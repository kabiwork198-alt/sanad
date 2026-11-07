"""Test the real local HTTP path with a mocked QDL upstream response."""
import json, os, subprocess, sys, tempfile, threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import MagicMock, patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sanad import app
with tempfile.TemporaryDirectory() as folder:
    app.DATA = Path(folder); app.DB = app.DATA / 'test.sqlite3'
    server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler); app.PORT = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    response=MagicMock(); response.__enter__.return_value.read.return_value=json.dumps({'within':{'total':2},'hits':[{'item-url':'81055/vdc_100064303797.0x000004','match':'Dhofar'},{'item-url':'../bad'}]}).encode()
    opener=MagicMock(); opener.open.return_value=response
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{app.PORT}/'
        with patch('sanad.qdl.urllib.request.build_opener',return_value=opener):
            subprocess.run(['node','tests/ui_qdl.cjs'],env=env,cwd=Path(__file__).resolve().parents[1],check=True,timeout=90)
    finally:
        server.shutdown();server.server_close();thread.join()
