// Diagnostic only: use a known public sample, never print the fetched text.
const puppeteer=require('puppeteer-core');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage();await page.setRequestInterception(true);
 page.on('request',r=>r.url()==='https://kabiwork198-alt.github.io/sanad/'?r.respond({status:200,contentType:'text/html',body:'<!doctype html><title>probe</title>'}):r.continue());
 await page.goto('https://kabiwork198-alt.github.io/sanad/');
 const result=await page.evaluate(async()=>{
   const id='frenchenglishmed00gorduoft';let out={id};
   try{
     const signal=()=>AbortSignal.timeout(25000);
     let r=await fetch('https://archive.org/metadata/'+id,{credentials:'omit',signal:signal()});
     out.metadataStatus=r.status;let d=await r.json();
     let file=(d.files||[]).find(x=>/_djvu\.txt$/.test(x.name)&&Number(x.size)>0&&Number(x.size)<5000000&&x.private!=='true');
     out.candidate=!!file;if(!file)return out;
     out.file=file.name;out.size=file.size;out.private=file.private||'';
     for(const route of ['cors','download']){
       try{r=await fetch('https://archive.org/'+route+'/'+id+'/'+encodeURIComponent(file.name),{credentials:'omit',signal:signal()});out[route]={status:r.status,bytes:(await r.arrayBuffer()).byteLength};}
       catch(e){out[route]={error:e.name+': '+e.message}}
     }
   }catch(e){out.error=e.name+': '+e.message}return out;
 });
 console.log('::notice file=tests/probe_archive.cjs,line=1::Internet Archive browser sample '+JSON.stringify(result));
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
