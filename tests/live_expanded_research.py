"""Live diagnostic: static app locally, public catalog requests from the browser."""
import functools, os, subprocess, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
root=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
    env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
    subprocess.run(['node','tests/live_expanded_research.cjs'],env=env,cwd=root,check=True,timeout=260)
finally:server.shutdown();server.server_close();thread.join()
