import os, subprocess, sys, tempfile, threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import app
sample={'count':1,'results':[{'book_id':123,'meta':{'page_id':456,'page':39,'vol':'2','book_name':'تاريخ بغداد','author_name':'المؤلف'},'snip':'معاينة فتح بغداد'}]}
page={'book_id':123,'page_id':456,'text':'مقدمة\nفتح بغداد للمراجعة','meta':{'page':39,'vol':'2'}}
def call(session,tool,args):return sample if tool=='search_turath' else page
with tempfile.TemporaryDirectory() as folder, mock.patch('sanad.turath.Session.call',new=call):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{app.PORT}/'
        subprocess.run(['node','tests/ui_turath.cjs'],env=env,cwd=Path(__file__).resolve().parents[1],check=True,timeout=90)
    finally:server.shutdown();server.server_close();thread.join()
