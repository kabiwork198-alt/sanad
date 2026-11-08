/* Real Wikipedia and source calls in Chromium; errors are reported, not replaced. */
const puppeteer=require('puppeteer-core');
(async()=>{let b;try{b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await b.newPage();p.on('dialog',d=>d.accept());await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});
 await p.type('#topic-query','ابن فضلان');await p.click('#topic-search');await p.waitForFunction(()=>homeTopics!==null||document.querySelector('#home-topics').textContent.includes('تعذر جلب'),{timeout:30000});
 const first=await p.evaluate(()=>homeTopics?{titles:homeTopics.topics.slice(0,4).map(t=>t.title),count:homeTopics.topics.length}:{error:document.querySelector('#home-topics').innerText});
 console.log('::notice title=Live topic UI Arabic Wikipedia::'+JSON.stringify(first));
 const out=await p.evaluate(async()=>{const result={};for(const [key,path,data] of [['sections','/api/topic-sections',{page_id:'129569'}],['wiki_text','/api/wikisource/rendered',{page_id:'3941',language:'ar'}],['openiti','/api/openiti/search',{query:'ابن فضلان'}]]){try{const r=await api(path,data);result[key]=key==='sections'?{revision:r.revision_url,sections:r.sections.slice(0,6).map(x=>x.title)}:key==='wiki_text'?{page:r.page_id,revision:r.revision_id,characters:r.text.length}: {total:r.total,first:r.results?.[0]?.url||''}}catch(e){result[key]={error:String(e.message)}}}return result});
 for(const [key,value] of Object.entries(out))console.log('::notice title=Live '+key+' Chromium::'+JSON.stringify(value));
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
