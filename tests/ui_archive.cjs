// Test the same opt-in OCR workflow in the Pages adapter and loopback application.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),text='نص تجريبي\nعبارة موثقة للمراجعة',raw=Buffer.from(text),sha=crypto.createHash('sha1').update(raw).digest('hex');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];let accept=true,reads=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'اختبار':undefined):d.dismiss());
 await page.setViewport({width:390,height:844,isMobile:true});
 const local=!!process.env.SANAD_TEST_ORIGIN;
 if(local)page.on('request',req=>{if(req.url().endsWith('/api/internet-archive/read'))reads++});
 else {await page.setRequestInterception(true);page.on('request',req=>{
   const u=new URL(req.url());
   if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){
    const relative=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep))return req.respond({status:403});
    try{return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}
   }
   if(u.hostname==='archive.org'&&u.pathname==='/metadata/sample'){reads++;return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({metadata:{identifier:'sample',mediatype:'texts'},files:[{name:'sample_djvu.txt',size:String(raw.length),sha1:sha}]})})}
   if(u.hostname==='archive.org'&&u.pathname==='/cors/sample/sample_djvu.txt'){reads++;return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/plain',body:raw})}
   return req.abort();
  });}
 await page.goto(process.env.SANAD_TEST_ORIGIN||'https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});await page.click('#empty-new');
 await page.evaluate(()=>current.sources.push({id:crypto.randomUUID().replaceAll('-',''),title:'عينة',author:'',url:'https://archive.org/details/sample',access:'',notes:''}));
 await page.click('[data-tab="sources"]');accept=false;await page.click('[data-archive-read="0"]');if(reads)throw Error('Requested without consent');
 accept=true;await page.click('[data-archive-read="0"]');await page.waitForSelector('[data-local-search="0"]',{timeout:10000});
 if(reads!==(local?1:2))throw Error('Unexpected network count '+reads);
 let source=await page.evaluate(()=>current.sources[0]);if(!source.notes.includes('sample_djvu.txt')||!source.notes.includes('SHA-1')||!source.fileId)throw Error('Provenance missing');
 await page.type('[data-local-query="0"]','عبارة موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 await page.click('#save');await page.waitForFunction(()=>!dirty);await page.reload({waitUntil:'load'});await page.click('[data-project]');await page.click('[data-tab="sources"]');
 await page.type('[data-local-query="0"]','عبارة موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: Archive consent, OCR import, provenance, local search and persistence '+(local?'(loopback)':'(browser)'));
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
