// Diagnostic: one real Bodleian IIIF manifest and a HEAD for one selected page, not a model test.
const puppeteer=require('puppeteer-core'),origin=new URL(process.env.SANAD_TEST_ORIGIN).origin;
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await browser.newPage();
 await p.setRequestInterception(true);p.on('request',r=>{const u=new URL(r.url());return u.origin===origin||u.origin==='https://iiif.bodleian.ox.ac.uk'||['data:','blob:'].includes(u.protocol)?r.continue():r.abort()});
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});
 const result=await p.evaluate(async()=>{try{const m=await SanadBodleian.fetchManifest('https://iiif.bodleian.ox.ac.uk/iiif/manifest/5c9da286-6a02-406c-b990-0896b8ddbbb0.json');const page=m.pages.find(x=>x.canvasUrl&&x.imageUrl);if(!page)return {ok:false,error:'no supported page'};let image;try{const r=await fetch(page.imageUrl,{method:'HEAD',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)});image={status:r.status,type:r.headers.get('content-type')}}catch(e){image={error:e.message}}return {ok:true,title:m.title,total:m.total,shelfmark:m.metadata.find(x=>x.label==='Shelfmark')?.value||'',attribution:m.attribution,page:page.label,canvasUrl:page.canvasUrl,imageUrl:page.imageUrl,image}}catch(e){return {ok:false,error:e.message}}});
 console.log(`::notice file=tests/ui_bodleian_live.cjs::Bodleian real manifest diagnostic: ${JSON.stringify(result)}`);
 }catch(e){console.log(`::notice file=tests/ui_bodleian_live.cjs::Bodleian diagnostic unavailable: ${String(e.message).replace(/[\r\n]+/g,' ').slice(0,500)}`)}finally{if(browser)await browser.close()}})();
