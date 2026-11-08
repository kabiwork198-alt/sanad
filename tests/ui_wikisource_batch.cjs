const puppeteer=require('puppeteer-core');
const title='مقدمة ابن خلدون',list=Array.from({length:12},(_,i)=>({pageid:3941+i,ns:0,title:title+'/قسم '+(i+1)}));
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await browser.newPage(),errors=[];let allow=true,lists=0,reads=0;p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>allow?d.accept(d.type()==='prompt'?'تجربة':undefined):d.dismiss());
 await p.setRequestInterception(true);p.on('request',r=>{const u=new URL(r.url());
  if(u.origin===new URL(process.env.SANAD_TEST_ORIGIN).origin){
   if(u.pathname==='/api/wikisource/subpages'){lists++;if(process.env.SANAD_TEST_MOCK_API==='1'){const body=JSON.parse(r.postData()),pages=body.cursor?[{page_id:'5000',title:title+'/متابعة'}]:list.map(x=>({page_id:String(x.pageid),title:x.title}));return r.respond({status:200,contentType:'application/json',body:JSON.stringify({page_id:'1898',language:'ar',title,prefix:title+'/',pages,next_cursor:body.cursor?'':'مقدمة_ابن_خلدون/تابع',truncated:!body.cursor,warning:'راجع الصفحات'})})}}
   if(u.pathname==='/api/wikisource/rendered'){reads++;if(process.env.SANAD_TEST_MOCK_API==='1'){const id=Number(JSON.parse(r.postData()).page_id);if(id===3942)return r.respond({status:400,contentType:'application/json',body:JSON.stringify({error:'الصفحة غير متاحة'})});return r.respond({status:200,contentType:'application/json',body:JSON.stringify({page_id:String(id),language:'ar',revision_id:String(100000+id),revision_url:'https://ar.wikisource.org/w/index.php?oldid='+(100000+id),title:title+'/قسم '+(id-3940),warning:'راجع الحقوق',text:'نص تاريخي قابل للبحث رقم '+id})})}}
   return r.continue()}

  if(u.hostname==='ar.wikisource.org'&&u.pathname==='/w/api.php'){
   const mode=u.searchParams.get('action'),id=Number(u.searchParams.get('pageid'));let data;
   if(mode==='parse'){reads++;data=id===3942?{error:{code:'missing'}}:{parse:{pageid:id,revid:100000+id,title:title+'/قسم '+(id-3940),text:'<div><style>HIDDEN_STYLE</style><p>نص تاريخي قابل للبحث رقم '+id+'</p><script>window.injected=true</script></div>'}}}
   else if(u.searchParams.get('prop')==='info'){lists++;data={query:{pages:[{pageid:1898,ns:0,title}]}}}
   else if(u.searchParams.get('list')==='allpages')data=u.searchParams.has('apcontinue')?{query:{allpages:[{pageid:5000,ns:0,title:title+'/متابعة'}]}}:{continue:{apcontinue:'مقدمة_ابن_خلدون/تابع'},query:{allpages:list}};
   else return r.abort();return r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
  }return r.abort();
 });
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await p.click('#empty-new');await p.click('[data-tab="sources"]');
 await p.evaluate(()=>{current.sources.push({id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',title:'مقدمة ابن خلدون',url:'https://ar.wikisource.org/?curid=1898',author:'ابن خلدون',notes:'',access:''});setDirty();render()});
 allow=false;await p.click('[data-wiki-list="0"]');if(lists)throw Error('list sent without consent');allow=true;await p.click('[data-wiki-list="0"]');await p.waitForSelector('[data-wiki-page="0"]');if(lists!==1)throw Error('list not sent');
 for(let i=0;i<11;i++)await p.click(`[data-wiki-page="${i}"]`);await p.click('[data-wiki-batch="0"]');if(reads)throw Error('over-limit batch sent');for(let i=3;i<11;i++)await p.click(`[data-wiki-page="${i}"]`);
 allow=false;await p.click('[data-wiki-batch="0"]');if(reads)throw Error('batch sent without consent');allow=true;await p.click('[data-wiki-batch="0"]');
 await p.waitForFunction(()=>wikiBatchTask===null&&wikiBatchReport!==null,{timeout:30000});if(reads!==3)throw Error('unexpected page requests '+reads);
 const state=await p.evaluate(()=>({sources:current.sources,report:wikiBatchReport,injected:window.injected}));
 if(state.sources.length!==2||!state.sources[1].fileId||!state.sources[1].notes.includes('oldid=103941')||state.report.failed.length!==1||!state.report.summary.includes('2 من 3')||state.injected)throw Error('partial result or provenance incorrect '+JSON.stringify(state.report));
 await p.click('[data-wiki-next="0"]');await p.waitForFunction(()=>wikiListResult?.pages[0]?.page_id==='5000');if(lists!==2)throw Error('next page was not fetched');
 await p.type('[data-local-query="1"]','3943');await p.click('[data-local-search="1"]');await p.waitForSelector('[data-match="0"]');
 const check=await p.evaluate(async()=>api('/api/library/search',{id:current.sources[1].fileId,query:'HIDDEN_STYLE'}));if(check.matches.length)throw Error('style leaked');
 await p.click('#save');await p.waitForFunction(()=>!dirty);const id=await p.evaluate(()=>current.id);await p.reload({waitUntil:'load'});await p.waitForSelector(`[data-project="${id}"]`);await p.click(`[data-project="${id}"]`);await p.click('[data-tab="sources"]');await p.type('[data-local-query="1"]','3943');await p.click('[data-local-search="1"]');await p.waitForSelector('[data-match="0"]');
 // Stop during the first request: keep the successful page, mark the second unattempted.
 await p.click('[data-wiki-list="0"]');await p.waitForSelector('[data-wiki-page="0"]');await p.click('[data-wiki-page="0"]');await p.click('[data-wiki-page="2"]');
 await p.evaluate(()=>{const old=api;window.waiting=false;let release;window.releaseWiki=()=>release();api=async(path,data)=>{if(path==='/api/wikisource/rendered'){window.waiting=true;await new Promise(resolve=>release=resolve)}return old(path,data)}});
 await p.click('[data-wiki-batch="0"]');await p.waitForFunction(()=>window.waiting);await p.click('[data-wiki-stop]');await p.evaluate(()=>window.releaseWiki());await p.waitForFunction(()=>wikiBatchTask===null&&wikiBatchReport?.summary.includes('لم تُحاول 1'));
 if((await p.evaluate(()=>current.sources.length))!==3)throw Error('stopped batch did not retain successful page');
 for(const width of [320,390,1440]){await p.setViewport({width,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: real wiki list/render connectors, consent, bounded partial batch, per-page revisions, local search and persistence');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
