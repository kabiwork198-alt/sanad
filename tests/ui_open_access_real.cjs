const puppeteer=require('puppeteer-core');
(async()=>{let b;try{
 b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await b.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'تجربة':undefined));
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await p.click('#empty-new');await p.click('[data-tab="sources"]');
 await p.evaluate(()=>{current.sources.push({id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',title:'Original',url:'https://openalex.org/W123',author:'',notes:'',access:''});render();const old=window.fetch;window.remote=[];window.fetch=(url,opts)=>{if(String(url).startsWith('https://api.openalex.org/works/')){remote.push(String(url));return Promise.resolve(new Response(JSON.stringify({id:'https://openalex.org/W123',doi:null,title:'Test',locations:[{is_oa:true,landing_page_url:'https://repo.example/item'}]}),{status:200,headers:{'Content-Type':'application/json'}}))}return old(url,opts)};});
 await p.click('[data-oa-find="0"]');await p.waitForSelector('[data-oa-add="0"]',{timeout:10000});
 const r=await p.evaluate(()=>({r:openAccessResult,remote,local:!window.SANAD_BROWSER}));if(r.r.copies[0].landing_url!=='https://repo.example/item')throw Error('connector mapping failed');if(r.remote.length!==(r.local?0:1))throw Error('unexpected browser network behavior');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: real browser engine or local HTTP endpoint, mocked upstream only');
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
