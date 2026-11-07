"""Windows CI diagnostic against public services, not a guarantee of availability."""
import concurrent.futures
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import catalogs, openiti, shamela, internet_archive, turath, alexandria_archive

def wiki():
    page = catalogs.read_wikisource('43576')
    if 'الاثنين' not in page['text'] or not page['revision_id']:
        raise ValueError('Expected example phrase or revision missing')
    return f"revision={page['revision_id']}; phrase found"

def shamela_live():
    results=shamela.search('تاريخ الطبري')['results']
    if not results: raise ValueError('No example matches')
    first=results[0]
    page=shamela.read_page(first['book_id'],first['page_id'])
    if not page['text'].strip() or not page['url'].startswith('https://shamela.ws/book/'):
        raise ValueError('Selected page unavailable')
    return f"results={len(results)}; selected page read; book={first['book_id']}; page={first['page_id']}"

def turath_live():
    results=turath.search('فتح بغداد')['results']
    if not results: raise ValueError('No example results')
    page=turath.read_page(results[0]['book_id'],results[0]['page_id'])
    if not page['text'].strip(): raise ValueError('Selected page unavailable')
    return f"results={len(results)}; selected page read; book={results[0]['book_id']}; page_id={results[0]['page_id']}"

def alexandria_live():
    results=alexandria_archive.search('Alexandria')['results']
    article=next((x for x in results if x['url'].startswith('https://www.alexandria-archive.com/article/')),None)
    if not article: raise ValueError('No public article result')
    page=alexandria_archive.read_article(article['url'].rsplit('/',1)[-1])
    if not page['text'] or 'نبذة عامة' not in page['warning']: raise ValueError('No public preview')
    return f"results={len(results)}; public preview read; article={article['url'].rsplit('/',1)[-1]}"

def check(name, fn):
    try:
        value = fn()
        return f'{name}: OK; ' + (f'results={len(value)}' if isinstance(value, list) else value)
    except Exception as exc:
        return f'{name}: unavailable ({type(exc).__name__})'

checks = [
    ('Internet Archive sample OCR', lambda: f"characters={len(internet_archive.read_text('frenchenglishmed00gorduoft')['text'])}"),
    ('Wikisource selected revision', wiki),
    ('Official Shamela MCP and page', shamela_live),
    ('Turath MCP and selected page', turath_live),
    ('Alexandria Archive MCP and preview', alexandria_live),
    ('OpenITI index history search', lambda: f"matches={openiti.search('تاريخ الطبري')['total']}"),
    ('OpenITI selected text', lambda: f"characters={len(openiti.read_text('data/0370CaribQurtubi/0370CaribQurtubi.SilaTarikhTabari/0370CaribQurtubi.SilaTarikhTabari.JK011178-ara1.completed')['text'])}"),
    ('DOAJ Baghdad', lambda: catalogs.doaj('Baghdad')),
    ('OpenAlex Baghdad no key', lambda: catalogs.openalex('Baghdad')),
    ('WDL Baghdad', lambda: catalogs.loc('Baghdad', 'world-digital-library')),
    ('Chronicling America Baghdad', lambda: catalogs.loc('Baghdad', 'chronicling-america')),
    ('Mali manuscripts Timbuktu', lambda: catalogs.loc('Timbuktu', 'islamic-manuscripts-from-mali')),
    ('National Archives Palestine', lambda: catalogs.national_archives('Palestine')),
]
with concurrent.futures.ThreadPoolExecutor(max_workers=len(checks)) as pool:
    for result in pool.map(lambda item: check(*item), checks):
        print('::notice file=tests/live_windows_sources.py,line=1::' + result)
