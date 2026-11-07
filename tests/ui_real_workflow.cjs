// Real user journey: local source -> search -> reviewed claim -> dissent -> draft -> readable report.
// Uses synthetic text only; all network requests outside the isolated test server are blocked.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),puppeteer=require('puppeteer-core');
const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('SANAD_TEST_ORIGIN required');
(async()=>{let browser;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sanad-real-workflow-'));try{
 const file=path.join(dir,'first.txt'),other=path.join(dir,'second.txt');fs.writeFileSync(file,'وثيقة اختبار\nوصلت القافلة بغداد سنة افتراضية\n');fs.writeFileSync(other,'مصدر بديل دون القافلة\n');
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'القافلة في بغداد — تجربة':undefined));
 await page.setViewport({width:390,height:844});await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(['data:','blob:'].includes(u.protocol)||u.origin===new URL(origin).origin)return r.continue();external.push(u.origin);return r.abort()});
 await page.goto(origin,{waitUntil:'load'});await page.click('#empty-new');
 await page.type('[data-field="question"]','ماذا نعرف عن القافلة؟');
 await page.click('[data-go-tab="sources"]');await page.click('[data-add="sources"]');
 await page.type('[data-group="sources"][data-index="0"][data-item-field="title"]','السجل التجريبي الأول');
 await page.type('[data-group="sources"][data-index="0"][data-item-field="author"]','باحث الاختبار');
 await page.type('[data-group="sources"][data-index="0"][data-item-field="edition"]','طبعة تجريبية');
 await (await page.$('[data-attach-file="0"]')).uploadFile(file);await page.click('[data-attach-local="0"]');await page.waitForFunction(()=>!!current.sources[0].fileId);
 const first=await page.evaluate(()=>current.sources[0].fileId);
 // A source object can be mutated while search is in flight: the returned result must be discarded.
 await page.evaluate(()=>{window.originalTestApi=api;api=async(p,d)=>{if(p==='/api/library/search'){await new Promise(r=>window.resumeTestSearch=r)}return window.originalTestApi(p,d)}});
 await page.type('[data-local-query="0"]','القافلة');await page.click('[data-local-search="0"]');await page.waitForFunction(()=>typeof window.resumeTestSearch==='function');
 await (await page.$('[data-attach-file="0"]')).uploadFile(other);await page.click('[data-attach-local="0"]');await page.waitForFunction(id=>current.sources[0].fileId!==id,{},first);const second=await page.evaluate(()=>current.sources[0].fileId);
 await page.evaluate(()=>window.resumeTestSearch());await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('تغير المشروع أو المصدر'));
 if(await page.$('[data-match="0"]'))throw Error('stale in-flight result was shown');await page.evaluate(()=>api=window.originalTestApi);
 await (await page.$('[data-attach-file="0"]')).uploadFile(file);await page.click('[data-attach-local="0"]');await page.waitForFunction(id=>current.sources[0].fileId===id,{},first);
 await page.type('[data-local-query="0"]','القافلة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 // A changed source after the results were displayed must not link a misleading excerpt.
 await page.evaluate(id=>current.sources[0].fileId=id,second);await page.click('[data-match="0"]');if(await page.evaluate(()=>current.claims.length))throw Error('stale displayed result linked to changed source');
 await page.evaluate(id=>current.sources[0].fileId=id,first);await page.click('[data-match="0"]');await page.click('[data-tab="claims"]');
 await page.type('[data-group="claims"][data-index="0"][data-item-field="text"]','وصلت القافلة بغداد بحسب السجل');
 await page.select('[data-group="claims"][data-index="0"][data-item-field="status"]','مدعوم');
 await page.type('[data-group="claims"][data-index="0"][data-item-field="printedPage"]','صفحة ٤');
 // An independent manually recorded source, with explicitly opposing evidence.
 await page.click('[data-tab="sources"]');await page.click('[data-add="sources"]');await page.type('[data-group="sources"][data-index="1"][data-item-field="title"]','الشهادة التجريبية المخالفة');
 await page.click('[data-tab="claims"]');await page.click('[data-evidence-add="0"]');
 const opposing=await page.evaluate(()=>current.sources[1].id);await page.select('[data-group="evidence"][data-index="0"][data-item-field="sourceId"]',opposing);await page.select('[data-group="evidence"][data-index="0"][data-item-field="stance"]','يخالف');
 await page.type('[data-group="evidence"][data-index="0"][data-item-field="location"]','الصفحة الافتراضية ٥');await page.type('[data-group="evidence"][data-index="0"][data-item-field="excerpt"]','شهادة مخالفة تحتاج فحصًا');
 await page.click('[data-tab="writing"]');await page.click('#draft');await page.waitForSelector('#apply-draft');if(!(await page.$eval('#draft-preview',x=>x.textContent)).includes('مراجعة'))throw Error('draft lacks review warning');await page.click('#apply-draft');
 await page.click('[data-tab="overview"]');await page._client().send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dir});await page.click('#export-report');
 const reportFile=path.join(dir,'sanad-research-review.txt');let report='';for(let i=0;i<100;i++){try{report=fs.readFileSync(reportFile,'utf8');if(report.includes('نهاية ملف المراجعة'))break}catch{}await new Promise(r=>setTimeout(r,100))}
 for(const text of ['القافلة في بغداد','يتضمن تغييرات غير محفوظة','السجل التجريبي الأول','طبعة تجريبية','صفحة ٤','الشهادة التجريبية المخالفة','يخالف','شهادة مخالفة تحتاج فحصًا','ليس نسخة احتياطية','غير مشفّر'])if(!report.includes(text))throw Error('report missing: '+text);
 await page.click('#save');await page.waitForFunction(()=>!dirty&&!saveInFlight);const projectId=await page.evaluate(()=>current.id);
 await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${projectId}"]`);await page.click(`[data-project="${projectId}"]`);await page.click('[data-tab="claims"]');
 const state=await page.evaluate(()=>({sources:current.sources,claims:current.claims,evidence:current.evidence,script:current.script}));
 if(state.sources.length!==2||state.claims.length!==1||state.evidence.length!==1||state.evidence[0].stance!=='يخالف'||!state.script.includes('القافلة')||state.sources[0].fileId!==first)throw Error('saved workflow did not survive reload');
 await page.click('[data-tab="sources"]');await page.type('[data-local-query="0"]','القافلة');await page.click('[data-local-search="0"]');await page.waitForSelector('[data-match="0"]');
 // Optional permitted real historical text; no copy is committed, and no claim is auto-verified.
 if(process.env.SANAD_TEST_REAL_SOURCE){
  await page.click('[data-add="sources"]');await page.type('[data-group="sources"][data-index="2"][data-item-field="title"]','تاريخ آداب العرب — نسخة OpenITI');
  await page.type('[data-group="sources"][data-index="2"][data-item-field="notes"]','اختبار OpenITI؛ CC BY-NC-SA؛ راجع الطبعة والحقوق');
  await (await page.$('[data-attach-file="2"]')).uploadFile(process.env.SANAD_TEST_REAL_SOURCE);await page.click('[data-attach-local="2"]');await page.waitForFunction(()=>!!current.sources[2]?.fileId);
  await page.type('[data-local-query="2"]','المدرسة النظامية');await page.click('[data-local-search="2"]');await page.waitForSelector('[data-match="0"]',{timeout:30000});
  const sample=await page.$eval('[data-match="0"]',e=>e.parentElement.textContent);if(!sample.includes('المدرسة النظامية'))throw Error('real source phrase missing');
  await page.click('[data-match="0"]');const newClaim=await page.evaluate(()=>current.claims.at(-1));
  if(newClaim.status!=='لم يُفحص'||!newClaim.notes.includes('المدرسة النظامية')||!newClaim.location.includes('السطر'))throw Error('real text was not marked as unreviewed with its actual line');
  await page.click('#save');await page.waitForFunction(()=>!dirty&&!saveInFlight);console.log('PASS: real OpenITI text, local search and unreviewed provenance (noncommercial-sharealike dataset)');
 }
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length||external.length)throw Error('page errors: '+errors+' external requests: '+external);
 console.log('PASS: offline real workflow, local search races, opposing evidence, draft, private readable report and reload');
 }finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
