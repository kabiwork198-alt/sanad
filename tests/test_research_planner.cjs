'use strict';
const assert=require('node:assert/strict');const {plan,execute,aggregate,brief}=require('../web/research-planner.js');
(async()=>{
 const arabic=plan('  ابن خلدون  ',false),english=plan('Battle of Baghdad',true);
 assert.equal(arabic.topic,'ابن خلدون');assert.equal(arabic.queries.length,12);assert.equal(arabic.jobs.length,50);assert.equal(english.jobs.length,51);assert.equal(arabic.language,'ar');assert.equal(english.language,'en');
 for(const key of ['timeline','geography','people','sources'])assert.ok(arabic.queries.some(q=>q.dimension===key));
 for(const key of ['early','rise','peak','end','places','politics','allies','rivals','mentors','manuscripts','studies'])assert.ok(arabic.queries.some(q=>q.id===key));
 assert.ok(english.queries.find(q=>q.id==='mentors').query.endsWith('mentors'));assert.ok(english.jobs.some(j=>j.provider==='ويكي مصدر الإنجليزية'&&j.query_id==='early'));
 const browserHeritage=plan('ابن خلدون',false,true),localHeritage=plan('ابن خلدون',true,true);
 assert.equal(browserHeritage.jobs.length,52);assert.equal(localHeritage.jobs.length,55);
 for(const p of ['فهرس OpenITI','تراث'])assert.equal(browserHeritage.jobs.filter(j=>j.provider===p&&j.query_id==='base').length,1);
 for(const p of ['الشاملة الرسمية (Windows)','أرشيف الإسكندرية (Windows)']){assert.ok(localHeritage.jobs.some(j=>j.provider===p));assert.ok(!browserHeritage.jobs.some(j=>j.provider===p))}
 assert.throws(()=>plan('x',false,true));assert.throws(()=>plan('a'.repeat(201),true,true));assert.doesNotThrow(()=>plan('a'.repeat(201),true,false));
 assert.throws(()=>plan('a'.repeat(241),false));assert.throws(()=>plan(' ',false));
 let active=0,max=0,groupActive=new Set(),calls=[];
 const mock=async j=>{assert.ok(!groupActive.has(j.group),'simultaneous same provider group');groupActive.add(j.group);active++;max=Math.max(max,active);calls.push(j);await new Promise(r=>setTimeout(r,4));active--;groupActive.delete(j.group);
  if(j.id==='base|Crossref')return {searched_at:'T',providers:[{provider:j.provider,status:'تعذر الاتصال أو قراءة الاستجابة',reason:'HTTP 429'}],results:[]};
  if(j.id==='early|Open Library')throw Error('failure');
  return {searched_at:'T',providers:[{provider:j.provider,status:'اكتمل',reason:''}],results:[{provider:j.provider,title:'Source '+j.query_id,url:'https://example.org/item#'+(j.dimension==='sources'?'sources':'one'),author:'A',detail:j.query,access:'record'}]};
 };
 const runs=await execute(arabic,mock,{pauseMs:0});assert.equal(runs.length,50);assert.ok(max<=4&&max>=2);assert.equal(calls.filter(j=>j.group==='crossref').length,1);
 assert.equal(runs.find(x=>x.id==='base|Crossref').reason,'HTTP 429');assert.equal(runs.filter(x=>x.group==='crossref'&&x.status==='لم تُنفذ').length,11);assert.equal(runs.find(x=>x.id==='early|Open Library').status,'تعذر الاتصال أو قراءة الاستجابة');
 const result=aggregate(arabic,runs,'START');assert.equal(result.providers[0].status,'تعذر الاتصال أو قراءة الاستجابة');assert.equal(result.results.length,2);assert.ok(result.results[0].appearances.length>3);assert.ok(result.results[1].url.endsWith('#sources'));assert.ok(result.results[0].appearances.some(a=>a.query.includes('الأماكن')));
 const txt=brief(result);assert.ok(txt.includes('لا تختلق'));assert.ok(txt.includes('البدايات'));assert.ok(txt.includes('لم تكتمل'));assert.ok(txt.length<=9000);
 let cancel=false,launched=0;const cancelled=await execute(arabic,async j=>{launched++;cancel=true;await new Promise(r=>setTimeout(r,5));return {providers:[{provider:j.provider,status:'اكتمل'}],results:[]}}, {pauseMs:0,shouldCancel:()=>cancel});assert.ok(launched<=4);assert.ok(cancelled.some(x=>x.status==='لم تُنفذ'));assert.equal(cancelled.length,50);
 // Empty URLs are never merged merely because the titles match.
 const small={topic:'x',queries:[],jobs:[{id:'one',query_id:'base',provider:'p',axis:'a',query:'x'},{id:'two',query_id:'base',provider:'p',axis:'a',query:'x'}]};const data=small.jobs.map(j=>({...j,status:'اكتمل',items:[{title:'Same',url:'',provider:'p'}]}));assert.equal(aggregate(small,data,'t').results.length,2);
 console.log('PASS: 12 query plan, bounded concurrency, host serialisation, 429, partial failures, exact-URL provenance, cancellation and brief');
})().catch(e=>{console.error(e);process.exitCode=1});
