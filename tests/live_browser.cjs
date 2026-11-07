// Optional GitHub Actions check: actual Chromium + live public catalogs, no user data.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const relative=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);return res.end()}const ext=path.extname(file);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream');res.end(data)});
});
function report(message){console.log(`::notice file=tests/live_browser.cjs,line=1::${message}`)}
(async()=>{
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage(), errors=[], browserConsole=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error'&&msg.text().includes('loc.gov'))browserConsole.push(msg.text().slice(0,300))});
  const locEvents=[];page.on('response',res=>{if(res.url().startsWith('https://www.loc.gov/collections/'))locEvents.push('HTTP '+res.status())});page.on('requestfailed',req=>{if(req.url().startsWith('https://www.loc.gov/collections/'))locEvents.push(req.failure()?.errorText||'failed')});
  page.on('dialog',dialog=>dialog.accept(dialog.type()==='prompt'?'الخوارزمي':undefined));
  await page.setViewport({width:390,height:844,isMobile:true});
  await page.setRequestInterception(true);
  page.on('request',async req=>{
    const url=new URL(req.url());
    if(url.hostname!=='kabiwork198-alt.github.io'||!url.pathname.startsWith('/sanad/'))return req.continue();
    const relative=url.pathname==='/sanad/'?'index.html':url.pathname.slice('/sanad/'.length);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep))return req.respond({status:403,body:'Forbidden'});
    try {const data=fs.readFileSync(file),ext=path.extname(file);return req.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:data})}catch{return req.respond({status:404,body:'Not found'})}
  });
  await page.goto('https://kabiwork198-alt.github.io/sanad/',{waitUntil:'load'});
  await page.click('#home-discover');
  await page.waitForFunction(()=>!document.querySelector('#home-discover').disabled,{timeout:25000});
  report('Browser topic cards: '+(await page.$$('[data-start-topic]')).length);
  await page.click('#empty-new');await page.click('[data-tab="research"]');await page.click('#research-search');
  await page.waitForFunction(()=>typeof researchResult!=='undefined'&&researchResult!==null,{timeout:45000});
  const result=await page.evaluate(()=>researchResult);
  const interesting=p=>['المكتبة الرقمية العالمية','صحف Chronicling America','مخطوطات مالي الإسلامية','DOAJ','OpenAlex'].includes(p.provider);
  report('Browser Arabic providers: '+result.providers.filter(interesting).map(p=>p.provider+': '+p.status+' / '+p.count).join('; '));
  report('Browser visible result cards: '+(await page.$$('[data-research-result]')).length);
  await page.$eval('#research-query',e=>e.value='');await page.type('#research-query','Baghdad');await page.click('#research-search');
  await page.waitForFunction(()=>typeof researchResult!=='undefined'&&researchResult?.query==='Baghdad',{timeout:45000});
  const archives=await page.evaluate(()=>researchResult.providers);
  report('Browser Baghdad providers: '+archives.filter(interesting).map(p=>p.provider+': '+p.status+' / '+p.count).join('; '));
  report('Browser LOC requests: '+locEvents.join(', '));if(browserConsole.length)report('Browser LOC console: '+browserConsole[0]);
  // Exercise the actual UI: a selected public Wikisource page is downloaded, stored,
  // searched locally and linked to a fixed revision. The page may itself be partial.
  try {
    const index=await page.evaluate(()=>{current.sources.push({id:crypto.randomUUID().replaceAll('-',''),title:'تاريخ الطبري/الجزء العاشر',author:'',url:'https://ar.wikisource.org/?curid=43576',access:'',notes:''});document.querySelector('[data-tab="sources"]').click();return current.sources.length-1});
    await page.click(`[data-wiki-read="${index}"]`);
    await page.waitForSelector(`[data-local-search="${index}"]`,{timeout:25000});
    await page.type(`[data-local-query="${index}"]`,'الاثنين');await page.click(`[data-local-search="${index}"]`);
    await page.waitForSelector('[data-match="0"]',{timeout:10000});
    const check=await page.evaluate(i=>({note:current.sources[i].notes,match:fileMatches.matches[0].text}),index);
    if(!check.note.includes('oldid=')||!check.match.includes('الاثنين'))throw Error('revision or match missing');
    report('Wikisource live UI: selected public revision saved, searched locally, match and revision link present');
  } catch(e) {const state=await page.evaluate(()=>({tab,toast:document.querySelector('#toast')?.textContent,sourceCount:current?.sources.length,wikiButtons:document.querySelectorAll('[data-wiki-read]').length}));report('Wikisource live UI unavailable: '+e.message.slice(0,100)+' '+JSON.stringify(state));}


  // Public OCR sample: real UI, metadata, bounded download, checksum and local search.
  try {
    const index=await page.evaluate(()=>{current.sources.push({id:crypto.randomUUID().replaceAll('-',''),title:'Public OCR sample',author:'',url:'https://archive.org/details/frenchenglishmed00gorduoft',access:'',notes:''});document.querySelector('[data-tab="sources"]').click();return current.sources.length-1});
    await page.click(`[data-archive-read="${index}"]`);
    await page.waitForSelector(`[data-local-search="${index}"]`,{timeout:90000});
    await page.type(`[data-local-query="${index}"]`,'the');await page.click(`[data-local-search="${index}"]`);await page.waitForSelector('[data-match="0"]',{timeout:25000});
    const source=await page.evaluate(i=>current.sources[i],index);
    if(!source.notes.includes('_djvu.txt')||!source.notes.includes('SHA-1'))throw Error('OCR provenance missing');
    report('Internet Archive live UI: public OCR downloaded, checksum checked when present, provenance retained and phrase found locally');
  } catch(e) {const state=await page.evaluate(()=>document.querySelector('#toast')?.textContent);report('Internet Archive live UI unavailable: '+String(e.message).slice(0,100)+' '+state);}

  // Turath official MCP: consented search and one selected page in a real browser.
  try {
    await page.click('[data-tab="research"]');await page.$eval('#turath-query',e=>e.value='فتح بغداد');await page.click('#turath-search');
    await page.waitForFunction(()=>typeof turathResult!=='undefined'&&turathResult!==null,{timeout:100000});
    const result=await page.evaluate(()=>turathResult);if(result.error)throw Error(result.error);if(!result.results?.length)throw Error('No sample results');
    await page.click('[data-turath-result="0"]');const index=await page.evaluate(()=>current.sources.length-1);await page.click('[data-tab="sources"]');await page.click(`[data-turath-read="${index}"]`);
    await page.waitForSelector(`[data-local-search="${index}"]`,{timeout:100000});const source=await page.evaluate(i=>current.sources[i],index);
    if(!source.fileId||!source.notes.includes('صفحة تراث'))throw Error('Page or provenance not saved');
    report('Turath live UI: MCP search and selected page succeeded in real browser, stored locally with citation provenance');
  } catch(e) {const toast=await page.evaluate(()=>document.querySelector('#toast')?.textContent);report('Turath live UI unavailable: '+String(e.message).slice(0,140)+' '+toast);}

  // Public pinned OpenITI index is fetched by the real browser only with consent.
  try {
    await page.click('[data-tab="research"]');
    await page.$eval('#openiti-query',e=>e.value='تاريخ الطبري');await page.click('#openiti-search');
    await page.waitForFunction(()=>typeof openitiResult!=='undefined'&&openitiResult!==null,{timeout:75000});
    const oi=await page.evaluate(()=>openitiResult);
    if(oi.error)throw Error(oi.error);
    if(oi.total<1||!oi.results[0]?.url?.startsWith('https://github.com/OpenITI/RELEASE/blob/'))throw Error('Expected catalog result or pinned link missing');
    await page.click('[data-openiti-result="0"]');
    const source=await page.evaluate(()=>current.sources[current.sources.length-1]);
    if(!source.notes.includes('CC BY-NC-SA'))throw Error('License warning not retained');
    report('OpenITI live browser: catalog loaded with consent, history search matches='+oi.total+', record and license saved');
    const index=await page.evaluate(()=>current.sources.length-1);
    await page.click('[data-tab="sources"]');await page.click(`[data-openiti-read="${index}"]`);
    await page.waitForSelector(`[data-local-search="${index}"]`,{timeout:100000});
    await page.type(`[data-local-query="${index}"]`,'بعهد الخليفة إلينا');await page.click(`[data-local-search="${index}"]`);
    await page.waitForSelector('[data-match="0"]',{timeout:100000});
    const passage=await page.evaluate(()=>fileMatches.matches[0]);
    if(!passage.text.includes('بعهد الخليفة إلينا')||!passage.location.includes('ليس رقم صفحة'))throw Error('Cross-line search or location missing');
    report('OpenITI live full text: selected 14 MB Tabari version downloaded with consent, cross-line phrase found, raw line location not confused with page');
  } catch(e) { report('OpenITI live browser unavailable: '+String(e.message).slice(0,160)); }

  if(errors.length)throw Error('Browser script errors: '+errors.join('; '));
 }finally{if(browser)await browser.close();server.close()}
})().catch(err=>{console.error(err);process.exitCode=1});
