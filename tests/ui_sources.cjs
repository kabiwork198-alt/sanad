// Tests consent, OpenITI search, safe source capture and provider-specific retry.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];let indexDownloads=0,crossrefCalls=0,accept=true;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'تاريخ الطبري':undefined):d.dismiss());
 await page.setViewport({width:390,height:844,isMobile:true});await page.setRequestInterception(true);
 page.on('request',req=>{const u=new URL(req.url());
  if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return req.respond({status:403});try{const ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}}
  if(u.hostname==='raw.githubusercontent.com'&&u.pathname.includes('OpenITI_metadata_2025-1-9.tsv')){indexDownloads++;const t='version_uri\tauthor_ar\tauthor_lat\ttitle_ar\ttitle_lat\tdate\tstatus\ted_info\tlocal_path\n0310Tabari.Tarikh.X-ara1\tالطبري\tTabari\tتاريخ الطبري\tTarikh\t0310\tpri\tطبعة\tdata/0310Tabari/0310Tabari.Tarikh/0310Tabari.Tarikh.X-ara1\n';return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/plain; charset=utf-8',body:t})}
  if(u.hostname==='api.crossref.org'){crossrefCalls++;const body=crossrefCalls===1?{}:{message:{items:[{title:['Recovered'],DOI:'10.1/test',URL:'https://doi.org/10.1/test'}]}};return req.respond({status:crossrefCalls===1?429:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(body)})}
  return req.abort();
 });
 await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});await page.click('#empty-new');await page.click('[data-tab="research"]');
 accept=false;await page.click('#openiti-search');if(indexDownloads!==0)throw Error('index fetched without consent');accept=true;
 await page.click('#openiti-search');await page.waitForSelector('[data-openiti-result="0"]');
 let result=await page.evaluate(()=>openitiResult);if(result.total!==1||!result.results[0].title.includes('الطبري'))throw Error('OpenITI result missing');
 await page.click('#openiti-search');await page.waitForSelector('[data-openiti-result="0"]');if(indexDownloads!==1)throw Error('index not reused in session');
 await page.click('[data-openiti-result="0"]');await page.click('[data-tab="sources"]');let source=await page.evaluate(()=>current.sources[0]);if(!source.notes.includes('CC BY-NC-SA')||!source.url.includes('/OpenITI/RELEASE/'))throw Error('source provenance missing');
 await page.click('[data-tab="research"]');await page.click('#research-search');await page.waitForSelector('[data-retry-provider="0"]');
 let status=await page.evaluate(()=>researchResult.providers[0]);if(status.reason!=='HTTP 429')throw Error('wrong diagnostic: '+JSON.stringify(status));
 await page.click('[data-retry-provider="0"]');await page.waitForFunction(()=>researchResult.providers[0].status==='اكتمل');
 status=await page.evaluate(()=>({provider:researchResult.providers[0],title:researchResult.results[0]?.title}));if(crossrefCalls!==2||status.title!=='Recovered')throw Error('retry failed');
 await page.click('#save');await page.reload({waitUntil:'load'});await page.click('[data-project]');await page.click('[data-tab="sources"]');source=await page.evaluate(()=>current.sources[0]);if(!source.title.includes('الطبري'))throw Error('source not saved');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: OpenITI opt-in, caching, source provenance, safe provider retry and persistence');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
