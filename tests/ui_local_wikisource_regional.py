"""Exercise regional Wikisource search and rendered text in both editions."""
import functools, os, subprocess, sys, tempfile, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
root=Path(__file__).resolve().parents[1]
examples={'fa':('تاریخ ایران','متن تاریخ ایران'),'tr':('Tarih kitabı','Tarih kitabı örnek')}
def get_json(host,params):
    language=host.split('//')[1].split('.')[0]
    if language not in examples: raise ValueError('unexpected host')
    title,text=examples[language]
    if params['action']=='parse':return {'parse':{'pageid':123,'revid':456,'title':title,'text':f'<div><style>HIDDEN_STYLE</style><p>{text}</p></div>'}}
    return {'query':{'search':[{'pageid':123,'title':title}]}}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
with tempfile.TemporaryDirectory() as folder, patch('sanad.catalogs.get_json',new=get_json):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    for mode in ('browser','local'):
        handler=functools.partial(Quiet,directory=str(root)) if mode=='browser' else app.Handler
        server=ThreadingHTTPServer(('127.0.0.1',0),handler);app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
            print('regional Wikisource mode:',mode,flush=True)
            subprocess.run(['node','tests/ui_wikisource_regional.cjs'],env=env,cwd=root,check=True,timeout=90)
        finally:server.shutdown();server.server_close();thread.join()
