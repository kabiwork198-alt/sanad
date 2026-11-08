// The scheduler, consent, retry, provenance and selected text handoff in both UIs.
const puppeteer=require('puppeteer-core');
(async()=>{let b;try{
 b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await b.newPage(),errors=[],dialogs=[];let accept=true;
 let handled=null;p.on('pageerror',e=>errors.push(e.message));p.on('dialog',async d=>{dialogs.push(d.message());try{await (accept?d.accept(d.type()==='prompt'?'ابن خلدون':undefined):d.dismiss())}finally{handled?.()}});
 async function dialogClick(selector){let timer;const done=new Promise((resolve,reject)=>{handled=resolve;timer=setTimeout(()=>reject(Error('dialog timeout: '+selector)),10000)});try{await Promise.all([p.click(selector),done])}finally{clearTimeout(timer);handled=null}}
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await dialogClick('#empty-new');await p.waitForSelector('[data-tab="research"]');await p.click('[data-tab="research"]');
 await p.evaluate(()=>{window.realApi=api;window.calls=[];window.turathCount=0;api=async(path,data)=>{
  calls.push({path,...data});
  if(path==='/api/research')return {searched_at:'T',providers:[{provider:data.provider,status:'اكتمل'}],results:[]};
  if(path==='/api/turath/search'&&turathCount++===0)throw Error('بلغت حد طلبات تراث؛ حاول لاحقًا');
  const urls={'/api/openiti/search':'https://github.com/OpenITI/RELEASE/blob/cfc4157a3cf2054c0888f133970a4eaa3e22e58c/data/0310Tabari/0310Tabari.Tarikh/0310Tabari.Tarikh.X-ara1','/api/turath/search':'https://app.turath.io/book/123?page=456','/api/shamela/search':'https://shamela.ws/book/18147/1517','/api/alexandria/search':'https://www.alexandria-archive.com/article/2'};
  if(urls[path])return {results:[{title:'مصدر '+path,author:'مؤلف',url:urls[path],detail:'معاينة للمراجعة',access:'سجل لم يراجع'}]};
  if(path==='/api/openiti/read')return {text:'######OpenITI#\n# هذا نص ابن خلدون للمراجعة\n',url:urls['/api/openiti/search'],warning:'راجع الطبعة والحقوق'};
  return realApi(path,data);
 }});
 if(!(await p.$eval('#research-heritage',e=>e.checked)))throw Error('heritage sources not selected by default');
 accept=false;await dialogClick('#research-search');if(await p.evaluate(()=>calls.length))throw Error('request sent before consent');accept=true;
 await dialogClick('#research-search');await p.waitForFunction(()=>researchResult?.plan&&researchTask===null,{timeout:40000});
 let found=await p.evaluate(()=>({runs:researchResult.runs,results:researchResult.results,local:!window.SANAD_BROWSER,calls}));
 const expected=found.local?['فهرس OpenITI','تراث','الشاملة الرسمية (Windows)','أرشيف الإسكندرية (Windows)']:['فهرس OpenITI','تراث'];
 if(found.runs.length!==(found.local?55:52))throw Error('wrong attempt count');
 for(const provider of expected)if(!found.runs.some(x=>x.provider===provider&&x.query_id==='base'))throw Error('missing '+provider);
 if(found.runs.find(x=>x.provider==='تراث').reason!=='HTTP 429')throw Error('failed connector did not report rate limit');
 if(!dialogs.some(d=>d.includes('OpenITI')&&d.includes('12 ميجابايت')&&d.includes('تراث')&&(!found.local||d.includes('شروط الشاملة'))))throw Error('consent omitted sources or terms');
 const index=await p.evaluate(()=>researchResult.providers.findIndex(x=>x.provider==='تراث'));await dialogClick(`[data-retry-provider="${index}"]`);await p.waitForFunction(()=>researchResult.providers.find(x=>x.provider==='تراث')?.status==='اكتمل');
 found=await p.evaluate(()=>({results:researchResult.results,calls}));if(found.calls.filter(x=>x.path==='/api/turath/search').length!==2)throw Error('retry did not use Turath connector');
 const resultIndex=found.results.findIndex(x=>x.provider==='فهرس OpenITI');await p.click(`[data-research-result="${resultIndex}"]`);await p.click('[data-tab="sources"]');
 const src=await p.evaluate(()=>current.sources[0]);if(!src.notes.includes('فهرس OpenITI')||!src.notes.includes('ابن خلدون'))throw Error('source provenance lost');
 await dialogClick('[data-openiti-read="0"]');await p.waitForSelector('[data-local-search="0"]');await p.type('[data-local-query="0"]','ابن خلدون');await p.click('[data-local-search="0"]');await p.waitForSelector('[data-match="0"]');
 await p.click('#save');await p.waitForFunction(()=>!dirty&&!saveInFlight);const id=await p.evaluate(()=>current.id);await p.reload({waitUntil:'load'});await p.waitForSelector(`[data-project="${id}"]`);await p.click(`[data-project="${id}"]`);await p.click('[data-tab="sources"]');await p.type('[data-local-query="0"]','ابن خلدون');await p.click('[data-local-search="0"]');await p.waitForSelector('[data-match="0"]');
 for(const width of [320,390,1440]){await p.setViewport({width,height:844});await p.click('[data-tab="research"]');if(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: unified heritage search, consent, failure/retry, source provenance, text handoff and persistence');
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
