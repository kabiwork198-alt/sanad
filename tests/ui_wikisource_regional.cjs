// Persian and Turkish Wikisource: real adapter calls against controlled fixtures.
const puppeteer=require('puppeteer-core');
const origin=process.env.SANAD_TEST_ORIGIN;
const examples={fa:{provider:'ويكي مصدر الفارسية',query:'تاریخ',title:'تاریخ ایران',text:'متن تاریخ ایران'},tr:{provider:'ويكي مصدر التركية',query:'Tarih',title:'Tarih kitabı',text:'Tarih kitabı örnek'}};
(async()=>{let b;try{
 b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await b.newPage(),errors=[];let accepted=false,reads=0;
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>accepted?d.accept(d.type()==='prompt'?'اختبار المصادر':undefined):d.dismiss());
 await p.setRequestInterception(true);p.on('request',r=>{
  const u=new URL(r.url()),lang=u.hostname.split('.')[0];
  if(u.origin===new URL(origin).origin){if(u.pathname==='/api/wikisource/rendered')reads++;return r.continue()}
  if(examples[lang]&&u.hostname===lang+'.wikisource.org'&&u.pathname==='/w/api.php'){
   const v=examples[lang];let body;if(u.searchParams.get('action')==='parse'){reads++;body={parse:{pageid:123, revid:456, title:v.title,text:`<div><style>HIDDEN_STYLE</style><p>${v.text}</p></div>`}}}else body={query:{search:[{pageid:123,title:v.title}]}};
   return r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  }
  return r.abort();
 });
 await p.goto(origin,{waitUntil:'load'});accepted=true;await p.click('#empty-new');await p.waitForFunction(()=>!!current);
 for(const [lang,x] of Object.entries(examples)){
  const result=await p.evaluate(async x=>api('/api/research',{query:x.query,provider:x.provider}),x);
  if(result.providers[0].status!=='اكتمل'||result.results[0]?.url!==`https://${lang}.wikisource.org/?curid=123`)throw Error('search failed '+lang+': '+JSON.stringify(result));
  await p.evaluate(r=>{current.sources.push({id:uid(),...r,notes:''});setDirty()},result.results[0]);
 }
 await p.click('[data-tab="sources"]');accepted=false;await p.click('[data-wiki-render="0"]');if(reads!==0)throw Error('read before consent');accepted=true;
 for(const [i,[lang,x]] of Object.entries(Object.entries(examples))){
  await p.click(`[data-wiki-render="${i}"]`);await p.waitForSelector(`[data-local-search="${i}"]`);await p.type(`[data-local-query="${i}"]`,x.query);await p.click(`[data-local-search="${i}"]`);await p.waitForFunction(i=>fileMatches?.sourceId===current.sources[i].id&&fileMatches.matches.length,{},Number(i));
  const data=await p.evaluate(i=>({source:current.sources[i],matches:fileMatches.matches}),Number(i));
  if(!data.source.notes.includes(`${lang}.wikisource.org/w/index.php?oldid=456`)||!data.matches.some(m=>m.text.includes(x.text)))throw Error('read/lineage missing '+lang+': '+JSON.stringify(data));
  if((await p.evaluate(async id=>(await api('/api/library/search',{id,query:'HIDDEN_STYLE'})).matches.length,data.source.fileId)))throw Error('style leaked');
 }
 await p.click('#save');await p.waitForFunction(()=>!dirty);const id=await p.evaluate(()=>current.id);await p.reload({waitUntil:'load'});await p.waitForSelector(`[data-project="${id}"]`);await p.click(`[data-project="${id}"]`);await p.click('[data-tab="sources"]');await p.type('[data-local-query="0"]','تاریخ');await p.click('[data-local-search="0"]');await p.waitForSelector('[data-match="0"]');
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: Persian and Turkish discovery, consent, rendered page, provenance, safe text, search and reload');
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
