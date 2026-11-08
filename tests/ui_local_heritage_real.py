"""Use real local adapters and mocked upstream service responses."""
import os, subprocess, sys, tempfile, threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
root=Path(__file__).resolve().parents[1]
header='version_uri\tauthor_ar\tauthor_lat\ttitle_ar\ttitle_lat\tdate\tstatus\ted_info\tlocal_path\n'
row='0808IbnKhaldun.X-ara1\tابن خلدون\tIbn Khaldun\tالعبر\tIbar\t0808\tpri\tطبعة\tdata/0808IbnKhaldun/0808IbnKhaldun.X/0808IbnKhaldun.X-ara1\n'
def shamela(session,tool,args):
    if tool=='shamela_find':return {'layers':[{'results':[{'book_id':18147,'page_id':1517,'title':'كتاب','author':'مؤلف','preview':'ابن خلدون'}]}]}
    return {'book_id':18147,'page_id':1517,'text':'نص صفحة ابن خلدون للمراجعة'}
def turath(session,tool,args):
    return {'results':[{'book_id':123,'meta':{'page_id':456,'book_name':'كتاب تراث','author_name':'مؤلف','vol':'2','page':'39'},'snip':'ابن خلدون'}]}
def alex(session,tool,args):
    return {'results':[{'url':'https://www.alexandria-archive.com/article/2','title':'مقال','snippet':'ابن خلدون','category':'مقال'}]}
with tempfile.TemporaryDirectory() as folder, patch('sanad.openiti.fetch_index',return_value=header+row), patch('sanad.shamela.Session.call',new=shamela), patch('sanad.turath.Session.call',new=turath), patch('sanad.alexandria_archive.Session.call',new=alex):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
        subprocess.run(['node','tests/ui_heritage_real_backend.cjs'],env=env,cwd=root,check=True,timeout=90)
    finally:server.shutdown();server.server_close();thread.join()
