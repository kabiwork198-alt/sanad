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
 await p._client().send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:tmp});await p.click('#export-all');
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('أُنشئت نسخة'),{timeout:15000});
 const file=path.join(tmp,'sanad-backup-with-files.json');if(!fs.existsSync(file))throw Error('no downloaded backup');
 const backup=JSON.parse(fs.readFileSync(file,'utf8'));if(backup.version!==2||backup.files.length!==1||backup.projects.length!==1)throw Error('missing exported projects or file');
 const tampered=JSON.parse(JSON.stringify(backup));tampered.files[0].content=Buffer.from('تعديل الخبيث').toString('base64');tampered.files[0].size=Buffer.byteLength('تعديل الخبيث');
 fs.writeFileSync(path.join(tmp,'tampered.json'),JSON.stringify(tampered));
 // Test the actual file picker and error reporting: no new project on integrity failure.
 await (await p.$('#import')).uploadFile(path.join(tmp,'tampered.json'));
 await p.waitForFunction(()=>document.querySelector('#toast').textContent.includes('بصمة'),{timeout:15000});
 if((await p.evaluate(async()=>(await api('/api/projects')).projects.length))!==1)throw Error('tampered backup inserted project');
 const win=await open(local),w=win.page;
 await (await w.$('#import')).uploadFile(file);
 await w.waitForFunction(()=>document.querySelector('#toast').textContent.includes('استُورد 1'),{timeout:15000});
 await w.click('[data-project]');await w.click('[data-tab="sources"]');await w.type('[data-local-query="0"]','بغداد');await w.click('[data-local-search="0"]');await w.waitForSelector('[data-match="0"]');
 if(!(await w.$eval('#content',e=>e.innerText)).includes('وثيقة بغداد الأصلية'))throw Error('browser -> Windows file search failed');
 // Reimport must produce a new copy, not overwrite the previous one.
 await (await w.$('#import')).uploadFile(file);await w.waitForFunction(async()=>(await api('/api/projects')).projects.length===2,{timeout:15000});
 const reverse=await w.evaluate(()=>createFullBackup());if(reverse.projects.length!==2||reverse.files.length!==1)throw Error('deduplication failed');
 fs.writeFileSync(path.join(tmp,'reverse.json'),JSON.stringify(reverse));
 const dest=await open(site),d=dest.page;
 await (await d.$('#import')).uploadFile(path.join(tmp,'reverse.json'));
 await d.waitForFunction(()=>document.querySelector('#toast').textContent.includes('استُورد 2'),{timeout:15000});
 await d.click('[data-project]');await d.click('[data-tab="sources"]');await d.type('[data-local-query="0"]','بغداد');await d.click('[data-local-search="0"]');await d.waitForSelector('[data-match="0"]');
 // Missing attachments must block export rather than silently creating an incomplete backup.
 const missing=await d.evaluate(async()=>{current.sources[0].fileId='f'.repeat(64);await api('/api/save',{project:current});try{await createFullBackup();return false}catch(e){return e.message.includes('مفقود')}});
 if(!missing)throw Error('missing attachment did not block export');
 // Legacy backups stay importable, but contain no files.
 const legacy={format:'sanad-backup',version:1,projects:[{id:'c'.repeat(32),title:'قديم',sources:[],claims:[]}]};
 const before=await d.evaluate(async()=>(await api('/api/projects')).projects.length);
 await d.evaluate(b=>restoreBackup(b),legacy);if(await d.evaluate(async()=>(await api('/api/projects')).projects.length)!==before+1)throw Error('legacy import failed');
 for(const x of [source,win,dest])if(x.errors.length)throw Error(x.errors.join('; '));
 console.log('PASS: full backup UI, integrity rejection, missing-file refusal, browser/Windows round trip, deduplication and legacy import');
 }finally{if(browser)await browser.close();fs.rmSync(tmp,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
