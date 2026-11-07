"""Run historical citation and date UI tests in static and local modes."""
import functools, os, subprocess, sys, tempfile, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import app
root=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
with tempfile.TemporaryDirectory() as folder:
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    for kind in ('browser','local'):
        handler=functools.partial(Quiet,directory=str(root)) if kind=='browser' else app.Handler
        server=ThreadingHTTPServer(('127.0.0.1',0),handler);app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
            print('historical citations mode:',kind,flush=True)
            subprocess.run(['node','tests/ui_history.cjs'],env=env,cwd=root,check=True,timeout=90)
        finally:server.shutdown();server.server_close();thread.join()
