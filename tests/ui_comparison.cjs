// Two real local files, one unavailable file, multi-source search and evidence linking.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),testUrl=process.env.SANAD_TEST_ORIGIN||'https://kabiwork198-alt.github.io/sanad/';
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'مقارنة تجريبية':undefined));
 await page.setViewport({width:390,height:844,isMobile:true});await page.setRequestInterception(true);
 page.on('request',req=>{const u=new URL(req.url());if(process.env.SANAD_TEST_ORIGIN&&u.origin===new URL(testUrl).origin)return req.continue();if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return req.respond({status:403});try{const ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}}return req.abort()});
 await page.goto(testUrl,{waitUntil:'load'});await page.click('#empty-new');
 await page.evaluate(async()=>{
   const files=['السطر الأول\nفي بغداد شهادة أولى','######OpenITI#\n\n# هنا بغداد\n~~شهادة ثانية مخالفة\n'];
   for(let i=0;i<files.length;i++){const bytes=new TextEncoder().encode(files[i]),doc=await api('/api/library/import',{name:'test'+i+'.txt',content:bytesToBase64(bytes)});current.sources.push({id:uid(),title:'مصدر '+(i+1),fileId:doc.document.id})}
   current.sources.push({id:uid(),title:'ملف مفقود',fileId:'f'.repeat(64)});current.claims.push({id:uid(),text:'ادعاء للمراجعة',status:'لم يُفحص'});setDirty();
 });
 await page.click('[data-tab="sources"]');await page.type('#comparison-query','بغداد');
 for(const el of await page.$$('[data-compare-source]'))await el.click();
 await page.click('#comparison-search');await page.waitForSelector('[data-comparison-add="1:0"]',{timeout:15000});
 let result=await page.evaluate(()=>comparisonResult);
 if(result.groups.length!==3||result.groups[0].matches.length!==1||result.groups[1].matches.length!==1||!result.groups[2].error)throw Error('must distinguish found and missing files');
 await page.select('#comparison-claim',await page.evaluate(()=>current.claims[0].id));
 await page.click('[data-comparison-add="0:0"]');await page.click('[data-comparison-add="0:0"]');if(await page.evaluate(()=>current.evidence.length)!==1)throw Error('duplicate excerpt accepted');await page.click('[data-comparison-add="1:0"]');
 const data=await page.evaluate(()=>({claim:current.claims[0],sources:current.sources,evidence:current.evidence}));
 if(data.evidence.length!==2||data.evidence.some(e=>e.claimId!==data.claim.id||e.stance!=='غير محسوم'||!e.excerpt.includes('بغداد'))||data.evidence[0].sourceId===data.evidence[1].sourceId)throw Error('evidence incorrectly linked or classified');
 await page.evaluate(()=>{current.sources[0].fileId='e'.repeat(64)});await page.click('[data-comparison-add="0:0"]');if(await page.evaluate(()=>current.evidence.length)!==2)throw Error('stale result linked');
 await page.evaluate(()=>{current.sources[0].fileId=comparisonResult.groups[0].fileId});await page.click('#save');await page.reload({waitUntil:'load'});await page.click('[data-project]');await page.click('[data-tab="claims"]');
 const saved=await page.evaluate(()=>current.evidence);if(saved.length!==2||!saved.every(x=>x.stance==='غير محسوم'))throw Error('evidence not saved');
 await page.click('[data-tab="sources"]');
 await page.evaluate(()=>{for(let i=0;i<21;i++)current.sources.push({id:uid(),title:'إضافي '+i,fileId:current.sources[0].fileId});render()});
 await page.type('#comparison-query','بغداد');for(const el of await page.$$('[data-compare-source]'))await el.click();await page.click('#comparison-search');
 if(!(await page.$eval('#toast',e=>e.textContent)).includes('20 ملفًا'))throw Error('missing 20 file bound');
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)>1)throw Error('horizontal overflow at '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: local multi-file search, failure distinction, unjudged evidence, stale-file guard, persistence and responsive widths');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
