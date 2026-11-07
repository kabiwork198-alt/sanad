const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const text='نص تجريبي\nعبارة للمراجعة',raw=Buffer.from(text),sha=crypto.createHash('sha1').update(raw).digest('hex');
let meta,requests=[];
const reset=()=>{meta={metadata:{identifier:'sample',mediatype:'texts'},files:[{name:'sample_djvu.txt',size:String(raw.length),sha1:sha}]};requests=[]};reset();
const context={window:{},localStorage:{getItem(){return null},setItem(){}},TextEncoder,TextDecoder,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,crypto:crypto.webcrypto,
 fetch:async url=>{requests.push(url);let payload=url.includes('/metadata/')?Buffer.from(JSON.stringify(meta)):raw;return {ok:true,url,headers:{get:()=>null},arrayBuffer:async()=>Uint8Array.from(payload).buffer}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('web/browser-engine.js','utf8'),context);
(async()=>{const api=context.window.browserEngine;
 const result=await api('/api/internet-archive/read',{identifier:'sample'});assert.equal(result.text,text);assert.equal(result.sha1,sha);assert.match(result.file_url,/archive.org\/download\/sample/);assert.equal(requests.length,2);
 for(const bad of ['../a','.','https://bad']){reset();await assert.rejects(()=>api('/api/internet-archive/read',{identifier:bad}));assert.equal(requests.length,0)}
 for(const edit of [m=>m.metadata['access-restricted-item']='true',m=>m.metadata.lending_edition='book',m=>m.is_dark=true,m=>m.files[0].private='true',m=>m.files[0].name='../bad_djvu.txt',m=>m.files[0].size='999999999',m=>m.files[0].sha1='a'.repeat(40)]){reset();edit(meta);await assert.rejects(()=>api('/api/internet-archive/read',{identifier:'sample'}));}
 console.log('PASS: Internet Archive browser OCR bounded, verified, restricted records rejected');
})().catch(e=>{console.error(e);process.exitCode=1});
