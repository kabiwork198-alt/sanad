/* Approximate a Hijri year for ordering only; not a precise calendar conversion. */
'use strict';
(function(root){
 function hijriToGregorianEstimate(value){
  const digits=String(value??'').trim().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0));
  if(!/^[0-9]{1,4}$/.test(digits))throw Error('أدخل سنة هجرية صحيحة بالأرقام');
  const year=Number(digits);if(year<1||year>3000)throw Error('أدخل سنة هجرية بين 1 و3000');
  // Mean-year approximation; a Hijri year spans parts of two Gregorian years.
  return Math.floor(year*0.970224+621.5774);
 }
 const api={hijriToGregorianEstimate};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadHistoryDates=api;
})(globalThis);
