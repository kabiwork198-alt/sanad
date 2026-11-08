// End-to-end image-only multi-page PDF OCR using the bundled engine, without external requests.
const {spawnSync}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),puppeteer=require('puppeteer-core');
const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('SANAD_TEST_ORIGIN required');
(async()=>{let browser,dir=fs.mkdtempSync(path.join(os.tmpdir(),'sanad-ocr-batch-'));try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage(),external=[],errors=[];let accept=true;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>accept?d.accept(d.type()==='prompt'?'OCR متعدد الصفحات':undefined):d.dismiss());
 const cdp=await page.createCDPSession();await cdp.send('Network.enable');await cdp.send('Network.setBlockedURLs',{urls:['https://*']});
 page.on('request',r=>{const u=r.url();if(!u.startsWith('data:')&&!u.startsWith('blob:')&&new URL(u).origin!==new URL(origin).origin)external.push(u)});
 await page.goto(origin,{waitUntil:'load'});await page.click('#empty-new');await page.click('[data-tab="sources"]');
 const images=await page.evaluate(()=>{
  const make=(text,rtl=false)=>{const c=document.createElement('canvas');c.width=1800;c.height=500;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='black';x.font='bold 100px sans-serif';if(rtl){x.direction='rtl';x.textAlign='right';x.fillText(text,1700,240)}else x.fillText(text,60,240);return c.toDataURL('image/png')};
  return [make('HISTORICAL DOCUMENT 1916'),make('Baghdad archives and history'),make('التاريخ الإسلامي مدينة بغداد',true),make(''),...Array(8).fill(make('ARCHIVE RECORD'))];
 });
 const print=await browser.newPage();await print.setContent(`<style>@page{size:A4;margin:12mm}body{margin:0} .sheet{page-break-after:always} .sheet:last-child{page-break-after:auto}img{width:100%}</style>${images.map(data=>`<div class="sheet"><img src="${data}"></div>`).join('')}`);const pdf=path.join(dir,'multipage.pdf');await print.pdf({path:pdf,format:'A4',printBackground:true});await print.close();
 const encrypted=path.join(dir,'protected.pdf'),py=spawnSync(process.env.SANAD_TEST_PYTHON||'python',['-c','from pypdf import PdfReader,PdfWriter; import sys; r=PdfReader(sys.argv[1]); assert len(r.pages)==12 and not any((p.extract_text() or "").strip() for p in r.pages); w=PdfWriter(); [w.add_page(p) for p in r.pages]; w.encrypt("test-password"); w.write(sys.argv[2])',pdf,encrypted],{encoding:'utf8'});if(py.status!==0)throw Error('image-only PDF or encryption check failed: '+py.stderr);
 await (await page.$('#ocr-batch-file')).uploadFile(encrypted);await page.$eval('#ocr-batch-last',e=>e.value='2');await page.click('#ocr-batch-run');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('محمي'),{timeout:30000});if(await page.evaluate(()=>current.sources.length))throw Error('protected PDF was processed');
 await (await page.$('#ocr-batch-file')).uploadFile(pdf);await page.select('#ocr-batch-language','ara+eng');await page.$eval('#ocr-batch-last',e=>e.value='12');
 accept=false;await page.click('#ocr-batch-run');if(await page.evaluate(()=>current.sources.length))throw Error('ran without consent');accept=true;
 // Reject out-of-range request before loading OCR or publishing a source.
 await page.$eval('#ocr-batch-last',e=>e.value='13');await page.click('#ocr-batch-run');await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('يتجاوز عدد صفحات'),{timeout:30000});if(await page.evaluate(()=>current.sources.length))throw Error('out-of-range import');
 await (await page.$('#ocr-batch-file')).uploadFile(pdf);await page.select('#ocr-batch-language','ara+eng');await page.$eval('#ocr-batch-last',e=>e.value='12');await page.click('#ocr-batch-run');
 await page.waitForSelector('[data-local-search="0"]',{timeout:180000});const src=await page.evaluate(()=>current.sources[0]);
 const hash=crypto.createHash('sha256').update(fs.readFileSync(pdf)).digest('hex');if(!src.notes.includes(hash)||!src.notes.includes('الصفحات المعالجة: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12')||!src.notes.includes('صفحات بلا نص: 4')||!src.notes.includes('الأصل محفوظ ومرتبط')||src.originalFileId!==hash)throw Error('batch provenance wrong: '+src.notes);
 if(!(await page.$('[data-ocr-original="0"]'))||!(await page.$('[data-ocr-text="0"]')))throw Error('OCR downloads not offered');
 const exported=await page.evaluate(async()=>api('/api/library/export',{id:current.sources[0].fileId}));if(!Buffer.from(exported.document.content,'base64').toString('utf8').startsWith('#SANAD-OCR-TEXT-1\n#SANAD-PAGE:1'))throw Error('numbered OCR export malformed');
 for(const [q,n] of [['1916',1],['archives',2],['بغداد',3]]){await page.$eval('[data-local-query="0"]',e=>e.value='');await page.type('[data-local-query="0"]',q);await page.click('[data-local-search="0"]');await page.waitForFunction(n=>document.querySelector('[data-match="0"]')?.parentElement?.textContent.includes('PDF '+n),{timeout:15000},n)}
 if(!(await page.evaluate(async()=>{const r=await api('/api/library/search',{id:current.sources[0].fileId,query:'ARCHIVE RECORD'});return r.matches.some(m=>m.location.includes('PDF 12'))})))throw Error('last page missing');
 // Stop during page 2: page 1 and any completed current page must be kept and labelled partial.
 await (await page.$('#ocr-batch-file')).uploadFile(pdf);await page.select('#ocr-batch-language','eng');await page.$eval('#ocr-batch-last',e=>e.value='3');await page.click('#ocr-batch-run');await page.waitForFunction(()=>document.querySelector('#ocr-batch-progress')?.textContent.includes('صفحة PDF 2'),{timeout:90000});
 await page.click('#home');if(await page.evaluate(()=>current===null))throw Error('navigation allowed during processing');await page.click('#ocr-batch-stop');await page.waitForSelector('[data-local-search="1"]',{timeout:90000});const partial=await page.evaluate(()=>current.sources[1]);if(!partial.notes.includes('نتيجة جزئية')||!partial.notes.includes('الصفحات المعالجة: 1, 2'))throw Error('partial result is not retained: '+partial.notes);
 // A partial result remains attached to the same source after reload and resume.
 await page.waitForSelector('#ocr-resume');const partialId=partial.id;const savedProject=await page.evaluate(()=>current.id);
 const peer=await browser.newPage();await peer.goto(origin,{waitUntil:'load'});
 const locked=await page.evaluate(async()=>{let release,ready;const held=new Promise(r=>release=r),acquired=new Promise(r=>ready=r);window.testOcrLockRelease=release;window.testOcrLock=navigator.locks.request('sanad-ocr-'+current.id,()=>{ready();return held});await acquired;return current.id});
 const blocked=await peer.evaluate(async id=>{try{await SanadOcrJournal.exclusive(id,()=>Promise.resolve());return false}catch(e){return e.message.includes('نافذة أخرى')}},locked);
 if(!blocked)throw Error('concurrent OCR lock not enforced');await page.evaluate(()=>window.testOcrLockRelease());await page.evaluate(()=>window.testOcrLock);await peer.close();
 await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${savedProject}"]`);await page.click(`[data-project="${savedProject}"]`);await page.click('[data-tab="sources"]');await page.waitForSelector('#ocr-resume');
 // Fail after staging the new file but before saving the project: previous link remains durable.
 await page.evaluate(()=>{window.originalPersistOcr=persistOcrProject;let calls=0;persistOcrProject=async id=>{if(++calls===2)throw Error('SIMULATED PRE-SAVE CRASH');return window.originalPersistOcr(id)}});
 await page.click('#ocr-resume');await page.waitForFunction(()=>!ocrBusy&&document.querySelector('#toast').textContent.includes('SIMULATED PRE-SAVE CRASH'),{timeout:90000});
 const beforeSave=await page.evaluate(async()=>{const state=await SanadOcrJournal.get(current.id),project=(await api('/api/projects')).projects.find(x=>x.id===current.id);return {job:state.job,previous:project.sources[1].fileId}});
 if(beforeSave.job.pendingFileId===beforeSave.previous||beforeSave.job.publishedFileId!==beforeSave.previous)throw Error('staged-before-save state did not preserve prior attachment');
 await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${savedProject}"]`);await page.click(`[data-project="${savedProject}"]`);await page.click('[data-tab="sources"]');await page.waitForSelector('#ocr-resume');
 // Crash/failure after project save but before the completed journal is removed.
 await page.evaluate(()=>{window.originalRemoveJournal=SanadOcrJournal.remove;SanadOcrJournal.remove=async()=>{throw Error('SIMULATED PUBLICATION CRASH')}});
 await page.click('#ocr-resume');await page.waitForFunction(()=>!ocrBusy&&document.querySelector('#toast').textContent.includes('SIMULATED PUBLICATION CRASH'),{timeout:90000});
 const staged=await page.evaluate(async()=>{const saved=await SanadOcrJournal.get(current.id);return {job:saved.job,file:current.sources[1].fileId}});
 if(staged.job.pendingFileId!==staged.file||staged.job.publishedFileId===staged.file)throw Error('publication intent not persisted before project save');
 await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${savedProject}"]`);await page.click(`[data-project="${savedProject}"]`);await page.click('[data-tab="sources"]');await page.waitForSelector('#ocr-resume');
 // A genuine unrelated source edit must not be silently overwritten by recovery.
 const unrelated=await page.evaluate(async()=>{const doc=(await api('/api/library/import',{name:'changed.txt',content:btoa('user changed this file')})).document;current.sources[1].fileId=doc.id;await api('/api/save',{project:current});return doc.id});
 await page.click('#ocr-resume');await page.waitForFunction(()=>!ocrBusy&&document.querySelector('#toast').textContent.includes('تغير ربط المصدر'),{timeout:90000});
 if(await page.evaluate(id=>current.sources[1].fileId!==id,unrelated))throw Error('recovery overwrote unrelated source edit');
 await page.evaluate(async id=>{current.sources[1].fileId=id;await api('/api/save',{project:current})},staged.file);
 await page.waitForSelector('#ocr-resume');await page.click('#ocr-resume');
 await page.waitForFunction(()=>!ocrBusy&&current.sources[1]?.notes.includes('الصفحات المعالجة: 1, 2, 3'),{timeout:90000});
 if(await page.evaluate(id=>current.sources.length!==2||current.sources[1].id!==id||current.sources[1].notes.includes('نتيجة جزئية'),partialId))throw Error('resume duplicated or failed to complete source');
 await page.waitForFunction(()=>document.querySelector('#ocr-recovery')?.textContent.includes('لا توجد مهمة'));
 // Reload abruptly while a third task is on page 2; page 1 and original must survive.
 await (await page.$('#ocr-batch-file')).uploadFile(pdf);await page.select('#ocr-batch-language','eng');await page.$eval('#ocr-batch-last',e=>e.value='3');await page.click('#ocr-batch-run');
 await page.waitForFunction(()=>document.querySelector('#ocr-batch-progress')?.textContent.includes('صفحة PDF 2'),{timeout:90000});
 await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${savedProject}"]`);await page.click(`[data-project="${savedProject}"]`);await page.click('[data-tab="sources"]');await page.waitForSelector('#ocr-resume');
 const checkpoint=await page.evaluate(async()=>SanadOcrJournal.get(current.id));if(checkpoint.job.next!==2||checkpoint.pages.length!==1||checkpoint.job.originalFileId!==hash)throw Error('crash checkpoint wrong');
 const rejected=await page.evaluate(async()=>{const saved=await SanadOcrJournal.get(current.id);saved.job.totalBytes++;try{validateOcrRecovery(saved,current.id);return false}catch{return true}});if(!rejected)throw Error('corrupted checkpoint accepted');
 await page.evaluate(()=>{SanadOcrJournal.remove=async()=>{throw Error('SIMULATED LEGACY CRASH')}});await page.click('#ocr-resume');
 await page.waitForFunction(()=>!ocrBusy&&document.querySelector('#toast').textContent.includes('SIMULATED LEGACY CRASH'),{timeout:90000});
 await page.evaluate(async()=>{const saved=await SanadOcrJournal.get(current.id);delete saved.job.pendingFileId;await SanadOcrJournal.save(saved.job)});
 await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${savedProject}"]`);await page.click(`[data-project="${savedProject}"]`);await page.click('[data-tab="sources"]');await page.waitForSelector('#ocr-resume');await page.click('#ocr-resume');await page.waitForFunction(async()=>!ocrBusy&&!(await SanadOcrJournal.get(current.id)),{timeout:90000});
 const recovered=await page.evaluate(()=>current.sources[2]);if(!recovered.notes.includes('الصفحات المعالجة: 1, 2, 3')||recovered.originalFileId!==hash)throw Error('crash recovery not complete');
 const backup=await page.evaluate(async()=>createFullBackup());if(!backup.files.some(f=>f.id===hash)||!backup.files.some(f=>f.id===recovered.fileId))throw Error('backup missing OCR original or text');

 // Simulate repeated engine failures after one real recognized page: keep page 1 and record failures.
 await page.evaluate(async()=>{await loadOcr();const original=Tesseract.createWorker;window.originalOcrWorker=original;Tesseract.createWorker=async(...args)=>{const worker=await original(...args),recognize=worker.recognize.bind(worker);let calls=0;worker.recognize=async(...input)=>{if(++calls>1)throw Error('simulated engine failure');return recognize(...input)};return worker}});
 await (await page.$('#ocr-batch-file')).uploadFile(pdf);await page.select('#ocr-batch-language','eng');await page.$eval('#ocr-batch-last',e=>e.value='12');await page.click('#ocr-batch-run');
 await page.waitForSelector('[data-local-search="3"]',{timeout:90000});const failed=await page.evaluate(()=>current.sources[3]);if(!failed.notes.includes('صفحات تعذر فحصها: 2, 3, 4')||!failed.notes.includes('فشل ثلاث صفحات')||!failed.notes.includes('الصفحات المعالجة: 1'))throw Error('failed pages not recorded: '+failed.notes);
 // Discard the failed job, then simulate a storage failure while checkpointing page 2.
 await page.waitForSelector('#ocr-discard');await page.click('#ocr-discard');await page.waitForFunction(()=>document.querySelector('#ocr-recovery')?.textContent.includes('لا توجد مهمة'));
 await page.evaluate(()=>{Tesseract.createWorker=window.originalOcrWorker;window.savedJournalSave=SanadOcrJournal.save;SanadOcrJournal.save=async(job,p)=>{if(p?.number===2)throw Error('SIMULATED STORAGE FAILURE');return window.savedJournalSave(job,p)}});
 await (await page.$('#ocr-batch-file')).uploadFile(pdf);await page.select('#ocr-batch-language','eng');await page.$eval('#ocr-batch-last',e=>e.value='3');await page.click('#ocr-batch-run');
 await page.waitForFunction(()=>!ocrBusy&&document.querySelector('#toast').textContent.includes('SIMULATED STORAGE FAILURE'),{timeout:90000});
 const safe=await page.evaluate(async()=>SanadOcrJournal.get(current.id));if(safe.job.next!==2||safe.pages.length!==1||await page.evaluate(()=>current.sources.length)!==4)throw Error('checkpoint storage failure corrupted progress or published a source');
 await page.evaluate(()=>SanadOcrJournal.save=window.savedJournalSave);await page.waitForSelector('#ocr-resume');await page.click('#ocr-resume');await page.waitForSelector('[data-local-search="4"]',{timeout:90000});
 const saved=await page.evaluate(async()=>createFullBackup());const restored=await page.evaluate(async value=>{await restoreBackup(value);const list=(await api('/api/projects')).projects;const copy=list.find(p=>p.id!==current.id&&p.sources.some(s=>s.originalFileId));const s=copy.sources.find(s=>s.originalFileId);return {id:s.originalFileId,original:(await api('/api/library/export',{id:s.originalFileId})).document}},saved);
 if(restored.id!==hash||crypto.createHash('sha256').update(Buffer.from(restored.original.content,'base64')).digest('hex')!==hash)throw Error('restored OCR original does not match');

 await page.click('#save');await page.waitForFunction(()=>!dirty&&!saveInFlight);const id=await page.evaluate(()=>current.id);await page.reload({waitUntil:'load'});await page.waitForSelector(`[data-project="${id}"]`);await page.click(`[data-project="${id}"]`);await page.click('[data-tab="sources"]');await page.type('[data-local-query="0"]','archives');await page.click('[data-local-search="0"]');await page.waitForFunction(()=>document.querySelector('[data-match="0"]')?.parentElement?.textContent.includes('PDF 2'));
 for(const width of [320,390,1440]){await page.setViewport({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(external.length||errors.length)throw Error('external: '+external+' errors: '+errors);console.log('PASS: real offline twelve-page PDF OCR, consent, original backup, lock, partial resume, abrupt reload, publication crash, legacy recovery, failed pages and hash');
 }finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
