"""Exercise OCR workflow through real local HTTP with mocked Internet Archive."""
import hashlib, json, os, subprocess, sys, tempfile, threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import app
raw='نص تجريبي\nعبارة موثقة للمراجعة'.encode()
metadata={'metadata':{'identifier':'sample','mediatype':'texts'},'files':[{'name':'sample_djvu.txt','size':str(len(raw)),'sha1':hashlib.sha1(raw).hexdigest()}]}
def read(url, limit):
    if url=='https://archive.org/metadata/sample':return json.dumps(metadata).encode()
    if url=='https://archive.org/cors/sample/sample_djvu.txt':return raw
    raise ValueError('Unexpected URL')
with tempfile.TemporaryDirectory() as folder, mock.patch('sanad.internet_archive.read_bytes',new=read):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3'
    server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{app.PORT}/'
        subprocess.run(['node','tests/ui_archive.cjs'],env=env,cwd=Path(__file__).resolve().parents[1],check=True,timeout=90)
    finally:server.shutdown();server.server_close();thread.join()
