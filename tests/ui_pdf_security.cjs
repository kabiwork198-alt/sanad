// Exercise PDF text extraction, password rejection and a malformed xref through both adapters and the bundled EXE.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process'),puppeteer=require('puppeteer-core');
const origin=process.env.SANAD_TEST_ORIGIN;if(!origin)throw Error('SANAD_TEST_ORIGIN required');
(async()=>{let browser;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sanad-pdf-test-'));try{
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const printer=await browser.newPage();await printer.setContent('<p>A documented excerpt for review.</p>');
 const plain=path.join(dir,'plain.pdf'),encrypted=path.join(dir,'encrypted.pdf');await printer.pdf({path:plain});await printer.close();
 const py=spawnSync(process.env.SANAD_TEST_PYTHON||'python',['-c','from pypdf import PdfReader,PdfWriter; import sys; r=PdfReader(sys.argv[1]); w=PdfWriter(); [w.add_page(p) for p in r.pages]; w.encrypt("secret"); w.write(sys.argv[2])',plain,encrypted],{encoding:'utf8'});
 if(py.status!==0)throw Error('could not make encrypted PDF: '+py.stderr);
 const page=await browser.newPage();await page.goto(origin,{waitUntil:'load'});
 const result=await page.evaluate(async({plain,encrypted,broken})=>{
  const load=async(name,content)=>(await api('/api/library/import',{name,content})).document.id;
  const search=async(id)=>Promise.race([api('/api/library/search',{id,query:'documented'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('search timed out')),10000))]);
  const hit=await search(await load('plain.pdf',plain));
  const failures=[];for(const [name,content] of [['encrypted.pdf',encrypted],['broken.pdf',broken]]){
   try{await search(await load(name,content));failures.push('unexpected success')}
   catch(e){failures.push(e.message)}
  }
  return {hit,failures};
 },{plain:fs.readFileSync(plain).toString('base64'),encrypted:fs.readFileSync(encrypted).toString('base64'),broken:Buffer.from('%PDF-1.4\nstartxref\n28\n%%EOF\nxref\n1 0\naaa').toString('base64')});
 if(!result.hit.matches.some(m=>m.location.includes('PDF 1')&&m.text.includes('documented')))throw Error('PDF text extraction failed: '+JSON.stringify(result.hit));
 if(!/محمي|مشفر/.test(result.failures[0]))throw Error('encrypted file not rejected: '+result.failures[0]);
 if(!/تعذر قراءة PDF/.test(result.failures[1]))throw Error('malformed xref not safely rejected: '+result.failures[1]);
 console.log('PASS: PDF extraction, encrypted file rejection and malformed xref regression');
 }finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exitCode=1});
