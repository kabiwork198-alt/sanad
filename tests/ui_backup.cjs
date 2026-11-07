// Real browser storage <-> local Python backend, without network services or real user data.
const fs=require('node:fs'), path=require('node:path'), os=require('node:os'), puppeteer=require('puppeteer-core');
const root=path.resolve(__dirname,'..'), local=process.env.SANAD_TEST_ORIGIN;
if(!local) throw Error('SANAD_TEST_ORIGIN required');
const site='https://kabiwork198-alt.github.io/sanad/';
(async()=>{let browser;const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'sanad-backup-test-'));try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 async function open(url){
  const context=await browser.createBrowserContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept(d.type()==='prompt'?'مشروع الاختبار':undefined));
  await page.setRequestInterception(true);page.on('request',r=>{const u=new URL(r.url());if(u.origin===new URL(local).origin)return r.continue();if(u.hostname==='kabiwork198-alt.github.io'&&u.pathname.startsWith('/sanad/')){const rel=u.pathname==='/sanad/'?'index.html':u.pathname.slice('/sanad/'.length),file=path.resolve(root,rel);if(!file.startsWith(root+path.sep))return r.respond({status:403});try{const ext=path.extname(file);return r.respond({status:200,contentType:({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8'})[ext]||'application/octet-stream',body:fs.readFileSync(file)})}catch{return r.respond({status:404})}}return r.abort()});
  await page.goto(url,{waitUntil:'load'});await page.setViewport({width:390,height:844,isMobile:true});return {page,context,errors};
 }
 const source=await open(site),p=source.page;
 await p.click('#empty-new');
 await p.evaluate(async()=>{
  const doc=(await api('/api/library/import',{name:'source.txt',content:bytesToBase64(new TextEncoder().encode('سطر أول\nوثيقة بغداد الأصلية\n'))})).document;
  current.sources.push({id:uid(),title:'سجل بغداد',fileId:doc.id});current.claims.push({id:uid(),text:'خبر يحتاج مراجعة',status:'لم يُفحص'});setDirty();
 });
 await p.click('#save');await p.waitForFunction(()=>!dirty);
 await p._client().send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:tmp});
 // Exercise password UI, authenticated encryption, and the actual downloaded file.
 await p.click('#export-encrypted');await p.waitForSelector('#backup-password-dialog[open]');
 await p.type('#backup-password','عبارة تجريبية طويلة جدا');await p.type('#backup-password-confirm','عبارة مختلفة تماما');await p.click('#backup-password-form button[type=submit]');
 if(!(await p.$eval('#backup-password-error',x=>x.textContent)).includes('غير متطابقتين'))throw Error('password confirmation not enforced');
 await p.$eval('#backup-password-confirm',x=>x.value='');await p.type('#backup-password-confirm','عبارة تجريبية طويلة جدا');await p.click('#backup-password-form button[type=submit]');
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('أُنشئت نسخة مشفّرة'),{timeout:30000});
 const encryptedFile=path.join(tmp,'sanad-backup-encrypted.json');let envelope;
 for(let i=0;i<100;i++){try{envelope=JSON.parse(fs.readFileSync(encryptedFile,'utf8'));break}catch{await new Promise(resolve=>setTimeout(resolve,100))}}
 if(!envelope||envelope.format!=='sanad-encrypted-backup'||JSON.stringify(envelope).includes('بغداد'))throw Error('encrypted export missing or leaked content');
 const validation=await p.evaluate(async envelope=>{
  let rejected=0;for(const changes of [{iterations:999999999},{cipher:'AES-CBC'},{salt:'not-base64!'},{iv:'AA=='}]){try{await decryptBackup({...envelope,...changes},'عبارة تجريبية طويلة جدا')}catch{rejected++}}
  const sample={text:'ع'.repeat(512*1024)},copy=await decryptBackup(await encryptBackup(sample,'عبارة تجريبية طويلة جدا'),'عبارة تجريبية طويلة جدا');return rejected===4&&copy.text===sample.text;
 },envelope);if(!validation)throw Error('envelope validation or medium-size round trip failed');
 await p.click('#export-all');
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('أُنشئت نسخة'),{timeout:15000});
 const file=path.join(tmp,'sanad-backup-with-files.json');let backup;
 // The UI can report success before Chromium finishes writing the download.
 for(let i=0;i<100;i++){try{backup=JSON.parse(fs.readFileSync(file,'utf8'));break}catch{await new Promise(resolve=>setTimeout(resolve,100))}}
 if(!backup)throw Error('download did not finish within 10 seconds');
 if(backup.version!==2||backup.files.length!==1||backup.projects.length!==1)throw Error('missing exported projects or file');
 const tampered=JSON.parse(JSON.stringify(backup));tampered.files[0].content=Buffer.from('تعديل الخبيث').toString('base64');tampered.files[0].size=Buffer.byteLength('تعديل الخبيث');
 fs.writeFileSync(path.join(tmp,'tampered.json'),JSON.stringify(tampered));
 // Test the actual file picker and error reporting: no new project on integrity failure.
 await (await p.$('#import')).uploadFile(path.join(tmp,'tampered.json'));
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('بصمة'),{timeout:15000});
 if((await p.evaluate(async()=>(await api('/api/projects')).projects.length))!==1)throw Error('tampered backup inserted project');
 const win=await open(local),w=win.page;
 // A wrong password and tampered ciphertext must not import projects.
 async function encryptedImport(file,password){await w.$eval('#toast',e=>e.textContent='');await (await w.$('#import')).uploadFile(file);await w.waitForSelector('#backup-password-dialog[open]');await w.type('#backup-password',password);await w.click('#backup-password-form button[type=submit]')}
 await encryptedImport(encryptedFile,'كلمة مرور خاطئة');await w.waitForFunction(()=>document.querySelector('#toast').textContent.includes('كلمة المرور غير صحيحة'),{timeout:30000});
 if((await w.evaluate(async()=>(await api('/api/projects')).projects.length))!==0)throw Error('wrong password imported project');
 const corrupt={...envelope,ciphertext:(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1)};const corruptFile=path.join(tmp,'corrupt-encrypted.json');fs.writeFileSync(corruptFile,JSON.stringify(corrupt));
 await encryptedImport(corruptFile,'عبارة تجريبية طويلة جدا');await w.waitForFunction(()=>document.querySelector('#toast').textContent.includes('كلمة المرور غير صحيحة'),{timeout:30000});
 if((await w.evaluate(async()=>(await api('/api/projects')).projects.length))!==0)throw Error('corrupt encrypted backup imported project');
 await encryptedImport(encryptedFile,'عبارة تجريبية طويلة جدا');await w.waitForFunction(async()=>(await api('/api/projects')).projects.length===1,{timeout:30000});
 await w.waitForSelector('[data-project]');await w.click('[data-project]');await w.click('[data-tab="sources"]');await w.type('[data-local-query="0"]','بغداد');await w.click('[data-local-search="0"]');await w.waitForSelector('[data-match="0"]');
 if(!(await w.$eval('#content',e=>e.innerText)).includes('وثيقة بغداد الأصلية'))throw Error('encrypted browser -> Windows restore failed');
 // Cancel must not change projects, and the same input can be used again.
 await (await w.$('#import')).uploadFile(encryptedFile);await w.waitForSelector('#backup-password-dialog[open]');await w.click('#backup-password-cancel');
 if((await w.evaluate(async()=>(await api('/api/projects')).projects.length))!==1)throw Error('cancel imported project');
 await (await w.$('#import')).uploadFile(file);
 await w.waitForFunction(async()=>(await api('/api/projects')).projects.length===2,{timeout:15000});
 await w.waitForSelector('[data-project]');await w.click('[data-project]');await w.click('[data-tab="sources"]');await w.type('[data-local-query="0"]','بغداد');await w.click('[data-local-search="0"]');await w.waitForSelector('[data-match="0"]');
 if(!(await w.$eval('#content',e=>e.innerText)).includes('وثيقة بغداد الأصلية'))throw Error('browser -> Windows file search failed');
 // Reimport must produce a new copy, not overwrite the previous one.
 await (await w.$('#import')).uploadFile(file);await w.waitForFunction(async()=>(await api('/api/projects')).projects.length===3,{timeout:15000});
 const reverse=await w.evaluate(()=>createFullBackup());if(reverse.projects.length!==3||reverse.files.length!==1)throw Error('deduplication failed');
 fs.writeFileSync(path.join(tmp,'reverse.json'),JSON.stringify(reverse));
 const dest=await open(site),d=dest.page;
 // Export an encrypted archive from the local backend and import it into the browser.
 const returnDir=path.join(tmp,'return');fs.mkdirSync(returnDir);await w._client().send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:returnDir});
 await w.click('#export-encrypted');await w.waitForSelector('#backup-password-dialog[open]');await w.type('#backup-password','عبارة أخرى طويلة جدا');await w.type('#backup-password-confirm','عبارة أخرى طويلة جدا');await w.click('#backup-password-form button[type=submit]');
 await w.waitForFunction(()=>document.querySelector('#toast').textContent.includes('أُنشئت نسخة مشفّرة'),{timeout:30000});
 const returnFile=path.join(returnDir,'sanad-backup-encrypted.json');for(let i=0;i<100&&!fs.existsSync(returnFile);i++)await new Promise(resolve=>setTimeout(resolve,100));
 await (await d.$('#import')).uploadFile(returnFile);await d.waitForSelector('#backup-password-dialog[open]');await d.type('#backup-password','عبارة أخرى طويلة جدا');await d.click('#backup-password-form button[type=submit]');
 await d.waitForFunction(async()=>(await api('/api/projects')).projects.length===3,{timeout:30000});
 await (await d.$('#import')).uploadFile(path.join(tmp,'reverse.json'));
 await d.waitForFunction(async()=>(await api('/api/projects')).projects.length===6,{timeout:15000});
 await d.waitForSelector('[data-project]');await d.click('[data-project]');await d.click('[data-tab="sources"]');await d.type('[data-local-query="0"]','بغداد');await d.click('[data-local-search="0"]');await d.waitForSelector('[data-match="0"]');
 // Missing attachments must block export rather than silently creating an incomplete backup.
 const missing=await d.evaluate(async()=>{current.sources[0].fileId='f'.repeat(64);await api('/api/save',{project:current});try{await createFullBackup();return false}catch(e){return e.message.includes('مفقود')}});
 if(!missing)throw Error('missing attachment did not block export');
 // Legacy backups stay importable, but contain no files.
 const legacy={format:'sanad-backup',version:1,projects:[{id:'c'.repeat(32),title:'قديم',sources:[],claims:[]}]};
 const before=await d.evaluate(async()=>(await api('/api/projects')).projects.length);
 await d.evaluate(b=>restoreBackup(b),legacy);if(await d.evaluate(async()=>(await api('/api/projects')).projects.length)!==before+1)throw Error('legacy import failed');
 for(const x of [source,win,dest])if(x.errors.length)throw Error(x.errors.join('; '));
 console.log('PASS: encrypted backup UI, wrong password and tampering rejection, encrypted cross-mode restore both ways, full backup UI, integrity rejection, missing-file refusal, browser/Windows round trip, deduplication and legacy import');
 }finally{if(browser)await browser.close();fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
