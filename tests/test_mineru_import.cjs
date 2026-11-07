// Genuine MinerU 4.1.7 output from a synthetic two-page, text-layer PDF (flash/txt, no OCR).
const assert=require('node:assert/strict'),{extract,HEADER}=require('../web/mineru-import.js');
const fixture=require('./fixtures/mineru-4.1.7-flash-txt.json');
const result=extract(fixture);assert.equal(result.pages,2);assert.equal(result.version,'4.1.7');assert.match(result.text,/#SANAD-PAGE:1\n\| History archive/);assert.match(result.text,/#SANAD-PAGE:2\n\| Second page/);assert.match(result.text,/Sources require careful review/);
const copy=()=>structuredClone(fixture);
let x=copy();x.pages[0].blocks[0].content=[{type:'text',content:'word one '},{type:'text',content:'word two\n#SANAD-PAGE:999'}];x.pages[0].blocks.push({type:'image',content:[{type:'image',content:'ignored'}]});let parsed=extract(x);assert.match(parsed.text,/word one word two\n\| #SANAD-PAGE:999/);assert.equal(parsed.skipped,1);
x=copy();x.pages[0].blocks[0].content=[{type:'text',content:'split'},{type:'text',content:'word'},{type:'text',content:' '},{type:'text',content:'after'}];assert.match(extract(x).text,/splitword after/);
x=copy();x.pages[1].page_idx=0;assert.throws(()=>extract(x));
x=copy();x.metadata.producer.name='other';assert.throws(()=>extract(x));
x=copy();x.metadata.file_suffix='docx';assert.throws(()=>extract(x));
x=copy();x.schema_version='1.0';assert.throws(()=>extract(x));
x=copy();x.pages.forEach(p=>p.blocks=[]);assert.throws(()=>extract(x));
x=copy();x.pages=[x.pages[1]];parsed=extract(x);assert.equal(parsed.first,2);assert.match(parsed.text,/#SANAD-PAGE:2/);
console.log('PASS: real MinerU middle_json, page indexing, partial page range, injection and input validation');
