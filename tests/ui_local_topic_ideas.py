"""Test actual browser and HTTP mappings with simulated upstream responses."""
import functools, os, subprocess, sys, tempfile, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
root=Path(__file__).resolve().parents[1]
extract='أحمد بن فضلان رحالة عباسي كتب رسالة عن الرحلة ووصف المناطق والشعوب التي زارها.'
def get_json(params):
    if params.get('action')=='parse':return {'parse':{'pageid':129569,'title':'أحمد بن فضلان','revid':76515169,'tocdata':{'sections':[{'tocLevel':1,'line':'رحلة ابن فضلان'},{'tocLevel':2,'line':'اكتشاف مخطوطة مشهد'},{'tocLevel':1,'line':'المراجع'}]}}}
    return {'continue':{'gsroffset':24},'query':{'pages':[{'pageid':129569,'ns':0,'title':'أحمد بن فضلان','index':1,'extract':extract},{'pageid':1,'ns':0,'title':'قائمة الرحلات','extract':extract}]}}
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
with tempfile.TemporaryDirectory() as folder,patch('sanad.wikipedia.get_json',new=get_json):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    for mode in ('browser','local'):
        handler=functools.partial(Quiet,directory=str(root)) if mode=='browser' else app.Handler
        server=ThreadingHTTPServer(('127.0.0.1',0),handler);app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/';print('topic mode:',mode,flush=True)
            subprocess.run(['node','tests/ui_topic_ideas.cjs'],env=env,cwd=root,check=True,timeout=90)
        finally:server.shutdown();server.server_close();thread.join()
