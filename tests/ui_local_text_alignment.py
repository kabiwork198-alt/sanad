"""Run the local two-passage comparison in browser and local modes with disposable storage."""
import functools
import os
import subprocess
import sys
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import app

root = Path(__file__).resolve().parents[1]
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

with tempfile.TemporaryDirectory() as folder:
    app.DATA = Path(folder)
    app.DB = app.DATA / 'alignment-test.sqlite3'
    for mode in ('browser', 'local'):
        handler = functools.partial(Quiet, directory=str(root)) if mode == 'browser' else app.Handler
        server = ThreadingHTTPServer(('127.0.0.1', 0), handler)
        app.PORT = server.server_port
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            env = os.environ.copy()
            env['SANAD_TEST_ORIGIN'] = f'http://127.0.0.1:{server.server_port}/'
            print('text alignment:', mode, flush=True)
            result = subprocess.run(['node', 'tests/ui_text_alignment.cjs'], env=env, cwd=root, capture_output=True, text=True, timeout=90)
            print(result.stdout, end='', flush=True)
            print(result.stderr, end='', file=sys.stderr, flush=True)
            if result.returncode:
                if os.environ.get('GITHUB_ACTIONS'):
                    detail = (result.stderr or result.stdout or 'No output').replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
                    print(f'::error file=tests/ui_text_alignment.cjs::Alignment test failed in {mode}: {detail}', flush=True)
                raise subprocess.CalledProcessError(result.returncode, result.args)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()
