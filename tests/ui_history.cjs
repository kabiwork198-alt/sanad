const puppeteer=require('puppeteer-core');
const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('SANAD_TEST_ORIGIN required');
(async()=>{let browser;try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[];let accept=true;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'اختبار التوثيق':undefined):d.dismiss());
 await page.goto(origin,{waitUntil:'load'});await page.click('#empty-new');await page.click('[data-tab="sources"]');
 await page.evaluate(()=>{current.sources.push({id:uid(),title:'المصدر الأول',author:'',url:'',notes:'',workYear:'2000'});current.sources.push({id:uid(),title:'المصدر الثاني',author:'',url:'',notes:''});setDirty();render()});
 const set=async (selector,value)=>page.$eval(selector,(e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}))},value);
 await set('[data-group="sources"][data-index="0"][data-item-field="edition"]','طبعة دار الاختبار');
 await set('[data-group="sources"][data-index="0"][data-item-field="workHijriYear"]','٩٢٣');
 accept=false;await page.click('[data-year-estimate="sources"][data-index="0"]');if(await page.evaluate(()=>current.sources[0].workYear)!=='2000')throw Error('declined overwrite changed year');
 accept=true;await page.click('[data-year-estimate="sources"][data-index="0"]');if(await page.evaluate(()=>current.sources[0].workYear)!=='1517')throw Error('source estimated year wrong');
 await page.evaluate(async()=>{const content=bytesToBase64(new TextEncoder().encode('ذكر أحمد بن يحيى في الكتاب'));const doc=(await api('/api/library/import',{name:'test.txt',content})).document;current.sources[0].fileId=doc.id;setDirty();render()});
 await set('[data-local-query="0"]','احمد بن يحيي');await page.click('[data-local-search="0"]');await page.waitForFunction(()=>fileMatches?.match_mode==='basic');if(await page.evaluate(()=>fileMatches.matches.length))throw Error('basic search should not normalize alef/ya variants');
 await set('[data-local-query="0"]','احمد بن يحيي');await page.select('[data-local-mode="0"]','arabic-variants');await page.click('[data-local-search="0"]');await page.waitForFunction(()=>fileMatches?.match_mode==='arabic-variants');if(!(await page.evaluate(()=>fileMatches.matches[0]?.text.includes('أحمد بن يحيى'))))throw Error('variant search missed original spelling');
 await set('#comparison-query','احمد بن يحيي');await page.select('#comparison-mode','arabic-variants');await page.click('[data-compare-source]');await page.click('#comparison-search');await page.waitForFunction(()=>comparisonResult?.match_mode==='arabic-variants');if(!(await page.evaluate(()=>comparisonResult.groups[0].matches.length)))throw Error('comparison variant search failed');
 await page.click('[data-tab="timeline"]');await page.click('[data-add="events"]');
 await set('[data-group="events"][data-item-field="dateOriginal"]','١٤٤٥ هـ كما ورد');await set('[data-group="events"][data-item-field="hijriYear"]','١٤٤٥');await page.click('[data-year-estimate="events"]');
 if(await page.evaluate(()=>current.events[0].sortYear)!=='2023'||await page.evaluate(()=>current.events[0].dateOriginal)!=='١٤٤٥ هـ كما ورد')throw Error('event estimation or original date wrong');
 await page.evaluate(()=>{const id=uid();current.claims.push({id,text:'ادعاء للاختبار',status:'مدعوم',sourceId:current.sources[0].id,location:'صفحة PDF 10'});current.evidence.push({claimId:id,sourceId:current.sources[1].id,stance:'يخالف',location:'السطر 50'});setDirty()});await page.click('[data-tab="claims"]');
 await set('[data-group="claims"][data-item-field="printedPage"]','ج ٢ ص ٤٥');await set('[data-group="evidence"][data-item-field="printedPage"]','ص ٩');
 const draft=await page.evaluate(async()=>(await api('/api/draft',{project:current})).text);
 for(const text of ['طبعة دار الاختبار','ج ٢ ص ٤٥','ص ٩','صفحة PDF 10','السطر 50'])if(!draft.includes(text))throw Error('draft missing '+text+': '+draft);
 await page.click('#save');await page.waitForFunction(()=>!dirty);const id=await page.evaluate(()=>current.id);await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${id}"]`);await page.click(`[data-project="${id}"]`);
 const data=await page.evaluate(()=>current);if(data.events[0].hijriYear!=='١٤٤٥'||data.events[0].dateOriginal!=='١٤٤٥ هـ كما ورد'||data.claims[0].printedPage!=='ج ٢ ص ٤٥'||data.evidence[0].printedPage!=='ص ٩'||data.sources[0].edition!=='طبعة دار الاختبار')throw Error('historical citation fields lost after reload');
 await page.click('[data-tab="timeline"]');for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error('page errors '+errors.join('; '));console.log('PASS: optional Hijri estimates, consent before overwriting, original dates, printed citations, draft and reload');
 }finally{if(browser)await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
