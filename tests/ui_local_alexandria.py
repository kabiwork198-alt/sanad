import os, subprocess, sys, tempfile, threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
sample={'results':[{'category':'article','title':'تاريخ الإسكندرية','id':2,'url':'https://www.alexandria-archive.com/article/2','snippet':'نبذة للمراجعة'}]}
article={'id':2,'titleAr':'تاريخ الإسكندرية','author':'المؤلف','published':'2025-01-01','url':'https://www.alexandria-archive.com/article/2','readMoreUrl':'https://www.alexandria-archive.com/article/2','access':{'full':False,'requiresSignIn':True},'provenance':{'rights':'حقوق محفوظة'},'_mcp_content':[{'type':'text','text':'هذه نبذة عامة للمراجعة'}]}
def call(session,tool,args):return sample if tool=='search_archive' else article
with tempfile.TemporaryDirectory() as folder, mock.patch('sanad.alexandria_archive.Session.call',new=call):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3';server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{app.PORT}/'
        subprocess.run(['node','tests/ui_alexandria.cjs'],env=env,cwd=Path(__file__).resolve().parents[1],check=True,timeout=90)
    finally:server.shutdown();server.server_close();thread.join()
