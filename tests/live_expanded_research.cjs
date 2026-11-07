// Diagnostic with a public historical topic: genuine providers, no user data.
const puppeteer=require('puppeteer-core');const origin=process.env.SANAD_TEST_ORIGIN;
const notice=x=>console.log('::notice title=Expanded research live diagnostic::'+x);
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();p.on('dialog',d=>d.accept(d.type()==='prompt'?'ابن خلدون':undefined));
 await p.goto(origin,{waitUntil:'load'});await p.click('#empty-new');await p.click('[data-tab="research"]');await p.click('#research-search');
 try{await p.waitForFunction(()=>researchResult?.plan&&researchTask===null,{timeout:210000})}catch(e){await p.click('#research-stop');await p.waitForFunction(()=>researchResult?.plan&&researchTask===null,{timeout:30000})}
 const info=await p.evaluate(()=>{const r=researchResult;return {queries:r.plan.queries.map(q=>({label:q.label,query:q.query,attempts:r.runs.filter(x=>x.query_id===q.id).map(x=>({provider:x.provider,status:x.status,count:x.count,reason:x.reason})),examples:r.results.filter(x=>x.appearances.some(a=>a.query_id===q.id)).slice(0,2).map(x=>x.title)})),unique:r.results.length,completed:r.runs.filter(x=>x.status==='اكتمل').length,failed:r.runs.filter(x=>x.status==='تعذر الاتصال أو قراءة الاستجابة').length,unattempted:r.runs.filter(x=>x.status==='لم تُنفذ').length}});
 notice(JSON.stringify(info));
 }catch(e){notice('Diagnostic unavailable: '+String(e.message).slice(0,250))}finally{if(browser)await browser.close()}})().catch(e=>notice('Diagnostic error: '+e.message));
