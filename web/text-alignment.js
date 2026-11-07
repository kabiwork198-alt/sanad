/* Literal, bounded two-passage alignment. It is not historical corroboration. */
'use strict';
(function(root){
 const MAX_CHARS=5000,MAX_TOKENS=800;
 function tokenize(text){
  if(typeof text!=='string'||!text.trim())throw Error('يجب أن يحتوي كل مقتطف على نص');
  if(text.length>MAX_CHARS)throw Error('كل مقتطف محدود بـ 5000 محرف؛ اختر مقطعًا أقصر مع الاحتفاظ بسياقه');
  const tokens=text.match(/\s+|[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu)||[];
  if(tokens.length>MAX_TOKENS)throw Error('كل مقتطف محدود بـ 800 وحدة نصية؛ اختر مقطعًا أقصر');
  return tokens;
 }
 function align(left,right){
  const a=tokenize(left),b=tokenize(right),width=b.length+1;
  // Longest common subsequence, exact Unicode token equality, with bounded storage.
  const dp=new Uint16Array((a.length+1)*width);
  for(let i=a.length-1;i>=0;i--)for(let j=b.length-1;j>=0;j--){const k=i*width+j;dp[k]=a[i]===b[j]?1+dp[(i+1)*width+j+1]:Math.max(dp[(i+1)*width+j],dp[i*width+j+1])}
  const outA=[],outB=[];
  function push(out,text,same){const last=out[out.length-1];if(last&&last.same===same)last.text+=text;else out.push({text,same})}
  let i=0,j=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){push(outA,a[i],true);push(outB,b[j],true);i++;j++}else if(dp[(i+1)*width+j]>=dp[i*width+j+1]){push(outA,a[i++],false)}else{push(outB,b[j++],false)}}
  while(i<a.length)push(outA,a[i++],false);while(j<b.length)push(outB,b[j++],false);
  return {first:outA,second:outB};
 }
 root.SanadTextAlignment=Object.freeze({MAX_CHARS,MAX_TOKENS,tokenize,align});
})(typeof window!=='undefined'?window:globalThis);
