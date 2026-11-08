// Synthetic providers only: validates UI consent and key handling, not live API access.
'use strict';
const puppeteer=require('puppeteer-core');const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('missing origin');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage();let accept=true,dialogs=[],calls=[];
 page.on('dialog',async d=>{dialogs.push(d.message());if(d.type()==='prompt')await d.accept('اختبار المفتاح');else if(accept)await d.accept();else await d.dismiss()});
 await page.setRequestInterception(true);page.on('request',r=>{
  const u=new URL(r.url());if(u.origin===new URL(origin).origin||['data:','blob:'].includes(u.protocol))return r.continue();
  if(u.origin==='https://api.openai.com'){
   const headers={'access-control-allow-origin':new URL(origin).origin,'access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'authorization, content-type'};
   if(r.method()==='OPTIONS')return r.respond({status:204,headers});
   calls.push({url:r.url(),authorization:r.headers().authorization,body:r.postData()});return r.respond({status:200,headers:{...headers,'content-type':'application/json'},body:JSON.stringify({choices:[{finish_reason:'stop',message:{content:'نتيجة اصطناعية'}}]})});
  }return r.abort();
 });
 await page.goto(origin,{waitUntil:'load'});await page.click('#empty-new');await page.waitForSelector('[data-field="question"]');await page.click('[data-tab="assistant"]');
 await page.type('#cloud-model','model-test');await page.type('#cloud-key','synthetic-secret');await page.type('#cloud-prompt','نص تجريبي');
 accept=false;await page.click('#cloud-send');await new Promise(r=>setTimeout(r,100));if(calls.length)throw Error('request sent after consent denied');
 accept=true;await page.click('#cloud-send');await page.waitForFunction(()=>document.querySelector('#cloud-output')?.value==='نتيجة اصطناعية');const call=calls[0];if(call.url!=='https://api.openai.com/v1/chat/completions'||call.authorization!=='Bearer synthetic-secret'||!dialogs.at(-1).includes('api.openai.com'))throw Error('incorrect destination or consent');
 const persisted=await page.evaluate(()=>JSON.stringify({current,projects,storage:localStorage}));if(persisted.includes('synthetic-secret'))throw Error('key saved in project or local storage');
 await page.click('#cloud-clear-key');if(await page.$eval('#cloud-key',e=>e.value))throw Error('clear key failed');await page.type('#cloud-key','synthetic-secret');await page.click('[data-tab="overview"]');await page.click('[data-tab="assistant"]');if(await page.$eval('#cloud-key',e=>e.value))throw Error('key retained after leaving assistant');
 console.log('PASS: cloud assistant consent, request and key lifecycle (synthetic provider)');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
