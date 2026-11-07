import base64
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from sanad import app, library, wikipedia, catalogs


def simple_pdf():
    stream = b'BT /F1 12 Tf 72 720 Td (A documented excerpt) Tj ET'
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'\nendstream',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ]
    data = b'%PDF-1.4\n'
    offsets = [0]
    for i, obj in enumerate(objects, 1):
        offsets.append(len(data)); data += str(i).encode() + b' 0 obj\n' + obj + b'\nendobj\n'
    xref = len(data)
    data += f'xref\n0 {len(objects)+1}\n'.encode() + b'0000000000 65535 f \n'
    for n in offsets[1:]: data += f'{n:010d} 00000 n \n'.encode()
    return data + f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()


class LibraryTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self): self.tmp.cleanup()

    def test_import_and_search_arabic_utf8(self):
        content = 'السطر الأول\nهذا نَصٌّ للتجربة\n'.encode('utf-8')
        doc = library.import_document(self.root, '../book.txt', base64.b64encode(content).decode())
        self.assertEqual(doc['name'], 'book.txt')
        result = library.search_document(self.root, doc['id'], 'نص')
        self.assertEqual(result['matches'][0]['location'], 'السطر 2')
        self.assertIn('للتجربة', result['matches'][0]['text'])
        self.assertTrue((self.root / 'library' / (doc['id'] + '.bin')).exists())

    def test_rejects_invalid_or_unsupported_files(self):
        for name, payload in [('a.exe', 'eA=='), ('x.pdf', 'eA=='), ('x.txt', '!')]:
            with self.assertRaises(ValueError): library.import_document(self.root, name, payload)
        with self.assertRaises(ValueError): library.search_document(self.root, '../secret', 'hello')

    @unittest.skipUnless(importlib.util.find_spec('pypdf'), 'pypdf not installed')
    def test_pdf_extraction_records_page(self):
        doc = library.import_document(self.root, 'test.pdf', base64.b64encode(simple_pdf()).decode())
        result = library.search_document(self.root, doc['id'], 'documented')
        self.assertEqual(result['matches'][0]['location'], 'صفحة PDF 1')
        self.assertIn('documented excerpt', result['matches'][0]['text'])

    @unittest.skipUnless(importlib.util.find_spec('pypdf'), 'pypdf not installed')
    def test_encrypted_pdf_is_not_bypassed(self):
        from pypdf import PdfWriter
        import io
        writer = PdfWriter(); writer.add_blank_page(width=100, height=100); writer.encrypt('secret')
        output = io.BytesIO(); writer.write(output)
        doc = library.import_document(self.root, 'protected.pdf', base64.b64encode(output.getvalue()).decode())
        with self.assertRaisesRegex(ValueError, 'محمي'): library.search_document(self.root, doc['id'], 'test')


class FederatedSearchTest(unittest.TestCase):
    def test_partial_provider_error_is_visible(self):
        item = {'title': 'Book', 'url': 'https://example.com', 'author': '', 'year': '2000'}
        with mock.patch('sanad.app.search_crossref', side_effect=OSError('network')), \
             mock.patch('sanad.app.search_openlibrary', return_value=[item]), \
             mock.patch('sanad.app.search_commons', return_value=[]), \
             mock.patch('sanad.app.wikipedia.citations', return_value=[]), \
             mock.patch('sanad.app.catalogs.wikisource', return_value=[]), \
             mock.patch('sanad.app.catalogs.internet_archive', return_value=[]):
            result = app.research_search('example')
        self.assertEqual(len(result['results']), 1)
        self.assertEqual(result['results'][0]['provider'], 'Open Library')
        self.assertIn('تعذر', result['providers'][0]['status'])
        self.assertIn('لا يشمل', result['warning'])

    def test_commons_only_valid_links_and_reports_license(self):
        payload = {'query': {'pages': [{'title': 'File:Example.jpg', 'imageinfo': [{'descriptionurl': 'https://commons.wikimedia.org/wiki/File:Example.jpg', 'extmetadata': {'LicenseShortName': {'value': 'CC BY'}}}]}, {'title': 'Bad', 'imageinfo': [{'descriptionurl': 'https://evil.example/a'}]}]}}
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload).encode()
        with mock.patch('sanad.app.urllib.request.urlopen', return_value=response):
            found = app.search_commons('history')
        self.assertEqual(len(found), 1)
        self.assertIn('CC BY', found[0]['detail'])


class CatalogTest(unittest.TestCase):
    def test_wikisource_does_not_claim_reading(self):
        data={'query':{'search':[{'pageid':39899,'title':'تاريخ الطبري'}, {'pageid':'bad','title':'fake'}]}}
        with mock.patch('sanad.catalogs.get_json',return_value=data):
            items=catalogs.wikisource('الطبري')
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]['url'],'https://ar.wikisource.org/?curid=39899')
        self.assertIn('لم يُقرأ',items[0]['access'])

    def test_archive_validates_identifiers_and_quotes_query(self):
        data={'response':{'docs':[{'identifier':'good-item','title':'Book','creator':['A','B'],'year':2000},{'identifier':'../bad','title':'bad'}]}}
        with mock.patch('sanad.catalogs.get_json',return_value=data) as fetch:
            items=catalogs.internet_archive('A "title"')
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]['url'],'https://archive.org/details/good-item')
        self.assertIn('لا يضمن',items[0]['access'])
        self.assertIn('\\"title\\"',fetch.call_args.args[1]['q'])


class WikipediaTest(unittest.TestCase):
    def test_topics_only_accepts_article_ids(self):
        payload = {'query': {'categorymembers': [{'pageid':1319, 'title':'الخوارزمي'}, {'pageid':'bad', 'title':'fake'}]}}
        with mock.patch('sanad.wikipedia.get_json', return_value=payload):
            result = wikipedia.topics()
        self.assertEqual(result, [{'title':'الخوارزمي', 'url':'https://ar.wikipedia.org/?curid=1319'}])

    def test_citations_preserve_the_origin_and_do_not_claim_reading(self):
        search = {'query': {'search': [{'pageid':1319, 'title':'الخوارزمي'}]}}
        parsed = {'parse': {'text':'<ol><li id="cite&#95;note-1"><span>اسم المرجع <b>صفحة ١٠</b></span></li><li>irrelevant</li></ol>'}}
        with mock.patch('sanad.wikipedia.get_json', side_effect=[search, parsed]):
            result = wikipedia.citations('الخوارزمي')
        self.assertEqual(len(result), 1)
        self.assertIn('cite_note-1', result[0]['url'])
        self.assertIn('صفحة ١٠', result[0]['title'])
        self.assertIn('لم يُقرأ', result[0]['access'])


class ChronologyTest(unittest.TestCase):
    def test_old_project_still_works_and_dates_validate(self):
        project = {'id':'a'*32, 'title':'Test', 'sources':[{'id':'b'*32}], 'claims':[], 'signals':[], 'scenes':[]}
        app.validate_project(project)
        project['events'] = [{'title':'event','sortYear':'950','sourceId':'b'*32}]
        app.validate_project(project)
        project['events'][0]['sortYear'] = '100 هـ'
        with self.assertRaises(ValueError): app.validate_project(project)
        project['events'][0]['sortYear'] = '950'
        project['events'][0]['sourceId'] = 'c'*32
        with self.assertRaises(ValueError): app.validate_project(project)

if __name__ == '__main__': unittest.main()
