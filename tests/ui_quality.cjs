// Real Chromium checks: visual layout, save race, and document integrity.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'مشروع الاختبار':undefined));
 await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return r.respond({status:403});try{const ext=path.extname(file);return r.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return r.respond({status:404})}}return r.abort()});
 await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});await page.click('#empty-new');
 await page.evaluate(()=>{const original=window.browserEngine;window.originalEngine=original;window.browserEngine=async(path,data)=>{if(path==='/api/save')await new Promise(resolve=>window.resumeSave=resolve);return original(path,data)}});
 await page.click('#save');await page.waitForFunction(()=>typeof window.resumeSave==='function');
 await page.click('#home');await page.click('#delete');if(!(await page.evaluate(()=>view==='workspace'&&current!==null)))throw Error('navigation or deletion was allowed during save');
 await page.$eval('[data-field="question"]',el=>{el.value='تعديل أثناء الحفظ';el.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.evaluate(()=>window.resumeSave());await page.waitForFunction(()=>!document.querySelector('#save').disabled);
 const state=await page.evaluate(async()=>({dirty,visible:document.querySelector('#save-state').textContent,saved:(await api('/api/projects')).projects[0].question,current:current.question}));
 if(!state.dirty||!state.visible.includes('غير محفوظة')||state.saved==='تعديل أثناء الحفظ'||state.current!=='تعديل أثناء الحفظ')throw Error('save race lost or misreported edits: '+JSON.stringify(state));
 await page.evaluate(()=>window.browserEngine=window.originalEngine);await page.click('#save');await page.waitForFunction(()=>!dirty&&!document.querySelector('#save').disabled);
 if((await page.evaluate(async()=>(await api('/api/projects')).projects[0].question))!=='تعديل أثناء الحفظ')throw Error('second save did not persist edits');
 const integrity=await page.evaluate(async()=>{
  const doc=(await api('/api/library/import',{name:'book.txt',content:btoa('Baghdad historic text')})).document;
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sanad-browser-documents',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put(new TextEncoder().encode('modified text'),doc.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
  try{await api('/api/library/search',{id:doc.id,query:'modified'});return false}catch(e){return e.message.includes('تالف')}
 });if(!integrity)throw Error('corrupted browser file was searched');
 for(const width of [320,360,390,768,1024,1440]){
  await page.setViewport({width,height:844});for(const tab of ['overview','research','sources','claims']){await page.click(`[data-tab="${tab}"]`);const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth,selected:document.querySelector('#tabs [aria-current="page"]')?.dataset.tab}));if(size.scroll>size.viewport+1||size.selected!==tab)throw Error(`layout or active tab ${width}/${tab}: ${JSON.stringify(size)}`)}
 }
 await page.click('#open-guide');for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('guide overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: save race, corrupted file rejection, responsive layouts and accessible active navigation');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
