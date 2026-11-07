// Tests consent, OpenITI search, safe source capture and provider-specific retry.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];let indexDownloads=0,textDownloads=0,crossrefCalls=0,accept=true,failText=true;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'تاريخ الطبري':undefined):d.dismiss());
 await page.setViewport({width:390,height:844,isMobile:true});await page.setRequestInterception(true);
 page.on('request',req=>{const u=new URL(req.url());
  if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return req.respond({status:403});try{const ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}}
  if(u.hostname==='raw.githubusercontent.com'&&u.pathname.includes('OpenITI_metadata_2025-1-9.tsv')){indexDownloads++;const t='version_uri\tauthor_ar\tauthor_lat\ttitle_ar\ttitle_lat\tdate\tstatus\ted_info\tlocal_path\n0310Tabari.Tarikh.X-ara1\tالطبري\tTabari\tتاريخ الطبري\tTarikh\t0310\tpri\tطبعة\tdata/0310Tabari/0310Tabari.Tarikh/0310Tabari.Tarikh.X-ara1\n';return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/plain; charset=utf-8',body:t})}
  if(u.hostname==='raw.githubusercontent.com'&&u.pathname.includes('/data/0310Tabari/')){textDownloads++;if(failText)return req.respond({status:404,headers:{'Access-Control-Allow-Origin':'*'}});return req.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/plain; charset=utf-8',body:'######OpenITI#\n\n# وذكر الرجل قصة في دفتر\n~~كان كثيرا ما ينظر فيه.\nPageV01P001\n'})}
  if(u.hostname==='api.crossref.org'){crossrefCalls++;const body=crossrefCalls===1?{}:{message:{items:[{title:['Recovered'],DOI:'10.1/test',URL:'https://doi.org/10.1/test'}]}};return req.respond({status:crossrefCalls===1?429:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify(body)})}
  return req.abort();
 });
 await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});await page.click('#empty-new');await page.click('[data-tab="research"]');
 accept=false;await page.click('#openiti-search');if(indexDownloads!==0)throw Error('index fetched without consent');accept=true;
 await page.click('#openiti-search');await page.waitForSelector('[data-openiti-result="0"]');
 let result=await page.evaluate(()=>openitiResult);if(result.total!==1||!result.results[0].title.includes('الطبري'))throw Error('OpenITI result missing');
 await page.click('#openiti-search');await page.waitForSelector('[data-openiti-result="0"]');if(indexDownloads!==1)throw Error('index not reused in session');
 await page.click('[data-openiti-result="0"]');await page.click('[data-tab="sources"]');let source=await page.evaluate(()=>current.sources[0]);if(!source.notes.includes('CC BY-NC-SA')||!source.url.includes('/OpenITI/RELEASE/'))throw Error('source provenance missing');
 accept=false;await page.click('[data-openiti-read="0"]');if(textDownloads!==0)throw Error('text fetched without consent');accept=true;
 await page.click('[data-openiti-read="0"]');await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('تعذر تحميل النص:'));failText=false;
 await page.click('[data-openiti-read="0"]');await page.waitForSelector('[data-local-search="0"]');if(textDownloads!==2)throw Error('text retry did not work');
 await page.type('[data-local-query="0"]','دفتر كان كثيرا');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 const match=await page.evaluate(()=>fileMatches.matches[0]);if(!match.text.includes('دفتر كان كثيرا')||!match.location.includes('ليس رقم صفحة'))throw Error('cross-line OpenITI match missing');
 await page.click('[data-match="0"]');const claim=await page.evaluate(()=>current.claims[0]);if(claim.sourceId!==source.id||!claim.notes.includes('دفتر كان كثيرا')||claim.status!=='لم يُفحص')throw Error('passage not linked for review');
 await page.click('[data-tab="research"]');await page.click('#research-search');await page.waitForSelector('[data-retry-provider="0"]');
 let status=await page.evaluate(()=>researchResult.providers[0]);if(status.reason!=='HTTP 429')throw Error('wrong diagnostic: '+JSON.stringify(status));
 await page.click('[data-retry-provider="0"]');await page.waitForFunction(()=>researchResult.providers[0].status==='اكتمل');
 status=await page.evaluate(()=>({provider:researchResult.providers[0],title:researchResult.results[0]?.title}));if(crossrefCalls!==2||status.title!=='Recovered')throw Error('retry failed');
 await page.click('#save');await page.reload({waitUntil:'load'});await page.click('[data-project]');await page.click('[data-tab="sources"]');source=await page.evaluate(()=>current.sources[0]);if(!source.title.includes('الطبري'))throw Error('source not saved');await page.type('[data-local-query="0"]','دفتر كان كثيرا');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: OpenITI consent, full-text import, cross-line search, provenance, retry and persistence');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
