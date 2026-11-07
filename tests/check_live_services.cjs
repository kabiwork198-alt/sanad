// Optional live diagnostics. Uses public example queries and does not submit user data.
const origin='https://kabiwork198-alt.github.io';
function report(message){ console.log(`::notice file=tests/check_live_services.cjs,line=1::${message}`); }
async function check(name,url){
  try {
    const r=await fetch(url,{headers:{Origin:origin,'User-Agent':'SanadStudio/0.1 (public connectivity check)'},signal:AbortSignal.timeout(18000)});
    const allow=r.headers.get('access-control-allow-origin')||'none';
    if(!r.ok) {report(`${name}: HTTP ${r.status}, CORS=${allow}`);return null;}
    const data=await r.json();report(`${name}: HTTP ${r.status}, CORS=${allow}`);return data;
  }catch(e){report(`${name}: unavailable (${e.name})`);return null}
}
(async()=>{
 const enc=encodeURIComponent;
 const q=enc('الخوارزمي');
 const base='https://ar.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*';
 const [topics,search] = await Promise.all([
   check('Wikipedia topics',base+'&action=query&list=categorymembers&cmtype=page&cmlimit=24&cmtitle='+enc('تصنيف:تاريخ إسلامي')),
   check('Wikipedia search',base+'&action=query&list=search&srnamespace=0&srlimit=1&srsearch='+q),
   check('Crossref','https://api.crossref.org/works?rows=1&query.bibliographic='+q),
   check('Open Library','https://openlibrary.org/search.json?limit=1&q='+q),
   check('Wikimedia Commons','https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url%7Cextmetadata&format=json&formatversion=2&origin=*&gsrsearch='+q),
 ]);
 report('Wikipedia topic count: '+(topics?.query?.categorymembers?.length ?? 'unknown'));
 const id=search?.query?.search?.[0]?.pageid;
 if(id){const page=await check('Wikipedia citations',base+'&action=parse&prop=text&pageid='+id);report('Wikipedia citation markers: '+(page?.parse?.text?.match(/<li\b[^>]*\bid\s*=\s*["']cite_note-/gi)||[]).length);const t=page?.parse?.text||'';const pos=t.indexOf('cite_note');if(pos>=0)report('Wikipedia markup sample (base64): '+Buffer.from(t.slice(Math.max(0,pos-250),pos+350)).toString('base64'));else report('Wikipedia markup has no cite_note')}
})().catch(e=>{console.error(e);process.exitCode=1});
