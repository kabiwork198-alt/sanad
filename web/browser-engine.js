/* Browser-only adapter for GitHub Pages. User data stays in this browser. */
'use strict';
window.SANAD_BROWSER = true;
(() => {
  const KEY = 'sanad-projects-v1';
  const MAX_FILE = 20 * 1024 * 1024;
  const MAX_PAGES = 300;
  const MAX_MATCHES = 12;
  const trim = x => String(x ?? '').trim();
  const normalize = (s,mode='basic') => {const value=String(s).normalize('NFKC').toLocaleLowerCase().replace(/[\p{M}\u0640]/gu, '');return mode==='arabic-variants'?value.replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي'):value};
  function excerpt(text, needle, mode='basic', at=normalize(text,mode).indexOf(needle)) {
    let pos=0,original=0;
    if(at>=0){for(const char of text){pos+=normalize(char,mode).length;if(pos>at)break;original+=char.length}}
    const start=Math.max(0,original-250);
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
    for (const key of ['signals','sources','claims','scenes','events','evidence']) {
      if (p[key] !== undefined && (!Array.isArray(p[key]) || p[key].length > 500 || p[key].some(v => !v || typeof v !== 'object' || Array.isArray(v) || Object.values(v).some(x => typeof x !== 'string' || x.length > 250000)))) throw Error('قائمة غير صالحة: ' + key);
    }
    for (const key of ['question','angle','audience','ideaStatus','researchNotes','outline','script','english','translationNotes','productionNotes','reviewNotes']) {
      if (p[key] !== undefined && (typeof p[key] !== 'string' || p[key].length > 250000)) throw Error('حقل نصي غير صالح: ' + key);
    }
    if (new TextEncoder().encode(JSON.stringify(p)).length > 5 * 1024 * 1024) throw Error('المشروع أكبر من الحد المسموح');
    const sources = p.sources || [];
    const ids = sources.map(s => s.id);
    if (ids.some(x => !/^[a-f0-9]{32}$/.test(x || '')) || new Set(ids).size !== ids.length) throw Error('معرّفات المصادر غير صالحة أو مكررة');
    const claimIds=(p.claims||[]).map(c=>c.id).filter(Boolean);
    if(claimIds.some(id=>!/^[a-f0-9]{32}$/.test(id))||new Set(claimIds).size!==claimIds.length)throw Error('معرّفات الادعاءات غير صالحة أو مكررة');
    for(const entry of (p.evidence||[])) {
      if(!claimIds.includes(entry.claimId))throw Error('دليل المقارنة يشير إلى ادعاء غير موجود');
      if(entry.sourceId&&!ids.includes(entry.sourceId))throw Error('دليل المقارنة يشير إلى مصدر غير موجود');
      if(!['يدعم','يخالف','يضيف سياقًا','غير محسوم'].includes(entry.stance||'غير محسوم'))throw Error('موقف دليل المقارنة غير صالح');
    }
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
      const comparisons=(p.evidence||[]).filter(e=>c.id&&e.claimId===c.id).map(e=>{
        const cited=byId.get(e.sourceId);
        if(!cited||!trim(cited.title)||!trim(e.location))issues.push(`دليل مقارنة للادعاء ${i+1}: يحتاج مصدرًا مسمى وموضعًا.`);
        if(e.stance==='يخالف')issues.push(`الادعاء ${i+1}: يوجد دليل مخالف سجله المستخدم؛ راجع الخلاف ولا تحذفه من المعالجة.`);
        return {source:trim(cited?.title)||'مصدر غير محدد',location:trim(e.location)||'موضع غير محدد',printedPage:trim(e.printedPage),edition:trim(cited?.edition),stance:e.stance||'غير محسوم',excerpt:trim(e.excerpt),notes:trim(e.notes)};
      });
      if (trim(c.text) && status === 'مدعوم' && source && trim(source.title) && trim(c.location)) reviewed.push({text:trim(c.text),source:trim(source.title),location:trim(c.location),printedPage:trim(c.printedPage),edition:trim(source.edition),notes:trim(c.notes),comparisons});
    });
    return {issues, reviewed_claims:reviewed, counts:{signals:signals.length,sources:sources.length,claims:claims.length,reviewed:reviewed.length}, warning:'الفحص تنظيمي فقط؛ لا يثبت صحة الادعاءات أو الاستشهادات، ولا يغني عن مراجعة المصادر والخلافات والحقوق بشريًا.'};
  }
  function draft(p) {
    const r = report(p);
    if (!r.reviewed_claims.length) throw Error('أضف ادعاءً راجعه إنسان وصنّفه مدعومًا، مع مصدر مسمى وموضع، قبل إنشاء المسودة.');
    const lines = ['مسودة تحريرية للمراجعة — ليست نصًا معتمدًا للنشر','','العنوان: '+trim(p.title),'','المقدمة:','[اكتب افتتاحية لا تعد بأكثر مما تثبته المصادر.]'];
    if (trim(p.question)) lines.push('سؤال الحلقة (صياغة المستخدم): '+trim(p.question));
    lines.push('','المتن:');
    r.reviewed_claims.forEach((c,i) => {lines.push(`${i+1}. ${c.text}`,`   [مرجع للمراجعة: ${c.source}، ${c.location}]`);if(c.edition||c.printedPage)lines.push(`   [الطبعة والصفحة المطبوعة كما أدخل الباحث: ${c.edition||'غير محددة'}، ${c.printedPage||'غير محددة'}]`);if(c.notes)lines.push(`   [ملاحظات الباحث للمراجعة وليست للتعليق الصوتي: ${c.notes}]`);for(const e of c.comparisons){lines.push(`   [دليل إضافي كما سجّله المستخدم: ${e.stance} — ${e.source}، ${e.location}]`);if(e.edition||e.printedPage)lines.push(`   [الطبعة والصفحة المطبوعة كما أدخل الباحث: ${e.edition||'غير محددة'}، ${e.printedPage||'غير محددة'}]`);if(e.excerpt)lines.push(`   [نص للمطابقة مع الأصل: ${e.excerpt}]`);if(e.notes)lines.push(`   [ملاحظات المقارنة: ${e.notes}]`);}});
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
    try { const response = await fetch(url,{signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);return await response.json(); }
    catch(e) { if(e?.name==='AbortError')throw Error('انتهت مهلة الاتصال');if(/^HTTP [0-9]{3}$/.test(e?.message||''))throw e;throw Error('تعذر الاتصال أو قراءة الاستجابة؛ قد يكون الاتصال أو وصول المتصفح محجوبًا.'); }
    finally {clearTimeout(timer);}
  }
  async function searchQdl(id,q) {
    if(typeof id!=='string'||!/^vdc_[0-9]{1,20}\.0x[0-9a-fA-F]{6,16}$/.test(id))throw Error('معرّف سجل مكتبة قطر غير صالح');
    if(typeof q!=='string'||q.trim().length<2||q.trim().length>200)throw Error('أدخل عبارة بحث من حرفين إلى 200 حرف');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let d;
    try {
      const r=await fetch('https://www.qdl.qa/en/annos/search/81055/'+id+'?'+params({q:q.trim()}),{signal:controller.signal,credentials:'omit',redirect:'error'});
      if(!r.ok)throw Error('HTTP '+r.status);
      if(Number(r.headers.get('Content-Length')||0)>2000000)throw Error('استجابة البحث كبيرة جدًا');
      let size=0,chunks=[];
      if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2000000){await reader.cancel();throw Error('استجابة البحث كبيرة جدًا')}chunks.push(part.value)}}finally{reader.releaseLock()}}
      else {const part=new Uint8Array(await r.arrayBuffer());size=part.length;if(size>2000000)throw Error('استجابة البحث كبيرة جدًا');chunks=[part]}
      const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}d=JSON.parse(new TextDecoder().decode(bytes));
    }catch(e){if(e.name==='AbortError')throw Error('انتهت مهلة الاتصال بمكتبة قطر');if(e instanceof TypeError)throw Error('تعذر الاتصال بمكتبة قطر أو منع المتصفح الاستجابة؛ افتح السجل وابحث فيه على موقع المكتبة');throw e}finally{clearTimeout(timer)}
    if(!d||!Array.isArray(d.hits))throw Error('الوثيقة لا تتيح نتائج بحث مدعومة؛ افتح سجل المكتبة');
    const hits=d.hits.filter(x=>x&&typeof x['item-url']==='string'&&/^81055\/vdc_[0-9]{1,20}\.0x[0-9a-fA-F]{6,16}$/.test(x['item-url'])).slice(0,20).map(x=>({url:'https://www.qdl.qa/en/archive/'+x['item-url'],match:typeof x.match==='string'?x.match.slice(0,200):''}));
    const total=Number.isSafeInteger(d.within?.total)&&d.within.total>=0?d.within.total:null;
    return {hits,total,warning:'مطابقات البحث تحدد صفحات محتملة فقط وقد تخطئ بسبب OCR أو نقص الفهرسة؛ افتح صورة الصفحة وراجع سياقها ورقمها وحقوقها. عدم العثور لا يثبت الغياب.'};
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
  const topicCategories={travel:['الرحالة والطرق','تصنيف:رحالة مسلمون'],andalus:['الأندلس','تصنيف:تاريخ الأندلس'],battles:['المعارك والأحداث','تصنيف:معارك العرب'],maghreb:['المغرب','تصنيف:تاريخ المغرب'],islamic:['التاريخ الإسلامي','تصنيف:تاريخ إسلامي']};
  async function topics(category='travel',query='',cursor='') {
    if(typeof category!=='string'||!Object.hasOwn(topicCategories,category))throw Error('مسار الموضوعات غير صالح');
    if(typeof query!=='string'||query.length>120||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(query))throw Error('عبارة البحث غير صالحة');query=query.trim().replace(/\s+/g,' ');if(query&&query.length<2)throw Error('أدخل حرفين على الأقل');
    if(typeof cursor!=='string'||cursor.length>600)throw Error('مؤشر النتائج غير صالح');
    const [label,cat]=topicCategories[category],p={action:'query',prop:'extracts|pageprops',exintro:'1',explaintext:'1',exsentences:'2',exlimit:'12',ppprop:'disambiguation'};
    if(query){if(cursor&&(!/^[0-9]{1,3}$/.test(cursor)||Number(cursor)>200))throw Error('مؤشر البحث غير صالح');Object.assign(p,{generator:'search',gsrsearch:query,gsrnamespace:'0',gsrlimit:'12'});if(cursor)p.gsroffset=cursor}
    else{if(cursor&&!/^page\|[0-9a-f]{1,550}\|[0-9]{1,13}$/.test(cursor))throw Error('مؤشر التصنيف غير صالح');Object.assign(p,{generator:'categorymembers',gcmtitle:cat,gcmtype:'page',gcmlimit:'12'});if(cursor){p.gcmcontinue=cursor;p.continue='gcmcontinue||'}}
    const d=await wikiListJSON(wikiAPI(p));if(d?.error)throw Error('تعذر قراءة استجابة ويكيبيديا');const raw=d?.query?.pages||[];if(!Array.isArray(raw))throw Error('استجابة ويكيبيديا غير صالحة');const seen=new Set(),found=[];
    for(const item of raw.slice(0,12)){const id=item?.pageid,title=item?.title,extract=item?.extract;if(!Number.isSafeInteger(id)||id<=0||id>=1e13||seen.has(id)||item.ns!==0||typeof title!=='string'||!title.trim()||title.length>200||typeof extract!=='string'||Object.hasOwn(item.pageprops||{},'disambiguation'))continue;
      const t=title.trim().replace(/\s+/g,' '),text=extract.trim().replace(/\s+/g,' ');if(text.length<40||/^(?:قائمة|تصنيف|بوابة|[0-9٠-٩]{3,4}\s)/.test(t))continue;
      seen.add(id);const score=['رحل','رسالة','مخطوط','معركة','حصار','تجارة','رحلة','مقاومة','هجرة','ترجم'].filter(x=>text.includes(x)).length;found.push({id:String(id),title:t,url:'https://ar.wikipedia.org/?curid='+id,extract:text.slice(0,350)+(text.length>350?'…':''),score,index:Number.isInteger(item.index)?item.index:9999});
    }
    const norm=s=>s.normalize('NFKD').toLowerCase().replace(/[\p{M}]/gu,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي'),terms=(norm(query).match(/[\p{L}\p{N}]+/gu)||[]).filter(t=>t.length>=3&&!['ابن','تاريخ','كتاب','على','إلى','الى'].includes(t)),hits=(text)=>terms.filter(t=>norm(text).includes(t)).length;
    if(!['مسلسل','فيلم','روايه'].some(t=>norm(query).includes(t))){for(let i=found.length-1;i>=0;i--)if(/\((?:مسلسل|فيلم|رواية)(?:\s|\))/.test(found[i].title)||/(?:هو|هي)\s+(?:فيلم|مسلسل|رواية)(?=\s|[،.])/.test(found[i].extract.slice(0,250)))found.splice(i,1)}
    if(terms.length){for(let i=found.length-1;i>=0;i--)if(!hits(found[i].title+' '+found[i].extract))found.splice(i,1)}
    found.sort(query?(a,b)=>hits(b.title)-hits(a.title)||hits(b.extract)-hits(a.extract)||a.index-b.index:(a,b)=>b.score-a.score);for(const x of found){delete x.score;delete x.index}
    let next=String((query?d?.continue?.gsroffset:d?.continue?.gcmcontinue)??'');if(query&&(!/^[0-9]{1,3}$/.test(next)||Number(next)>200))next='';if(!query&&!/^page\|[0-9a-f]{1,550}\|[0-9]{1,13}$/.test(next))next='';
    return {topics:found,category,category_label:label,query,next_cursor:next,origin_url:'https://ar.wikipedia.org/wiki/'+encodeURIComponent(cat.replaceAll(' ','_')),searched_at:new Date().toISOString()};
  }
  async function topicSections(id){
    if(typeof id!=='string'||!/^[1-9][0-9]{0,12}$/.test(id))throw Error('معرّف المقالة غير صالح');
    const d=await wikiListJSON(wikiAPI({action:'parse',pageid:id,prop:'tocdata|revid'})),item=d?.parse;
    if(!item||String(item.pageid)!==id||!Number.isSafeInteger(item.revid)||item.revid<=0)throw Error('تعذر قراءة فهرس المقالة');
    const raw=item.tocdata?.sections||[];if(!Array.isArray(raw))throw Error('فهرس المقالة غير صالح');const seen=new Set(),sections=[],revision_url='https://ar.wikipedia.org/w/index.php?oldid='+item.revid;
    for(const row of raw.slice(0,200)){
      if(!row||![1,2].includes(row.tocLevel)||typeof row.line!=='string')continue;
      const line=row.line.replace(/<[^>]*>/g,'').trim().replace(/\s+/g,' ');
      if(line.length<3||line.length>120||/[<>]/.test(line)||/^(?:المراجع|المصادر|الهوامش|هوامش|وصلات خارجية|انظر أيض[اًا]|ملاحظات|فهرس المراجع|المعلومات الكاملة للمراجع)(?:\s|$)/.test(line))continue;
      let url='';if(typeof row.anchor==='string'&&row.anchor.length>0&&row.anchor.length<=300&&!/[\x00-\x1f\x7f]/.test(row.anchor)){try{url=revision_url+'#'+encodeURIComponent(row.anchor).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}catch{}}
      const key=url||line;if(seen.has(key))continue;seen.add(key);
      const number=typeof row.number==='string'&&/^[0-9]{1,3}(?:\.[0-9]{1,3}){0,3}$/.test(row.number)?row.number:'';
      sections.push({title:line,number,url});if(sections.length>=40)break;
    }
    return {page_id:id,title:String(item.title||'').slice(0,200),revision_url,sections,retrieved_at:new Date().toISOString(),warning:'حتى 40 عنوانًا مناسبًا من أول 200 قسم في المستويين الأولين؛ قد تُستبعد أقسام أخرى. العناوين إرشادية وليست حقائق مثبتة أو قائمة مصادر؛ راجع المصادر الأصلية.'};
  }
  async function openlibraryEditions(workId,offset=0){
    if(typeof workId!=='string'||!/^OL[0-9]{1,12}W$/.test(workId))throw Error('معرّف عمل Open Library غير صالح');
    if(!Number.isInteger(offset)||offset<0||offset>1000||offset%20)throw Error('صفحة الطبعات غير صالحة');
    const url='https://openlibrary.org/works/'+workId+'/editions.json?'+params({limit:'20',offset:String(offset)});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let size=0,chunks=[],d;
    try{
      const r=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error'});if(!r.ok)throw Error('تعذر جلب الطبعات (HTTP '+r.status+')');
      if(Number(r.headers.get('Content-Length')||0)>2000000)throw Error('استجابة الطبعات كبيرة جدًا');
      if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2000000){await reader.cancel();throw Error('استجابة الطبعات كبيرة جدًا')}chunks.push(part.value)}}finally{reader.releaseLock()}}
      else throw Error('المتصفح لا يدعم القراءة المحدودة للطبعات');
      const bytes=new Uint8Array(size);let at=0;for(const part of chunks){bytes.set(part,at);at+=part.length}d=JSON.parse(new TextDecoder().decode(bytes));
    }catch(e){if(e.name==='AbortError')throw Error('انتهت مهلة Open Library');if(e instanceof TypeError)throw Error('تعذر الاتصال بـ Open Library');throw e}finally{clearTimeout(timer)}
    if(!d||!Array.isArray(d.entries))throw Error('استجابة الطبعات غير صالحة');
    const total=Number.isSafeInteger(d.size)&&d.size>=0?d.size:null,editions=[];
    for(const e of d.entries.slice(0,20)){
      if(!e||typeof e.key!=='string'||!/^\/books\/OL[0-9]{1,12}M$/.test(e.key))continue;
      if(Array.isArray(e.works)&&e.works.length&&!e.works.some(w=>w&&w.key==='/works/'+workId))continue;
      const ia=typeof e.ocaid==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(e.ocaid)&&!['.','..'].includes(e.ocaid)?e.ocaid:'';
      const publishers=Array.isArray(e.publishers)?e.publishers:[],languages=Array.isArray(e.languages)?e.languages:[];
      editions.push({title:String(e.title||'بلا عنوان').slice(0,300),edition_url:'https://openlibrary.org'+e.key,archive_id:ia,archive_url:ia?'https://archive.org/details/'+ia:'',date:String(e.publish_date||'').slice(0,100),publisher:publishers.slice(0,5).map(String).join(', ').slice(0,300),language:languages.slice(0,8).filter(x=>x&&typeof x.key==='string'&&/^\/languages\/[A-Za-z]{3}$/.test(x.key)).map(x=>x.key.split('/').pop()).join(', ').slice(0,100)});
    }
    return {work_url:'https://openlibrary.org/works/'+workId,offset,total,has_more:d.entries.length===20&&(total===null||offset+20<total)&&offset<1000,truncated:offset===1000&&d.entries.length===20&&(total===null||offset+20<total),editions,warning:'هذه سجلات طبعات، وليست إثباتًا لإتاحة النص أو تطابق الطبعة أو حقوقها. افتح سجل الطبعة والأرشيف للتحقق؛ قد يكون بعضها للإعارة أو بلا OCR.'};
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
  async function wikisourceOther(q,lang){
    const labels={en:'الإنجليزية',fr:'الفرنسية',fa:'الفارسية',tr:'التركية'};if(!Object.hasOwn(labels,lang))throw Error('لغة ويكي مصدر غير مدعومة');
    const d=await getJSON('https://'+lang+'.wikisource.org/w/api.php?'+params({action:'query',list:'search',srsearch:q,srnamespace:'0',srlimit:'10',format:'json',formatversion:'2',origin:'*'}));
    return (d.query?.search||[]).filter(x=>Number.isSafeInteger(x.pageid)&&x.pageid>0&&typeof x.title==='string'&&x.title.trim()).map(x=>({title:x.title.slice(0,300),url:'https://'+lang+'.wikisource.org/?curid='+x.pageid,author:'',detail:'نتيجة في ويكي مصدر '+labels[lang]+'؛ راجع النسخة والطبعة والترجمة.',access:'سجل صفحة؛ لم يُقرأ النص بعد. راجع الترخيص والسياق.'}));
  }
  async function readWikisourceRendered(id,lang){
    if(!['ar','en','fr','fa','tr'].includes(lang))throw Error('لغة ويكي مصدر غير مدعومة');
    if(typeof id!=='string'||!/^[1-9][0-9]{0,12}$/.test(id))throw Error('معرّف صفحة ويكي مصدر غير صالح');
    const url='https://'+lang+'.wikisource.org/w/api.php?'+params({action:'parse',pageid:id,prop:'text|revid',format:'json',formatversion:'2',origin:'*'});
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let size=0,chunks=[],d;
    try{
      const r=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error'});if(!r.ok)throw Error('تعذر الوصول إلى ويكي مصدر (HTTP '+r.status+')');
      if(Number(r.headers.get('Content-Length')||0)>2000000)throw Error('الصفحة أكبر من الحد الآمن');
      if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2000000){await reader.cancel();throw Error('الصفحة أكبر من الحد الآمن')}chunks.push(part.value)}}finally{reader.releaseLock()}}
      else{const part=new Uint8Array(await r.arrayBuffer());size=part.length;if(size>2000000)throw Error('الصفحة أكبر من الحد الآمن');chunks=[part]}
      const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}d=JSON.parse(new TextDecoder().decode(bytes));
    }catch(e){if(e.name==='AbortError')throw Error('انتهت مهلة الاتصال بويكي مصدر');if(e instanceof TypeError)throw Error('تعذر الاتصال بويكي مصدر');throw e}finally{clearTimeout(timer)}
    const item=d?.parse;if(!item||String(item.pageid)!==id||!Number.isSafeInteger(item.revid)||item.revid<=0||typeof item.text!=='string')throw Error('الصفحة المعروضة غير متاحة أو استجابة ويكي غير صالحة');
    // No remote HTML is inserted into a document: strip tags and active contents before decoding entities.
    let plain=item.text.replace(/<(script|style|noscript|iframe|object|svg|canvas)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'').replace(/<\/?(?:p|div|br|li|tr|h[1-6]|section|blockquote)\b[^>]*>/gi,'\n').replace(/<[^>]*>/g,'');
    const decoder=document.createElement('textarea');decoder.innerHTML=plain.replace(/</g,'&lt;');const text=decoder.value.trim();
    if(!text||new TextEncoder().encode(text).length>1800000)throw Error('النص غير متاح أو أكبر من الحد الآمن');
    return {title:String(item.title||'بلا عنوان').slice(0,300),page_id:id,language:lang,revision_id:String(item.revid),revision_url:'https://'+lang+'.wikisource.org/w/index.php?oldid='+item.revid,text,warning:'نص آلي مستخرج من صفحة معروضة وقد يضم ترويسات وحواشي أو أخطاء؛ المراجعة تخص الصفحة وقد يتغير المحتوى المضمّن والقوالب. رقم السطر ليس صفحة الطبعة. راجع صورة المصدر والطبعة والترجمة والحقوق.'};
  }
  async function wikiListJSON(url){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let size=0,chunks=[];
    try{const r=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error'});if(!r.ok)throw Error('HTTP '+r.status);if(Number(r.headers.get('Content-Length')||0)>2000000)throw Error('استجابة الفهرس كبيرة جدًا');
      if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;if(size>2000000){await reader.cancel();throw Error('استجابة الفهرس كبيرة جدًا')}chunks.push(v.value)}}finally{reader.releaseLock()}}
      else{const v=new Uint8Array(await r.arrayBuffer());size=v.length;if(size>2000000)throw Error('استجابة الفهرس كبيرة جدًا');chunks=[v]}
      const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    }catch(e){if(e?.name==='AbortError')throw Error('انتهت مهلة الاتصال');if(e instanceof TypeError)throw Error('تعذر الاتصال بالخدمة أو حظر المتصفح الاستجابة');throw e}finally{clearTimeout(timer)}
  }
  async function wikisourceSubpages(id,lang,cursor=''){
    if(!['ar','en','fr','fa','tr'].includes(lang)||typeof id!=='string'||!/^[1-9][0-9]{0,12}$/.test(id))throw Error('معرّف صفحة أو لغة ويكي مصدر غير صالح');
    if(typeof cursor!=='string'||cursor.length>500||/[\x00-\x1f\x7f]/.test(cursor))throw Error('مؤشر الصفحات غير صالح');
    const host='https://'+lang+'.wikisource.org/w/api.php?',data=await wikiListJSON(host+params({action:'query',prop:'info',pageids:id,format:'json',formatversion:'2',origin:'*'}));
    const pages=data?.query?.pages,item=Array.isArray(pages)&&pages.length===1?pages[0]:null,title=item?.title;
    if(!item||String(item.pageid)!==id||item.ns!==0||typeof title!=='string'||!title.trim()||title.length>300)throw Error('صفحة ويكي مصدر غير صالحة أو ليست صفحة عمل');
    const prefix=title.split('/')[0]+'/';if(cursor&&!cursor.replaceAll('_',' ').startsWith(prefix))throw Error('مؤشر الصفحات لا ينتمي إلى العمل');
    const p={action:'query',list:'allpages',apnamespace:'0',apprefix:prefix,aplimit:'100',apfilterredir:'nonredirects',format:'json',formatversion:'2',origin:'*'};if(cursor)p.apcontinue=cursor;
    const result=await wikiListJSON(host+params(p)),matches=result?.query?.allpages;if(!Array.isArray(matches))throw Error('تعذر قراءة قائمة الصفحات');
    const out=[],seen=new Set();for(const row of matches.slice(0,100)){const id=row?.pageid,name=row?.title;if(!Number.isSafeInteger(id)||id<=0||id>=1e13||row.ns!==0||typeof name!=='string'||!name.startsWith(prefix)||name.length>300||seen.has(id))continue;seen.add(id);out.push({page_id:String(id),title:name})}
    let more=result?.continue?.apcontinue;if(typeof more!=='string'||more.length>500||!more.replaceAll('_',' ').startsWith(prefix)||/[\x00-\x1f\x7f]/.test(more))more='';
    return {page_id:id,language:lang,title,prefix,pages:out,next_cursor:more,truncated:matches.length>100||!!more,warning:'صفحات يبدأ عنوانها بالبادئة نفسها؛ قد لا تكون فصولًا أو نصوصًا كاملة، ولا يثبت ترتيبها أو اكتمال الكتاب. راجع الصفحات والطبعة والحقوق.'};
  }
  async function internetArchive(q) {
    const phrase=q.replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    const p=new URLSearchParams({q:`"${phrase}" AND mediatype:texts`,rows:'10',output:'json'});
    for(const field of ['identifier','title','creator','year'])p.append('fl[]',field);
    const d=await getJSON('https://archive.org/advancedsearch.php?'+p.toString());
    return (d.response?.docs||[]).filter(x=>typeof x.identifier==='string'&&/^[A-Za-z0-9._-]{1,100}$/.test(x.identifier)).map(x=>({title:String(Array.isArray(x.title)?x.title[0]:(x.title||x.identifier)).slice(0,300),url:'https://archive.org/details/'+x.identifier,author:String(Array.isArray(x.creator)?x.creator.slice(0,5).join(', '):(x.creator||'')).slice(0,300),detail:'سنة النشر المفهرسة: '+String(x.year||'غير معروفة')+'؛ قد يكون السجل غير دقيق أو مكررًا.',access:'سجل كتاب في Internet Archive؛ لا يضمن الإتاحة أو التنزيل أو الترخيص.'}));
  }
  async function loc(q, collection) {
    if(!['world-digital-library','chronicling-america','islamic-manuscripts-from-mali'].includes(collection))throw Error('مجموعة غير مدعومة');
    const p={fo:'json',at:'results',c:'8',...(collection==='chronicling-america'?{dl:'page',qs:q}:{q})};
    const d=await getJSON('https://www.loc.gov/collections/'+collection+'/?'+params(p));
    return (d.results||[]).flatMap(x=>{
      let url;try{url=new URL(x.url||x.id||'');if(!['www.loc.gov','loc.gov'].includes(url.hostname)||!['http:','https:'].includes(url.protocol)||url.username||url.password)return [];url.protocol='https:';}catch{return [];}
      const date=String(x.date||'غير معروف').slice(0,100),kind=Array.isArray(x.original_format)?x.original_format.slice(0,4).join(', '):String(x.original_format||'');
      const note=collection==='chronicling-america'?'صفحة صحيفة أمريكية؛ تحقق من التاريخ وصورة الصفحة وأخطاء OCR. ':collection==='islamic-manuscripts-from-mali'?'مخطوطات مالي الإسلامية؛ قد تكون النتيجة وصفًا فقط، وراجع الصورة وحقوقها. ':'';
      return [{title:String(Array.isArray(x.title)?(x.title[0]||'بلا عنوان'):(x.title||'بلا عنوان')).slice(0,300),url:url.href,author:'مكتبة الكونغرس / الجهة الحافظة كما في السجل',detail:'التاريخ في السجل: '+date+'؛ النوع: '+note+(kind||'غير محدد')+'؛ قد يشير التاريخ إلى النشر أو إنشاء المادة لا إلى الحدث.',access:'سجل أرشيفي؛ لم تُقرأ المادة أو يثبت ترخيص استخدامها. '+(x.access_restricted===true?'يذكر السجل وجود تقييد.':'تحقق من الإتاحة والحقوق في السجل.')}];
    });
  }
  async function doaj(q) {
    const d=await getJSON('https://doaj.org/api/search/articles/'+encodeURIComponent(q)+'?'+params({page:'1',pageSize:'10'}));
    return (d.results||[]).flatMap(x=>{if(!/^[a-f0-9]{32}$/.test(x.id||'')||!x.bibjson||typeof x.bibjson!=='object')return [];const b=x.bibjson,j=b.journal||{},doi=(Array.isArray(b.identifier)?b.identifier:[]).find(t=>t?.type==='doi')?.id||'';return [{title:String(b.title||'بلا عنوان').slice(0,300),author:(Array.isArray(b.author)?b.author:[]).slice(0,5).map(a=>a?.name||'').join(', ').slice(0,300),url:'https://doaj.org/article/'+x.id,detail:'سنة نشر الدراسة: '+String(b.year||'غير معروفة')+'؛ المجلة: '+String(j.title||'غير معروفة')+'؛ DOI: '+String(doi),access:'سجل دراسة في DOAJ؛ تحقق من النص الكامل والرخصة لدى الناشر. لم يُقرأ النص آليًا.'}];});
  }
  async function openalex(q) {
    const d=await getJSON('https://api.openalex.org/works?'+params({search:q,per_page:'10',select:'id,title,publication_year,authorships,open_access'}));
    return (d.results||[]).flatMap(x=>{if(!/^https:\/\/openalex\.org\/W[0-9]+$/.test(x.id||''))return [];const authors=Array.isArray(x.authorships)?x.authorships:[],oa=x.open_access||{};return [{title:String(x.title||'بلا عنوان').slice(0,300),author:authors.slice(0,5).map(a=>a.author?.display_name||'').join(', ').slice(0,300),url:x.id,detail:'سنة نشر الدراسة: '+String(x.publication_year||'غير معروفة')+'؛ حالة الوصول بحسب الفهرس: '+String(oa.oa_status||'غير معروف'),access:'سجل OpenAlex؛ تحقق من النص الكامل والرخصة والإتاحة الحالية. لم يُقرأ النص آليًا.'}];});
  }
  async function readWikisource(id) {
    if(typeof id!=='string'||!/^[1-9][0-9]{0,12}$/.test(id))throw Error('معرّف صفحة ويكي مصدر غير صالح');
    const url='https://ar.wikisource.org/w/api.php?'+params({action:'query',prop:'revisions',pageids:id,rvprop:'ids|timestamp|content',rvslots:'main',format:'json',formatversion:'2',origin:'*'});
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),15000);let bytes=0,chunks=[];
    try {
      const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error('تعذر الوصول إلى ويكي مصدر');
      const size=Number(r.headers.get('Content-Length')||0);if(size>2000000)throw Error('الصفحة أكبر من الحد الآمن؛ افتحها على موقعها أو اختر صفحة أصغر');
      if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2000000){await reader.cancel();throw Error('الصفحة أكبر من الحد الآمن؛ افتحها على موقعها أو اختر صفحة أصغر')}chunks.push(part.value)}}finally{reader.releaseLock()}}
      else {const part=new Uint8Array(await r.arrayBuffer());bytes=part.length;if(bytes>2000000)throw Error('الصفحة أكبر من الحد الآمن؛ افتحها على موقعها أو اختر صفحة أصغر');chunks=[part]}
      const all=new Uint8Array(bytes);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length}
      const d=JSON.parse(new TextDecoder().decode(all)),pages=d.query?.pages||[],page=pages.length===1?pages[0]:{},rev=page.revisions?.[0],text=rev?.slots?.main?.content;
      if(String(page.pageid)!==id||!Number.isSafeInteger(rev?.revid)||rev.revid<=0||typeof text!=='string'||!text.trim())throw Error('الصفحة غير متاحة أو لا تحتوي نصًا قابلًا للقراءة');
      if(new TextEncoder().encode(text).length>1800000)throw Error('الصفحة أكبر من الحد الآمن؛ افتحها على موقعها أو اختر صفحة أصغر');
      return {title:String(page.title||'بلا عنوان').slice(0,300),page_id:id,revision_id:String(rev.revid),timestamp:String(rev.timestamp||''),text,revision_url:'https://ar.wikisource.org/w/index.php?oldid='+rev.revid,warning:'النص خام بصيغة ويكي وقد يكون فهرسًا أو جزءًا من كتاب، لا كتابًا كاملًا. رقم السطر ليس رقم صفحة الطبعة. تحقق من النسخة والترخيص وطابقها مع المصدر.'};
    } catch(e){if(e?.name==='AbortError')throw Error('انتهت مهلة الاتصال بويكي مصدر');throw e}
    finally {clearTimeout(timer)}
  }
  const iaLimit=16*1024*1024;
  function iaIdentifier(id){if(typeof id!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(id)||id==='.'||id==='..')throw Error('معرّف Internet Archive غير صالح');return id;}
  function iaTruthy(v){return v===true||['true','1','yes'].includes(String(v).toLowerCase());}
  async function iaFetch(url,limit){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);let bytes=0,chunks=[];
    try{
      const r=await fetch(url,{signal:controller.signal,credentials:'omit'});
      if(!r.ok)throw Error('تعذر الوصول إلى Internet Archive (HTTP '+r.status+')');
      if(r.url){const u=new URL(r.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='archive.org'||/^ia[0-9]+\.us\.archive\.org$/.test(u.hostname)))throw Error('إعادة توجيه Internet Archive غير مدعومة');}
      if((r.headers.get('Content-Type')||'').toLowerCase().startsWith('text/html'))throw Error('لم يُرجع الموقع نصًا أو بيانات صالحة');
      if(Number(r.headers.get('Content-Length')||0)>limit)throw Error('استجابة Internet Archive أكبر من الحد الآمن');
      if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.length;if(bytes>limit){await reader.cancel();throw Error('استجابة Internet Archive أكبر من الحد الآمن')}chunks.push(p.value)}}finally{reader.releaseLock()}}
      else {const p=new Uint8Array(await r.arrayBuffer());bytes=p.length;if(bytes>limit)throw Error('استجابة Internet Archive أكبر من الحد الآمن');chunks=[p]}
      const out=new Uint8Array(bytes);let at=0;for(const p of chunks){out.set(p,at);at+=p.length}return out;
    }catch(e){if(e?.name==='AbortError')throw Error('انتهت مهلة الاتصال بـ Internet Archive');if(e instanceof TypeError)throw Error('تعذر الاتصال بـ Internet Archive أو حظر المتصفح الاستجابة');throw e}finally{clearTimeout(timer)}
  }
  async function readInternetArchive(id){
    id=iaIdentifier(id);let d;
    try{d=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await iaFetch('https://archive.org/metadata/'+id,2000000)))}catch(e){if(e instanceof SyntaxError)throw Error('تعذر قراءة بيانات Internet Archive');throw e}
    const meta=d?.metadata;if(!meta||meta.identifier!==id||meta.mediatype!=='texts')throw Error('لم يُعثر على سجل نصي متاح');
    if(iaTruthy(d.is_dark)||iaTruthy(meta['access-restricted-item'])||meta.lending_edition||meta.lending_identifier)throw Error('المادة مقيّدة أو للإعارة؛ افتح سجلها ولا يتجاوز سَنَد القيود');
    if(!Array.isArray(d.files))throw Error('قائمة الملفات غير متاحة');
    const files=d.files.filter(x=>x&&typeof x.name==='string'&&x.name.endsWith('_djvu.txt')&&x.name.length<=255&&!(/[\x00-\x1f/\\]/.test(x.name))&&!iaTruthy(x.private)&&/^[0-9]+$/.test(String(x.size||''))&&Number(x.size)>0&&Number(x.size)<=iaLimit).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
    if(!files.length)throw Error('لا يوجد نص OCR عام مناسب حتى 16 ميجابايت في السجل؛ افتح الموقع أو أضف نسخة مسموحة');
    const file=files[0],encoded=encodeURIComponent(file.name),raw=await iaFetch('https://archive.org/cors/'+id+'/'+encoded,iaLimit),sha1=/^[0-9a-f]{40}$/i.test(file.sha1||'')?file.sha1.toLowerCase():'';
    if(raw.length!==Number(file.size))throw Error('تغير الملف أو لم يكتمل تنزيله؛ حاول مجددًا');
    if(sha1){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',raw))).map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==sha1)throw Error('تغير الملف أو لم يكتمل تنزيله؛ حاول مجددًا')}
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(raw)}catch{throw Error('ترميز نص OCR غير مدعوم')}
    if(!text.trim()||text.includes('\0'))throw Error('لم يُرجع الموقع نص OCR صالحًا');
    return {text,filename:file.name,url:'https://archive.org/details/'+id,file_url:'https://archive.org/download/'+id+'/'+encoded,sha1,warning:'نص OCR آلي قد يحتوي أخطاء أو ينقصه سياق، ورقم السطر ليس صفحة الطبعة. الإتاحة لا تثبت حق إعادة الاستخدام؛ راجع حقوق المادة وطابق الاقتباس مع صور الأصل.'};
  }
  // Turath advertises read-only, bounded tools. No cookies or third-party proxy.
  async function turathCall(tool,args){
    let session='';
    async function rpc(method,params,id){
      const body={jsonrpc:'2.0',method,params};if(id!==undefined)body.id=id;
      const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};if(session)headers['Mcp-Session-Id']=session;
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let size=0,chunks=[];
      try{
        const r=await fetch('https://mcp.turath.io/mcp/',{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal,credentials:'omit',redirect:'error'});
        if(r.status===429)throw Error('بلغت حد طلبات تراث؛ حاول لاحقًا');if(!r.ok)throw Error('تعذر اتصال تراث (HTTP '+r.status+')');
        session=r.headers.get('mcp-session-id')||session;if(session&&!/^[A-Za-z0-9._~+\-/=]{1,256}$/.test(session))throw Error('معرّف جلسة تراث غير صالح');
        if(id===undefined&&(r.status===202||r.status===204))return {};
        if(Number(r.headers.get('content-length')||0)>2000000)throw Error('استجابة تراث أكبر من الحد الآمن');
        if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>2000000){await reader.cancel();throw Error('استجابة تراث أكبر من الحد الآمن')}chunks.push(p.value)}}finally{reader.releaseLock()}}
        else{const p=new Uint8Array(await r.arrayBuffer());size=p.length;if(size>2000000)throw Error('استجابة تراث أكبر من الحد الآمن');chunks=[p]}
        if(id===undefined&&!size)return {};const all=new Uint8Array(size);let off=0;for(const p of chunks){all.set(p,off);off+=p.length}
        let obj;try{let text=new TextDecoder('utf-8',{fatal:true}).decode(all);if((r.headers.get('content-type')||'').includes('text/event-stream'))text=(text.split('\n').find(l=>l.startsWith('data:'))||'').slice(5).trim();obj=JSON.parse(text)}catch{throw Error('تعذر قراءة استجابة تراث')}
        if(!obj||obj.id!==id||obj.error||!obj.result)throw Error('تعذر تنفيذ طلب تراث أو تغيرت الواجهة');return obj.result;
      }catch(e){if(e?.name==='AbortError')throw Error('انتهت مهلة اتصال تراث');if(e instanceof TypeError)throw Error('تعذر الاتصال بتراث أو حظر المتصفح الاستجابة');throw e}finally{clearTimeout(timer)}
    }
    const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'SanadStudio',version:'1.0'}},1);if(!init.protocolVersion)throw Error('تعذر بدء جلسة تراث');
    await rpc('notifications/initialized',{},undefined);
    const result=await rpc('tools/call',{name:tool,arguments:args},2);if(result.isError||!Array.isArray(result.content))throw Error('تعذر تنفيذ بحث تراث');
    let data;try{data=JSON.parse(result.content.find(x=>x.type==='text'&&typeof x.text==='string')?.text)}catch{throw Error('صيغة استجابة تراث غير مدعومة')}
    if(!data||typeof data!=='object'||Array.isArray(data))throw Error('صيغة استجابة تراث غير مدعومة');return data;
  }
  async function searchTurath(q){
    if(typeof q!=='string'||q.trim().length<2||q.trim().length>300)throw Error('أدخل عبارة من حرفين إلى 300 حرف');q=q.trim();
    const data=await turathCall('search_turath',{q,page:1});if(!Array.isArray(data.results))throw Error('صيغة نتائج تراث غير مدعومة');const seen=new Set(),results=[];
    for(const item of data.results.slice(0,50)){const meta=item?.meta||{},book=item?.book_id,page=meta.page_id;
      if(!Number.isSafeInteger(book)||!Number.isSafeInteger(page)||book<=0||page<=0||book>999999999||page>999999999||seen.has(book+':'+page))continue;seen.add(book+':'+page);
      const vol=String(meta.vol||'').slice(0,30),printed=String(meta.page||'').slice(0,30),snippet=typeof item.snip==='string'?item.snip.slice(0,700):'';
      results.push({title:String(meta.book_name||'بلا عنوان').slice(0,300),author:String(meta.author_name||'').slice(0,300),url:'https://app.turath.io/book/'+book+'?page='+page,book_id:String(book),page_id:String(page),detail:'المجلد بحسب تراث: '+(vol||'غير معروف')+'؛ الصفحة بحسب تراث: '+(printed||'غير معروفة')+'. معاينة بحث: '+snippet,access:'بحث في تراث؛ المعاينة غير كافية للاستشهاد. افتح صفحة المصدر وراجع السياق والطبعة والحقوق.'});if(results.length>=20)break;
    }
    return {query:q,results,warning:'نتائج الصفحة الأولى فقط وقد تكون ناقصة؛ افتح الصفحة الأصلية وراجع السياق والطبعة والحقوق قبل الاستشهاد.'};
  }
  async function readTurath(bookId,pageId){
    if(![bookId,pageId].every(x=>typeof x==='string'&&/^[1-9][0-9]{0,8}$/.test(x)))throw Error('معرّف كتاب أو صفحة تراث غير صالح');
    const book=Number(bookId),page=Number(pageId),data=await turathCall('get_page',{book_id:book,page_id:page}),text=data.text;
    if(data.book_id!==book||data.page_id!==page||typeof text!=='string'||!text.trim()||new TextEncoder().encode(text).length>1800000)throw Error('صفحة تراث غير متاحة أو جاءت استجابتها غير متوقعة');
    const meta=data.meta||{};return {text,url:'https://app.turath.io/book/'+book+'?page='+page,volume:String(meta.vol||'').slice(0,30),printed_page:String(meta.page||'').slice(0,30),warning:'نص صفحة واحدة من تراث وقد يحتوي أخطاء أو حواشي. معرّف الصفحة الداخلي ليس رقم صفحة الطبعة؛ تحقق من موضع الصفحة والسياق والطبعة والحقوق في المصدر.'};
  }
  // The upstream metadata snapshot is downloaded only after explicit user action.
  const openitiRevision='cfc4157a3cf2054c0888f133970a4eaa3e22e58c';
  const openitiURL='https://raw.githubusercontent.com/OpenITI/RELEASE/'+openitiRevision+'/metadata/OpenITI_metadata_2025-1-9.tsv';
  let openitiIndexPromise=null;
  function openitiIndex(){
    if(openitiIndexPromise)return openitiIndexPromise;
    openitiIndexPromise=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000),limit=13500000;let bytes=0,chunks=[];
      try{
        const r=await fetch(openitiURL,{signal:controller.signal,credentials:'omit'});
        if(!r.ok)throw Error('تعذر تنزيل فهرس OpenITI (HTTP '+r.status+')');
        if(Number(r.headers.get('Content-Length')||0)>limit)throw Error('فهرس OpenITI أكبر من الحد الآمن');
        if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>limit){await reader.cancel();throw Error('فهرس OpenITI أكبر من الحد الآمن')}chunks.push(part.value)}}finally{reader.releaseLock()}}
        else{const part=new Uint8Array(await r.arrayBuffer());bytes=part.length;if(bytes>limit)throw Error('فهرس OpenITI أكبر من الحد الآمن');chunks=[part]}
        const all=new Uint8Array(bytes);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.length}
        const text=new TextDecoder('utf-8',{fatal:true}).decode(all),header=(text.split('\n',1)[0]||'').replace(/^\uFEFF/,'').split('\t');
        if(!['version_uri','author_ar','author_lat','title_ar','title_lat','date','status','ed_info','local_path'].every(k=>header.includes(k)))throw Error('صيغة فهرس OpenITI غير مدعومة');
        return text;
      }catch(e){if(e?.name==='AbortError')throw Error('انتهت مهلة تنزيل فهرس OpenITI');if(e instanceof TypeError)throw Error('تعذر الاتصال بـ GitHub لتنزيل فهرس OpenITI');throw e}
      finally{clearTimeout(timer)}
    })().catch(e=>{openitiIndexPromise=null;throw e});
    return openitiIndexPromise;
  }
  function openitiPath(path){
    if(typeof path!=='string'||path.length>500)throw Error('مسار OpenITI غير صالح');
    const p=path.split('/');if(p.length!==4||p[0]!=='data'||p.slice(1).some(x=>!(/^[A-Za-z0-9_.-]+$/.test(x))||x==='.'||x==='..'))throw Error('مسار OpenITI غير صالح');return path;
  }
  async function readOpeniti(path){
    path=openitiPath(path);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000),limit=16*1024*1024;let bytes=0,chunks=[];
    try{
      const r=await fetch('https://raw.githubusercontent.com/OpenITI/RELEASE/'+openitiRevision+'/'+path,{signal:controller.signal,credentials:'omit'});
      if(!r.ok)throw Error('النص غير متاح (HTTP '+r.status+')');
      if(Number(r.headers.get('Content-Length')||0)>limit)throw Error('النص أكبر من 16 ميجابايت؛ افتحه على موقع OpenITI');
      if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>limit){await reader.cancel();throw Error('النص أكبر من 16 ميجابايت؛ افتحه على موقع OpenITI')}chunks.push(part.value)}}finally{reader.releaseLock()}}
      else{const part=new Uint8Array(await r.arrayBuffer());bytes=part.length;if(bytes>limit)throw Error('النص أكبر من 16 ميجابايت؛ افتحه على موقع OpenITI');chunks=[part]}
      const all=new Uint8Array(bytes);let offset=0;for(const part of chunks){all.set(part,offset);offset+=part.length}
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(all)}catch{throw Error('تعذر قراءة ترميز نص OpenITI')}
      if(!text.startsWith('######OpenITI#'))throw Error('لم يرجع الموقع نص OpenITI متاحًا بصيغته المتوقعة');
      return {text,url:'https://github.com/OpenITI/RELEASE/blob/'+openitiRevision+'/'+path,warning:'نص OpenITI خام وقد يحتوي أخطاء أو وسومًا؛ لا يثبت موافقة أصحاب الحقوق. الإصدار CC BY-NC-SA 4.0 يقيد الاستخدام التجاري؛ راجع حقوق النص والطبعة وطابق الاقتباس مع الأصل.'};
    }catch(e){if(e?.name==='AbortError')throw Error('انتهت مهلة تنزيل نص OpenITI');if(e instanceof TypeError)throw Error('تعذر الاتصال بـ GitHub لتنزيل النص');throw e}finally{clearTimeout(timer)}
  }
  async function searchOpeniti(q){
    q=queryText(q);const needle=normalize(q),terms=needle.split(/\s+/).filter(Boolean);if(!terms.length)throw Error('عبارة البحث غير صالحة');
    const lines=(await openitiIndex()).split(/\r?\n/),headers=(lines.shift()||'').replace(/^\uFEFF/,'').split('\t');
    const keys=['version_uri','author_ar','author_lat','title_ar','title_lat','date','status','ed_info','local_path'],idx=Object.fromEntries(keys.map(k=>[k,headers.indexOf(k)]));
    if(keys.some(k=>idx[k]<0))throw Error('صيغة فهرس OpenITI غير مدعومة');
    let total=0;const best=[];
    for(const line of lines){const v=line.split('\t');if(v.length<headers.length)continue;const d=Object.fromEntries(keys.map(k=>[k,v[idx[k]]]));const parts=d.local_path.split('/');
      if(parts.length!==4||parts[0]!=='data'||parts.slice(1).some(x=>!(/^[A-Za-z0-9_.-]+$/.test(x))||x==='.'||x==='..'))continue;
      const combined=normalize([d.title_ar,d.title_lat,d.author_ar,d.author_lat,d.version_uri].join(' '));if(!terms.every(t=>combined.includes(t)))continue;
      total++;const rank=(normalize(d.title_ar+' '+d.title_lat).includes(needle)?0:2)+(d.status.toLowerCase()==='pri'?0:1);
      if(best.length>=25&&rank>=best[best.length-1].rank)continue;
      best.push({rank,item:{title:(d.title_ar||d.title_lat||d.version_uri).slice(0,300),author:(d.author_ar||d.author_lat).slice(0,300),url:'https://github.com/OpenITI/RELEASE/blob/'+openitiRevision+'/'+d.local_path,detail:'معرّف النسخة: '+d.version_uri.slice(0,200)+'؛ رمز السنة في الفهرس: '+(d.date||'غير معروف').slice(0,40)+' (ليس تاريخ الحدث)؛ حالة النسخة: '+(d.status||'غير معروف').slice(0,40)+'؛ بيانات الطبعة: '+(d.ed_info||'غير معروفة').slice(0,400),access:'سجل OpenITI؛ قد يتعذر فتح النص. لم يُقرأ آليًا. راجع الطبعة والرخصة، وبخاصة قيود الاستخدام التجاري.'}});
      best.sort((a,b)=>a.rank-b.rank);if(best.length>25)best.pop();
    }
    return {query:q,total,results:best.map(x=>x.item),warning:'بحث في فهرس OpenITI 2025.1.9 فقط؛ لم يُقرأ النص. رخصة المجموعة CC BY-NC-SA 4.0 تقيد الاستخدام التجاري؛ راجع الحقوق والطبعة والإتاحة قبل النشر.'};
  }
  async function research(q, selected) {
    q=queryText(q);
    const providers=[['Crossref',async()=> (await crossref(q)).map(x=>({title:x.title,url:x.url,author:x.author,detail:'DOI: '+x.doi,access:'بيانات فهرسية — تحقق من النص الكامل'}))],['Open Library',async()=> (await openlibrary(q)).map(x=>({title:x.title,url:x.url,author:x.author,detail:'سنة طبعة مفهرسة: '+x.year,access:'بيانات فهرسية — تحقق من النص الكامل'}))],['Wikimedia Commons',()=>commons(q)],['إحالات ويكيبيديا العربية',()=>wikiCitations(q)],['ويكي مصدر العربية',()=>wikisource(q)],['ويكي مصدر الإنجليزية',()=>wikisourceOther(q,'en')],['ويكي مصدر الفرنسية',()=>wikisourceOther(q,'fr')],['ويكي مصدر الفارسية',()=>wikisourceOther(q,'fa')],['ويكي مصدر التركية',()=>wikisourceOther(q,'tr')],['Internet Archive',()=>internetArchive(q)],['DOAJ',()=>doaj(q)],['OpenAlex',()=>openalex(q)],['المكتبة الرقمية العالمية',()=>loc(q,'world-digital-library')],['صحف Chronicling America',()=>loc(q,'chronicling-america')],['مخطوطات مالي الإسلامية',()=>loc(q,'islamic-manuscripts-from-mali')]];
    if(selected!==undefined&&(typeof selected!=='string'||!providers.some(p=>p[0]===selected)))throw Error('المصدر غير مدعوم');
    const requested=selected===undefined?providers:providers.filter(p=>p[0]===selected);
    const outcomes=await Promise.all(requested.map(async ([provider,fn])=>{try{const items=await fn();return {provider,items,status:'اكتمل',reason:''};}catch(e){const message=String(e?.message||'');return {provider,items:[],status:'تعذر الاتصال أو قراءة الاستجابة',reason:(/^HTTP [0-9]{3}$/.test(message)||message==='انتهت مهلة الاتصال')?message:'تحقق من الاتصال أو قيود المتصفح'};}}));
    return {query:q,searched_at:new Date().toISOString(),providers:outcomes.map(x=>({provider:x.provider,status:x.status,count:x.items.length,reason:x.reason})),results:outcomes.flatMap(x=>x.items.map(item=>({...item,provider:x.provider}))),warning};
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
  async function exportDocument(id) {
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('معرّف الملف غير صالح');
    const bytes=await documentStore('readonly',id);
    if(!bytes)throw Error('ملف مرتبط مفقود؛ أعد إرفاقه قبل إنشاء نسخة شاملة');
    if(!bytes.length||bytes.length>MAX_FILE)throw Error('حجم الملف المرتبط غير صالح');
    const digest=await crypto.subtle.digest('SHA-256',bytes),actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(actual!==id)throw Error('ملف مرتبط تالف أو لا تطابق بصمته المعرّف');
    const head=new TextDecoder().decode(bytes.slice(0,1024)),name=id+(head.includes('%PDF-')?'.pdf':'.txt');
    let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    return {id,name,size:bytes.length,content:btoa(binary)};
  }
  async function searchDocument(id,query,mode='basic') {
    if(!['basic','arabic-variants'].includes(mode))throw Error('نمط مطابقة البحث غير صالح');
    if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('معرّف الملف غير صالح');
    if(typeof query!=='string'||trim(query).length<2||query.length>200||!normalize(query,mode).trim())throw Error('أدخل عبارة بحث من حرفين إلى 200 حرف');
    const bytes=await documentStore('readonly',id);if(!bytes)throw Error('الملف غير موجود في هذا المتصفح؛ أضفه مجددًا');
    if(!bytes.length||bytes.length>MAX_FILE)throw Error('حجم الملف المرتبط غير صالح');
    const digest=await crypto.subtle.digest('SHA-256',bytes),actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    if(actual!==id)throw Error('ملف مرتبط تالف أو لا تطابق بصمته المعرّف');
    const needle=normalize(query.trim(),mode),matches=[],head=new TextDecoder().decode(bytes.slice(0,1024));let scanned=0,total=1,fileWarningForSearch=fileWarning;
    if(head.includes('%PDF-')) {
      try {
        if(!Promise.withResolvers)Promise.withResolvers=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};};
        const pdf=await import('./vendor/pdf.min.mjs');
        pdf.GlobalWorkerOptions.workerSrc=new URL('web/vendor/pdf.worker.min.mjs',document.baseURI).href;
        const task=pdf.getDocument({data:bytes.slice(),isEvalSupported:false});const doc=await task.promise;total=doc.numPages;
        for(let i=1;i<=Math.min(total,MAX_PAGES);i++){const page=await doc.getPage(i);const content=await page.getTextContent();scanned++;const line=content.items.map(x=>x.str||'').join(' ');if(normalize(line,mode).includes(needle))matches.push({location:`صفحة PDF ${i}`,text:excerpt(line,needle,mode)});if(matches.length>=MAX_MATCHES)break;}
        await doc.destroy();
      } catch(e) {if(e?.name==='PasswordException')throw Error('هذا الملف محمي أو مشفر؛ لا يتجاوز سَنَد الحماية. أضف نسخة مسموحة قابلة للقراءة.');throw Error('تعذر قراءة PDF؛ قد يكون تالفًا أو لا يدعمه المتصفح.');}
    } else {
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw Error('تعذر قراءة الملف النصي')};scanned=1;
      const isOpeniti=text.startsWith('######OpenITI#'),isMineru=text.startsWith('#SANAD-MINERU-TEXT-1\n'),isBatchOcr=text.startsWith('#SANAD-OCR-TEXT-1\n');let carry=[],paginatedPage=null;
      for(const [i,line] of text.split(/\r?\n/).entries()){
        if(isMineru||isBatchOcr){
          const marker=/^#SANAD-PAGE:([1-9][0-9]{0,6})$/.exec(line);
          if(marker){paginatedPage=Number(marker[1]);continue}
          if(paginatedPage!==null&&line.startsWith('| ')&&normalize(line.slice(2),mode).includes(needle))matches.push({location:`صفحة PDF ${paginatedPage} بحسب ${isMineru?'MinerU':'OCR المحلي'}؛ طابقها بالأصل`,text:excerpt(line.slice(2),needle,mode)});
        }else if(isOpeniti){
          if(!line.trim()||line.startsWith('# ')||line.startsWith('### '))carry=[];
          const cleaned=line.replace(/^~~\s?/,''),previous=carry.map(x=>x.text).join(' '),joined=(previous?previous+' ':'')+cleaned,previousLength=normalize(previous,mode).length,pos=normalize(joined,mode).indexOf(needle,Math.max(0,previousLength-needle.length+1));
          if(pos>=0&&pos+needle.length>previousLength){
            // Use the matching occurrence, not the oldest context or an earlier hit.
            let first=i+1,offset=0;
            if(pos<previousLength)for(const item of carry){const end=offset+normalize(item.text,mode).length;if(pos<end){first=item.line;break}offset=end+1}
            const location=first===i+1?`السطر ${i+1}`:`الأسطر ${first}–${i+1}`;
            matches.push({location:location+' (نص OpenITI الخام، ليس رقم صفحة)',text:excerpt(joined,needle,mode,pos)});
          }
          carry.push({line:i+1,text:cleaned.slice(-400)});carry=carry.slice(-6);while(carry.reduce((n,x)=>n+x.text.length,0)>800&&carry.length>1)carry.shift();
        }else if(normalize(line,mode).includes(needle))matches.push({location:`السطر ${i+1}`,text:excerpt(line,needle,mode)});
        if(matches.length>=MAX_MATCHES)break;
      }
      if(isBatchOcr)fileWarningForSearch='نص OCR المحلي تقريبي وقد يتضمن صفحات فارغة أو أخطاء؛ طابق المقتطف ورقم الصفحة مع الأصل والطبعة.';
      if(isMineru)fileWarningForSearch='نتيجة MinerU مستوردة وقد تحذف عناصر أو تخطئ في ترتيب العربية وقراءة الصفحات. رقم الصفحة من ملف النتيجة؛ طابقه مع الأصل والطبعة.';
      if(isOpeniti)fileWarningForSearch='نص OpenITI الخام قد يحتوي وسومًا وأخطاء؛ الأسطر ليست صفحات الطبعة. طابق المقتطف مع الأصل وراجع الحقوق.';
    }
    return {match_mode:mode,matches,scanned,total,partial:scanned<total||matches.length>=MAX_MATCHES,warning:fileWarningForSearch+(mode==='arabic-variants'?' مطابقة مرنة للألف والياء فقط؛ قد تشمل أسماء مختلفة ولا تشمل جميع اختلافات التهجئة.':'')};
  }
  window.browserEngine = async (path,data={}) => {
    if(path==='/api/projects')return {projects:projects()};
    if(path==='/api/save'){validate(data.project);const items=projects().filter(x=>x.id!==data.project.id);items.unshift(data.project);writeProjects(items);return {ok:true};}
    if(path==='/api/delete'){writeProjects(projects().filter(x=>x.id!==data.id));return {ok:true};}
    if(path==='/api/projects/import'){
      if(!Array.isArray(data.projects)||data.projects.length<1||data.projects.length>100)throw Error('عدد المشاريع غير صالح');
      data.projects.forEach(validate);const existing=projects(),ids=new Set(existing.map(p=>p.id));
      for(const p of data.projects){if(ids.has(p.id))throw Error('أحد المشاريع موجود مسبقًا؛ لم يُستبدل أي مشروع');ids.add(p.id)}
      writeProjects([...data.projects,...existing]);return {count:data.projects.length};
    }
    if(path==='/api/topics')return topics(data.category??'travel',data.query??'',data.cursor??'');
    if(path==='/api/topic-sections')return topicSections(data.page_id);
    if(path==='/api/qdl/search')return searchQdl(data.id,data.query);
    if(path==='/api/turath/search')return searchTurath(data.query);
    if(path==='/api/turath/read')return readTurath(data.book_id,data.page_id);
    if(path==='/api/internet-archive/read')return readInternetArchive(data.identifier);
    if(path==='/api/wikisource/read')return readWikisource(data.page_id);
    if(path==='/api/wikisource/subpages')return wikisourceSubpages(data.page_id,data.language,data.cursor||'');
    if(path==='/api/wikisource/rendered')return readWikisourceRendered(data.page_id,data.language);
    if(path==='/api/openiti/read')return readOpeniti(data.path);
    if(path==='/api/openiti/search')return searchOpeniti(data.query);
    if(path==='/api/research')return research(data.query,data.provider);
    if(path==='/api/crossref')return {results:await crossref(data.query)};
    if(path==='/api/openlibrary')return {results:await openlibrary(data.query)};
    if(path==='/api/openalex/locations')return window.SanadOpenAccess.search(data.identifier);
    if(path==='/api/openlibrary/editions')return openlibraryEditions(data.work_id,data.offset??0);
    if(path==='/api/youtube')return {results:await youtube(data.query,data.key)};
    if(path==='/api/library/import')return {document:await importDocument(data.name,data.content)};
    if(path==='/api/library/export')return {document:await exportDocument(data.id)};
    if(path==='/api/library/search')return searchDocument(data.id,data.query,data.match_mode===undefined?'basic':data.match_mode);
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
