// Optional GitHub Actions check: actual Chromium + live public catalogs, no user data.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end()}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream');res.end(data)});
});
function report(message){console.log(`::notice file=tests/live_browser.cjs,line=1::${message}`)}
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(), errors=[], browserConsole=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error'&&msg.text().includes('loc.gov'))browserConsole.push(msg.text().slice(0,300))});
  const locEvents=[];page.on('response',res=>{if(res.url().startsWith('https://www.loc.gov/collections/'))locEvents.push('HTTP '+res.status())});page.on('requestfailed',req=>{if(req.url().startsWith('https://www.loc.gov/collections/'))locEvents.push(req.failure()?.errorText||'failed')});
  page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'الخوارزمي':undefined));
  await page.setViewport({width:390,height:844,isMobile:true});
  await page.setRequestInterception(true);
  page.on('request',async req=>{
    const url=new URL(req.url());
    if(url.hostname!=='kabiwork198-alt.github.io'||!url.pathname.startsWith('/sanad/'))return req.continue();
    const relative=url.pathname==='/sanad/'?'index.html':url.pathname.slice('/sanad/'.length);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep))return req.respond({status:403,body:'Forbidden'});
    try {const data=fs.readFileSync(file),ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:data})}catch{return req.respond({status:404,body:'Not found'})}
  });
  await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});
  await page.click('#home-discover');
  await page.waitForFunction(()=>!document.querySelector('#home-discover').disabled,{timeout:25000});
  report('Browser topic cards: '+(await page.$$('[data-start-topic]')).length);
  await page.click('#empty-new');await page.click('[data-tab="research"]');await page.click('#research-search');
  await page.waitForFunction(()=>typeof researchResult!=='undefined'&&researchResult!==null,{timeout:45000});
  const result=await page.evaluate(()=>researchResult);
  for(const p of result.providers.filter(p=>p.provider==='المكتبة الرقمية العالمية'||p.provider==='صحف Chronicling America'))report('Browser Arabic '+p.provider+': '+p.status+' / '+p.count);
  report('Browser visible result cards: '+(await page.$$('[data-research-result]')).length);
  await page.$eval('#research-query',e=>e.value='');await page.type('#research-query','Baghdad');await page.click('#research-search');
  await page.waitForFunction(()=>typeof researchResult!=='undefined'&&researchResult?.query==='Baghdad',{timeout:45000});
  const archives=await page.evaluate(()=>researchResult.providers.filter(p=>p.provider==='المكتبة الرقمية العالمية'||p.provider==='صحف Chronicling America'));
  for(const p of archives)report('Browser Baghdad '+p.provider+': '+p.status+' / '+p.count);
  report('Browser LOC requests: '+locEvents.join(', '));if(browserConsole.length)report('Browser LOC console: '+browserConsole[0]);
  if(errors.length)throw Error('Browser script errors: '+errors.join('; '));
 }finally{if(browser)await browser.close();server.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
