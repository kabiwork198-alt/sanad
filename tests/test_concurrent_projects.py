"""Prevent stale local windows from overwriting or deleting another save."""
import concurrent.futures
import json
import http.client
from http.server import ThreadingHTTPServer
import tempfile
import threading
import unittest
from pathlib import Path
from contextlib import closing
from sanad import app

class ProjectConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        old_data,old_db=app.DATA,app.DB
        self.addCleanup(setattr,app,'DATA',old_data);self.addCleanup(setattr,app,'DB',old_db)
        app.DATA=Path(self.temp.name);app.DB=app.DATA/'test.sqlite3'
        self.project={'id':'a'*32,'title':'بحث','sources':[],'claims':[]}
    def test_legacy_migration_conflicts_delete_and_recovery(self):
        raw=json.dumps(self.project,ensure_ascii=False)
        with closing(app.connect()) as db,db:
            db.execute('INSERT INTO projects (id,title,updated,data) VALUES (?,?,?,?)',(self.project['id'],self.project['title'],1,raw))
        old=app.all_projects()[0];self.assertEqual(old['_rev'],'legacy')
        new=dict(old,title='النسخة المحفوظة');version=app.save_project(new)
        with self.assertRaises(app.ProjectConflict):app.save_project(dict(old,title='تعديل قديم'))
        with self.assertRaises(app.ProjectConflict):app.delete_project(old['id'],old['_rev'])
        self.assertEqual(app.all_projects()[0]['title'],'النسخة المحفوظة')
        copy=dict(old,id='b'*32,title='نسخة مستعادة');del copy['_rev']
        app.save_project(copy);self.assertEqual(len(app.all_projects()),2)
        app.delete_project(new['id'],version)
        with self.assertRaises(app.ProjectConflict):app.save_project(dict(old,_rev=version))
        with self.assertRaises(app.ProjectConflict):app.delete_project(new['id'],version)
    def test_concurrent_saves_only_one_commits(self):
        initial=app.save_project(self.project);barrier=threading.Barrier(2)
        def writer(title):
            candidate=dict(self.project,title=title,_rev=initial);barrier.wait()
            try:app.save_project(candidate);return 'saved'
            except app.ProjectConflict:return 'conflict'
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results=list(pool.map(writer,['أ','ب']))
        self.assertEqual(sorted(results),['conflict','saved'])
        self.assertIn(app.all_projects()[0]['title'],('أ','ب'))
    def test_http_conflict_returns_409_without_replacement(self):
        revision=app.save_project(self.project)
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);old_port=app.PORT;app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            body=json.dumps({'project':dict(self.project,title='نسخة قديمة',_rev='0'*32)}).encode()
            conn=http.client.HTTPConnection('127.0.0.1',app.PORT,timeout=5)
            conn.request('POST','/api/save',body,{'Content-Type':'application/json','Origin':f'http://127.0.0.1:{app.PORT}','X-Sanad-Token':app.TOKEN})
            result=conn.getresponse();message=json.loads(result.read());conn.close()
            self.assertEqual(result.status,409);self.assertIn('لم تُستبدل',message['error'])
            self.assertEqual(app.all_projects()[0]['_rev'],revision)
        finally:
            server.shutdown();server.server_close();thread.join();app.PORT=old_port
    def test_import_resets_revision_for_independent_copy(self):
        p=dict(self.project,_rev='f'*32);app.import_projects([p]);actual=app.all_projects()[0]
        self.assertNotEqual(actual['_rev'],p['_rev']);self.assertEqual(actual['title'],p['title'])
