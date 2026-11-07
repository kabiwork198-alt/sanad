"""Exercise actual local HTTP/token/backend with mocked external adapters."""
import os, subprocess, sys, tempfile, threading, time, urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
root=Path(__file__).resolve().parents[1]
calls=[];lock=threading.Lock()
def note(name, q):
    with lock: calls.append((name,q))
    time.sleep(.01)
def crossref(q):
    note('Crossref',q)
    if q=='ابن خلدون': raise urllib.error.HTTPError('https://api.crossref.org',429,'rate',{},None)
    return [{'title':'record','url':'https://example.org/item','author':'','doi':'test'}]
def openlibrary(q):
    note('Open Library',q)
    return [{'title':'record','url':'https://example.org/item','author':'','year':'1400'}]
def other(name):
    def f(q,*args):
        note(name,q)
        return [{'title':'record','url':'https://example.org/item','author':'','detail':'test','access':'record'}]
    return f
with tempfile.TemporaryDirectory() as folder, patch.object(app,'search_crossref',crossref), patch.object(app,'search_openlibrary',openlibrary), patch.object(app,'search_commons',other('Commons')), patch.object(app.wikipedia,'citations',other('Wikipedia')), patch.object(app.catalogs,'wikisource',other('Wikisource ar')), patch.object(app.catalogs,'wikisource_other',other('Wikisource other')), patch.object(app.catalogs,'internet_archive',other('Archive')), patch.object(app.catalogs,'doaj',other('DOAJ')), patch.object(app.catalogs,'openalex',other('OpenAlex')), patch.object(app.catalogs,'loc',other('LOC')), patch.object(app.catalogs,'national_archives',other('National archives')):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
        subprocess.run(['node','tests/ui_research_real_backend.cjs'],env=env,cwd=root,check=True,timeout=90)
        assert sum(n=='Crossref' for n,q in calls)==1, calls
        assert any(q=='ابن خلدون البدايات' for n,q in calls)
        assert any(q=='ابن خلدون المخطوطات' and n=='Archive' for n,q in calls)
        assert any(q=='ابن خلدون المعلمون' for n,q in calls)
    finally:server.shutdown();server.server_close();thread.join()
