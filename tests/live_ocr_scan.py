"""Diagnostic; only the sample download requires internet, OCR remains local."""
import functools, os, subprocess, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
root=Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(root)))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
try:
    env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{server.server_port}/'
    subprocess.run(['node','tests/probe_ocr_real.cjs'],env=env,cwd=root,check=True,timeout=160)
finally:server.shutdown();server.server_close();thread.join()
