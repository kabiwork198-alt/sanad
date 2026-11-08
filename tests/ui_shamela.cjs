// Real loopback backend + deterministic official-MCP fixtures provided by Python harness.
const puppeteer=require('puppeteer-core');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];let accept=true,searches=0,reads=0;
 let handledDialog=null;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{try{await (accept?d.accept(d.type()==='prompt'?'تاريخ الطبري':undefined):d.dismiss())}finally{handledDialog?.()}});
 async function dialogClick(selector){let timer;const done=new Promise((resolve,reject)=>{handledDialog=resolve;timer=setTimeout(()=>reject(Error('dialog timeout: '+selector)),10000)});try{await Promise.all([page.click(selector),done])}finally{clearTimeout(timer);handledDialog=null}}
 await page.setViewport({width:390,height:844,isMobile:true});page.on('request',req=>{if(req.url().endsWith('/api/shamela/search'))searches++;if(req.url().endsWith('/api/shamela/read'))reads++});
 await page.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await dialogClick('#empty-new');await page.waitForSelector('[data-tab="research"]');await page.click('[data-tab="research"]');
 accept=false;await dialogClick('#shamela-search');if(searches)throw Error('search sent before consent');accept=true;
 await dialogClick('#shamela-search');await page.waitForSelector('[data-shamela-result="0"]',{timeout:10000});
 await page.click('[data-shamela-result="0"]');await page.click('[data-tab="sources"]');
 let source=await page.evaluate(()=>current.sources[0]);if(source.url!=='https://shamela.ws/book/18147/1517'||!source.notes.includes('المعاينة ليست دليلًا'))throw Error('Shamela provenance missing');
 accept=false;await dialogClick('[data-shamela-read="0"]');if(reads)throw Error('page requested without consent');accept=true;
 await dialogClick('[data-shamela-read="0"]');await page.waitForSelector('[data-local-search="0"]');await page.type('[data-local-query="0"]','عبارة موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 source=await page.evaluate(()=>current.sources[0]);if(!source.fileId||!source.notes.includes('نص صفحة واحدة'))throw Error('page provenance missing');
 await page.click('[data-match="0"]');await page.click('#save');await page.waitForFunction(()=>!dirty);await page.reload({waitUntil:'load'});await page.waitForSelector('[data-project]');await page.click('[data-project]');await page.click('[data-tab="sources"]');await page.type('[data-local-query="0"]','عبارة موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: official Shamela consent, source provenance, selected-page read, local search and persistence');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
