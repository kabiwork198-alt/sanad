import json
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

    def test_save_and_read_unicode(self):
        p = project()
        app.save_project(p)
        self.assertEqual(app.all_projects()[0]['title'], 'اختبار')
        p['title'] = 'تعديل'
        app.save_project(p)
        self.assertEqual(len(app.all_projects()), 1)
        self.assertEqual(app.all_projects()[0]['title'], 'تعديل')

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
        req = urllib.request.Request(base+'/api/save', data=b'{}', headers={'X-Sanad-Token':app.TOKEN,'Origin':'http://evil.example'})
        with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code,403)
        req = urllib.request.Request(base+'/', headers={'Host':'evil.example'})
        with self.assertRaises(urllib.error.HTTPError) as cm: urllib.request.urlopen(req)
        self.assertEqual(cm.exception.code,403)

if __name__ == '__main__': unittest.main()
