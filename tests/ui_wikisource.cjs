// Deterministic browser test of explicit-consent Wikisource import and local search.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
(async()=>{
 let browser;
 try {
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(), errors=[]; let reads=0,accept=true;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'اختبار':undefined):d.dismiss());
  await page.setViewport({width:390,height:844,isMobile:true});
  await page.setRequestInterception(true);
  page.on('request',req=>{
   const u=new URL(req.url());
   if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){
    const relative=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep))return req.respond({status:403});
    try {const ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}
   }
   if(u.hostname==='ar.wikisource.org'&&u.searchParams.get('prop')==='revisions'){
    reads++;
    const data={query:{pages:[{pageid:43576,title:'صفحة اختبار',revisions:[{revid:42,timestamp:'2025-01-01T00:00:00Z',slots:{main:{content:'السطر الأول\nعبارة موثقة للمراجعة'}}}]}]}};
    return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(data)});
   }
   return req.abort();
  });
  await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});
  await page.click('#empty-new');
  await page.evaluate(()=>current.sources.push({id:crypto.randomUUID().replaceAll('-',''),title:'صفحة اختبار',author:'',url:'https://ar.wikisource.org/?curid=43576',access:'',notes:''}));
  await page.click('[data-tab="sources"]');
  accept=false;await page.click('[data-wiki-read="0"]');
  if(reads!==0)throw Error('Read occurred despite cancellation');
  accept=true;await page.click('[data-wiki-read="0"]');
  await page.waitForSelector('[data-local-search="0"]',{timeout:10000});
  if(reads!==1)throw Error('Expected exactly one read');
  await page.type('[data-local-query="0"]','موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
  const m=await page.evaluate(()=>({note:current.sources[0].notes,result:fileMatches.matches[0]}));
  if(!m.note.includes('oldid=42')||!m.result.text.includes('موثقة'))throw Error('Revision provenance or search match missing');
  await page.click('#save');await page.reload({waitUntil:'load'});await page.click('[data-project]');await page.click('[data-tab="sources"]');
  await page.type('[data-local-query="0"]','موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
  if(errors.length)throw Error(errors.join('; '));
  console.log('PASS: cancellation, one-page revision download, local search, provenance, and persistence');
 }finally {if(browser)await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
