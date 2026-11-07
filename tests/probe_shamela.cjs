// Diagnostic only: public official MCP, no user data, no crawling or index reconstruction.
const base='https://mcp.shamela.ws';
const notice=s=>console.log('::notice file=tests/probe_shamela.cjs,line=1::'+String(s).replaceAll('%','%25').replaceAll('\n','%0A').slice(0,50000));
(async()=>{
  let session='';
  async function req(method,params,id){
    const headers={'Accept':'application/json, text/event-stream','Content-Type':'application/json'};
    if(session)headers['Mcp-Session-Id']=session;
    const body={jsonrpc:'2.0',method,params};if(id!==undefined)body.id=id;
    const response=await fetch(base,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    session=response.headers.get('mcp-session-id')||session;
    const text=await response.text();if(text.length>1000000)throw Error('response too large');
    let parsed;try{if(text.trim().startsWith('{'))parsed=JSON.parse(text);else{const d=text.split('\n').find(l=>l.startsWith('data:'));if(d)parsed=JSON.parse(d.slice(5));}}catch{}
    return {status:response.status,type:response.headers.get('content-type'),parsed,body:text.slice(0,1000)};
  }
  try {
    const pre=await fetch(base,{method:'OPTIONS',headers:{Origin:'https://kabiwork198-alt.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,accept'},signal:AbortSignal.timeout(15000)});
    notice('Shamela browser preflight HTTP '+pre.status+' ACAO='+pre.headers.get('access-control-allow-origin')+' headers='+pre.headers.get('access-control-allow-headers'));
    const init=await req('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'sanad-diagnostic',version:'1.0'}},1);
    notice('Shamela init: '+JSON.stringify({status:init.status,version:init.parsed?.result?.protocolVersion,server:init.parsed?.result?.serverInfo,error:init.parsed?.error||init.body.slice(0,100)}));
    if(init.status!==200||!init.parsed?.result)return;
    const ack=await req('notifications/initialized',{},undefined);notice('Shamela initialized notification HTTP '+ack.status);
    const list=await req('tools/list',{},2);
    for(const tool of list.parsed?.result?.tools||[]){
      const props=tool.inputSchema?.properties||{},schema={name:tool.name,required:tool.inputSchema?.required||[],fields:Object.fromEntries(Object.entries(props).map(([k,v])=>[k,{type:v.type,enum:v.enum,items:v.items?.type,default:v.default}]))};
      notice('Shamela tool schema: '+JSON.stringify(schema));
    }
    const tool=(list.parsed?.result?.tools||[]).find(x=>x.name==='shamela_find');
    if(tool){
      const out=await req('tools/call',{name:'shamela_find',arguments:{keywords:['تاريخ الطبري'],difficulty:'easy'}},3);
      let payload;try{payload=JSON.parse(out.parsed.result.content.find(x=>x.type==='text').text)}catch{}
      const layers=(payload?.layers||[]).map(l=>({key:l.key,count:l.results?.length,first:l.results?.[0]}));
      const evidence=payload?.evidence;
      notice('Shamela sample structure: '+JSON.stringify({status:out.status,keys:Object.keys(payload||{}),layers,evidenceType:typeof evidence,evidenceKeys:Object.keys(evidence||{}),sourcesType:typeof evidence?.sources,sourceArray:Array.isArray(evidence?.sources),firstSource:Array.isArray(evidence?.sources)?evidence.sources[0]:null,error:out.parsed?.error}));
      const first=layers.flatMap(x=>x.first?[x.first]:[]).find(x=>Number.isSafeInteger(x.book_id)&&Number.isSafeInteger(x.page_id));
      if(first){const opened=await req('tools/call',{name:'shamela_open',arguments:{book_id:first.book_id,page_id:first.page_id,field:'body',max_chars:3000}},4);let page;try{page=JSON.parse(opened.parsed.result.content.find(x=>x.type==='text').text)}catch{}notice('Shamela open structure: '+JSON.stringify({status:opened.status,keys:Object.keys(page||{}),page,error:opened.parsed?.error}));}
    }

  } catch(e) {notice('Shamela probe unavailable: '+e.name+': '+e.message)}
})().catch(e=>{console.error(e);process.exitCode=1});
