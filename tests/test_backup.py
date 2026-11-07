import base64
import tempfile
import unittest
from pathlib import Path
from sanad import app, library


class BackupTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.old_data, self.old_db = app.DATA, app.DB
        app.DATA = Path(self.tmp.name)
        app.DB = app.DATA / 'db.sqlite3'

    def tearDown(self):
        app.DATA, app.DB = self.old_data, self.old_db
        self.tmp.cleanup()

    def test_export_rejects_missing_invalid_and_corrupt_files(self):
        content = 'تاريخ بغداد'.encode()
        doc = library.import_document(app.DATA, 'book.txt', base64.b64encode(content).decode())
        exported = library.export_document(app.DATA, doc['id'])
        self.assertEqual(base64.b64decode(exported['content']), content)
        self.assertEqual(exported['size'], len(content))
        for ident in ['../../bad', 'f' * 64]:
            with self.assertRaises(ValueError): library.export_document(app.DATA, ident)
        (app.DATA / 'library' / (doc['id'] + '.bin')).write_bytes(b'tampered')
        with self.assertRaises(ValueError): library.export_document(app.DATA, doc['id'])
        with self.assertRaises(ValueError): library.import_document(app.DATA, 'book.txt', base64.b64encode(content).decode())

    def test_all_projects_are_validated_before_atomic_insert(self):
        def project(ident, title='test'):
            return {'id': ident * 32, 'title': title, 'sources': [], 'claims': []}
        app.save_project(project('a', 'existing'))
        with self.assertRaises(ValueError): app.import_projects([project('b'), project('c', '')])
        self.assertEqual(len(app.all_projects()), 1)
        with self.assertRaises(ValueError): app.import_projects([project('b'), project('a', 'overwritten')])
        self.assertEqual([p['title'] for p in app.all_projects()], ['existing'])
        with self.assertRaises(ValueError): app.import_projects([project('b'), project('b')])
        self.assertEqual(app.import_projects([project('b'), project('c')])['count'], 2)
        self.assertEqual(len(app.all_projects()), 3)

if __name__ == '__main__': unittest.main()
