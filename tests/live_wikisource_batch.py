"""Diagnostic only: list one real Arabic work and read two public pages."""
from sanad import catalogs
try:
    result=catalogs.wikisource_subpages('1898','ar')
    parts=[]
    for p in result['pages'][:2]:
        page=catalogs.read_wikisource_rendered(p['page_id'],'ar')
        parts.append(f"{p['page_id']}@{page['revision_id']}:{len(page['text'])}chars")
    more=catalogs.wikisource_subpages('1898','ar',result['next_cursor']) if result['next_cursor'] else None
    print(f"::notice title=Live Arabic Wikisource batch::first={len(result['pages'])} next={len(more['pages']) if more else 0} reads={','.join(parts)}; no claims about completeness or rights")
except Exception as exc:
    print('::notice title=Live Arabic Wikisource batch unavailable::'+type(exc).__name__+': '+str(exc)[:300])
