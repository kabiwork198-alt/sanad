// Observe the public MCP from the actual Pages origin, without user data.
const puppeteer=require('puppeteer-core');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.url()==='https://kabiwork198-alt.github.io/sanad/'?r.respond({status:200,contentType:'text/html',body:'<!doctype html><title>probe</title>'}):r.continue());await page.goto('https://kabiwork198-alt.github.io/sanad/');
 const value=await page.evaluate(async()=>{try{const r=await fetch('https://www.alexandria-archive.com/mcp',{method:'POST',redirect:'error',credentials:'omit',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'SanadStudio',version:'1.0'}}}),signal:AbortSignal.timeout(25000)});return {status:r.status}}catch(e){return {error:e.name+': '+e.message}}});
 console.log('::notice file=tests/probe_alexandria_browser.cjs,line=1::Alexandria actual browser init '+JSON.stringify(value));
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
