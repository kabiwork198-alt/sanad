// End-to-end local HTTP and actual connector mapping; upstream responses are fixtures.
const puppeteer=require('puppeteer-core');
(async()=>{let b;try{
 b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await b.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'ابن خلدون':undefined));
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await p.click('#empty-new');await p.click('[data-tab="research"]');
 await p.evaluate(()=>{const real=api;api=async(path,data)=>path==='/api/research'?{searched_at:'T',providers:[{provider:data.provider,status:'اكتمل'}],results:[]}:real(path,data)});
 await p.click('#research-search');await p.waitForFunction(()=>researchResult?.plan&&researchTask===null,{timeout:45000});
 const data=await p.evaluate(()=>({runs:researchResult.runs,results:researchResult.results}));
 for(const provider of ['فهرس OpenITI','تراث','الشاملة الرسمية (Windows)','أرشيف الإسكندرية (Windows)']){
  const state=data.runs.find(x=>x.provider===provider);if(!state||state.status!=='اكتمل'||state.count!==1)throw Error('adapter failed '+provider+': '+JSON.stringify(state));
  if(!data.results.some(x=>x.provider===provider))throw Error('missing result '+provider);
 }
 const idx=data.results.findIndex(x=>x.provider==='الشاملة الرسمية (Windows)');await p.click(`[data-research-result="${idx}"]`);await p.click('[data-tab="sources"]');
 await p.click('[data-shamela-read="0"]');await p.waitForSelector('[data-local-search="0"]');await p.type('[data-local-query="0"]','ابن خلدون');await p.click('[data-local-search="0"]');await p.waitForSelector('[data-match="0"]');
 const source=await p.evaluate(()=>current.sources[0]);if(!source.notes.includes('الشاملة الرسمية')||!source.fileId||!source.notes.includes('نص صفحة واحدة'))throw Error('source or page provenance lost: '+JSON.stringify(source));
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: real HTTP backend, four unified connectors, source selection and Shamela page read');
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
