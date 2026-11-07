"""Real local API and SQLite, with a tiny ZIP standing in for the 2.86 GB release."""
import hashlib, io, os, subprocess, sys, tempfile, threading, zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app,openiti_corpus as c
from tests.test_openiti_corpus import fixture,Resp
zipdata,meta=fixture()
# Enough matching books to exercise real UI pagination, not just a mocked status.
buf=io.BytesIO()
with zipfile.ZipFile(io.BytesIO(zipdata)) as original,zipfile.ZipFile(buf,'w',zipfile.ZIP_DEFLATED) as out:
    for name in original.namelist():out.writestr(name,original.read(name))
    for n in range(3,103):
        uri=f'{n:04d}Author.Book.Edition-ara1';out.writestr(uri,'######OpenITI#\nبغداد مدينة تاريخية')
        meta+=(uri+'\tمؤلف\tAuthor\tكتاب\tBook\tطبعة\n').encode()
zipdata=buf.getvalue()
def response(req,timeout=0):
    if req.full_url==c.META_URL:return Resp(meta)
    if req.full_url==c.ARCHIVE_URL:return Resp(zipdata)
    raise AssertionError(req.full_url)
with tempfile.TemporaryDirectory() as folder, patch.object(c,'ARCHIVE_SIZE',len(zipdata)),patch.object(c,'ARCHIVE_MD5',hashlib.md5(zipdata).hexdigest()),patch.object(c,'META_SIZE',len(meta)),patch.object(c,'META_MD5',hashlib.md5(meta).hexdigest()),patch('urllib.request.urlopen',new=response):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3';manager=c.Corpus(app.DATA)
    with patch('sanad.app.corpus_manager',return_value=manager):
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port;thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
            subprocess.run(['node','tests/ui_openiti_corpus.cjs'],env=env,cwd=Path(__file__).resolve().parents[1],check=True,timeout=90)
        finally:server.shutdown();server.server_close();thread.join()
