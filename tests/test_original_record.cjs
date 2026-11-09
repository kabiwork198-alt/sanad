'use strict';
const assert=require('node:assert/strict'),mod=require('../web/original-record.js');
const url='https://commons.wikimedia.org/wiki/File:Kitab_al-Bulhan_--_zodiac.jpg';
const payload={query:{pages:[{pageid:127,ns:6,title:'File:Kitab al-Bulhan -- zodiac.jpg',imageinfo:[{descriptionurl:url,url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/zodiac.jpg',mime:'image/jpeg',sha1:'a'.repeat(40),timestamp:'2026-01-01T00:00:00Z',extmetadata:{ImageDescription:{value:'<b>folio</b> &amp; manuscript'},Artist:{value:'<a href="https://bad.test/">someone</a>'},Credit:{value:'Bodleian <script>alert(1)</script>'},DateTimeOriginal:{value:'14th century'},LicenseShortName:{value:'Public domain'},LicenseUrl:{value:'https://example.org/license'}}}]}]}};
(async()=>{
 assert.equal(mod.titleFromUrl(url),'File:Kitab al-Bulhan -- zodiac.jpg');
 for(const value of ['https://commons.wikimedia.org.evil.org/wiki/File:X','http://commons.wikimedia.org/wiki/File:X','https://commons.wikimedia.org/wiki/Special:X','https://commons.wikimedia.org/wiki/File:X?token=secret','https://user@commons.wikimedia.org/wiki/File:X','https://commons.wikimedia.org/wiki/File:%3Cimg%3E'])assert.equal(mod.titleFromUrl(value),'');
 let calls=0;const actual=await mod.fetchRecord(url,async(target,opts)=>{calls++;const u=new URL(target);assert.equal(u.hostname,'commons.wikimedia.org');assert.equal(u.searchParams.get('titles'),'File:Kitab al-Bulhan -- zodiac.jpg');assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');return new Response(JSON.stringify(payload))});assert.equal(calls,1);assert.equal(actual.pageUrl,url);assert.equal(actual.sha1,'a'.repeat(40));assert.equal(actual.description,'folio &amp; manuscript');assert.equal(actual.creator,'someone');assert.equal(actual.license,'Public domain');assert(!actual.source.includes('<script>'));
 const unsafe=JSON.parse(JSON.stringify(payload));unsafe.query.pages[0].imageinfo[0].url='https://evil.test/photo';unsafe.query.pages[0].imageinfo[0].extmetadata.LicenseUrl.value='javascript:alert(1)';const limited=mod.parse(unsafe,'File:x');assert.equal(limited.imageUrl,'');assert.equal(limited.licenseUrl,'');
 assert.throws(()=>mod.parse({query:{pages:[{ns:0}]}},'File:x'),/غير صالح/);assert.throws(()=>mod.parse({query:{pages:[]}},'File:x'),/لم يُعثر/);
 await assert.rejects(mod.fetchRecord('https://evil.test/',()=>{throw Error('should not fetch')}),/Commons/);
 await assert.rejects(mod.fetchRecord(url,async()=>new Response('x'.repeat(2000001))),/أكبر من الحد/);
 await assert.rejects(mod.fetchRecord(url,async()=>new Response('{}',{status:403})),/HTTP 403/);
 console.log('PASS: bounded selected Commons metadata, safe links, plain text and invalid or unavailable records');
})().catch(e=>{console.error(e);process.exitCode=1});
