/* One explicitly chosen Commons file record, not a manuscript-authentication service. */
(function(root){
 'use strict';
 function titleFromUrl(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='commons.wikimedia.org'||u.port||u.username||u.password||u.search||u.hash||!u.pathname.startsWith('/wiki/'))return '';const title=decodeURIComponent(u.pathname.slice(6)).replaceAll('_',' ');return /^File:[^\x00-\x1f<>\[\]{}|#]{1,240}$/i.test(title)?title:''}catch{return ''}
 }
 function safeLink(value,hosts){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(!hosts||hosts.includes(u.hostname))?u.href:''}catch{return ''}}
 // These values are displayed as text, never inserted as HTML. Do not infer missing data.
 function clean(value,max=1600){return typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max):''}
 function parse(data,requested,now=new Date()){
  const pages=data?.query?.pages;if(!Array.isArray(pages)||pages.length!==1)throw Error('لم يُعثر على سجل الملف المختار');
  const p=pages[0],info=Array.isArray(p.imageinfo)&&p.imageinfo.length===1?p.imageinfo[0]:null;
  if(p.missing||p.invalid||p.ns!==6||!info||typeof p.title!=='string'||!/^File:/i.test(p.title)||!Number.isSafeInteger(p.pageid)||p.pageid<=0)throw Error('سجل الملف غير متاح أو غير صالح');
  const page=safeLink(info.descriptionurl,['commons.wikimedia.org']);if(!page||!titleFromUrl(page))throw Error('رابط صفحة الملف غير صالح');
  const media=safeLink(info.url,['upload.wikimedia.org']);
  const m=info.extmetadata&&typeof info.extmetadata==='object'?info.extmetadata:{};
  const val=(key,max)=>clean(m[key]?.value,max);
  return {version:1,requested,title:clean(p.title,300),pageId:String(p.pageid),pageUrl:page,imageUrl:media,mediaType:clean(info.mime,100),sha1:/^[a-f0-9]{40}$/i.test(info.sha1||'')?info.sha1.toLowerCase():'',fileTimestamp:typeof info.timestamp==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(info.timestamp)?info.timestamp:'',retrievedAt:now.toISOString(),description:val('ImageDescription',2000),creator:val('Artist',600),source:val('Credit',1000),date:val('DateTimeOriginal',200),license:val('LicenseShortName',200),licenseUrl:safeLink(m.LicenseUrl?.value),usageTerms:val('UsageTerms',400)};
 }
 async function fetchRecord(sourceUrl,fetcher=fetch){
  const title=titleFromUrl(sourceUrl);if(!title)throw Error('أضف رابط صفحة ملف من Wikimedia Commons بالشكل File: أولًا');
  const params=new URLSearchParams({action:'query',titles:title,prop:'imageinfo',iiprop:'url|mime|sha1|timestamp|extmetadata',format:'json',formatversion:'2',origin:'*'});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   let response;try{response=await fetcher('https://commons.wikimedia.org/w/api.php?'+params,{signal:controller.signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'})}catch(e){throw Error(e?.name==='AbortError'?'انتهت مهلة Wikimedia Commons':'تعذر الوصول إلى Wikimedia Commons؛ تحقق من الاتصال أو قيود المتصفح')}
   if(!response.ok)throw Error(`تعذر جلب سجل Commons (HTTP ${response.status})`);
   const reader=response.body?.getReader();if(!reader)throw Error('استجابة Commons غير قابلة للقراءة');let n=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>2000000){await reader.cancel();throw Error('استجابة السجل أكبر من الحد')}chunks.push(value)}}catch(e){if(n>2000000)throw Error('استجابة السجل أكبر من الحد');throw Error('تعذر قراءة استجابة السجل')}finally{reader.releaseLock()}
   const bytes=new Uint8Array(n);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{throw Error('استجابة Commons غير صالحة')}
   return parse(data,title);
  }finally{clearTimeout(timer)}
 }
 const api={titleFromUrl,parse,fetchRecord};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadOriginalRecord=api;
})(globalThis);
