"""Windows CI diagnostic against public services, not a guarantee of availability."""
import concurrent.futures
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import catalogs

def wiki():
    page = catalogs.read_wikisource('43576')
    if 'الاثنين' not in page['text'] or not page['revision_id']:
        raise ValueError('Expected example phrase or revision missing')
    return f"revision={page['revision_id']}; phrase found"

def check(name, fn):
    try:
        value = fn()
        return f'{name}: OK; ' + (f'results={len(value)}' if isinstance(value, list) else value)
    except Exception as exc:
        return f'{name}: unavailable ({type(exc).__name__})'

checks = [
    ('Wikisource selected revision', wiki),
    ('DOAJ Baghdad', lambda: catalogs.doaj('Baghdad')),
    ('OpenAlex Baghdad no key', lambda: catalogs.openalex('Baghdad')),
    ('WDL Baghdad', lambda: catalogs.loc('Baghdad', 'world-digital-library')),
    ('Chronicling America Baghdad', lambda: catalogs.loc('Baghdad', 'chronicling-america')),
    ('National Archives Palestine', lambda: catalogs.national_archives('Palestine')),
]
with concurrent.futures.ThreadPoolExecutor(max_workers=len(checks)) as pool:
    for result in pool.map(lambda item: check(*item), checks):
        print('::notice file=tests/live_windows_sources.py,line=1::' + result)
