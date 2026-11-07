// Diagnostic: official LoC JSON API, one newspaper page and a few catalog results.
(async()=>{for(const [label,url] of [
 ['page','https://www.loc.gov/resource/sn83045462/1922-12-26/ed-1/?sp=22&fo=json'],
 ['text-view','https://www.loc.gov/resource/sn83045462/1922-12-26/ed-1/?sp=22&st=text&fo=json'],
 ['search','https://www.loc.gov/collections/chronicling-america/?fo=json&at=results&c=2&dl=page&qs=Baghdad']]){
 try{const r=await fetch(url,{signal:AbortSignal.timeout(25000)}),raw=await r.text();if(!r.ok)throw Error('HTTP '+r.status);const d=JSON.parse(raw);
 const info={status:r.status,bytes:Buffer.byteLength(raw),keys:Object.keys(d),fullTextType:typeof d.full_text,fullTextLength:typeof d.full_text==='string'?d.full_text.length:0,fulltextService:d.fulltext_service||null,resourceKeys:Object.keys(d.resource||{}),segments:(d.segments||[]).length,results:(d.results||[]).slice(0,2).map(x=>({url:x.url,access_restricted:x.access_restricted,site:x.site,type:x.type}))};
 console.log('::notice file=tests/probe_loc_text.cjs,line=1::LOC '+label+' '+JSON.stringify(info));
 }catch(e){console.log('::notice file=tests/probe_loc_text.cjs,line=1::LOC '+label+' unavailable '+String(e.message).slice(0,120))}
}})();
