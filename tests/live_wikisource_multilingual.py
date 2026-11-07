"""Diagnostic: two public examples, service failure does not fail a build."""
from sanad import catalogs
examples=[('fr','3599134','Nefouça','Ibn Khaldoun'),('en','184505','Bagdad','History of the Saracens')]
for language,page_id,phrase,query in examples:
    try:
        hits=catalogs.wikisource_other(query,language)
        page=catalogs.read_wikisource_rendered(page_id,language)
        print('::notice file=tests/live_wikisource_multilingual.py,line=1::Wikisource %s live Windows: results=%d revision=%s characters=%d phrase=%s' % (language,len(hits),page['revision_id'],len(page['text']),phrase in page['text']))
    except Exception as exc:
        print('::notice file=tests/live_wikisource_multilingual.py,line=1::Wikisource %s unavailable: %s %s' % (language,type(exc).__name__,str(exc)[:140]))
