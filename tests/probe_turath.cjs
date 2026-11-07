// Small read-only diagnostic of the Turath service advertised by its maintainers.
const base='https://mcp.turath.io/mcp/',notice=s=>console.log('::notice file=tests/probe_turath.cjs,line=1::'+String(s).replaceAll('%','%25').replaceAll('\n','%0A').slice(0,15000));
function shape(v,depth=0){if(depth>5)return '[depth]';if(Array.isArray(v))return {arrayLength:v.length,first:v.length?shape(v[0],depth+1):null};if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).slice(0,40).map(([k,x])=>[k,typeof x==='string'&&!/^(?:title|name|url|id|book_id|page_id)$/i.test(k)?'[string '+x.length+']':shape(x,depth+1)]));return v}
(async()=>{
 let session='';
 async function rpc(method,params,id){
  const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'};if(session)headers['Mcp-Session-Id']=session;
  const body={jsonrpc:'2.0',method,params};if(id!==undefined)body.id=id;
  const response=await fetch(base,{method:'POST',headers,body:JSON.stringify(body),redirect:'manual',signal:AbortSignal.timeout(25000)});
  session=response.headers.get('mcp-session-id')||session;const text=await response.text();if(text.length>2000000)throw Error('response too large');
  let data;try{const raw=text.trim().startsWith('{')?text:text.split('\n').find(l=>l.startsWith('data:'))?.slice(5);if(raw)data=JSON.parse(raw)}catch{}
  return {status:response.status,data,type:response.headers.get('content-type'),hasSession:!!session};
 }
 try{
  const pre=await fetch(base,{method:'OPTIONS',headers:{Origin:'https://kabiwork198-alt.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,mcp-session-id'},redirect:'manual',signal:AbortSignal.timeout(15000)});
  notice('Turath preflight HTTP '+pre.status+' ACAO='+pre.headers.get('access-control-allow-origin')+' allowed='+pre.headers.get('access-control-allow-headers')+' expose='+pre.headers.get('access-control-expose-headers'));
  const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'sanad-diagnostic',version:'1.0'}},1);notice('Turath init '+JSON.stringify(init));if(!init.data?.result)return;
  const ack=await rpc('notifications/initialized',{},undefined);notice('Turath initialized HTTP '+ack.status);
  const list=await rpc('tools/list',{},2);notice('Turath tools status '+list.status);
  for(const t of list.data?.result?.tools||[])notice('Turath tool '+JSON.stringify({name:t.name,description:t.description,inputSchema:t.inputSchema}));
  const result=await rpc('tools/call',{name:'search_turath',arguments:{q:'فتح بغداد',page:1}},3);
  let content=result.data?.result?.content||[];let parsed;
  try{parsed=JSON.parse(content.find(x=>x.type==='text')?.text)}catch{}
  notice('Turath search raw structure '+JSON.stringify({status:result.status,isError:result.data?.result?.isError,keys:Object.keys(parsed||{}),contentTypes:content.map(x=>x.type),structuredKeys:Object.keys(result.data?.result?.structuredContent||{}),shape:shape(parsed)}));
 }catch(e){notice('Turath unavailable: '+e.name+': '+e.message)}
})();
