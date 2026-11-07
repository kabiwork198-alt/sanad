// Offline, deterministic end-to-end test of navigation, manual sources and file linking.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
(async()=>{let browser;const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sanad-ui-'));try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'ملف تجريبي':undefined));
 await page.setViewport({width:390,height:844,isMobile:true});await page.setRequestInterception(true);
 page.on('request',req=>{const u=new URL(req.url());if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return req.respond({status:403});try{const ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return req.respond({status:404})}}return req.abort()});
 await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});
 if(!(await page.$eval('#source-guide',e=>e.hidden)))throw Error('guide unexpectedly shown on home');
 await page.click('#empty-new');const id=await page.evaluate(()=>current.id);
 await page.click('#open-guide');if(!(await page.$eval('#workspace',e=>e.hidden))||await page.$eval('#source-guide',e=>e.hidden))throw Error('guide navigation failed');
 await page.click('#back-workspace');if((await page.evaluate(()=>current.id))!==id||await page.$eval('#workspace',e=>e.hidden))throw Error('project was lost when visiting guide');
 await page.click('[data-tab="manual"]');await page.select('#manual-service','3');
 if(!(await page.$eval('#manual-open',e=>e.href)).startsWith('https://www.qdl.qa/'))throw Error('wrong manual destination');
 await page.type('#manual-title','وثيقة تجريبية');await page.click('[data-tab="overview"]');await page.click('[data-tab="manual"]');if((await page.$eval('#manual-title',e=>e.value))!=='وثيقة تجريبية'||(await page.$eval('#manual-service',e=>e.value))!=='3')throw Error('manual draft was lost between tabs');await page.type('#manual-author','جهة حافظة');await page.type('#manual-reference','رقم ١٢');await page.type('#manual-notes','تحتاج مراجعة الحقوق');
 await page.$eval('#manual-url',e=>e.value='javascript:alert(1)');await page.click('#manual-add');
 if((await page.evaluate(()=>current.sources.length))!==0)throw Error('unsafe URL accepted');
 await page.$eval('#manual-url',e=>e.value='https://example.org/record/12');await page.click('#manual-add');
 await page.waitForSelector('[data-attach-file="0"]');
 const file=path.join(tmp,'source.txt');fs.writeFileSync(file,'مقدمة\n'+('فَ'.repeat(1000))+' عبارة موثقة للمراجعة\n');
 await (await page.$('[data-attach-file="0"]')).uploadFile(file);await page.click('[data-attach-local="0"]');
 await page.waitForSelector('[data-local-search="0"]');await page.type('[data-local-query="0"]','موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 const result=await page.evaluate(()=>({source:current.sources[0],match:fileMatches.matches[0]}));
 if(!result.source.notes.includes('مكتبة قطر الرقمية')||!result.source.fileId||!result.match.text.includes('موثقة'))throw Error('manual provenance, linked file, or excerpt missing');
 await page.click('[data-match="0"]');await page.click('[data-tab="claims"]');if(!(await page.$eval('[data-group="claims"][data-item-field="notes"]',e=>e.value)).includes('موثقة'))throw Error('evidence not linked to claim');
 await page.click('#save');await page.waitForFunction(()=>!dirty);await page.reload({waitUntil:'load'});await page.waitForSelector('[data-project]');await page.click('[data-project]');await page.click('[data-tab="sources"]');await page.type('[data-local-query="0"]','موثقة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);if(overflow>1)throw Error('horizontal page overflow at '+width+': '+overflow)}
 await page.goto('https://kabiwork198-alt.github.io/sanad/#source-guide',{waitUntil:'load'});if(await page.$eval('#source-guide',e=>e.hidden)||!(await page.$eval('#empty',e=>e.hidden)))throw Error('guide deep link failed');await page.click('#home');if(await page.$eval('#empty',e=>e.hidden))throw Error('home navigation from deep link failed');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: view navigation, safe manual entry, local attachment, evidence, persistence and responsive widths');
 }finally{if(browser)await browser.close();fs.rmSync(tmp,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
