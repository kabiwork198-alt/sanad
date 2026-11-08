const puppeteer=require('puppeteer-core');
(async()=>{let b;try{
 b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await b.newPage(),errors=[];let allow=true,calls=0,failWiki=false;
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>allow?d.accept(d.type()==='prompt'?'تجربة':undefined):d.dismiss());await p.setRequestInterception(true);
 const extract='أحمد بن فضلان رحالة عباسي كتب رسالة عن الرحلة ووصف المناطق والشعوب التي زارها.';
 p.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(process.env.SANAD_TEST_ORIGIN).origin){
  if(u.pathname==='/api/topics'||u.pathname==='/api/topic-sections'){
   calls++;if(failWiki)return r.respond({status:503,contentType:'application/json',body:JSON.stringify({error:'تعذر الاتصال'})});
   if(process.env.SANAD_TEST_MOCK_TOPICS==='1'){const body=u.pathname==='/api/topics'?{topics:[{id:'129569',title:'أحمد بن فضلان',url:'https://ar.wikipedia.org/?curid=129569',extract}],query:'ابن فضلان',category:'travel',category_label:'الرحالة',next_cursor:'24',searched_at:'2026-11-06'}:{page_id:'129569',title:'أحمد بن فضلان',revision_url:'https://ar.wikipedia.org/w/index.php?oldid=76515169',sections:[{title:'رحلة ابن فضلان'},{title:'اكتشاف مخطوطة مشهد'}],warning:'راجع المصادر'};return r.respond({status:200,contentType:'application/json',body:JSON.stringify(body)})}
  }return r.continue()}

  if(u.hostname==='ar.wikipedia.org'&&u.pathname==='/w/api.php'){
   calls++;if(failWiki)return r.respond({status:503,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'{}'});let data;if(u.searchParams.get('action')==='parse')data={parse:{pageid:129569,title:'أحمد بن فضلان',revid:76515169,tocdata:{sections:[{tocLevel:1,line:'رحلة ابن فضلان'},{tocLevel:2,line:'اكتشاف مخطوطة مشهد'},{tocLevel:1,line:'المراجع'}]}}};
   else data={continue:{gsroffset:24},query:{pages:[{pageid:129569,ns:0,title:'أحمد بن فضلان',index:1,extract},{pageid:1,ns:0,title:'قائمة الرحلات',extract}]}};
   return r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)})}return r.abort();
 });
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await p.type('#topic-query','ابن فضلان');allow=false;await p.click('#topic-search');if(calls)throw Error('request before consent');allow=true;await p.click('#topic-search');await p.waitForSelector('[data-topic-sections="0"]');
 if((await p.$eval('#home-topics',e=>e.innerText)).includes('قائمة الرحلات'))throw Error('bad candidates not filtered');
 const x=await p.evaluate(()=>homeTopics);if(x.topics[0].title!=='أحمد بن فضلان'||!x.topics[0].extract.includes('رحالة')||x.query!=='ابن فضلان'||!x.next_cursor)throw Error('bad grounded candidate');
 allow=false;await p.click('[data-topic-sections="0"]');if(calls!==1)throw Error('sections without consent');allow=true;await p.click('[data-topic-sections="0"]');await p.waitForSelector('[data-topic-angle="1"]');
 if((await p.$eval('#home-topics',e=>e.innerText)).includes('ابحث في: المراجع'))throw Error('references not filtered');
 await p.click('[data-topic-angle="1"]');let state=await p.evaluate(()=>({current,query:researchQueryDraft}));if(!state.current.question.includes('اكتشاف مخطوطة مشهد')||!state.query.includes('اكتشاف مخطوطة مشهد')||!state.current.researchNotes.includes('oldid=76515169'))throw Error('chosen section and provenance lost');
 await p.click('#save');await p.waitForFunction(()=>!dirty);const id=state.current.id;await p.reload({waitUntil:'load'});await p.waitForSelector(`[data-project="${id}"]`);await p.click(`[data-project="${id}"]`);state=await p.evaluate(()=>current);if(!state.question.includes('مخطوطة مشهد')||!state.researchNotes.includes('129569'))throw Error('project not persisted');
 await p.click('[data-tab="overview"]');await p.click('#project-topic-search');await p.waitForSelector('[data-project-topic="0"]');await p.click('[data-project-topic="0"]');await p.waitForSelector('[data-project-angle="0"]');await p.click('[data-project-angle="0"]');
 state=await p.evaluate(()=>current);if(!state.question.includes('رحلة ابن فضلان')||!state.researchNotes.includes('oldid=76515169'))throw Error('workspace idea not applied with provenance');
 await p.click('#home');failWiki=true;await p.click('#topic-search');await p.waitForFunction(()=>document.querySelector('#home-topics').textContent.includes('تعذر جلب'));if(await p.evaluate(()=>homeTopics!==null))throw Error('fabricated fallback after network failure');
 for(const width of [320,390,1440]){await p.setViewport({width,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: consent, grounded metadata, filtered sections, research question, attribution and persistence');
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
