// Fixture-based mobile UI test; the local-backend wrapper mocks only the upstream service.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),url=process.env.SANAD_TEST_ORIGIN||'https://kabiwork198-alt.github.io/sanad/';
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'اختبار قطر':undefined));
 await page.setViewport({width:390,height:844,isMobile:true});await page.setRequestInterception(true);
 page.on('request',req=>{const u=new URL(req.url());
  if(process.env.SANAD_TEST_ORIGIN&&u.origin===new URL(url).origin)return req.continue();
  if(u.hostname==='www.qdl.qa'&&u.pathname.includes('/annos/search/'))return req.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({within:{total:2},hits:[{'item-url':'81055/vdc_100064303797.0x000004',match:'Dhofar'},{'item-url':'../bad',match:'bad'}]})});
  if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return req.respond({status:403});try{const ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}}return req.abort()});
 await page.goto(url,{waitUntil:'load'});await page.click('#empty-new');
 await page.evaluate(()=>{current.sources.push({id:uid(),title:'وثيقة قطر',url:'https://www.qdl.qa/en/archive/81055/vdc_100000000881.0x0000ce'});setDirty()});
 await page.click('[data-tab="sources"]');await page.type('[data-qdl-query="0"]','Dhofar');await page.click('[data-qdl-search="0"]');
 await page.waitForFunction(()=>qdlResult!==null,{timeout:15000});
 const result=await page.evaluate(()=>qdlResult);if(result.hits.length!==1||result.total!==2||!result.hits[0].url.endsWith('vdc_100064303797.0x000004'))throw Error('wrong QDL result');
 if(!(await page.$eval('#content',e=>e.innerText)).includes('لا يثبت الغياب'))throw Error('missing warning');
 await page.click('#save');await page.waitForFunction(()=>!dirty);await page.reload({waitUntil:'load'});await page.waitForSelector('[data-project]');await page.click('[data-project]');await page.click('[data-tab="sources"]');if(!await page.$('[data-qdl-search="0"]'))throw Error('saved source unavailable');
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: QDL record search UI, page link, warning, persistence and responsive widths');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
