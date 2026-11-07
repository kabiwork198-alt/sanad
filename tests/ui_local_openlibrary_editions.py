"""Real local API and UI, mocked Open Library and Archive upstreams."""
import hashlib, json, os, subprocess, sys, tempfile, threading, urllib.error
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from sanad import app
raw='سطر تمهيدي\nعبارة تاريخية موثقة\n'.encode()
calls=0
def editions(host, params):
    global calls
    calls+=1
    if calls==1: raise urllib.error.URLError('test failure')
    assert host=='https://openlibrary.org/works/OL63194W/editions.json'
    if params['offset']=='20':return {'size':21,'entries':[{'key':'/books/OL99M','title':'صفحة ثانية'}]}
    return {'size':21,'entries':[{'key':'/books/OL23411889M','title':'طبعة 1916','ocaid':'sample','publish_date':'1916','publishers':['ناشر'],'languages':[{'key':'/languages/ara'}],'works':[{'key':'/works/OL63194W'}]},{'key':'/books/OL42M','title':'طبعة مقيدة','ocaid':'restricted'}]+[{'key':f'/books/OL{100+i}M'} for i in range(18)]}
def read(url,limit):
    if url.endswith('/metadata/sample'):return json.dumps({'metadata':{'identifier':'sample','mediatype':'texts'},'files':[{'name':'sample_djvu.txt','size':str(len(raw)),'sha1':hashlib.sha1(raw).hexdigest()}]}).encode()
    if url.endswith('/metadata/restricted'):return json.dumps({'metadata':{'identifier':'restricted','mediatype':'texts','lending_edition':'restricted'},'files':[]}).encode()
    if url.endswith('/cors/sample/sample_djvu.txt'):return raw
    raise AssertionError(url)
with tempfile.TemporaryDirectory() as folder, patch('sanad.catalogs.get_json',new=editions), patch('sanad.internet_archive.read_bytes',new=read), patch('sanad.app.search_openlibrary',return_value=[{'title':'تاريخ','author':'مؤلف','url':'https://openlibrary.org/works/OL63194W','year':'1900'}]):
    app.DATA=Path(folder);app.DB=app.DATA/'test.sqlite3';server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);app.PORT=server.server_port
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        env=os.environ.copy();env['SANAD_TEST_ORIGIN']=f'http://127.0.0.1:{app.PORT}/'
        subprocess.run(['node','tests/ui_openlibrary_editions.cjs'],env=env,cwd=Path(__file__).resolve().parents[1],check=True,timeout=90)
    finally:server.shutdown();server.server_close();thread.join()
