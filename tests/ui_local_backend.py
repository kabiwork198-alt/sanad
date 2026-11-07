"""One-shot mobile UI test against the real loopback Python server, in temporary storage."""
import os
import subprocess
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import app

with tempfile.TemporaryDirectory() as folder:
    app.DATA = Path(folder)
    app.DB = app.DATA / 'test.sqlite3'
    server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
    app.PORT = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = os.environ.copy()
        env['SANAD_TEST_ORIGIN'] = f'http://127.0.0.1:{app.PORT}/'
        subprocess.run(['node', 'tests/ui_comparison.cjs'], env=env, cwd=Path(__file__).resolve().parents[1], check=True, timeout=90)
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
