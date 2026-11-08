'use strict';
// Direct browser requests: credentials are supplied for this call only, never persisted.
(function(root){
 const system='أنت مساعد بحث وتحرير. لا تختلق المراجع أو الاقتباسات، واذكر حدود معرفتك. إجابتك مسودة تحتاج مراجعة بشرية.';
 const providers={openai:{url:'https://api.openai.com/v1/chat/completions',name:'OpenAI'},openrouter:{url:'https://openrouter.ai/api/v1/chat/completions',name:'OpenRouter'},gemini:{name:'Google Gemini'},compatible:{name:'خدمة متوافقة مع OpenAI'}};
 function prepare({provider,endpoint='',model,key,prompt}){
  if(!Object.hasOwn(providers,provider))throw Error('مزود غير مدعوم');
  if(typeof model!=='string'||!model.trim()||model.length>200||/[\r\n]/.test(model))throw Error('أدخل اسم نموذج صالحًا حتى 200 حرف');
  if(typeof key!=='string'||!(/^[\x21-\x7e]{1,1024}$/).test(key))throw Error('أدخل مفتاح API صالحًا دون مسافات');
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>10000)throw Error('أدخل طلبًا حتى 10000 حرف');
  model=model.trim();let url,headers={'Content-Type':'application/json'},body;
  if(provider==='gemini'){
   if(!/^[A-Za-z0-9._-]{1,200}$/.test(model))throw Error('اكتب اسم نموذج Gemini فقط دون models/');
   url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
   headers['x-goog-api-key']=key;
   body={systemInstruction:{parts:[{text:system}]},contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{maxOutputTokens:2048}};
  }else{
   url=providers[provider].url;
   if(provider==='compatible'){
    if(typeof endpoint!=='string'||endpoint.length>1000)throw Error('رابط الخدمة غير صالح');
    let u;try{u=new URL(endpoint)}catch{throw Error('أدخل رابط HTTPS كاملًا لنقطة chat/completions')}
    // No credentials, fragments, queries, localhost, or IP literals. A user-defined
    // public hostname is still an explicit trust decision, not a vetted provider.
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||!u.hostname.includes('.')||u.hostname.endsWith('.')||/^(?:\d+\.)+\d+$/.test(u.hostname)||u.hostname.includes(':')||u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||!u.pathname.endsWith('/chat/completions'))throw Error('الرابط يجب أن يكون HTTPS لاسم نطاق عام ونقطة chat/completions دون منفذ أو بيانات دخول أو معاملات');
    url=u.href;
   }
   headers.Authorization='Bearer '+key;
   body={model,messages:[{role:'system',content:system},{role:'user',content:prompt}]};
   if(provider==='openai')body.max_completion_tokens=2048;else body.max_tokens=2048;
  }
  return {url,headers,body,provider,name:providers[provider].name};
 }
 async function request(config,fetcher=fetch){
  const request=prepare(config),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
  try{
   let response;
   try{response=await fetcher(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(request.body),redirect:'error',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal})}catch(e){throw Error(e?.name==='AbortError'?'انتهت مهلة الخدمة':'تعذر الاتصال بالخدمة أو رفض المتصفح الطلب؛ تحقق من الإنترنت وCORS')}
   if(!response.ok)throw Error(`رفضت الخدمة الطلب (HTTP ${response.status}). تحقق من المفتاح والنموذج والرصيد وحدود الخدمة.`);
   const reader=response.body?.getReader();if(!reader)throw Error('استجابة الخدمة غير قابلة للقراءة');
   const chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('استجابة الخدمة أكبر من الحد المسموح')}chunks.push(value)}}catch(e){if(size>2000000)throw Error('استجابة الخدمة أكبر من الحد المسموح');throw Error(e?.name==='AbortError'?'انتهت مهلة الخدمة':'تعذر قراءة استجابة الخدمة')}finally{reader.releaseLock()}
   const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
   let data;try{data=JSON.parse(new TextDecoder().decode(bytes))}catch{throw Error('استجابة الخدمة ليست JSON صالحة')}
   let text,finish;
   if(request.provider==='gemini'){const candidate=data?.candidates?.[0];text=candidate?.content?.parts?.map(p=>typeof p.text==='string'?p.text:'').join('');finish=candidate?.finishReason;if(finish&&finish!=='STOP')throw Error('لم تكتمل استجابة Gemini أو حُجبت؛ راجع إعدادات الخدمة وحدودها')}
   else{const choice=data?.choices?.[0];text=choice?.message?.content;finish=choice?.finish_reason;if(finish&&finish!=='stop')throw Error('لم تكتمل استجابة النموذج أو رفض الطلب؛ راجع إعدادات الخدمة وحدودها')}
   if(typeof text!=='string'||!text.trim()||text.length>30000)throw Error('استجابة النموذج فارغة أو غير نصية أو أكبر من الحد المسموح');
   return text;
  }finally{clearTimeout(timer)}
 }
 const api={prepare,request};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SanadCloudAI=api;
})(globalThis);
