/* Import the public MinerU 4.x middle JSON format, without running MinerU or uploading files. */
'use strict';
(function(root){
 const HEADER='#SANAD-MINERU-TEXT-1',MAX_BYTES=20*1024*1024,MAX_PAGES=5000,MAX_BLOCKS=100000;
 function extract(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||data.schema_version!=='2.0'||data.metadata?.producer?.name!=='mineru'||data.metadata?.file_suffix!=='pdf'||!Array.isArray(data.pages)||!data.pages.length||data.pages.length>MAX_PAGES)throw Error('صيغة الملف غير مدعومة: اختر middle_json لإصدار MinerU 4 مع صفحات PDF');
  const version=data.metadata?.producer?.version;if(typeof version!=='string'||!/^4\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$/.test(version))throw Error('إصدار MinerU في الملف غير مدعوم');
  const pages=[],seen=new Set();let blocks=0,skipped=0,textBlocks=0;
  for(const page of data.pages){
   if(!page||!Number.isSafeInteger(page.page_idx)||page.page_idx<0||page.page_idx>999999||seen.has(page.page_idx)||!Array.isArray(page.blocks))throw Error('أرقام صفحات MinerU أو بياناتها غير صالحة');
   seen.add(page.page_idx);const lines=[];
   for(const block of page.blocks){
    if(++blocks>MAX_BLOCKS)throw Error('نتيجة MinerU تحتوي عددًا كبيرًا من العناصر');
    if(!block||typeof block!=='object'||!Array.isArray(block.content)){skipped++;continue}
    const pieces=[];
    for(const part of block.content){
     if(part&&part.type==='text'&&typeof part.content==='string'){
      pieces.push(part.content.replace(/\r\n?/g,'\n'));
     }else if(part?.type!=='text')skipped++;
    }
    if(pieces.join('').trim()){
     // Prefix every line so source text cannot inject our page markers.
     lines.push(...pieces.join('').split('\n').map(line=>'| '+line));textBlocks++;
    }else if(!block.content.length)skipped++;
   }
   pages.push({number:page.page_idx+1,lines});
  }
  pages.sort((a,b)=>a.number-b.number);
  if(!textBlocks)throw Error('لم نجد نصًا قابلًا للاستيراد؛ قد تكون الصفحات صورًا بلا OCR');
  const text=HEADER+'\n'+pages.map(page=>`#SANAD-PAGE:${page.number}\n${page.lines.join('\n')}`).join('\n')+'\n';
  if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('النص الناتج أكبر من 20 ميبيبايت؛ قسّم الصفحات');
  const ext=data.extensions?.mineru||{};
  return {text,version,pages:pages.length,first:pages[0].number,last:pages[pages.length-1].number,textBlocks,skipped,tier:typeof ext.tier==='string'?ext.tier.slice(0,30):'',mode:typeof ext.parse_mode==='string'?ext.parse_mode.slice(0,30):''};
 }
 const api={HEADER,extract};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadMinerU=api;
})(globalThis);
