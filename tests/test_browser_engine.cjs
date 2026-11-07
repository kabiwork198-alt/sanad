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
  DOMParser: class { parseFromString(text) { return {body:{textContent:text}}; } },
  fetch: async url => {
    if (url.startsWith('https://raw.githubusercontent.com/OpenITI/RELEASE/')) {
      const text='version_uri\tauthor_ar\tauthor_lat\ttitle_ar\ttitle_lat\tdate\tstatus\ted_info\tlocal_path\n0310Tabari.Tarikh.X-ara1\tالطبري\tTabari\tتاريخ الطبري\tTarikh\t0310\tpri\tطبعة\tdata/0310Tabari/0310Tabari.Tarikh/0310Tabari.Tarikh.X-ara1\n0310Tabari.Bad\tالطبري\tTabari\tbad\tBad\t0310\tpri\t\tdata/../evil/file\n';
      return {ok:true,headers:{get:()=>null},arrayBuffer:async()=>Uint8Array.from(Buffer.from(text)).buffer};
    }
    if (url.startsWith('https://api.crossref.org/')) return {ok:true,json:async()=>({message:{items:[{title:['Paper'],DOI:'10.1/test',URL:'https://doi.org/10.1/test'}]}})};
    if (url.startsWith('https://openlibrary.org/')) return {ok:true,json:async()=>({docs:[{key:'/works/OL123W',title:'Book',author_name:['Author'],first_publish_year:2000}]})};
    if (url.startsWith('https://commons.wikimedia.org/')) throw Error('blocked');
    if (url.startsWith('https://doaj.org/api/')) return {ok:true,json:async()=>({results:[{id:'a'.repeat(32),bibjson:{title:'DOAJ Study',year:'2020',journal:{title:'Journal'}}},{id:'../bad',bibjson:{}}]})};
    if (url.startsWith('https://api.openalex.org/')) return {ok:true,json:async()=>({results:[{id:'https://openalex.org/W123',title:'OpenAlex Study',publication_year:2024,open_access:{oa_status:'closed'}},{id:'https://openalex.org.evil/W123'}]})};
    if (url.startsWith('https://ar.wikisource.org/')) {
      if(new URL(url).searchParams.get('prop')==='revisions'){
        const data=JSON.stringify({query:{pages:[{pageid:43576,title:'صفحة',revisions:[{revid:42,timestamp:'2025-01-01T00:00:00Z',slots:{main:{content:'نص أصلي للمراجعة'}}}]}]}});
        return {ok:true,headers:{get:()=>null},arrayBuffer:async()=>Uint8Array.from(Buffer.from(data)).buffer};
      }
      return {ok:true,json:async()=>({query:{search:[{pageid:39899,title:'تاريخ الطبري'}]}})};
    }
    if (url.startsWith('https://www.loc.gov/')) return {ok:true,json:async()=>({results:[{title:'Map',url:'http://www.loc.gov/item/123/',date:'1900',original_format:['map']},{title:'Bad',url:'https://www.loc.gov.evil.test/'}]})};
    if (url.startsWith('https://archive.org/')) return {ok:true,json:async()=>({response:{docs:[{identifier:'good-item',title:'Book in archive',creator:['Author'],year:2000},{identifier:'../bad',title:'Bad'}]}})};
    if (url.startsWith('https://ar.wikipedia.org/')) {
      const q=new URL(url).searchParams;
      if(q.get('list')==='categorymembers')return {ok:true,json:async()=>({query:{categorymembers:[{pageid:1319,title:'الخوارزمي'}]}})};
      if(q.get('list')==='search')return {ok:true,json:async()=>({query:{search:[{pageid:1319,title:'الخوارزمي'}]}})};
      if(q.get('action')==='parse')return {ok:true,json:async()=>({parse:{text:'<ol><li id="cite&#95;note-1"><span>عنوان المرجع <b>صفحة ١٠</b></span></li></ol>'}})};
    }
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
  project.sources.push({id:'d'.repeat(32),title:'Second source'});
  project.claims.push({id:'c'.repeat(32),text:'Claim for review',status:'مدعوم',sourceId:'b'.repeat(32),location:'p. 10'});
  project.evidence=[{claimId:'c'.repeat(32),sourceId:'d'.repeat(32),stance:'يخالف',location:'p. 20',excerpt:'Other account'}];
  assert.match((await api('/api/draft',{project})).text,/Second source/);
  assert.match((await api('/api/draft',{project})).text,/يخالف/);
  assert.ok((await api('/api/analyze',{project})).issues.some(x=>x.includes('دليل مخالف')));
  await api('/api/save',{project});
  assert.equal((await api('/api/projects')).projects[0].evidence[0].stance,'يخالف');
  project.evidence[0].sourceId='e'.repeat(32);
  await assert.rejects(()=>api('/api/save',{project}));
  project.evidence[0].sourceId='d'.repeat(32);
  const topics=await api('/api/topics',{});
  assert.equal(topics.topics[0].title,'الخوارزمي');
  const result=await api('/api/research',{query:'History'});
  assert.equal(result.results.length,9);
  const found = name => result.results.find(x=>x.provider===name);
  assert.match(found('المكتبة الرقمية العالمية').url,/https:\/\/www.loc.gov\/item/);
  assert.match(found('المكتبة الرقمية العالمية').detail,/لا إلى الحدث/);
  assert.match(found('ويكي مصدر العربية').url,/ar.wikisource.org/);
  assert.match(found('Internet Archive').url,/archive.org\/details\/good-item/);
  assert.match(found('Internet Archive').access,/لا يضمن/);
  assert.match(found('إحالات ويكيبيديا العربية').url, /cite_note-1/);
  assert.match(found('إحالات ويكيبيديا العربية').access, /لم يُقرأ/);
  assert.match(found('DOAJ').url,/doaj.org\/article/);
  assert.match(found('OpenAlex').detail,/closed/);
  assert.equal(result.providers.find(x=>x.provider==='Wikimedia Commons').status,'تعذر الاتصال أو قراءة الاستجابة');
  const single=await api('/api/research',{query:'History',provider:'Open Library'});
  assert.equal(single.providers.length,1);assert.equal(single.results[0].provider,'Open Library');
  await assert.rejects(()=>api('/api/research',{query:'History',provider:'bad'}));
  const oi=await api('/api/openiti/search',{query:'تاريخ الطبري'});
  assert.equal(oi.total,1);assert.equal(oi.results.length,1);
  assert.match(oi.results[0].url,/github.com\/OpenITI\/RELEASE\/blob/);
  assert.match(oi.warning,/تقي.*الاستخدام التجاري/);
  await assert.rejects(()=>api('/api/openiti/search',{query:''}));
  const revision=await api('/api/wikisource/read',{page_id:'43576'});
  assert.equal(revision.text,'نص أصلي للمراجعة');
  assert.equal(revision.revision_url,'https://ar.wikisource.org/w/index.php?oldid=42');
  assert.match(revision.warning,/ليس رقم صفحة/);
  await assert.rejects(()=>api('/api/wikisource/read',{page_id:'https://evil.test'}));
  await assert.rejects(()=>api('/api/lm',{prompt:'test'}));
  await api('/api/delete',{id:project.id});
  assert.equal((await api('/api/projects')).projects.length,0);
  console.log('PASS: browser local storage, proposals, research failures, drafts and optional model boundary');
})().catch(err => {console.error(err);process.exitCode=1});
