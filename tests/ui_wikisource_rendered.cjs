// Deterministic French historical text discovery, rendered transclusion and local search.
const fs=require('node:fs'),path=require('node:path'),puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'),testUrl=process.env.SANAD_TEST_ORIGIN||'https://kabiwork198-alt.github.io/sanad/';
const html='<div><style>HIDDEN_STYLE</style><h2>Histoire des Berbères</h2><p>Les Nefouça, descendants de Nefous, formaient une des plus grandes tribus.</p><script>window.injected=true</script><p>Texte inclus depuis une page de livre.</p></div>';
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];let allow=true,reads=0;page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>allow?d.accept(d.type()==='prompt'?'ابن خلدون':undefined):d.dismiss());
 await page.setViewport({width:390,height:844,isMobile:true});await page.setRequestInterception(true);
 page.on('request',r=>{const u=new URL(r.url());
  if(process.env.SANAD_TEST_ORIGIN&&u.origin===new URL(testUrl).origin){if(u.pathname==='/api/wikisource/rendered')reads++;return r.continue()}
  if(u.hostname==='fr.wikisource.org'&&u.pathname==='/w/api.php'){
   if(u.searchParams.get('action')==='parse'){reads++;return r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({parse:{pageid:3599134,revid:11490985,title:'Histoire des Berbères/Nefouça',text:html}})})}
   return r.respond({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({query:{search:[{pageid:3599134,title:'Histoire des Berbères/Nefouça'}]}})});
  }
  if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),f=path.resolve(root,rel);if(!f.startsWith(root+path.sep))return r.respond({status:403});try{const ext=path.extname(f);return r.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(f)})}catch{return r.respond({status:404})}}
  return r.abort();
 });
 await page.goto(testUrl,{waitUntil:'load'});await page.click('#empty-new');
 const results=await page.evaluate(()=>api('/api/research',{query:'Ibn Khaldoun',provider:'ويكي مصدر الفرنسية'}));
 if(results.results.length!==1||results.results[0].url!=='https://fr.wikisource.org/?curid=3599134')throw Error('French search missing');
 await page.evaluate(x=>{current.sources.push({id:uid(),...x,notes:''});setDirty()},results.results[0]);await page.click('[data-tab="sources"]');
 allow=false;await page.click('[data-wiki-render="0"]');if(reads!==0)throw Error('fetch without consent');
 allow=true;await page.click('[data-wiki-render="0"]');await page.waitForSelector('[data-local-search="0"]',{timeout:15000});
 if(reads!==1)throw Error('unexpected render read count: '+reads);
 await page.type('[data-local-query="0"]','Nefouça');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 const result=await page.evaluate(()=>({source:current.sources[0],match:fileMatches.matches[0],injected:window.injected}));
 if(!result.source.notes.includes('oldid=11490985')||!result.source.notes.includes('قد يتغير المحتوى')||!result.match.text.includes('Nefouça')||result.injected)throw Error('bad provenance, text or remote script executed');
 const check=await page.evaluate(async()=>api('/api/library/search',{id:current.sources[0].fileId,query:'HIDDEN_STYLE'}));if(check.matches.length)throw Error('style leaked into stored text');
 await page.click('#save');await page.waitForFunction(()=>!dirty);await page.reload({waitUntil:'load'});await page.click('[data-project]');await page.click('[data-tab="sources"]');await page.type('[data-local-query="0"]','Nefouça');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: French discovery, consent, rendered transclusion, provenance, safe text, local search and persistence');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
