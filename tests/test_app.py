import json
import sqlite3
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest import mock
from http.server import ThreadingHTTPServer
from sanad import app


def project():
    return {'id':'a'*32, 'title':'اختبار', 'signals':[], 'sources':[], 'claims':[], 'scenes':[]}


class SanadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_data, self.old_db = app.DATA, app.DB
        app.DATA = Path(self.tmp.name)
        app.DB = app.DATA / 'test.sqlite3'

    def tearDown(self):
        app.DATA, app.DB = self.old_data, self.old_db
        self.tmp.cleanup()

    def test_frozen_app_keeps_data_outside_temporary_bundle(self):
        bundle = Path(self.tmp.name) / 'temporary-bundle'
        local = Path(self.tmp.name) / 'local-app-data'
        with mock.patch.object(app.sys, 'frozen', True, create=True), \
             mock.patch.object(app.sys, '_MEIPASS', str(bundle), create=True), \
             mock.patch.dict(app.os.environ, {'LOCALAPPDATA': str(local)}, clear=True):
            root, data = app.runtime_paths()
        self.assertEqual(root, bundle.resolve())
        self.assertEqual(data, (local / 'SanadStudio').resolve())
        self.assertNotEqual(data.parent, root)

    def test_frozen_app_respects_explicit_data_directory(self):
        target = Path(self.tmp.name) / 'other-data'
        with mock.patch.object(app.sys, 'frozen', True, create=True), \
             mock.patch.dict(app.os.environ, {'SANAD_DATA_DIR': str(target)}, clear=True):
            _, data = app.runtime_paths()
        self.assertEqual(data, target.resolve())

    def test_save_and_read_unicode(self):
        p = project()
        p['_rev'] = app.save_project(p)
        self.assertEqual(app.all_projects()[0]['title'], 'اختبار')
        p['title'] = 'تعديل'
        app.save_project(p)
        self.assertEqual(len(app.all_projects()), 1)
        self.assertEqual(app.all_projects()[0]['title'], 'تعديل')

    def test_database_connections_are_closed_after_use(self):
        db = app.connect()
        with mock.patch('sanad.app.connect', return_value=db):
            app.save_project(project())
        with self.assertRaises(sqlite3.ProgrammingError):
            db.execute('SELECT 1')
        db = app.connect()
        with mock.patch('sanad.app.connect', return_value=db):
            app.all_projects()
        with self.assertRaises(sqlite3.ProgrammingError):
            db.execute('SELECT 1')

    def test_verified_claim_needs_existing_source_and_location(self):
        p = project()
        p['claims'] = [{'text':'ادعاء', 'status':'مدعوم'}]
        with self.assertRaises(ValueError): app.save_project(p)
        p['sources'] = [{'id':'b'*32, 'title':'كتاب'}]
        p['claims'][0].update(sourceId='b'*32, location='ص ١٠')
        app.save_project(p)
        p['sources'] = []
        with self.assertRaises(ValueError): app.save_project(p)

    def test_malformed_import_rejected(self):
        for bad in [None, {}, {'id':'bad', 'title':'x'}, dict(project(), sources=[{'id':'bad'}]), dict(project(), claims=[{'status':'مدعوم', 'location':[]}])]:
            with self.assertRaises(ValueError): app.validate_project(bad)

    def test_crossref_search_mapping(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'message': {'items': [{'title':['Book'], 'author':[{'given':'A','family':'B'}], 'DOI':'10.1/test', 'URL':'https://doi.org/10.1/test'}]}}).encode()
        with mock.patch('sanad.app.urllib.request.urlopen', return_value=response):
            result = app.search_crossref('ابن خلدون')
        self.assertEqual(result[0]['title'], 'Book')
        self.assertEqual(result[0]['author'], 'A B')

    def test_youtube_search_mapping_and_validation(self):
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps({'items': [{'id': {'videoId':'abcdefghijk'}, 'snippet': {'title':'Example', 'channelTitle':'Channel', 'publishedAt':'2026-01-01'}}, {'id': {'videoId':'invalid'}, 'snippet': {}}]}).encode()
        with mock.patch('sanad.app.urllib.request.urlopen', return_value=response):
            result = app.search_youtube('history', 'local-test-key')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['url'], 'https://www.youtube.com/watch?v=abcdefghijk')
        with self.assertRaises(ValueError): app.search_youtube('', 'key')
        with self.assertRaises(ValueError): app.search_youtube('history', '')

    def test_storage_and_unexpected_errors_return_safe_json(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        old_port=app.PORT; app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.addCleanup(thread.join,2);self.addCleanup(setattr,app,'PORT',old_port);self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        base=f'http://127.0.0.1:{app.PORT}';headers={'X-Sanad-Token':app.TOKEN,'Origin':base,'Content-Type':'application/json'}
        with mock.patch('sanad.app.save_project',side_effect=sqlite3.OperationalError('secret local path')):
            req=urllib.request.Request(base+'/api/save',data=json.dumps({'project':project()}).encode(),headers=headers)
            with self.assertRaises(urllib.error.HTTPError) as cm:urllib.request.urlopen(req)
            self.assertEqual(cm.exception.code,503);self.assertNotIn('secret',cm.exception.read().decode())
        with mock.patch('sanad.app.openiti.read_text',side_effect=RuntimeError('secret service response')):
            req=urllib.request.Request(base+'/api/openiti/read',data=b'{}',headers=headers)
            with self.assertRaises(urllib.error.HTTPError) as cm:urllib.request.urlopen(req)
            self.assertEqual(cm.exception.code,500);self.assertNotIn('secret',cm.exception.read().decode())
        with mock.patch('sanad.app.all_projects',side_effect=sqlite3.DatabaseError('secret')):
            req=urllib.request.Request(base+'/api/projects',headers={'X-Sanad-Token':app.TOKEN})
            with self.assertRaises(urllib.error.HTTPError) as cm:urllib.request.urlopen(req)
            self.assertEqual(cm.exception.code,503);self.assertNotIn('secret',cm.exception.read().decode())

    def test_topic_http_rate_limit_is_reported_without_retry(self):
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler); old_port=app.PORT; app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        self.addCleanup(thread.join,2);self.addCleanup(setattr,app,'PORT',old_port);self.addCleanup(server.server_close);self.addCleanup(server.shutdown)
        base=f'http://127.0.0.1:{app.PORT}'
        error=urllib.error.HTTPError('https://ar.wikipedia.org/w/api.php',429,'limit',{},None)
        with mock.patch('sanad.wikipedia.topics',side_effect=error) as fetch:
            req=urllib.request.Request(base+'/api/topics',data=b'{}',headers={'X-Sanad-Token':app.TOKEN,'Origin':base,'Content-Type':'application/json'})
            with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(req)
            self.assertEqual(cm.exception.code,502); self.assertIn('HTTP 429',json.loads(cm.exception.read())['error']);fetch.assert_called_once()

    def test_http_token_origin_host_and_save(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), app.Handler)
        old_port = app.PORT
        app.PORT = server.server_port
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(thread.join, 2)
        self.addCleanup(setattr, app, 'PORT', old_port)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        base = f'http://127.0.0.1:{app.PORT}'
        req = urllib.request.Request(base+'/api/save', data=json.dumps({'project':project()}).encode(), headers={'Content-Type':'application/json', 'Origin':base})
        with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code, 403)
        req.add_header('X-Sanad-Token', app.TOKEN)
        with urllib.request.urlopen(req) as r: self.assertEqual(r.status,200)
        req = urllib.request.Request(base+'/api/projects', headers={'X-Sanad-Token':app.TOKEN})
        with urllib.request.urlopen(req) as r: self.assertEqual(json.load(r)['projects'][0]['title'], 'اختبار')
        payload = project()
        payload['sources'] = [{'id':'b'*32, 'title':'كتاب'}]
        payload['claims'] = [{'text':'ادعاء يراجعه الباحث', 'status':'مدعوم', 'sourceId':'b'*32, 'location':'ص ١٠'}]
        req = urllib.request.Request(base+'/api/draft', data=json.dumps({'project':payload}).encode(), headers={'X-Sanad-Token':app.TOKEN,'Content-Type':'application/json','Origin':base})
        with urllib.request.urlopen(req) as r:
            draft = json.load(r)
            self.assertIn('ادعاء يراجعه الباحث', draft['text'])
            self.assertEqual(draft['included'], 1)
        req = urllib.request.Request(base+'/api/analyze', data=json.dumps({'project':payload}).encode(), headers={'X-Sanad-Token':app.TOKEN,'Content-Type':'application/json','Origin':base})
        with urllib.request.urlopen(req) as r: self.assertIn('لا يثبت صحة', json.load(r)['warning'])
        path = 'data/a/b/c'
        req = urllib.request.Request(base+'/api/openiti/read', data=json.dumps({'path':path}).encode(), headers={'X-Sanad-Token':app.TOKEN,'Content-Type':'application/json','Origin':base})
        with mock.patch('sanad.app.openiti.read_text', return_value={'text':'######OpenITI#\nنص','url':'https://github.com/OpenITI/RELEASE','warning':'راجع الحقوق'}) as fetch:
            with urllib.request.urlopen(req) as r: self.assertIn('نص', json.load(r)['text'])
            fetch.assert_called_once_with(path)
        req = urllib.request.Request(base+'/api/save', data=b'{}', headers={'X-Sanad-Token':app.TOKEN,'Origin':'http://evil.example'})
        with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code,403)
        with urllib.request.urlopen(base+'/vendor/ocr/data/ara.traineddata.gz') as r:
            self.assertEqual(r.status, 200)
            self.assertEqual(r.headers.get_content_type(), 'application/octet-stream')
            self.assertTrue(r.read().startswith(b'\x1f\x8b'))
        with urllib.request.urlopen(base+'/') as r:
            policy=r.headers['Content-Security-Policy']
            self.assertIn("worker-src 'self'",policy)
            self.assertIn("'wasm-unsafe-eval'",policy)
            self.assertIn("connect-src 'self' data:",policy)
        with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(base+'/vendor/ocr/unknown')
        self.assertEqual(cm.exception.code,404)
        req = urllib.request.Request(base+'/', headers={'Host':'evil.example'})
        with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code,403)

if __name__ == '__main__': unittest.main()
