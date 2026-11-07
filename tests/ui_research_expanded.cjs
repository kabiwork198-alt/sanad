// Exercise the actual UI and scheduler against controlled provider responses in both editions.
const puppeteer=require('puppeteer-core');const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('SANAD_TEST_ORIGIN required');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];let consent=true,dialogs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());return consent?d.accept(d.type()==='prompt'?'ابن خلدون':undefined):d.dismiss()});
 await page.goto(origin,{waitUntil:'load'});await page.click('#empty-new');await page.click('[data-tab="research"]');
 await page.evaluate(()=>{window.originalResearchApi=api;window.stats={requests:[],active:0,max:0,activeProviders:{},crossref:0,early:0,lm:0};api=async(path,data)=>{
  if(path==='/api/lm'){stats.lm++;throw Error('model must not be invoked')}
  if(path!=='/api/research')return originalResearchApi(path,data);
  const p=data.provider;if(!p)throw Error('expanded requests must select one provider');stats.requests.push({...data});stats.active++;stats.max=Math.max(stats.max,stats.active);stats.activeProviders[p]=(stats.activeProviders[p]||0)+1;if(stats.activeProviders[p]>1)throw Error('provider concurrent');await new Promise(r=>setTimeout(r,18));stats.active--;stats.activeProviders[p]--;
  if(p==='Crossref'&&data.query==='ابن خلدون'&&stats.crossref++===0)return {searched_at:'T',providers:[{provider:p,status:'تعذر الاتصال أو قراءة الاستجابة',reason:'HTTP 429',count:0}],results:[]};
  if(p==='Open Library'&&data.query.endsWith('البدايات')&&stats.early++===0)return {searched_at:'T',providers:[{provider:p,status:'تعذر الاتصال أو قراءة الاستجابة',reason:'HTTP 503',count:0}],results:[]};
  return {searched_at:'T',providers:[{provider:p,status:'اكتمل',reason:'',count:1}],results:[{provider:p,title:'سجل تجريبي',author:'مؤلف',url:'https://example.org/same',detail:data.query,access:'سجل غير محقق'}]};
 }});
 consent=false;await page.click('#research-search');if((await page.evaluate(()=>stats.requests.length))!==0)throw Error('sent queries before consent');consent=true;
 await page.click('#research-search');await page.waitForFunction(()=>researchResult?.plan&&researchTask===null,{timeout:45000});
 const result=await page.evaluate(()=>({query:researchResult.query,runs:researchResult.runs,results:researchResult.results,stats}));
 if(result.runs.length!==(await page.evaluate(()=>window.SANAD_BROWSER?48:49)))throw Error('incorrect number of planned attempts');
 if(result.stats.max>4||result.stats.max<2||result.stats.requests.filter(x=>x.provider==='Crossref').length!==1)throw Error('concurrency or 429 throttling wrong '+JSON.stringify(result.stats));
 if(result.results.length!==1||result.results[0].appearances.length<10)throw Error('deduplication lost provenance');
 for(const dimension of ['timeline','geography','people','sources'])if(!result.runs.some(x=>x.dimension===dimension))throw Error('missing dimension '+dimension);
 if(!result.runs.some(x=>x.reason.includes('429')&&x.status==='لم تُنفذ')||!dialogs.some(x=>x.includes('البدايات')&&x.includes('المخطوطات')))throw Error('missing rate limit or consent preview');
 await page.click('[data-retry-provider="0"]');await page.waitForFunction(()=>researchResult.providers[0].status==='اكتمل');
 const idx=await page.evaluate(()=>researchResult.runs.findIndex(x=>x.query_id==='early'&&x.provider==='Open Library'));await page.$eval(`[data-retry-attempt="${idx}"]`,el=>el.closest('details').open=true);await page.click(`[data-retry-attempt="${idx}"]`);await page.waitForFunction(i=>researchResult.runs[i].status==='اكتمل',{},idx);
 await page.click('#research-make-brief');const brief=await page.$eval('#research-brief',x=>x.value);if(!brief.includes('البدايات')||!brief.includes('لم تكتمل')||!brief.includes('لا تختلق'))throw Error('brief loses limitations');
 if(!(await page.evaluate(()=>window.SANAD_BROWSER))){await page.click('#research-to-assistant');const prompt=await page.$eval('#lm-prompt',x=>x.value);if(!prompt.includes('ملخص بحث استكشافي')||await page.evaluate(()=>stats.lm))throw Error('assistant preview is missing or sent automatically');await page.click('[data-tab="research"]')}
 await page.click('[data-research-result="0"]');const source=await page.evaluate(()=>current.sources[0]);if(!source.notes.includes('البدايات')||!source.notes.includes('السياق السياسي')||!source.notes.includes('سجل غير محقق'))throw Error('source provenance lost');
 await page.click('#save');await page.waitForFunction(()=>!dirty);const id=await page.evaluate(()=>current.id);await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${id}"]`);await page.click(`[data-project="${id}"]`);await page.click('[data-tab="sources"]');if(!(await page.evaluate(()=>current.sources[0].notes.includes('البدايات'))))throw Error('provenance not saved');
 // Stop a second search while four requests are in flight; preserve completed and unattempted statuses.
 await page.click('[data-tab="research"]');await page.evaluate(()=>{window.baseApi2=api;window.cancelCalls=0;api=async(path,data)=>{if(path!=='/api/research')return baseApi2(path,data);cancelCalls++;await new Promise(r=>setTimeout(r,300));return {searched_at:'T',providers:[{provider:data.provider,status:'اكتمل',count:1}],results:[{provider:data.provider,title:'partial',url:'https://example.org/partial',author:'',detail:'',access:'record'}]}}});
 await page.click('#research-search');await page.waitForFunction(()=>window.cancelCalls>0);await page.click('#research-stop');await page.waitForFunction(()=>researchResult?.plan&&researchTask===null,{timeout:20000});
 const cancelled=await page.evaluate(()=>({unstarted:researchResult.runs.filter(r=>r.status==='لم تُنفذ').length,completed:researchResult.runs.filter(r=>r.status==='اكتمل').length,calls:cancelCalls}));if(!cancelled.unstarted||!cancelled.completed||cancelled.calls>4)throw Error('cancellation lost statuses '+JSON.stringify(cancelled));
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});await page.click('[data-tab="research"]');if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: consent, real UI planning, concurrency, 429, retries, deduplication, source provenance, assistant preview, cancellation and persistence');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
