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
   check('Arabic Wikisource','https://ar.wikisource.org/w/api.php?action=query&list=search&srnamespace=0&srlimit=1&format=json&formatversion=2&origin=*&srsearch='+q),
   check('Internet Archive','https://archive.org/advancedsearch.php?output=json&rows=1&fl%5B%5D=identifier&fl%5B%5D=title&q='+enc('\"الخوارزمي\" AND mediatype:texts')),
   check('World Digital Library','https://www.loc.gov/collections/world-digital-library/?fo=json&at=results&c=1&q=Baghdad'),
   check('Chronicling America','https://www.loc.gov/collections/chronicling-america/?fo=json&at=results&c=1&dl=page&qs=Baghdad'),
   check('National Archives UK','https://discovery.nationalarchives.gov.uk/API/search/v1/records?sps.searchQuery=Palestine&sps.resultsPageSize=1'),
 ]);
 report('Wikipedia topic count: '+(topics?.query?.categorymembers?.length ?? 'unknown'));
 const id=search?.query?.search?.[0]?.pageid;
 if(id){const page=await check('Wikipedia citations',base+'&action=parse&prop=text&pageid='+id);const t=(page?.parse?.text||'').replace(/&#(?:0*95|x0*5f);/gi,'_');report('Wikipedia citation markers: '+(t.match(/<li\b[^>]*\bid\s*=\s*["']cite_note-/gi)||[]).length)}
})().catch(e=>{console.error(e);process.exitCode=1});
