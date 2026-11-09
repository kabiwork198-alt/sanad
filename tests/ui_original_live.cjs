// Optional diagnostic: one real Commons file record, no image download or credentials.
const puppeteer=require('puppeteer-core'),origin=new URL(process.env.SANAD_TEST_ORIGIN).origin;
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();
 await p.setRequestInterception(true);p.on('request',r=>{const u=new URL(r.url());if(u.origin===origin||(u.origin==='https://commons.wikimedia.org'&&u.pathname==='/w/api.php')||['data:','blob:'].includes(u.protocol))return r.continue();return r.abort()});
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});
 const result=await p.evaluate(async()=>{try{const r=await SanadOriginalRecord.fetchRecord('https://commons.wikimedia.org/wiki/File:Kitab_al-Bulhan_--_zodiac.jpg');return {ok:true,title:r.title,pageId:r.pageId,pageUrl:r.pageUrl,image:!!r.imageUrl,sha1:!!r.sha1,description:!!r.description,license:r.license}}catch(e){return {ok:false,error:e.message}}});
 if(!result.ok||!result.image||!result.pageId||!result.sha1)throw Error('live record incomplete: '+JSON.stringify(result));
 console.log(`::notice file=tests/ui_original_live.cjs::Live Commons file metadata (no image download): ${JSON.stringify(result)}`);
 }catch(e){console.log(`::notice file=tests/ui_original_live.cjs::Live Commons record unavailable: ${String(e.message).replace(/[\r\n]+/g,' ').slice(0,500)}`)}finally{if(browser)await browser.close()}})();
