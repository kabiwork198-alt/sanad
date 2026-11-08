// Exercise real browser connectors with mocked upstream HTTP/CORS.
const puppeteer=require('puppeteer-core'),origin=process.env.SANAD_TEST_ORIGIN;
(async()=>{let b;try{
 b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await b.newPage(),errors=[];let external=0;p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept(d.type()==='prompt'?'ابن خلدون':undefined));
 await p.setRequestInterception(true);p.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(origin).origin)return r.continue();
  if(u.hostname==='raw.githubusercontent.com'&&u.pathname.endsWith('/metadata/OpenITI_metadata_2025-1-9.tsv')){external++;return r.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'text/plain',body:'version_uri\tauthor_ar\tauthor_lat\ttitle_ar\ttitle_lat\tdate\tstatus\ted_info\tlocal_path\n0808IbnKhaldun.X-ara1\tابن خلدون\tIbn Khaldun\tالعبر\tIbar\t0808\tpri\tطبعة\tdata/0808IbnKhaldun/0808IbnKhaldun.X/0808IbnKhaldun.X-ara1\n'})}
  if(u.hostname==='mcp.turath.io'){
   if(r.method()==='OPTIONS')return r.respond({status:200,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'content-type','Access-Control-Allow-Methods':'POST'}});
   const data=JSON.parse(r.postData());external++;
   if(data.method==='notifications/initialized')return r.respond({status:202,headers:{'Access-Control-Allow-Origin':'*'},body:''});
   const result=data.method==='initialize'?{protocolVersion:'2025-03-26'}:{content:[{type:'text',text:JSON.stringify({results:[{book_id:123,meta:{page_id:456,book_name:'كتاب تراث',author_name:'مؤلف'},snip:'ابن خلدون'}]})}]};
   return r.respond({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({jsonrpc:'2.0',id:data.id,result})});
  }
  return r.abort();
 });
 await p.goto(origin,{waitUntil:'load'});await p.click('#empty-new');await p.click('[data-tab="research"]');
 await p.evaluate(()=>{const real=api;api=async(path,data)=>path==='/api/research'?{searched_at:'T',providers:[{provider:data.provider,status:'اكتمل'}],results:[]}:real(path,data)});
 await p.click('#research-search');await p.waitForFunction(()=>researchResult?.plan&&researchTask===null,{timeout:40000});
 const data=await p.evaluate(()=>({runs:researchResult.runs,results:researchResult.results}));
 for(const provider of ['فهرس OpenITI','تراث']){const state=data.runs.find(x=>x.provider===provider);if(state?.status!=='اكتمل'||state.count!==1||!data.results.some(x=>x.provider===provider))throw Error('browser adapter failed '+provider+': '+JSON.stringify(state));}
 if(external<4)throw Error('expected actual OpenITI and MCP requests');
 const idx=data.results.findIndex(x=>x.provider==='تراث');await p.click(`[data-research-result="${idx}"]`);await p.click('[data-tab="sources"]');await p.waitForSelector('[data-turath-read="0"]');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: real browser adapter, OpenITI metadata and Turath MCP discovery with mock HTTP');
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
