// Same consent/search/page/search flow through static adapter or loopback Python backend.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');const root=path.resolve(__dirname,'..');
const result={count:1,results:[{book_id:123,meta:{page_id:456,page:39,vol:'2',book_name:'تاريخ بغداد',author_name:'المؤلف'},snip:'معاينة فتح بغداد'}]};
const opened={book_id:123,page_id:456,text:'مقدمة\nفتح بغداد للمراجعة',meta:{page:39,vol:'2'}};
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];let accept=true,calls=0;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'فتح بغداد':undefined):d.dismiss());await page.setViewport({width:390,height:844,isMobile:true});
 const local=!!process.env.SANAD_TEST_ORIGIN;if(local)page.on('request',r=>{if(r.url().includes('/api/turath/'))calls++});
 else{await page.setRequestInterception(true);page.on('request',req=>{
  const u=new URL(req.url());
  if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return req.respond({status:403});try{return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}}
  if(u.hostname==='mcp.turath.io'&&u.pathname==='/mcp/'){
   if(req.method()==='OPTIONS')return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST'}});
   const body=JSON.parse(req.postData());if(body.method==='tools/call')calls++;
   if(body.method==='notifications/initialized')return req.respond({status:202,headers:{'Access-Control-Allow-Origin':'*'},body:''});
   const value=body.method==='initialize'?{protocolVersion:'2025-03-26'}:{content:[{type:'text',text:JSON.stringify(body.params.name==='search_turath'?result:opened)}]};
   return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:body.id,result:value})});
  }return req.abort();});}
 await page.goto(process.env.SANAD_TEST_ORIGIN||'https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});await page.click('#empty-new');await page.click('[data-tab="research"]');
 accept=false;await page.click('#turath-search');if(calls)throw Error('search sent without consent');accept=true;
 await page.click('#turath-search');await page.waitForSelector('[data-turath-result="0"]',{timeout:15000});await page.click('[data-turath-result="0"]');await page.click('[data-tab="sources"]');
 let source=await page.evaluate(()=>current.sources[0]);if(source.url!=='https://app.turath.io/book/123?page=456'||!source.notes.includes('المعاينة ليست دليلًا'))throw Error('Search provenance missing');
 accept=false;await page.click('[data-turath-read="0"]');if(calls!==1)throw Error('read sent without consent');accept=true;await page.click('[data-turath-read="0"]');
 await page.waitForSelector('[data-local-search="0"]',{timeout:15000});await page.type('[data-local-query="0"]','فتح بغداد');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 source=await page.evaluate(()=>current.sources[0]);if(!source.fileId||!source.notes.includes('الصفحة: 39'))throw Error('Page provenance missing');await page.click('#save');await page.waitForFunction(()=>!dirty);await page.reload({waitUntil:'load'});await page.waitForSelector('[data-project]');await page.click('[data-project]');await page.click('[data-tab="sources"]');await page.type('[data-local-query="0"]','فتح بغداد');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: Turath opt-in search, one-page read, provenance, local search and persistence ('+(local?'Windows backend':'browser')+')');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
