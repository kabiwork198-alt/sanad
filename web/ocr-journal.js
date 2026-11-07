/* Durable, local-only OCR checkpoints. One task per saved project. */
'use strict';
(function(root){
 const DB='sanad-ocr-checkpoints-v1';
 function open(){return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,1);let blocked=false;
  req.onupgradeneeded=()=>{req.result.createObjectStore('jobs',{keyPath:'projectId'});req.result.createObjectStore('pages',{keyPath:['projectId','number']});};
  req.onsuccess=()=>{if(blocked){req.result.close();return}req.result.onversionchange=()=>req.result.close();resolve(req.result)};
  req.onerror=()=>reject(Error('تعذر فتح تخزين تقدم OCR المحلي'));
  req.onblocked=()=>{blocked=true;reject(Error('تخزين تقدم OCR محجوب؛ أغلق نوافذ سَنَد الأخرى'))};
 });}
 async function transaction(stores,mode,fn){
  const db=await open();
  return new Promise((resolve,reject)=>{
   let value;const tx=db.transaction(stores,mode);
   try{fn(tx,v=>{value=v})}catch(e){tx.abort();db.close();reject(e);return}
   tx.oncomplete=()=>{db.close();resolve(value)};
   tx.onabort=tx.onerror=()=>{db.close();reject(Error('تعذر حفظ أو قراءة تقدم OCR؛ قد تكون مساحة التخزين ممتلئة أو محجوبة'))};
  });
 }
 async function get(projectId){return transaction(['jobs','pages'],'readonly',(tx,done)=>{
  let job, pages;const j=tx.objectStore('jobs').get(projectId),p=tx.objectStore('pages').getAll(IDBKeyRange.bound([projectId,0],[projectId,9999]));
  j.onsuccess=()=>{job=j.result;done(job?{job,pages:pages||[]}:null)};
  p.onsuccess=()=>{pages=p.result;done(job?{job,pages}:null)};
 });}
 async function create(job){return transaction(['jobs'],'readwrite',(tx)=>{tx.objectStore('jobs').add(job)});}
 async function save(job,page){return transaction(['jobs','pages'],'readwrite',(tx)=>{
  if(page)tx.objectStore('pages').put({projectId:job.projectId,number:page.number,text:page.text});
  tx.objectStore('jobs').put(job);
 });}
 async function remove(projectId){return transaction(['jobs','pages'],'readwrite',(tx)=>{
  tx.objectStore('jobs').delete(projectId);
  tx.objectStore('pages').delete(IDBKeyRange.bound([projectId,0],[projectId,9999]));
 });}
 async function exclusive(projectId,fn){
  if(!navigator.locks?.request)throw Error('المتصفح لا يدعم قفل المهام الآمن؛ استخدم متصفحًا حديثًا يدعم Web Locks');
  return navigator.locks.request('sanad-ocr-'+projectId,{ifAvailable:true},lock=>{
   if(!lock)throw Error('مهمة OCR لهذا المشروع مفتوحة في نافذة أخرى؛ أغلقها أو انتظر انتهاءها');
   return fn();
  });
 }
 root.SanadOcrJournal={get,create,save,remove,exclusive};
})(window);
