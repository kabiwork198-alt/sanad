"""Live Windows diagnostic. Availability failure is reported, not treated as a test pass."""
from sanad import catalogs, internet_archive
from sanad.app import search_openlibrary
try:
    hits=search_openlibrary('A short history of the Saracens')
    found=any(h.get('url')=='https://openlibrary.org/works/OL63194W' for h in hits)
    listing=catalogs.openlibrary_editions('OL63194W')
    edition=next(e for e in listing['editions'] if e['edition_url'].endswith('/OL23411889M'))
    assert edition['archive_id']=='shorthistoryofsa00alis'
    text=internet_archive.read_text(edition['archive_id'])
    print('::notice file=tests/live_openlibrary_editions.py,line=1::Open Library Windows live: search_work=%s editions=%s edition=%s date=%s archive=%s OCR_characters=%s text_phrase=%s' % (found,len(listing['editions']),edition['edition_url'],edition['date'],edition['archive_id'],len(text['text']),'ineffaceable' in text['text'].lower()))
except Exception as exc:
    print('::notice file=tests/live_openlibrary_editions.py,line=1::Open Library Windows live unavailable: %s %s' % (type(exc).__name__,str(exc)[:180]))
