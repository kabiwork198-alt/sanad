"""Real loopback app; mocked French Wikisource response with transcluded text."""
import os, subprocess, sys, tempfile, threading
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
html='<div><style>HIDDEN_STYLE</style><h2>Histoire des Berbères</h2><p>Les Nefouça, descendants de Nefous, formaient une des plus grandes tribus.</p><script>window.injected=true</script><p>Texte inclus depuis une page de livre.</p></div>'
def get_json(host,params):
    assert host=='https://fr.wikisource.org/w/api.php'
    if params['action']=='parse':return {'parse':{'pageid':3599134,'revid':11490985,'title':'Histoire des Berbères/Nefouça','text':html}}
    return {'query':{'search':[{'pageid':3599134,'title':'Histoire des Berbères/Nefouça'}]}}
with tempfile.TemporaryDirectory() as folder, patch('sanad.catalogs.get_json',new=get_json):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3';server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{app.PORT}/'
        subprocess.run(['node','tests/ui_wikisource_rendered.cjs'],env=env,cwd=Path(__file__).resolve().parents[1],check=True,timeout=90)
    finally:server.shutdown();server.server_close();thread.join()
