'use strict';
const assert=require('node:assert/strict'),ai=require('../web/cloud-ai.js');
const input={provider:'openai',model:'test-model',key:'test-secret',prompt:'طلب اختبار'};
const jsonResponse=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
(async()=>{
 for(const [provider,url] of [['openai','https://api.openai.com/v1/chat/completions'],['openrouter','https://openrouter.ai/api/v1/chat/completions'],['gemini','https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent'],['compatible','https://service.example/v1/chat/completions']]){
  const cfg={...input,provider,endpoint:'https://service.example/v1/chat/completions'},expected=provider==='gemini'?{candidates:[{finishReason:'STOP',content:{parts:[{text:'نتيجة اختبار'}]}}]}:{choices:[{finish_reason:'stop',message:{content:'نتيجة اختبار'}}]};
  let called=0;const text=await ai.request(cfg,async(u,opts)=>{called++;assert.equal(u,url);assert.equal(opts.redirect,'error');assert.equal(opts.credentials,'omit');assert.equal(opts.referrerPolicy,'no-referrer');assert.ok(!u.includes(cfg.key));const body=JSON.parse(opts.body);if(provider==='gemini'){assert.equal(opts.headers['x-goog-api-key'],cfg.key);assert.equal(body.contents[0].parts[0].text,cfg.prompt)}else{assert.equal(opts.headers.Authorization,'Bearer '+cfg.key);assert.equal(body.messages[1].content,cfg.prompt)}return jsonResponse(expected)});assert.equal(text,'نتيجة اختبار');assert.equal(called,1);
 }
 for(const endpoint of ['http://service.example/v1/chat/completions','https://127.0.0.1/v1/chat/completions','https://a.local/v1/chat/completions','https://service.example:444/v1/chat/completions','https://user:pass@service.example/v1/chat/completions','https://service.example/v1/chat/completions?key=x','https://service.example/other'])assert.throws(()=>ai.prepare({...input,provider:'compatible',endpoint}));
 assert.throws(()=>ai.prepare({...input,provider:'other'}));assert.throws(()=>ai.prepare({...input,key:'a\r\nb'}));assert.throws(()=>ai.prepare({...input,provider:'gemini',model:'../evil'}));assert.throws(()=>ai.prepare({...input,prompt:'x'.repeat(10001)}));
 await assert.rejects(ai.request(input,async()=>jsonResponse({error:{message:'test-secret'}},401)),e=>e.message.includes('401')&&!e.message.includes('test-secret'));
 await assert.rejects(ai.request(input,async()=>jsonResponse({choices:[{finish_reason:'length',message:{content:'partial'}}]})),/لم تكتمل/);
 await assert.rejects(ai.request({...input,provider:'gemini'},async()=>jsonResponse({promptFeedback:{blockReason:'SAFETY'}})),/فارغة/);
 await assert.rejects(ai.request(input,async()=>new Response('x'.repeat(2000001))),/أكبر/);
 await assert.rejects(ai.request(input,async()=>{throw Error('test-secret')}),e=>!e.message.includes('test-secret'));
 console.log('PASS: cloud AI providers, credentials, endpoint validation, bounded responses and safe errors (synthetic transport)');
})().catch(e=>{console.error(e);process.exitCode=1});
