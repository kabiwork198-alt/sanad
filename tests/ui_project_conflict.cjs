// Two independent tabs against real browser or local storage; no upstream network.
const puppeteer=require('puppeteer-core');
(async()=>{let browser,stage='starting';const watchdog=setTimeout(()=>{console.error('Conflict test stalled at: '+stage);process.exit(1)},65000);try{
 const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('test origin missing');
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const first=await browser.newPage(),second=await browser.newPage(),errors=[];
 for(const page of [first,second]){page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());return u.origin===new URL(origin).origin||['blob:','data:'].includes(u.protocol)?r.continue():r.abort()});}
 let done=null;for(const page of [first,second])page.on('dialog',async d=>{try{await d.accept(d.type()==='prompt'?'بحث الحماية':undefined)}finally{done?.()}});
 async function dialogClick(page,selector){await page.bringToFront();let timer;const wait=new Promise((resolve,reject)=>{done=resolve;timer=setTimeout(()=>reject(Error('dialog timeout')),10000)});try{await Promise.all([page.click(selector),wait])}finally{clearTimeout(timer);done=null}}
 stage='first project';console.log(stage);await first.goto(origin,{waitUntil:'load'});await dialogClick(first,'#empty-new');await first.waitForSelector('[data-field="question"]');await first.type('[data-field="question"]','النسخة الأصلية');await first.click('#save');await first.waitForFunction(()=>!dirty&&!saveInFlight);const id=await first.evaluate(()=>current.id);
 stage='second tab activation';console.log(stage);await second.bringToFront();
 stage='second navigation';console.log(stage);await second.goto(origin,{waitUntil:'load',timeout:15000});
 stage='second project list';console.log(stage);await second.waitForSelector(`[data-project="${id}"]`,{timeout:15000});
 stage='second project click';console.log(stage);await second.click(`[data-project="${id}"]`);
 stage='second project opened';console.log(stage);await second.waitForSelector('[data-field="question"]',{timeout:15000});
 stage='first save';console.log(stage);await first.bringToFront();await first.$eval('[data-field="question"]',e=>{e.value='تحديث النافذة الأولى';e.dispatchEvent(new Event('input',{bubbles:true}))});await first.click('#save');await first.waitForFunction(()=>!dirty&&!saveInFlight);
 stage='conflicting save';console.log(stage);await second.bringToFront();await second.$eval('[data-field="question"]',e=>{e.value='عمل النافذة الثانية';e.dispatchEvent(new Event('input',{bubbles:true}))});await second.click('#save');await second.waitForFunction(()=>document.querySelector('#toast').textContent.includes('تغير المشروع أو حُذف'));
 if(!await second.evaluate(()=>dirty&&current.question==='عمل النافذة الثانية'))throw Error('stale work was lost');
 const saved=await second.evaluate(async()=>(await api('/api/projects')).projects.find(x=>x.id===current.id));if(saved.question!=='تحديث النافذة الأولى')throw Error('newer save was overwritten');
 // Stale deletion must also leave the newer version intact.
 stage='stale delete';console.log(stage);const stale=await second.evaluate(async()=>{try{await api('/api/delete',{id:current.id,revision:current._rev});return false}catch(e){return e.message.includes('تغير المشروع')}});if(!stale)throw Error('stale delete succeeded');
 stage='save copy';console.log(stage);await dialogClick(second,'#save-copy');await second.waitForFunction(()=>!dirty&&!saveInFlight&&current.title.includes('نسخة'));const copies=await second.evaluate(async()=>(await api('/api/projects')).projects);if(!copies.some(x=>x.id===id&&x.question==='تحديث النافذة الأولى')||!copies.some(x=>x.id!==id&&x.question==='عمل النافذة الثانية'))throw Error('copy recovery lost data');
 stage='concurrent saves';console.log(stage);const race=await Promise.all([first,second].map((page,i)=>page.evaluate(async({id,i})=>{const item=(await api('/api/projects')).projects.find(p=>p.id===id);await new Promise(r=>setTimeout(r,100));item.question='تحديث متزامن '+i;try{await api('/api/save',{project:item});return 'saved'}catch(e){if(e.message.includes('تغير المشروع'))return 'conflict';throw e}},{id,i})));if(race.sort().join(',')!=='conflict,saved')throw Error('concurrent commits were not serialized: '+race);
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: two-tab stale and simultaneous save/delete prevention and copy recovery');
 }finally{stage='closing browser';if(browser)await browser.close();clearTimeout(watchdog)}})().catch(e=>{console.error(e);process.exitCode=1});
