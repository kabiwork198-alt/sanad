'use strict';
const assert=require('node:assert/strict'),bod=require('../web/bodleian-manifest.js');
const id='5c9da286-6a02-406c-b990-0896b8ddbbb0',page='3e847457-c129-4c3f-b67b-138573afb1de';
const manifest=`https://iiif.bodleian.ox.ac.uk/iiif/manifest/${id}.json`,object=`https://digital.bodleian.ox.ac.uk/objects/${id}/`;
const canvas=`https://iiif.bodleian.ox.ac.uk/iiif/canvas/${page}.json`,service=`https://iiif.bodleian.ox.ac.uk/iiif/image/${page}`;
const doc={'@id':manifest,'@type':'sc:Manifest',label:'Bodleian MS Test',description:'<b>text</b>',attribution:'Photo © Bodleian. CC BY-NC 4.0',metadata:[{label:'Shelfmark',value:'MS. Test 1'},{label:'Holding Institution',value:'Bodleian'},{label:'Date Statement',value:'14th century'}],sequences:[{canvases:[{'@id':canvas,label:'fol. 1r',images:[{resource:{service:{'@id':service}}}]},{'@id':canvas,label:'missing',images:[]}]}]};
(async()=>{
 assert.equal(bod.identify(object).manifestUrl,manifest);assert.equal(bod.identify(manifest).id,id);
 for(const bad of ['http://iiif.bodleian.ox.ac.uk/iiif/manifest/'+id+'.json','https://iiif.bodleian.ox.ac.uk.evil.test/iiif/manifest/'+id+'.json',manifest+'?key=secret','https://iiif.bodleian.ox.ac.uk:444/iiif/manifest/'+id+'.json','https://digital.bodleian.ox.ac.uk/objects/../../etc'])assert.equal(bod.identify(bad),null);
 const data=await bod.fetchManifest(object,async(url,opts)=>{assert.equal(url,manifest);assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');return new Response(JSON.stringify(doc))});assert.equal(data.title,'Bodleian MS Test');assert.equal(data.total,2);assert.equal(data.pages[0].label,'fol. 1r');assert.equal(data.pages[0].imageUrl,service+'/full/1280,/0/default.jpg');assert.equal(data.pages[1].imageUrl,'');assert.equal(data.metadata[0].value,'MS. Test 1');assert(!data.description.includes('<b>'));
 const bad=JSON.parse(JSON.stringify(doc));bad.sequences[0].canvases[0].images[0].resource.service['@id']='https://evil.test/image';assert.equal(bod.parse(bad,manifest).pages[0].imageUrl,'');bad.sequences[0].canvases[0].images[0].resource.service['@id']='https://iiif.bodleian.ox.ac.uk/iiif/image/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';assert.equal(bod.parse(bad,manifest).pages[0].imageUrl,'');
 bad['@id']=manifest.replace(id,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');assert.throws(()=>bod.parse(bad,manifest),/لا يطابق/);
 await assert.rejects(bod.fetchManifest('https://example.test/',()=>{throw Error('must not call')}),/مدعومًا/);await assert.rejects(bod.fetchManifest(manifest,async()=>new Response('x'.repeat(8000001))),/أكبر/);await assert.rejects(bod.fetchManifest(manifest,async()=>new Response('{}',{status:403})),/403/);
 console.log('PASS: fixed Bodleian IIIF manifest, bounded pages, matching image services and safe errors (synthetic fixtures)');
})().catch(e=>{console.error(e);process.exitCode=1});
