// Both browser and local modes, with an actual MinerU 4.1.7 synthetic output fixture.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),puppeteer=require('puppeteer-core');
const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('SANAD_TEST_ORIGIN required');
(async()=>{let browser,dir=fs.mkdtempSync(path.join(os.tmpdir(),'sanad-mineru-'));try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});let page=await browser.newPage(),external=[],errors=[],accept=true;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'اختبار MinerU':undefined):d.dismiss());
 page.on('request',r=>{const u=r.url();if(!u.startsWith('data:')&&!u.startsWith('blob:')&&new URL(u).origin!==new URL(origin).origin)external.push(u)});
 await page.goto(origin,{waitUntil:'load'});await page.click('#empty-new');await page.click('[data-tab="sources"]');
 const fixture=path.resolve('tests/fixtures/mineru-4.1.7-flash-txt.json'),invalid=path.join(dir,'bad.json');fs.writeFileSync(invalid,'{"pages":[]}');
 await (await page.$('#mineru-json')).uploadFile(invalid);await page.click('#mineru-import');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('غير مدعومة'));
 if(await page.evaluate(()=>current.sources.length))throw Error('invalid result imported');
 const print=await browser.newPage();await print.setContent('<h1>Sample unrelated PDF</h1>');const pdf=path.join(dir,'source.pdf');await print.pdf({path:pdf});await print.close();
 await (await page.$('#mineru-json')).uploadFile(fixture);await (await page.$('#mineru-original')).uploadFile(pdf);accept=false;await page.click('#mineru-import');if(await page.evaluate(()=>current.sources.length))throw Error('import proceeded without consent');accept=true;await page.click('#mineru-import');
 await page.waitForSelector('[data-local-search="0"]',{timeout:20000});const src=await page.evaluate(()=>current.sources[0]);
 for(const hash of [fixture,pdf].map(f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')))if(!src.notes.includes(hash))throw Error('missing SHA-256');
 if(!src.notes.includes('لم يتحقق منها')||!src.notes.includes('4.1.7'))throw Error('provenance and warning missing');
 for(const [query,num] of [['Baghdad',1],['careful review',2]]){
  await page.$eval('[data-local-query="0"]',e=>e.value='');await page.type('[data-local-query="0"]',query);await page.click('[data-local-search="0"]');
  await page.waitForFunction(n=>document.querySelector('[data-match="0"]')?.parentElement?.textContent.includes('PDF '+n),{},num);
 }
 await page.click('#save');await page.waitForFunction(()=>!dirty);await page.reload({waitUntil:'load'});await page.waitForSelector('[data-project]');await page.click('[data-project]');await page.click('[data-tab="sources"]');
 await page.type('[data-local-query="0"]','careful review');await page.click('[data-local-search="0"]');await page.waitForFunction(()=>document.querySelector('[data-match="0"]')?.parentElement?.textContent.includes('PDF 2'));
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length||external.length)throw Error('errors: '+errors+' external: '+external);console.log('PASS: MinerU import consent, actual multi-page fixture, provenance, page search, persistence and no external requests');
 }finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
