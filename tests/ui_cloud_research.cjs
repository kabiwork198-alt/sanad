// Synthetic cloud responses; exercises actual Windows-mode UI, consent and routing.
'use strict';
const puppeteer=require('puppeteer-core'), origin=new URL(process.env.SANAD_TEST_ORIGIN).origin;
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();let allow=false,done=null,calls=[],localCalls=0,dialogs=[];
 page.on('dialog',async d=>{dialogs.push(d.message());try{await(d.type()==='prompt'?d.accept('بحث اختباري'):allow?d.accept():d.dismiss())}finally{done?.()}});
 async function dialogClick(selector){let timer;const wait=new Promise((resolve,reject)=>{done=resolve;timer=setTimeout(()=>reject(Error('dialog timeout '+selector)),10000)});try{await Promise.all([page.click(selector),wait])}finally{clearTimeout(timer);done=null}}
 await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());
  if(u.origin==='https://api.openai.com'){
   const headers={'access-control-allow-origin':origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type'};
   if(r.method()==='OPTIONS')return r.respond({status:204,headers});
   const data=JSON.parse(r.postData());calls.push({data,key:r.headers().authorization});const prompt=data.messages[1].content;const text=prompt.includes('المقتطف التالي')?'تفسير اصطناعي للمراجعة':'محور تاريخي أول\nمحور تاريخي ثان';
   return r.respond({status:200,headers:{...headers,'content-type':'application/json'},body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:text}}]})});
  }
  if(u.origin===origin&&u.pathname==='/api/lm'){localCalls++;return r.respond({status:200,contentType:'application/json',body:JSON.stringify({text:'محاور محلية'})})}
  if(u.origin===origin||['data:','blob:'].includes(u.protocol))return r.continue();return r.abort();
 });
 await page.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await dialogClick('#empty-new');await page.waitForSelector('[data-field="question"]');await page.click('[data-tab="assistant"]');
 await page.type('#cloud-model','cloud-model');await page.type('#cloud-key','synthetic-key');await dialogClick('#cloud-enable-research');if(await page.evaluate(()=>cloudResearchRoute!==null))throw Error('enabled without consent');
 allow=true;await dialogClick('#cloud-enable-research');if(!dialogs.at(-1).includes('api.openai.com'))throw Error('activation lacks destination');
 await page.click('[data-tab="research"]');await page.select('#research-mode','custom');allow=false;await dialogClick('#ai-plan-generate');if(calls.length)throw Error('planning sent without consent');
 allow=true;await dialogClick('#ai-plan-generate');await page.waitForFunction(()=>document.querySelector('#ai-plan-draft').value.includes('محور تاريخي'));if(calls.length!==1||calls[0].data.model!=='cloud-model'||calls[0].key!=='Bearer synthetic-key'||!calls[0].data.messages[1].content.includes('بحث اختباري')||!dialogs.at(-1).includes('api.openai.com'))throw Error('cloud planning route incorrect');
 const text='مقتطف صناعي عن رحلة إلى بغداد.';await page.evaluate(async text=>{const doc=(await api('/api/library/import',{name:'test.txt',content:bytesToBase64(new TextEncoder().encode(text))})).document;current.sources.push({id:uid(),title:'مصدر اصطناعي',fileId:doc.id});setDirty()},text);
 await page.click('[data-tab="sources"]');await page.type('[data-local-query="0"]','بغداد');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-ai-match="0"]');allow=false;await dialogClick('[data-ai-match="0"]');if(calls.length!==1)throw Error('excerpt sent without consent');
 allow=true;await dialogClick('[data-ai-match="0"]');await page.waitForFunction(()=>document.querySelector('#content').textContent.includes('تفسير اصطناعي للمراجعة'));if(calls.length!==2||!calls[1].data.messages[1].content.includes(text)||!dialogs.at(-1).includes('api.openai.com'))throw Error('selected excerpt route incorrect');
 if(JSON.stringify(await page.evaluate(()=>({current,projects,storage:localStorage}))).includes('synthetic-key'))throw Error('key entered persisted project data');
 await page.click('[data-tab="assistant"]');await page.click('#cloud-disable-research');if(await page.evaluate(()=>cloudResearchRoute!==null))throw Error('disable failed');
 await page.click('[data-tab="research"]');await page.type('#ai-plan-model','local-model');await page.$eval('#ai-plan-draft',e=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}))});await dialogClick('#ai-plan-generate');await page.waitForFunction(()=>document.querySelector('#ai-plan-draft').value.includes('محاور محلية'));if(localCalls!==1||calls.length!==2)throw Error('local fallback incorrect');
 console.log('PASS: optional cloud research planning and excerpt analysis, consent, memory-only key and local fallback (synthetic providers)');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
