// Diagnostic only: real Wikimedia APIs and real Chromium from the Pages origin.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
const report=s=>console.log('::notice file=tests/probe_wikisource_multilingual.cjs,line=1::'+s);
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();page.on('dialog',d=>d.accept(d.type()==='prompt'?'اختبار':undefined));await page.setRequestInterception(true);
 page.on('request',r=>{const u=new URL(r.url());if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),f=path.resolve(root,rel);if(!f.startsWith(root+path.sep))return r.respond({status:403});try{const ext=path.extname(f);return r.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(f)})}catch{return r.respond({status:404})}}return r.continue()});
 await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});
 for(const [lang,id,needle,query,provider] of [['fr','3599134','Nefouça','Ibn Khaldoun','ويكي مصدر الفرنسية'],['en','184505','Bagdad','History of the Saracens','ويكي مصدر الإنجليزية']]){
  const result=await page.evaluate(async({lang,id,needle,query,provider})=>{try{const r=await api('/api/research',{query,provider}),page=await api('/api/wikisource/rendered',{page_id:id,language:lang});return {state:r.providers[0].status,results:r.results.length,revision:page.revision_id,characters:page.text.length,phrase:page.text.includes(needle),warning:page.warning.includes('قد يتغير المحتوى')}}catch(e){return {error:String(e.message)}}},{lang,id,needle,query,provider});
  report('Wikisource '+lang+' live browser: '+JSON.stringify(result));
 }
 for(const [lang,query,provider] of [['fa','تاریخ','ويكي مصدر الفارسية'],['tr','Tarih','ويكي مصدر التركية']]){
  const result=await page.evaluate(async({lang,query,provider})=>{try{const r=await api('/api/research',{query,provider});if(!r.results.length)return {state:r.providers[0].status,results:0,reason:r.providers[0].reason};const id=new URL(r.results[0].url).searchParams.get('curid');const item=await api('/api/wikisource/rendered',{page_id:id,language:lang});return {state:r.providers[0].status,results:r.results.length,revision:item.revision_id,characters:item.text.length}}catch(e){return {error:String(e.message)}}},{lang,query,provider});
  report('Wikisource '+lang+' live browser: '+JSON.stringify(result));
 }
 // Exercise actual UI, consent, local file import and search with the French chapter.
 try{
  await page.click('#empty-new');await page.evaluate(()=>{current.sources.push({id:uid(),title:'Histoire des Berbères/Nefouça',url:'https://fr.wikisource.org/?curid=3599134'});document.querySelector('[data-tab="sources"]').click()});
  await page.click('[data-wiki-render="0"]');await page.waitForSelector('[data-local-search="0"]',{timeout:30000});await page.type('[data-local-query="0"]','Nefouça');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]',{timeout:10000});
  const result=await page.evaluate(()=>({revision:current.sources[0].notes.match(/oldid=\d+/)?.[0],text:fileMatches.matches[0].text.includes('Nefouça')}));report('Wikisource French live UI: '+JSON.stringify(result));
 }catch(e){report('Wikisource French live UI unavailable: '+String(e.message).slice(0,160));}
 }catch(e){report('Wikisource browser diagnostic unavailable: '+e.message)}finally{if(browser)await browser.close()}
})().catch(e=>report('Wikisource diagnostic failed: '+e.message));
