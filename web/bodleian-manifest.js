/* One opt-in Bodleian IIIF Presentation 2 manifest. No crawling or image fetching. */
(function(root){
 'use strict';
 const ID='[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
 function identify(input){
  try{const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash)return null;let m;
   if(u.hostname==='iiif.bodleian.ox.ac.uk')m=new RegExp('^/iiif/manifest/('+ID+')\\.json$','i').exec(u.pathname);
   else if(u.hostname==='digital.bodleian.ox.ac.uk')m=new RegExp('^/objects/('+ID+')/?$','i').exec(u.pathname);
   if(!m)return null;const id=m[1].toLowerCase();return {id,manifestUrl:`https://iiif.bodleian.ox.ac.uk/iiif/manifest/${id}.json`,objectUrl:`https://digital.bodleian.ox.ac.uk/objects/${id}/`};
  }catch{return null}
 }
 function clean(v,max=1200){if(typeof v!=='string')return '';return v.replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,max)}
 function label(v){if(typeof v==='string')return clean(v,250);if(Array.isArray(v))return label(v[0]);if(v&&typeof v==='object')return clean(v['@value'],250);return ''}
 function parse(doc,source,now=new Date()){
  const target=identify(source);if(!target)throw Error('رابط Bodleian أو manifest غير مدعوم');
  if(!doc||doc['@type']!=='sc:Manifest'||identify(doc['@id'])?.id!==target.id||!Array.isArray(doc.sequences)||doc.sequences.length<1||!Array.isArray(doc.sequences[0]?.canvases))throw Error('الملف ليس manifest Bodleian مدعومًا أو لا يطابق الرابط');
  const canvases=doc.sequences[0].canvases;if(canvases.length>5000)throw Error('الفهرس أكبر من حد 5000 صفحة؛ استخدم عارض المكتبة');
  const metadata=[];const accepted=new Set(['Title','Shelfmark','Holding Institution','Date Statement','Language','Collection']);
  for(const entry of Array.isArray(doc.metadata)?doc.metadata:[]){const name=label(entry?.label),value=label(entry?.value);if(accepted.has(name)&&value&&metadata.length<25)metadata.push({label:name,value})}
  const pages=canvases.map((c,index)=>{
   const canvas=c?.['@id'];let canvasUrl='';try{const u=new URL(canvas);if(u.protocol==='https:'&&u.hostname==='iiif.bodleian.ox.ac.uk'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&new RegExp('^/iiif/canvas/'+ID+'\\.json$','i').test(u.pathname))canvasUrl=u.href}catch{}
   const service=c?.images?.[0]?.resource?.service?.['@id'];let imageUrl='';try{const u=new URL(service);if(u.protocol==='https:'&&u.hostname==='iiif.bodleian.ox.ac.uk'&&!u.port&&!u.username&&!u.password&&!u.search&&!u.hash&&new RegExp('^/iiif/image/'+ID+'$','i').test(u.pathname))imageUrl=u.href+'/full/1280,/0/default.jpg'}catch{}
   if(canvasUrl&&imageUrl){const canvasId=canvasUrl.match(/\/([0-9a-f-]+)\.json$/i)?.[1],imageId=imageUrl.match(/\/image\/([0-9a-f-]+)\//i)?.[1];if(canvasId?.toLowerCase()!==imageId?.toLowerCase())imageUrl=''}
   return {index:index+1,label:label(c?.label),canvasUrl,imageUrl};
  });
  return {...target,title:label(doc.label),description:clean(doc.description,1600),attribution:clean(doc.attribution,1600),license:clean(doc.license,500),metadata,pages,total:canvases.length,retrievedAt:now.toISOString()};
 }
 async function fetchManifest(input,fetcher=fetch){
  const target=identify(input);if(!target)throw Error('أدخل رابط مخطوط Digital Bodleian أو IIIF manifest مدعومًا');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  try{let r;try{r=await fetcher(target.manifestUrl,{signal:controller.signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'})}catch(e){throw Error(e?.name==='AbortError'?'انتهت مهلة Bodleian':'تعذر الاتصال بـ Bodleian أو منع المتصفح الاستجابة')}
   if(!r.ok)throw Error(`تعذر جلب فهرس Bodleian (HTTP ${r.status})`);
   const reader=r.body?.getReader();if(!reader)throw Error('استجابة المكتبة غير قابلة للقراءة');const chunks=[];let n=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>8000000){await reader.cancel();throw Error('too large')}chunks.push(value)}}catch(e){throw Error(n>8000000?'الفهرس أكبر من 8 ميغابايت؛ افتح عارض المكتبة':'تعذر قراءة استجابة المكتبة')}finally{reader.releaseLock()}
   const all=new Uint8Array(n);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length}let doc;try{doc=JSON.parse(new TextDecoder().decode(all))}catch{throw Error('فهرس المكتبة ليس JSON صالحًا')};return parse(doc,target.manifestUrl);
  }finally{clearTimeout(timer)}
 }
 const api={identify,parse,fetchManifest};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadBodleian=api;
})(globalThis);
