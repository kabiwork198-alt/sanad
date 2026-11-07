/* Dependency-free checks for the static GitHub Pages adapter. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {TextEncoder, TextDecoder} = require('node:util');
const storage = new Map();
const context = {
  window: {}, localStorage: {
    getItem: k => storage.has(k) ? storage.get(k) : null,
    setItem: (k,v) => storage.set(k,v),
  },
  TextEncoder, TextDecoder, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
  crypto: require('node:crypto').webcrypto,
  fetch: async url => {
    if (url.startsWith('https://api.crossref.org/')) return {ok:true,json:async()=>({message:{items:[{title:['Paper'],DOI:'10.1/test',URL:'https://doi.org/10.1/test'}]}})};
    if (url.startsWith('https://openlibrary.org/')) return {ok:true,json:async()=>({docs:[{key:'/works/OL123W',title:'Book',author_name:['Author'],first_publish_year:2000}]})};
    if (url.startsWith('https://commons.wikimedia.org/')) throw Error('blocked');
    throw Error('unexpected network request');
  },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('web/browser-engine.js','utf8'),context);
(async () => {
  const api = context.window.browserEngine;
  assert.equal(context.window.SANAD_BROWSER,true);
  const project = {id:'a'.repeat(32),title:'Test',sources:[{id:'b'.repeat(32),title:'Book'}],claims:[],signals:[],scenes:[],events:[]};
  await api('/api/save',{project});
  assert.equal((await api('/api/projects')).projects.length,1);
  const proposal = await api('/api/suggestions',{project});
  assert.equal(proposal.suggestions.length,3);
  assert.match((await api('/api/analyze',{project})).warning,/لا يثبت/);
  await assert.rejects(()=>api('/api/draft',{project}));
  project.claims.push({text:'Claim for review',status:'مدعوم',sourceId:'b'.repeat(32),location:'p. 10'});
  assert.match((await api('/api/draft',{project})).text,/Claim for review/);
  const result=await api('/api/research',{query:'History'});
  assert.equal(result.results.length,2);
  assert.equal(result.providers[2].status,'تعذر الاتصال أو قراءة الاستجابة');
  await assert.rejects(()=>api('/api/lm',{prompt:'test'}));
  await api('/api/delete',{id:project.id});
  assert.equal((await api('/api/projects')).projects.length,0);
  console.log('PASS: browser local storage, proposals, research failures, drafts and optional model boundary');
})().catch(err => {console.error(err);process.exitCode=1});
