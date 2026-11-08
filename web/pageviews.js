/* Measured attention to one specified Wikipedia article, not general popularity. */
'use strict';
(function(root){
 const API='https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ar.wikipedia/all-access/user/';
 function title(value){if(typeof value!=='string')throw Error('أدخل عنوان المقالة');if(/[\x00-\x1f\x7f]/.test(value))throw Error('عنوان المقالة غير صالح');const s=value.trim().replace(/\s+/g,' ');if(s.length<1||s.length>200||s==='.'||s==='..')throw Error('عنوان المقالة غير صالح');return s}
 function periods(now=new Date()){
  if(!(now instanceof Date)||!Number.isFinite(now.valueOf()))throw Error('تاريخ غير صالح');
  const end=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-2));
  const dates=[];for(let i=59;i>=0;i--){const d=new Date(end.valueOf()-i*86400000);dates.push(d.toISOString().slice(0,10).replaceAll('-','')+'00')}
  return dates;
 }
 function range(start,end){
  const parse=s=>{if(typeof s!=='string'||!/^[0-9]{8}00$/.test(s))throw Error('الفترة غير صالحة');const d=new Date(Date.UTC(Number(s.slice(0,4)),Number(s.slice(4,6))-1,Number(s.slice(6,8))));if(d.toISOString().slice(0,10).replaceAll('-','')+'00'!==s)throw Error('الفترة غير صالحة');return d};
  const first=parse(start),last=parse(end);if(last-first!==59*86400000)throw Error('الفترة يجب أن تكون 60 يومًا');return Array.from({length:60},(_,i)=>new Date(first.valueOf()+i*86400000).toISOString().slice(0,10).replaceAll('-','')+'00');
 }
 function url(article,dates){return API+encodeURIComponent(title(article).replaceAll(' ','_'))+'/daily/'+dates[0]+'/'+dates[59]}
 function summarize(data,article,dates){
  if(!data||!Array.isArray(data.items)||data.items.length!==60||dates.length!==60)throw Error('بيانات المشاهدات غير مكتملة؛ لم تُحسب الأيام الناقصة صفرًا');
  const expected=title(article).replaceAll(' ','_'),byDay=new Map();
  for(const row of data.items){if(!row||row.project!=='ar.wikipedia'||row.article!==expected||row.granularity!=='daily'||row.access!=='all-access'||row.agent!=='user'||!dates.includes(row.timestamp)||byDay.has(row.timestamp)||!Number.isSafeInteger(row.views)||row.views<0)throw Error('استجابة المشاهدات غير صالحة أو غير مطابقة للمقالة والفترة');byDay.set(row.timestamp,row.views)}
  const values=dates.map(d=>byDay.get(d));if(values.some(x=>x===undefined))throw Error('بيانات المشاهدات غير مكتملة');
  const previous=values.slice(0,30).reduce((a,b)=>a+b,0),recent=values.slice(30).reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(previous)||!Number.isSafeInteger(recent))throw Error('أعداد المشاهدات غير صالحة');
  return {article:title(article),previous,recent,change_percent:previous?Math.round((recent-previous)*1000/previous)/10:null,previous_start:dates[0],previous_end:dates[29],recent_start:dates[30],recent_end:dates[59],url:url(article,dates),checked_at:new Date().toISOString()};
 }
 const api={title,periods,range,url,summarize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadPageviews=api;
})(globalThis);
