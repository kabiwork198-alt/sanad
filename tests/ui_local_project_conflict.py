"""Two-tab conflict checks with actual local/browser project persistence."""
import functools, os, subprocess, sys, tempfile, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root))
from sanad import app
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
with tempfile.TemporaryDirectory() as folder:
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    for mode in ('browser','local'):
        handler=functools.partial(Quiet,directory=str(root)) if mode=='browser' else app.Handler
        server=ThreadingHTTPServer(('127.0.0.1',0),handler);app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
            print('project conflict:',mode,flush=True);subprocess.run(['node','tests/ui_project_conflict.cjs'],env=env,cwd=root,check=True,timeout=90)
        finally:server.shutdown();server.server_close();thread.join()
