/* Browser-only adapter for GitHub Pages. User data stays in this browser. */
'use strict';
window.SANAD_BROWSER = true;
(() => {
  const KEY = 'sanad-projects-v1';
  const MAX_FILE = 20 * 1024 * 1024;
  const MAX_PAGES = 300;
  const MAX_MATCHES = 12;
  const trim = x => String(x ?? '').trim();
  const normalize = s => String(s).normalize('NFKC').toLocaleLowerCase().replace(/[\p{M}\u0640]/gu, '');
  function excerpt(text, needle) {
    // Normalization may change character offsets; this is an approximate context window.
    const start = Math.max(0, normalize(text).indexOf(needle) - 250);
    return (start ? '…' : '') + text.slice(start, start + 1000) + (text.length > start + 1000 ? '…' : '');
  }
  const params = o => new URLSearchParams(o).toString();
  const warning = 'النتائج سجلات بحث وليست إثباتًا لقراءة النص أو صحة النسبة أو رخصة الاستخدام. لا يشمل البحث كل المكتبات.';
  const fileWarning = 'النص مستخرج آليًا وقد يتضمن أخطاء. طابقه مع النسخة الأصلية. لا يُقرأ النص من الصور الممسوحة ضوئيًا دون OCR.';

  function projects() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(value)) throw Error();
      return value;
    } catch { throw Error('تعذر قراءة البيانات المحلية في هذا المتصفح. تأكد من السماح بتخزين الموقع.'); }
  }
  function writeProjects(value) {
    try { localStorage.setItem(KEY, JSON.stringify(value)); }
    catch { throw Error('تعذر الحفظ؛ قد تكون مساحة المتصفح ممتلئة أو التخزين معطّلًا.'); }
  }
  function validate(p) {
    if (!p || typeof p !== 'object' || !/^[a-f0-9]{32}$/.test(p.id || '')) throw Error('صيغة المشروع غير صالحة');
    if (typeof p.title !== 'string' || !p.title.trim() || p.title.length > 200) throw Error('أدخل عنوانًا بين حرف و200 حرف');
    for (const key of ['signals','sources','claims','scenes','events']) {
      if (p[key] !== undefined && (!Array.isArray(p[key]) || p[key].length > 500 || p[key].some(v => !v || typeof v !== 'object' || Array.isArray(v) || Object.values(v).some(x => typeof x !== 'string' || x.length > 250000)))) throw Error('قائمة غير صالحة: ' + key);
    }
    for (const key of ['question','angle','audience','ideaStatus','researchNotes','outline','script','english','translationNotes','productionNotes','reviewNotes']) {
      if (p[key] !== undefined && (typeof p[key] !== 'string' || p[key].length > 250000)) throw Error('حقل نصي غير صالح: ' + key);
    }
    if (new TextEncoder().encode(JSON.stringify(p)).length > 5 * 1024 * 1024) throw Error('المشروع أكبر من الحد المسموح');
    const sources = p.sources || [];
    const ids = sources.map(s => s.id);
    if (ids.some(x => !/^[a-f0-9]{32}$/.test(x || '')) || new Set(ids).size !== ids.length) throw Error('معرّفات المصادر غير صالحة أو مكررة');
    for (const claim of (p.claims || [])) {
      if (!['لم يُفحص','مدعوم','محل خلاف','غير مدعوم','يتعذر التحقق'].includes(claim.status || 'لم يُفحص')) throw Error('حالة الادعاء غير صالحة');
      if (claim.sourceId && !ids.includes(claim.sourceId)) throw Error('الادعاء يشير إلى مصدر غير موجود');
      if (claim.status === 'مدعوم' && (!ids.includes(claim.sourceId) || !trim(claim.location))) throw Error('الادعاء المدعوم يحتاج مصدرًا وموضعًا');
    }
    for (const event of (p.events || [])) if (event.sourceId && !ids.includes(event.sourceId)) throw Error('الحدث يشير إلى مصدر غير موجود');
    for (const [list, field] of [[p.events || [], 'sortYear'], [sources, 'workYear']]) for (const x of list) {
      const year = trim(x[field]);
      if (year && (!/^[0-9]{1,4}$/.test(year) || Number(year) < 1)) throw Error('سنة الترتيب يجب أن تكون سنة ميلادية من 1 إلى 9999 أو تترك فارغة');
    }
  }
  function report(p) {
    const sources = p.sources || [], claims = p.claims || [], signals = p.signals || [];
    const byId = new Map(sources.map(s => [s.id, s]));
    const issues = [], reviewed = [];
    if (!trim(p.question)) issues.push('لم يُحدد سؤال الحلقة.');
    if (!signals.length) issues.push('لا توجد إشارات اهتمام مسجلة؛ لا يمكن وصف الفكرة بأنها رائجة.');
    signals.forEach((s,i) => { if (['source','query','scope','date','evidence'].some(k => !trim(s[k]))) issues.push(`إشارة الاهتمام ${i+1} ناقصة المصدر أو المصطلح أو المنطقة والفترة أو التاريخ أو الدليل وحدوده.`); });
    if (!sources.length) issues.push('لم تُسجّل مصادر بعد.');
    if (!claims.length) issues.push('لم تُسجّل ادعاءات للمراجعة بعد.');
    claims.forEach((c,i) => {
      const source = byId.get(c.sourceId), status = c.status || 'لم يُفحص';
      if (!trim(c.text)) issues.push(`الادعاء ${i+1} بلا نص.`);
      if (status !== 'مدعوم') issues.push(`الادعاء ${i+1}: حالته «${status}» ويحتاج معالجة بشرية قبل الاعتماد.`);
      if (!source || !trim(source.title) || !trim(c.location)) issues.push(`الادعاء ${i+1}: يحتاج مصدرًا مسمى وموضعًا محددًا.`);
      if (trim(c.text) && status === 'مدعوم' && source && trim(source.title) && trim(c.location)) reviewed.push({text:trim(c.text),source:trim(source.title),location:trim(c.location),notes:trim(c.notes)});
    });
    return {issues, reviewed_claims:reviewed, counts:{signals:signals.length,sources:sources.length,claims:claims.length,reviewed:reviewed.length}, warning:'الفحص تنظيمي فقط؛ لا يثبت صحة الادعاءات أو الاستشهادات، ولا يغني عن مراجعة المصادر والخلافات والحقوق بشريًا.'};
  }
  function draft(p) {
    const r = report(p);
    if (!r.reviewed_claims.length) throw Error('أضف ادعاءً راجعه إنسان وصنّفه مدعومًا، مع مصدر مسمى وموضع، قبل إنشاء المسودة.');
    const lines = ['مسودة تحريرية للمراجعة — ليست نصًا معتمدًا للنشر','','العنوان: '+trim(p.title),'','المقدمة:','[اكتب افتتاحية لا تعد بأكثر مما تثبته المصادر.]'];
    if (trim(p.question)) lines.push('سؤال الحلقة (صياغة المستخدم): '+trim(p.question));
    lines.push('','المتن:');
    r.reviewed_claims.forEach((c,i) => {lines.push(`${i+1}. ${c.text}`,`   [مرجع للمراجعة: ${c.source}، ${c.location}]`);if(c.notes)lines.push(`   [ملاحظات الباحث للمراجعة وليست للتعليق الصوتي: ${c.notes}]`);});
    lines.push('','الخاتمة:','[اكتب خلاصة متوازنة تعكس حدود الأدلة والخلافات.]','','ملاحظات للمراجع:','لا تمثل حالة «مدعوم» تحققًا آليًا. راجع نصوص المصادر والاقتباسات والسياق والخلافات قبل النشر.');
    const excluded = (p.claims || []).length-r.reviewed_claims.length;
    if (excluded) lines.push(`لم تُدرج ${excluded} من الادعاءات لأنها لم تستوفِ شروط هذه المسودة؛ راجعها ولا تُخفِ خلافًا مؤثرًا.`);
    return {text:lines.join('\n'),issues:r.issues,included:r.reviewed_claims.length};
  }
  function queryText(q) {
    if (typeof q !== 'string' || !q.trim() || q.length > 300) throw Error('أدخل عبارة بحث لا تتجاوز 300 حرف');
    return q.trim();
  }
  async function getJSON(url) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try { const response = await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('تعذر الاتصال بالخدمة');return await response.json(); }
    catch { throw Error('تعذر الاتصال بالخدمة من هذا المتصفح؛ قد تكون الخدمة محجوبة أو لا تسمح بالوصول المباشر.'); }
    finally {clearTimeout(timer);}
  }
  async function crossref(q) {
    const d = await getJSON('https://api.crossref.org/works?'+params({'query.bibliographic':queryText(q),rows:'10',select:'DOI,title,author,published,URL,type'}));
    return (d.message?.items||[]).map(x=>({title:x.title?.[0]||'بلا عنوان',author:(x.author||[]).slice(0,5).map(a=>[a.given,a.family].filter(Boolean).join(' ')).join(', '),url:x.URL||'',doi:x.DOI||'',type:x.type||''}));
  }
  async function openlibrary(q) {
    const d = await getJSON('https://openlibrary.org/search.json?'+params({q:queryText(q),limit:'10',fields:'key,title,author_name,first_publish_year'}));
    return (d.docs||[]).filter(x=>/^\/works\/OL[0-9]+W$/.test(x.key||'')).map(x=>({title:x.title||'بلا عنوان',author:(x.author_name||[]).slice(0,5).join(', '),url:'https://openlibrary.org'+x.key,year:String(x.first_publish_year||'')}));
  }
  async function commons(q) {
    const d = await getJSON('https://commons.wikimedia.org/w/api.php?'+params({action:'query',generator:'search',gsrsearch:queryText(q),gsrnamespace:'6',gsrlimit:'8',prop:'imageinfo',iiprop:'url|extmetadata',format:'json',formatversion:'2',origin:'*'}));
    return (d.query?.pages||[]).flatMap(p=>{const info=p.imageinfo?.[0]||{},url=info.descriptionurl||'';if(!url.startsWith('https://commons.wikimedia.org/'))return [];const lic=info.extmetadata?.LicenseShortName?.value||'غير معروف';return [{title:p.title||'',url,author:'',detail:`ترخيص مذكور في السجل: ${lic}؛ يلزم فحص صفحة الملف والحقوق.`,access:'سجل مادة مرئية — تحقق من الأصل والنسبة والترخيص'}];});
  }
  const wikiAPI = o => 'https://ar.wikipedia.org/w/api.php?' + params({...o,format:'json',formatversion:'2',origin:'*'});
  async function topics() {
    const d=await getJSON(wikiAPI({action:'query',list:'categorymembers',cmtitle:'تصنيف:تاريخ إسلامي',cmtype:'page',cmlimit:'24'}));
    const topics=(d.query?.categorymembers||[]).filter(x=>Number.isSafeInteger(x.pageid)&&x.pageid>0&&typeof x.title==='string'&&x.title.trim()).map(x=>({title:x.title.slice(0,200),url:'https://ar.wikipedia.org/?curid='+x.pageid}));
    return {topics,searched_at:new Date().toISOString()};
  }
  async function wikiCitations(q) {
    const search=await getJSON(wikiAPI({action:'query',list:'search',srsearch:q,srlimit:'1',srnamespace:'0'}));
    const page=search.query?.search?.[0];
    if(!page)return [];
    if(!Number.isSafeInteger(page.pageid)||page.pageid<=0)throw Error('سجل ويكيبيديا غير صالح');
    const d=await getJSON(wikiAPI({action:'parse',pageid:String(page.pageid),prop:'text'}));
    if(typeof d.parse?.text!=='string')throw Error('استجابة ويكيبيديا غير صالحة');
    // Parse only isolated citation text, never insert remote HTML into the live page.
    const out=[];const pattern=/<li\b[^>]*\bid\s*=\s*["'](cite_note-[^"']+)["'][^>]*>([\s\S]*?)<\/li>/gi;
    // MediaWiki may encode underscores in HTML id attributes as numeric entities.
    const html=d.parse.text.replace(/&#(?:0*95|x0*5f);/gi,'_');
    for(const match of html.matchAll(pattern)){
      const plain=match[2].replace(/<[^>]*>/g,' ');
      const text=(new DOMParser().parseFromString(plain,'text/html').body.textContent||'').replace(/\s+/g,' ').trim().slice(0,600);
      if(!text)continue;
      out.push({title:text.slice(0,200),author:'',url:'https://ar.wikipedia.org/?curid='+page.pageid+'#'+encodeURIComponent(match[1]),detail:`مرجع مذكور في مقالة ويكيبيديا «${String(page.title||'').slice(0,200)}»: ${text} — تحقق من المصدر الأصلي.`,access:'إحالة في ويكيبيديا، لم يُقرأ المصدر الأصلي؛ تحقق من مطابقتها للموضوع والإتاحة والحقوق.'});
      if(out.length>=15)break;
    }
    return out;
  }
  async function wikisource(q) {
    const d=await getJSON('https://ar.wikisource.org/w/api.php?'+params({action:'query',list:'search',srsearch:q,srnamespace:'0',srlimit:'10',format:'json',formatversion:'2',origin:'*'}));
    return (d.query?.search||[]).filter(x=>Number.isSafeInteger(x.pageid)&&x.pageid>0&&typeof x.title==='string'&&x.title.trim()).map(x=>({title:x.title.slice(0,300),url:'https://ar.wikisource.org/?curid='+x.pageid,author:'',detail:'نتيجة في ويكي مصدر العربية؛ طابق النص والطبعة مع المصدر الأصلي.',access:'صفحة ضمن مكتبة نصية؛ لم يُقرأ نصها آليًا. راجع الإتاحة والترخيص والطبعة.'}));
  }
  async function internetArchive(q) {
    const phrase=q.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    const p=new URLSearchParams({q:`"${phrase}" AND mediatype:texts`,rows:'10',output:'json'});
    for(const field of ['identifier','title','creator','year'])p.append('fl[]',field);
    const d=await getJSON('https://archive.org/advancedsearch.php?'+p.toString());
    return (d.response?.docs||[]).filter(x=>typeof x.identifier==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(x.identifier)).map(x=>({title:String(Array.isArray(x.title)?x.title[0]:(x.title||x.identifier)).slice(0,300),url:'https://archive.org/details/'+x.identifier,author:String(Array.isArray(x.creator)?x.creator.slice(0,5).join(', '):(x.creator||'')).slice(0,300),detail:'سنة النشر المفهرسة: '+String(x.year||'غير معروفة')+'؛ قد يكون السجل غير دقيق أو مكررًا.',access:'سجل كتاب في Internet Archive؛ لا يضمن الإتاحة أو التنزيل أو الترخيص.'}));
  }
  async function research(q) {
    q=queryText(q);
    const providers=[['Crossref',async()=> (await crossref(q)).map(x=>({title:x.title,url:x.url,author:x.author,detail:'DOI: '+x.doi,access:'بيانات فهرسية — تحقق من النص الكامل'}))],['Open Library',async()=> (await openlibrary(q)).map(x=>({title:x.title,url:x.url,author:x.author,detail:'سنة طبعة مفهرسة: '+x.year,access:'بيانات فهرسية — تحقق من النص الكامل'}))],['Wikimedia Commons',()=>commons(q)],['إحالات ويكيبيديا العربية',()=>wikiCitations(q)],['ويكي مصدر العربية',()=>wikisource(q)],['Internet Archive',()=>internetArchive(q)]];
    const outcomes=await Promise.all(providers.map(async ([provider,fn])=>{try{const items=await fn();return {provider,items,status:'اكتمل'};}catch{return {provider,items:[],status:'تعذر الاتصال أو قراءة الاستجابة'};}}));
    return {query:q,searched_at:new Date().toISOString(),providers:outcomes.map(x=>({provider:x.provider,status:x.status,count:x.items.length})),results:outcomes.flatMap(x=>x.items.map(item=>({...item,provider:x.provider}))),warning};
  }
  async function youtube(q,key) {
    q=queryText(q);if(typeof key!=='string'||!key.trim()||key.length>500)throw Error('أدخل مفتاح YouTube Data API');
    const d=await getJSON('https://www.googleapis.com/youtube/v3/search?'+params({part:'snippet',type:'video',maxResults:'15',q,key:key.trim()}));
    return (d.items||[]).filter(x=>/^[A-Za-z0-9_-]{11}$/.test(x.id?.videoId||'')).map(x=>({title:x.snippet?.title||'',channel:x.snippet?.channelTitle||'',published:x.snippet?.publishedAt||'',url:'https://www.youtube.com/watch?v='+x.id.videoId}));
  }
  function database() {
    return new Promise((resolve,reject)=>{const req=indexedDB.open('sanad-browser-documents',1);req.onupgradeneeded=()=>req.result.createObjectStore('files');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(Error('تعذر استخدام تخزين الملفات في المتصفح'));req.onblocked=()=>reject(Error('تخزين الملفات محجوب؛ أغلق نسخ الموقع الأخرى وحاول مجددًا'));});
  }
  async function documentStore(mode,id,bytes) {
    const db=await database();
    return new Promise((resolve,reject)=>{const tx=db.transaction('files',mode),store=tx.objectStore('files'),req=bytes?store.put(bytes,id):store.get(id);let value;req.onsuccess=()=>value=req.result;req.onerror=()=>reject(Error('تعذر الوصول إلى الملف المحلي'));tx.oncomplete=()=>{db.close();resolve(value)};tx.onerror=()=>{db.close();reject(Error('تعذر حفظ الملف؛ ربما امتلأت مساحة الجهاز'))};tx.onabort=()=>{db.close();reject(Error('تعذر الوصول إلى الملف المحلي'))};});
  }
  async function importDocument(name,content) {
    if(typeof name!=='string'||!name.trim()||name.length>200||!(/\.(pdf|txt|md)$/i.test(name)))throw Error('الصيغ المدعومة: PDF وTXT وMD');
    if(typeof content!=='string'||content.length>MAX_FILE*4/3+16)throw Error('حجم الملف أكبر من 20 ميجابايت');
    let bytes;try{const raw=atob(content);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0))}catch{throw Error('بيانات الملف غير صالحة')}
    if(!bytes.length||bytes.length>MAX_FILE)throw Error('الملف فارغ أو أكبر من 20 ميجابايت');
    const pdf=/\.pdf$/i.test(name),head=new TextDecoder().decode(bytes.slice(0,1024));
    if(pdf&&!head.includes('%PDF-'))throw Error('الملف ليس PDF صالحًا بحسب ترويسته');
    if(!pdf){try{new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('احفظ الملف النصي بترميز UTF-8 ثم أعد المحاولة')}}
    const digest=await crypto.subtle.digest('SHA-256',bytes),id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    await documentStore('readwrite',id,bytes);
    return {id,name:name.replace(/\\/g,'/').split('/').pop(),size:bytes.length,kind:name.split('.').pop().toLowerCase()};
  }
  async function searchDocument(id,query) {
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('معرّف الملف غير صالح');
    if(typeof query!=='string'||trim(query).length<2||query.length>200||!normalize(query).trim())throw Error('أدخل عبارة بحث من حرفين إلى 200 حرف');
    const bytes=await documentStore('readonly',id);if(!bytes)throw Error('الملف غير موجود في هذا المتصفح؛ أضفه مجددًا');
    const needle=normalize(query.trim()),matches=[],head=new TextDecoder().decode(bytes.slice(0,1024));let scanned=0,total=1;
    if(head.includes('%PDF-')) {
      try {
        if(!Promise.withResolvers)Promise.withResolvers=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
        const pdf=await import('./vendor/pdf.min.mjs');
        pdf.GlobalWorkerOptions.workerSrc=new URL('web/vendor/pdf.worker.min.mjs',document.baseURI).href;
        const task=pdf.getDocument({data:bytes.slice()});const doc=await task.promise;total=doc.numPages;
        for(let i=1;i<=Math.min(total,MAX_PAGES);i++){const page=await doc.getPage(i);const content=await page.getTextContent();scanned++;const line=content.items.map(x=>x.str||'').join(' ');if(normalize(line).includes(needle))matches.push({location:`صفحة PDF ${i}`,text:excerpt(line,needle)});if(matches.length>=MAX_MATCHES)break;}
        await doc.destroy();
      } catch(e) {if(e?.name==='PasswordException')throw Error('هذا الملف محمي أو مشفر؛ لا يتجاوز سَنَد الحماية. أضف نسخة مسموحة قابلة للقراءة.');throw Error('تعذر قراءة PDF؛ قد يكون تالفًا أو لا يدعمه المتصفح.');}
    } else {
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('تعذر قراءة الملف النصي')};scanned=1;
      for(const [i,line] of text.split(/\r?\n/).entries()){if(normalize(line).includes(needle))matches.push({location:`السطر ${i+1}`,text:excerpt(line,needle)});if(matches.length>=MAX_MATCHES)break;}
    }
    return {matches,scanned,total,partial:scanned<total||matches.length>=MAX_MATCHES,warning:fileWarning};
  }
  window.browserEngine = async (path,data={}) => {
    if(path==='/api/projects')return {projects:projects()};
    if(path==='/api/save'){validate(data.project);const items=projects().filter(x=>x.id!==data.project.id);items.unshift(data.project);writeProjects(items);return {ok:true};}
    if(path==='/api/delete'){writeProjects(projects().filter(x=>x.id!==data.id));return {ok:true};}
    if(path==='/api/topics')return topics();
    if(path==='/api/research')return research(data.query);
    if(path==='/api/crossref')return {results:await crossref(data.query)};
    if(path==='/api/openlibrary')return {results:await openlibrary(data.query)};
    if(path==='/api/youtube')return {results:await youtube(data.query,data.key)};
    if(path==='/api/library/import')return {document:await importDocument(data.name,data.content)};
    if(path==='/api/library/search')return searchDocument(data.id,data.query);
    if(path==='/api/lm'||path==='/api/prepare-prompt')throw Error('Qwen غير متاح من نسخة المتصفح؛ استخدم نسخة Windows المحلية.');
    if(['/api/suggestions','/api/analyze','/api/draft'].includes(path)){
      const p=data.project;validate(p);
      if(path==='/api/analyze')return report(p);
      if(path==='/api/draft')return draft(p);
      const t=trim(p.title);return {suggestions:[{question:`ما الذي نعرفه عن ${t}، وما الذي يبقى محل خلاف؟`,angle:'تمييز الروايات المدعومة من المختلف فيها.'},{question:`كيف تشكّلت صورة ${t} في المصادر المختلفة؟`,angle:'مقارنة مصادر متعددة وسياقاتها وحدودها.'},{question:`ما الأسئلة الشائعة التي تستحق البحث حول ${t}؟`,angle:'الانطلاق من أسئلة الجمهور مع التحقق من إشارات الاهتمام.'}]};
    }
    throw Error('الوظيفة غير متاحة في نسخة المتصفح');
  };
})();
