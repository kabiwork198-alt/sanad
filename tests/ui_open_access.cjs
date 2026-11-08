const puppeteer=require('puppeteer-core');
(async()=>{let b;try{
 b=await puppeteer.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const p=await b.newPage(),errors=[],dialogs=[];let accept=true,calls=[];
 p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>{dialogs.push(d.message());return accept?d.accept(d.type()==='prompt'?'تجربة':undefined):d.dismiss()});
 const work={id:'https://openalex.org/W2741809807',doi:'https://doi.org/10.7717/peerj.4375',title:'Article <script>bad()</script>',locations:[{is_oa:true,landing_page_url:'https://repository.example/item',pdf_url:'https://repository.example/item.pdf',source:{display_name:'Repository'},version:'acceptedVersion',license:'cc-by'},{is_oa:false,landing_page_url:'https://paywall.example/item'}]};
 await p.goto(process.env.SANAD_TEST_ORIGIN,{waitUntil:'load'});await p.click('#empty-new');await p.click('[data-tab="sources"]');
 await p.evaluate(work=>{current.sources.push({id:'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',title:'Original',url:'https://doi.org/10.7717/peerj.4375',author:'',notes:'',access:''},{id:'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',title:'QDL',url:'https://www.qdl.qa/en/archive/81055/vdc_100023807156.0x000001',author:'',notes:'',access:''});render();window.savedApi=api;window.oaCalls=[];api=async(path,data)=>{if(path==='/api/openalex/locations'){oaCalls.push(data);return window.SanadOpenAccess.map(data.identifier,work)}return savedApi(path,data)}},work);
 if(await p.$eval('[data-oa-identifier="0"]',e=>e.value)!=='10.7717/peerj.4375')throw Error('DOI not prefilled');
 const manifest=await p.$eval('a[href*="/iiif/81055/"]',e=>e.href);if(manifest!=='https://www.qdl.qa/en/iiif/81055/vdc_100023807156.0x000001/manifest')throw Error('bad IIIF URL');
 accept=false;await p.click('[data-oa-find="0"]');if(await p.evaluate(()=>oaCalls.length))throw Error('request sent without consent');accept=true;
 await p.click('[data-oa-find="0"]');await p.waitForSelector('[data-oa-add="0"]');
 if(await p.evaluate(()=>oaCalls.length)!==1)throw Error('wrong number of searches');
 if(!dialogs.some(x=>x.includes('OpenAlex')&&x.includes('لن يُحمّل')))throw Error('consent missing');
 if(await p.$('script[src="bad()"]'))throw Error('unescaped title');
 const text=await p.$eval('#workspace',e=>e.innerText);if(!text.includes('acceptedVersion')||!text.includes('لم يُحمّل البرنامج نصًا')||text.includes('paywall.example'))throw Error('wrong display');
 await p.click('[data-oa-add="0"]');const copy=await p.evaluate(()=>current.sources[2]);if(copy.url!=='https://repository.example/item'||!copy.notes.includes('acceptedVersion')||!copy.notes.includes('OpenAlex')||copy.fileId)throw Error('wrong added source');
 await p.click('#save');await p.waitForFunction(()=>!dirty);const id=await p.evaluate(()=>current.id);await p.reload({waitUntil:'load'});await p.waitForSelector(`[data-project="${id}"]`);await p.click(`[data-project="${id}"]`);await p.click('[data-tab="sources"]');if(!(await p.evaluate(()=>current.sources.some(x=>x.url==='https://repository.example/item'&&x.notes.includes('acceptedVersion')))))throw Error('copy not persisted');
 for(const width of [320,390,1440]){await p.setViewport({width,height:844});if(await p.evaluate(()=>document.documentElement.scrollWidth-innerWidth)>1)throw Error('overflow '+width)}
 if(errors.length)throw Error(errors.join('; '));console.log('PASS: open-copy consent, copy provenance, no text, persistence and QDL manifest');
 }finally{if(b)await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
