// Diagnostic only: test the official record search in a real Chromium origin.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),events=[];page.on('response',r=>{if(r.url().includes('qdl.qa/en/annos/'))events.push('HTTP '+r.status())});page.on('requestfailed',r=>{if(r.url().includes('qdl.qa/en/annos/'))events.push(r.failure()?.errorText||'failed')});
 await page.setRequestInterception(true);page.on('request',req=>{const u=new URL(req.url());if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return req.respond({status:403});try{const ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}}return req.continue()});
 await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});
 const result=await page.evaluate(async()=>{try{const r=await browserEngine('/api/qdl/search',{id:'vdc_100000000881.0x0000ce',query:'Dhofar'});return {status:'OK',total:r.total,pages:r.hits.length,first:r.hits[0]?.url}}catch(e){return {status:'unavailable',reason:e.message}}});
 console.log('::notice file=tests/probe_qdl.cjs,line=1::QDL Chromium: '+JSON.stringify(result)+'; requests='+events.join(','));
 }catch(e){console.log('::notice file=tests/probe_qdl.cjs,line=1::QDL Chromium diagnostic failed: '+e.message)}finally{if(browser)await browser.close()}
})().catch(e=>console.log('::notice file=tests/probe_qdl.cjs,line=1::QDL diagnostic failed: '+e.message));
