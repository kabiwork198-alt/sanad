/* One-record, opt-in lookup against a pinned public GitHub dataset revision.
   This is not Dorar, an authenticity judge, or a full-text search. */
'use strict';
(function(root){
 const REV='df57907be35291c91ad6a6691180e22ca9920784',MAX_RESPONSE=128*1024;
 const BOOKS=Object.freeze({'ara-bukhari':'صحيح البخاري','ara-muslim':'صحيح مسلم','ara-abudawud':'سنن أبي داود','ara-tirmidhi':'جامع الترمذي','ara-nasai':'سنن النسائي','ara-ibnmajah':'سنن ابن ماجه','ara-malik':'موطأ مالك'});
 const WARNING='بيانات من مشروع Hadith API غير الرسمي، لا من الدرر السنية. رقم السجل خاص بهذه النسخة وقد يختلف عن الطبعات. النقول والأحكام المنسوبة ليست تحققًا من سَنَد؛ راجع الأصل والتخريج واختلاف الروايات والحقوق.';
 function number(value){
  if(typeof value!=='string')throw Error('أدخل رقمًا صحيحًا للسجل');
  const ascii=value.trim().replace(/[٠-٩۰-۹]/g,c=>String(c.charCodeAt(0)-(c>='۰'?0x6f0:0x660)));
  if(!/^[1-9][0-9]{0,5}$/.test(ascii))throw Error('أدخل رقم سجل صحيحًا من 1 إلى 999999');return ascii;
 }
 function pathFor(book,n){if(!Object.hasOwn(BOOKS,book))throw Error('الكتاب غير مدعوم');return `editions/${book}/${number(n)}.min.json`}
 function sourceUrl(book,n){return `https://github.com/fawazahmed0/hadith-api/blob/${REV}/${pathFor(book,n)}`}
 function scalar(value){if(typeof value==='string'&&value.length<=50)return value;if(typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=99999999)return String(value);return ''}
 function parse(envelope,book,n){
  const path=pathFor(book,n),num=number(n);
  if(!envelope||envelope.type!=='file'||envelope.path!==path||envelope.encoding!=='base64'||!Number.isInteger(envelope.size)||envelope.size<1||envelope.size>65536||typeof envelope.content!=='string'||envelope.content.length>100000)throw Error('استجابة مصدر الحديث غير صالحة');
  let raw;try{raw=atob(envelope.content.replace(/[\r\n]/g,''))}catch{throw Error('ترميز مصدر الحديث غير صالح')}
  if(raw.length!==envelope.size)throw Error('حجم سجل الحديث لا يطابق الاستجابة');
  let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(raw,c=>c.charCodeAt(0))))}catch{throw Error('تعذر قراءة سجل الحديث')}
  if(!data||!Array.isArray(data.hadiths)||data.hadiths.length!==1)throw Error('صيغة سجل الحديث غير مدعومة');
  const item=data.hadiths[0];if(!item||scalar(item.hadithnumber)!==num||typeof item.text!=='string'||item.text.length>30000)throw Error('السجل المستلم لا يطابق الطلب أو يتجاوز الحجم المسموح');
  if(!item.text.trim())throw Error('السجل موجود لكن النسخة لا تتضمن نصًا لهذا الرقم؛ لا يعني ذلك غياب الحديث');
  if(item.grades!==undefined&&(!Array.isArray(item.grades)||item.grades.length>20||item.grades.some(g=>!g||typeof g.name!=='string'||typeof g.grade!=='string'||g.name.length>500||g.grade.length>500)))throw Error('صيغة الأحكام المنقولة غير مدعومة');
  const reference=item.reference&&typeof item.reference==='object'?item.reference:{};
  return {book,bookTitle:BOOKS[book],number:num,arabicNumber:scalar(item.arabicnumber),referenceBook:scalar(reference.book),referenceHadith:scalar(reference.hadith),text:item.text,grades:(item.grades||[]).map(g=>({name:g.name,grade:g.grade})),url:sourceUrl(book,num),revision:REV,warning:WARNING};
 }
 async function lookup(book,n){
  const path=pathFor(book,n);const url=`https://api.github.com/repos/fawazahmed0/hadith-api/contents/${path}?ref=${REV}`;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(url,{signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',headers:{'Accept':'application/vnd.github+json'}});
   if(response.status===404)throw Error('لا يوجد سجل لهذا الرقم في هذه النسخة؛ تحقق من رقمها ولا تستنتج غياب الحديث');
   if(response.status===403||response.status===429)throw Error('تعذر طلب السجل أو بلغ حد GitHub؛ انتظر وحاول لاحقًا');
   if(!response.ok)throw Error('تعذر طلب سجل الحديث (HTTP '+response.status+')');
   const length=Number(response.headers.get('Content-Length')||0);if(length>MAX_RESPONSE)throw Error('استجابة مصدر الحديث كبيرة جدًا');
   let bytes;
   if(response.body?.getReader){const reader=response.body.getReader(),chunks=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>MAX_RESPONSE){await reader.cancel();throw Error('استجابة مصدر الحديث كبيرة جدًا')}chunks.push(part.value)}}finally{reader.releaseLock()}bytes=new Uint8Array(size);let off=0;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length}}
   else throw Error('المتصفح لا يدعم قراءة الاستجابة بحد آمن للحجم');
   let obj;try{obj=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('استجابة مصدر الحديث غير صالحة')}
   return parse(obj,book,n);
  }catch(e){if(e.name==='AbortError')throw Error('انتهت مهلة الاتصال بمصدر الحديث');if(e instanceof TypeError)throw Error('تعذر الاتصال بمصدر الحديث؛ افحص الاتصال وحاول لاحقًا');throw e}finally{clearTimeout(timer)}
 }
 root.SanadHadith=Object.freeze({BOOKS,REV,WARNING,number,pathFor,sourceUrl,parse,lookup});
})(typeof window!=='undefined'?window:globalThis);
