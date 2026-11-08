"""Run both browser and local paths with mocked Wikisource HTTP responses only."""
import functools, os, subprocess, sys, tempfile, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
root=Path(__file__).resolve().parents[1]
title='مقدمة ابن خلدون'
def get_json(host,params):
    assert host=='https://ar.wikisource.org/w/api.php'
    if params.get('action')=='parse':
        id=int(params['pageid'])
        if id==3942:return {'error':{'code':'missing'}}
        return {'parse':{'pageid':id,'revid':100000+id,'title':title+'/قسم '+str(id-3940),'text':f'<div><style>HIDDEN_STYLE</style><p>نص تاريخي قابل للبحث رقم {id}</p><script>window.injected=true</script></div>'}}
    if params.get('prop')=='info':return {'query':{'pages':[{'pageid':1898,'ns':0,'title':title}]}}
    if params.get('list')=='allpages' and params.get('apcontinue'):return {'query':{'allpages':[{'pageid':5000,'ns':0,'title':title+'/متابعة'}]}}
    if params.get('list')=='allpages':return {'continue':{'apcontinue':'مقدمة_ابن_خلدون/تابع'},'query':{'allpages':[{'pageid':3941+i,'ns':0,'title':title+'/قسم '+str(i+1)} for i in range(12)]}}
    raise AssertionError(params)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
with tempfile.TemporaryDirectory() as folder,patch('sanad.catalogs.get_json',new=get_json):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    for mode in ('browser','local'):
        handler=functools.partial(Quiet,directory=str(root)) if mode=='browser' else app.Handler
        server=ThreadingHTTPServer(('127.0.0.1',0),handler);app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
            print('batch test:',mode,flush=True);subprocess.run(['node','tests/ui_wikisource_batch.cjs'],env=env,cwd=root,check=True,timeout=90)
        finally:server.shutdown();server.server_close();thread.join()
