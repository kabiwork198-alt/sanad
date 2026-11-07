"""Mobile UI against actual loopback backend with deterministic Shamela responses."""
import os
import subprocess
import sys
import tempfile
import threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import app

sample = {'layers':[{'results':[{'book_id':18147,'page_id':1517,'title':'كنز الدرر','author':'ابن الدواداري','preview':'معاينة'}]}]}
page = {'book_id':18147,'page_id':1517,'text':'مقدمة\nعبارة موثقة للمراجعة'}
def call(session, tool, arguments):
    return sample if tool == 'shamela_find' else page

with tempfile.TemporaryDirectory() as folder, mock.patch('sanad.shamela.Session.call', new=call):
    app.DATA = Path(folder)
    app.DB = app.DATA / 'test.sqlite3'
    server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
    app.PORT = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        env = os.environ.copy()
        env['SANAD_TEST_ORIGIN'] = f'http://127.0.0.1:{app.PORT}/'
        subprocess.run(['node', 'tests/ui_shamela.cjs'], env=env, cwd=Path(__file__).resolve().parents[1], check=True, timeout=90)
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
