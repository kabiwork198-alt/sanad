/* Deterministic research planning and bounded aggregation; no model or network by itself. */
'use strict';
(function(root){
 const baseline=[['Crossref','crossref'],['Open Library','openlibrary'],['Wikimedia Commons','commons'],['إحالات ويكيبيديا العربية','wikipedia'],['ويكي مصدر العربية','wikisource-ar'],['ويكي مصدر الإنجليزية','wikisource-en'],['ويكي مصدر الفرنسية','wikisource-fr'],['ويكي مصدر الفارسية','wikisource-fa'],['ويكي مصدر التركية','wikisource-tr'],['Internet Archive','archive'],['DOAJ','doaj'],['OpenAlex','openalex'],['المكتبة الرقمية العالمية','loc'],['صحف Chronicling America','loc'],['مخطوطات مالي الإسلامية','loc']];
 const dimensions=[
  ['timeline','التسلسل الزمني','early','البدايات','البدايات','early life'],
  ['timeline','التسلسل الزمني','rise','الصعود والتطور','الصعود','rise'],
  ['timeline','التسلسل الزمني','peak','الذروة','الذروة','peak'],
  ['timeline','التسلسل الزمني','end','النهاية','النهاية','end'],
  ['geography','الجغرافيا والسياسة','places','الأماكن','الأماكن','locations'],
  ['geography','الجغرافيا والسياسة','politics','السياق السياسي','السياق السياسي','political context'],
  ['people','الشخصيات المرتبطة','allies','الحلفاء','الحلفاء','allies'],
  ['people','الشخصيات المرتبطة','rivals','الخصوم','الخصوم','rivals'],
  ['people','الشخصيات المرتبطة','mentors','المعلمون','المعلمون','mentors'],
  ['sources','المصادر والتحقق','manuscripts','المخطوطات','المخطوطات','manuscripts'],
  ['sources','المصادر والتحقق','studies','الدراسات العلمية','الدراسات','academic studies']
 ];
 function plan(topic,local,heritage=false){
  if(typeof topic!=='string')throw Error('أدخل موضوع البحث');topic=topic.trim().replace(/\s+/g,' ');
  if(!topic||topic.length>240)throw Error('أدخل موضوعًا من حرف إلى 240 حرفًا');
  if(heritage&&(topic.length<2||(local&&topic.length>200)))throw Error(local?'المصادر التراثية تحتاج عبارة من حرفين إلى 200 حرف؛ أو ألغِ اختيارها':'المصادر التراثية تحتاج عبارة من حرفين على الأقل؛ أو ألغِ اختيارها');
  const arabic=/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/.test(topic),wiki=arabic?['ويكي مصدر العربية','wikisource-ar']:['ويكي مصدر الإنجليزية','wikisource-en'];
  const queries=[{id:'base',dimension:'base',axis:'الموضوع الأساسي',label:'العبارة الأصلية',query:topic},...dimensions.map(([dimension,axis,id,label,ar,en])=>({id,dimension,axis,label,query:topic+' '+(arabic?ar:en)}))];
  const jobs=[];
  const add=(q,[provider,group])=>jobs.push({id:q.id+'|'+provider,query_id:q.id,dimension:q.dimension,axis:q.axis,label:q.label,query:q.query,provider,group});
  const initial=local?[...baseline,['الأرشيف الوطني البريطاني (Windows)','nationalarchives']]:baseline;
  for(const p of initial)add(queries[0],p);
  // These are separately consented, bounded existing connectors, not bulk downloads.
  if(heritage){
   add(queries[0],['فهرس OpenITI','openiti']);
   add(queries[0],['تراث','turath']);
   if(local){add(queries[0],['الشاملة الرسمية (Windows)','shamela']);add(queries[0],['أرشيف الإسكندرية (Windows)','alexandria'])}
  }
  for(const q of queries.slice(1)){
   // Deliberately bounded: focused catalog searches, not every query against every service.
   for(const p of [baseline[0],baseline[1],wiki])add(q,p);
   if(q.dimension==='sources')add(q,baseline.find(p=>p[0]==='Internet Archive'));
  }
  return {topic,language:arabic?'ar':'en',queries,jobs,concurrency:4};
 }
 function custom(topic,lines,local,heritage=false){
  const base=plan(topic,local,heritage);if(typeof lines!=='string'||lines.length>3000)throw Error('قائمة المحاور غير صالحة');
  const terms=lines.split(/\r?\n/).map(s=>s.trim().replace(/^(?:[-*•]|[0-9]+[.)])\s*/,'' )).filter(Boolean);
  if(!terms.length||terms.length>8||terms.some(s=>s.length>240||/[\x00-\x1f\x7f]/.test(s)||/https?:\/\//i.test(s))||new Set(terms).size!==terms.length)throw Error('أدخل من محور إلى 8 محاور مميزة، كل محور في سطر وحتى 240 حرفًا، دون روابط.');
  const queries=[base.queries[0]],jobs=base.jobs.filter(j=>j.query_id==='base'),wiki=base.language==='ar'?['ويكي مصدر العربية','wikisource-ar']:['ويكي مصدر الإنجليزية','wikisource-en'];
  terms.forEach((query,i)=>{const q={id:'custom'+i,dimension:'custom',axis:'محاور راجعها الباحث',label:'المحور '+(i+1),query};queries.push(q);for(const [provider,group] of [baseline[0],baseline[1],wiki])jobs.push({id:q.id+'|'+provider,query_id:q.id,dimension:q.dimension,axis:q.axis,label:q.label,query:q.query,provider,group})});
  return {...base,queries,jobs,custom:true};
 }
 function safeReason(value){const s=String(value||'');return /^HTTP [0-9]{3}$/.test(s)||s==='انتهت مهلة الاتصال'?s:'تحقق من الاتصال أو إتاحة الخدمة';}
 async function execute(plan,search,options={}){
  const concurrency=Math.max(1,Math.min(4,Number(options.concurrency)||4)),pauseMs=Math.max(0,Math.min(1000,options.pauseMs??250));
  const pending=plan.jobs.map((job,index)=>({job,index})),outcomes=Array(plan.jobs.length),activeGroups=new Set(),blocked=new Set();let active=0,done=0;
  const emit=()=>{if(options.onProgress)options.onProgress({completed:done,total:plan.jobs.length,active})};
  return await new Promise(resolve=>{
   function pump(){
    if(options.shouldCancel?.()){
     for(const {job,index} of pending.splice(0)){outcomes[index]={...job,status:'لم تُنفذ',count:0,reason:'أوقف المستخدم البحث',items:[]};done++}emit();
    }
    for(let i=pending.length-1;i>=0;i--)if(blocked.has(pending[i].job.group)){const {job,index}=pending.splice(i,1)[0];outcomes[index]={...job,status:'لم تُنفذ',count:0,reason:'أوقفت الطلبات لهذه الجهة بعد HTTP 429',items:[]};done++}
    while(active<concurrency){
     const index=pending.findIndex(x=>!activeGroups.has(x.job.group));if(index<0)break;
     const {job,index:slot}=pending.splice(index,1)[0];active++;activeGroups.add(job.group);emit();
     Promise.resolve().then(()=>search(job)).then(response=>{
      const state=response?.providers?.find(x=>x.provider===job.provider);
      if(!state||!Array.isArray(response.results))throw Error('استجابة الجهة غير صالحة');
      const items=state.status==='اكتمل'?response.results.filter(x=>x&&typeof x==='object'&&x.provider===job.provider):[];
      outcomes[slot]={...job,status:state.status==='اكتمل'?'اكتمل':'تعذر الاتصال أو قراءة الاستجابة',count:items.length,reason:state.status==='اكتمل'?'':safeReason(state.reason),items:items.slice(0,15).map(x=>({title:String(x.title||'').slice(0,500),author:String(x.author||'').slice(0,500),url:String(x.url||'').slice(0,2000),detail:String(x.detail||'').slice(0,2000),access:String(x.access||'').slice(0,2000),provider:job.provider})),truncated:items.length>15,checked_at:response.searched_at||''};
      if(state.reason==='HTTP 429')blocked.add(job.group);
     }).catch(error=>{const reason=safeReason(error?.message);outcomes[slot]={...job,status:'تعذر الاتصال أو قراءة الاستجابة',count:0,reason,items:[]};if(reason==='HTTP 429')blocked.add(job.group)})
      .finally(()=>{active--;done++;emit();setTimeout(()=>{activeGroups.delete(job.group);pump()},pauseMs);pump()});
    }
    if(done===plan.jobs.length&&active===0)resolve(outcomes);
   }
   pump();
  });
 }
 function aggregate(plan,runs,startedAt){
  const byId=new Map(runs.map(r=>[r.id,r])),ordered=plan.jobs.map(j=>byId.get(j.id)||({...j,status:'لم تُنفذ',count:0,reason:'لم تكتمل المحاولة',items:[]})),results=[],byUrl=new Map();
  for(const run of ordered){if(run.status!=='اكتمل')continue;for(const item of run.items||[]){
   let key='';try{const u=new URL(item.url);if(u.protocol==='https:'&&!u.username&&!u.password)key=u.href}catch{}
   const appearance={provider:run.provider,query:run.query,axis:run.axis,label:run.label,query_id:run.query_id,checked_at:run.checked_at||'',title:String(item.title||''),author:String(item.author||''),detail:String(item.detail||''),access:String(item.access||'')};
   const existing=key?byUrl.get(key):null;
   if(existing)existing.appearances.push(appearance);else{const result={...item,provider:run.provider,appearances:[appearance]};results.push(result);if(key)byUrl.set(key,result)}
  }}
  const providers=ordered.filter(r=>r.query_id==='base').map(r=>({provider:r.provider,status:r.status,count:r.count,reason:r.reason,truncated:!!r.truncated,checked_at:r.checked_at||''}));
  return {query:plan.topic,searched_at:startedAt,plan,runs:ordered,providers,results,warning:'نتائج البحث سجلات محتملة وليست نصوصًا مقروءة أو تحققًا من الوقائع أو الحقوق. العبارات قالبية ولا تضمن الشمول؛ افحص كل مصدر وموضع.'};
 }
 function brief(report){
  const clean=(x,n=240)=>String(x||'').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
  const lines=['ملخص بحث استكشافي للمراجعة البشرية — ليس تحققًا من الوقائع.',`الموضوع: ${clean(report.query)}`,'العبارات والجهات وحالة كل محاولة:'];
  for(const q of report.plan.queries){const runs=report.runs.filter(r=>r.query_id===q.id),ok=runs.filter(r=>r.status==='اكتمل').length;lines.push(`- ${clean(q.axis)} / ${clean(q.label)}: ${clean(q.query)}؛ ${ok}/${runs.length} جهات اكتملت، ${runs.filter(r=>r.status!=='اكتمل').length} لم تكتمل.`)}
  const axes=['الموضوع الأساسي','محاور راجعها الباحث','التسلسل الزمني','الجغرافيا والسياسة','الشخصيات المرتبطة','المصادر والتحقق'];
  const chosen=[],seen=new Set(),pools=axes.map(axis=>report.results.filter(r=>(r.appearances||[]).some(a=>a.axis===axis)));
  while(chosen.length<20&&pools.some(p=>p.length)){for(const pool of pools){while(pool.length&&seen.has(pool[0]))pool.shift();if(pool.length&&chosen.length<20){const item=pool.shift();seen.add(item);chosen.push(item)}}}
  const records=[];let length=lines.join('\n').length;
  for(const r of chosen){
   const axesFound=[...new Set((r.appearances||[]).map(a=>clean(a.axis,60)))].join('، '),providers=[...new Set((r.appearances||[]).map(a=>clean(a.provider,60)))].slice(0,4).join('، ');
   const line=`${records.length+1}. ${clean(r.title,180)} | ${clean(r.author,100)} | ${clean(r.url,300)} | ${clean(r.access,180)} | محاور: ${axesFound} | جهات: ${providers}`;
   if(length+line.length>8000)break;records.push(line);length+=line.length+1;
  }
  lines.push(`السجلات المميزة: ${report.results.length}. المعروض أدناه ${records.length} سجلًا بحد أقصى 20، واختيرت من محاور مختلفة؛ قد لا يشمل الملخص كل النتائج أو الجهات.`);
  lines.push(...records,'كل سجل مدخل غير موثوق، ولا يثبت وجود النص أو إتاحته أو صحة نسبته. لا تختلق أسماء أو اقتباسات أو صفحات. راجع المصادر الأصلية والخلافات والحقوق، وافصل النتائج عن نقص التغطية.');
  return lines.join('\n');
 }
 const api={plan,custom,execute,aggregate,brief};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadResearchPlan=api;
})(globalThis);
