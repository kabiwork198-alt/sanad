'use strict';
const assert=require('node:assert/strict');require('../web/hadith-lookup.js');const H=globalThis.SanadHadith;
const envelope=(item,book='ara-bukhari',n='1')=>{const b=Buffer.from(JSON.stringify({hadiths:[item]}));return {type:'file',path:`editions/${book}/${n}.min.json`,size:b.length,encoding:'base64',content:b.toString('base64')}};
const item={hadithnumber:1,arabicnumber:1,text:'نص تجريبي فقط',grades:[{name:'باحث تجريبي',grade:'حكم منقول'}],reference:{book:0,hadith:1}};
(async()=>{
 assert.equal(H.number(' ١٢۳ '),'123');for(const n of ['','0','01','1.1','1/../../x','1000000','-1'])assert.throws(()=>H.number(n));
 for(const book of ['../../bad','ara-bukhari/other','ara-bukhari?'])assert.throws(()=>H.pathFor(book,'1'));
 const valid=envelope(item),parsed=H.parse(valid,'ara-bukhari','١');assert.equal(parsed.text,item.text);assert.equal(parsed.referenceBook,'0');assert.equal(parsed.grades[0].grade,'حكم منقول');assert.ok(parsed.warning.includes('لا من الدرر'));
 for(const env of [{...valid,path:'elsewhere'},{...valid,size:valid.size+1},{...valid,encoding:'utf8'},envelope({...item,hadithnumber:2}),envelope({...item,text:''}),envelope({...item,grades:[{name:'x',grade:{}}]})])assert.throws(()=>H.parse(env,'ara-bukhari','1'));
 const old=globalThis.fetch;let requests=[];globalThis.fetch=async(url,opts)=>{requests.push([url,opts]);return new Response(JSON.stringify(valid),{status:200})};
 assert.equal((await H.lookup('ara-bukhari','١')).text,item.text);assert.match(requests[0][0],new RegExp(H.REV));assert.match(requests[0][0],/^https:\/\/api\.github\.com\/repos\/fawazahmed0\/hadith-api\/contents\//);assert.equal(requests[0][1].credentials,'omit');assert.equal(requests[0][1].redirect,'error');
 await assert.rejects(H.lookup('../attack','1'));await assert.rejects(H.lookup('ara-bukhari','0'));assert.equal(requests.length,1);
 globalThis.fetch=async()=>new Response('',{status:404});await assert.rejects(H.lookup('ara-bukhari','1'),/لا يوجد سجل/);
 globalThis.fetch=async()=>new Response('',{status:429});await assert.rejects(H.lookup('ara-bukhari','1'),/حد GitHub/);
 globalThis.fetch=async()=>new Response('x'.repeat(128*1024+1),{status:200});await assert.rejects(H.lookup('ara-bukhari','1'),/كبيرة/);
 globalThis.fetch=old;console.log('PASS: bounded pinned one-record lookup, safe IDs, original attributed grades, blank records and HTTP errors');
})().catch(e=>{console.error(e);process.exitCode=1});
