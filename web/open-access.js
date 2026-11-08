/* One OpenAlex work, on demand: report links, do not request or download the copies. */
'use strict';
(function(root){
 const warning='روابط أبلغ عنها OpenAlex ولم يتحقق سَنَد من إتاحتها أو تطابق النسخة أو الترخيص. قد تكون مسودة أو نسخة مقبولة؛ راجع الناشر والمستودع والطبعة والحقوق قبل الاعتماد أو النشر. لم يُحمّل البرنامج نصًا. عدم وجود رابط لا يثبت غياب نسخة متاحة.';
 function identifier(input){
  if(typeof input!=='string')throw Error('أدخل DOI أو معرّف عمل OpenAlex');let value=input.trim();
  if(/^[Ww][0-9]{1,15}$/.test(value))return {value:value.toUpperCase(),kind:'work'};
  value=value.replace(/^https:\/\/(?:dx\.)?doi\.org\//i,'').replace(/^doi:\s*/i,'');
  if(!/^10\.[0-9]{4,9}\/[A-Za-z0-9._;()/:+\-]{1,200}$/i.test(value)||value.split('/').some(x=>x==='.'||x==='..'))throw Error('معرّف غير صالح أو غير مدعوم؛ أدخل DOI واضحًا أو معرّف W من OpenAlex');
  return {value,kind:'doi'};
 }
 function safeLink(value){
  if(typeof value!=='string'||value.length>2000||!/^https:\/\/[A-Za-z0-9.-]+(?:[/?#]|$)/.test(value)||/[\x00-\x20\x7f\\]/.test(value))return '';
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname&&!u.username&&!u.password&&!u.port?value:''}catch{return ''}
 }
 function map(input,data){
  const {value,kind}=identifier(input);
  if(!data||typeof data!=='object'||typeof data.id!=='string'||!/^https:\/\/openalex\.org\/W[0-9]{1,15}$/.test(data.id))throw Error('استجابة OpenAlex غير صالحة');
  if(kind==='work'&&data.id.split('/').at(-1)!==value)throw Error('معرّف العمل في الاستجابة لا يطابق الطلب؛ افتح السجل للتحقق');
  if(kind==='doi'&&String(data.doi||'').toLowerCase()!==('https://doi.org/'+value).toLowerCase())throw Error('DOI في الاستجابة لا يطابق الطلب؛ افتح السجل للتحقق');
  if(!Array.isArray(data.locations))throw Error('بيانات مواقع OpenAlex غير متاحة');
  const copies=[],seen=new Set();
  for(const item of data.locations.slice(0,100)){
   if(!item||typeof item!=='object'||item.is_oa!==true)continue;
   let landing=safeLink(item.landing_page_url),pdf=safeLink(item.pdf_url);if(seen.has(landing))landing='';if(seen.has(pdf)||pdf===landing)pdf='';if(!landing&&!pdf)continue;
   if(landing)seen.add(landing);if(pdf)seen.add(pdf);
   copies.push({landing_url:landing,pdf_url:pdf,source:String(item.source?.display_name||'غير معروف').slice(0,300),version:String(item.version||'غير معروفة').slice(0,100),license:String(item.license||'غير معروفة').slice(0,100)});
   if(copies.length>=20)break;
  }
  return {identifier:value,work_url:data.id,doi:String(data.doi||'').slice(0,500),title:String(data.title||'بلا عنوان').slice(0,300),copies,truncated:data.locations.length>100||copies.length>=20,warning};
 }
 async function search(input){
  const {value,kind}=identifier(input),key=kind==='work'?value:'doi:'+value.split('/').map(encodeURIComponent).join('/');
  const url='https://api.openalex.org/works/'+key+'?select=id,doi,title,open_access,locations';
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);let size=0,chunks=[];
  try{
   const r=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error'});if(!r.ok)throw Error('تعذر الوصول إلى OpenAlex (HTTP '+r.status+')');
   if(Number(r.headers.get('Content-Length')||0)>2000000)throw Error('استجابة OpenAlex أكبر من الحد الآمن');
   if(r.body?.getReader){const reader=r.body.getReader();try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2000000){await reader.cancel();throw Error('استجابة OpenAlex أكبر من الحد الآمن')}chunks.push(part.value)}}finally{reader.releaseLock()}}
   else{const part=new Uint8Array(await r.arrayBuffer());size=part.length;if(size>2000000)throw Error('استجابة OpenAlex أكبر من الحد الآمن');chunks=[part]}
   const bytes=new Uint8Array(size);let pos=0;for(const part of chunks){bytes.set(part,pos);pos+=part.length}return map(input,JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  }catch(e){if(e?.name==='AbortError')throw Error('انتهت مهلة الاتصال بـ OpenAlex');if(e instanceof TypeError)throw Error('تعذر الاتصال بـ OpenAlex أو حظر المتصفح الاستجابة');throw e}finally{clearTimeout(timer)}
 }
 const api={identifier,safeLink,map,search};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadOpenAccess=api;
})(globalThis);
