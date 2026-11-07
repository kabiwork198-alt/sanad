import base64
import concurrent.futures
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from sanad import app, library, wikipedia, catalogs, workflow


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

    def test_optional_arabic_spelling_variants_and_provenance(self):
        for header in ('', '#SANAD-OCR-TEXT-1\n#SANAD-PAGE:7\n| ', '######OpenITI#\n~~'):
            content = (header + 'ا'*1200 + ' أحمد بن يحيى وابتداء الأمر').encode('utf-8')
            doc = library.import_document(self.root, 'names.txt', base64.b64encode(content).decode())
            self.assertFalse(library.search_document(self.root, doc['id'], 'احمد بن يحيي')['matches'])
            result = library.search_document(self.root, doc['id'], 'احمد بن يحيي', 'arabic-variants')
            self.assertEqual(result['match_mode'], 'arabic-variants')
            self.assertIn('أحمد بن يحيى', result['matches'][0]['text'])
            self.assertIn('أسماء مختلفة', result['warning'])
            if header.startswith('#SANAD-OCR'): self.assertIn('PDF 7', result['matches'][0]['location'])
        with self.assertRaises(ValueError): library.search_document(self.root, doc['id'], 'احمد', 'bogus')

    def test_mineru_imported_pages_search_and_marker_escape(self):
        text = '#SANAD-MINERU-TEXT-1\n#SANAD-PAGE:1\n| Baghdad historical archive\n| #SANAD-PAGE:999\n#SANAD-PAGE:2\n| Sources require careful review.\n'
        doc = library.import_document(self.root, 'mineru.txt', base64.b64encode(text.encode()).decode())
        page1 = library.search_document(self.root, doc['id'], 'Baghdad')
        page2 = library.search_document(self.root, doc['id'], 'careful review')
        fake = library.search_document(self.root, doc['id'], 'SANAD-PAGE:999')
        self.assertIn('PDF 1', page1['matches'][0]['location'])
        self.assertIn('PDF 2', page2['matches'][0]['location'])
        self.assertIn('PDF 1', fake['matches'][0]['location'])
        self.assertIn('الأصل', page2['warning'])

    def test_paginated_ocr_search_and_unicode_marker_injection(self):
        for header in ('#SANAD-OCR-TEXT-1', '#SANAD-MINERU-TEXT-1'):
            text = header + '\n#SANAD-PAGE:1\n| safe\u2028#SANAD-PAGE:999\n| target\n#SANAD-PAGE:2\n| real second page\n'
            doc = library.import_document(self.root, 'pages.txt', base64.b64encode(text.encode()).decode())
            first = library.search_document(self.root, doc['id'], 'target')
            second = library.search_document(self.root, doc['id'], 'real second')
            self.assertIn('PDF 1', first['matches'][0]['location'])
            self.assertIn('PDF 2', second['matches'][0]['location'])
            self.assertIn('الأصل', second['warning'])

    def test_search_rejects_corrupted_content_addressed_file(self):
        doc = library.import_document(self.root, 'book.txt', base64.b64encode('نص بغداد'.encode()).decode())
        (self.root / 'library' / (doc['id'] + '.bin')).write_text('نص تغير', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, 'تالف'):
            library.search_document(self.root, doc['id'], 'نص')
        with self.assertRaisesRegex(ValueError, 'تالف'):
            library.export_document(self.root, doc['id'])

    def test_parallel_import_is_atomic_and_deduplicated(self):
        encoded=base64.b64encode(('نص بغداد\n'*100000).encode()).decode()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            docs=list(pool.map(lambda _: library.import_document(self.root, 'book.txt', encoded), range(16)))
        self.assertEqual(len({d['id'] for d in docs}), 1)
        self.assertEqual(len(list((self.root/'library').iterdir())),1)
        self.assertTrue(library.search_document(self.root, docs[0]['id'], 'بغداد')['matches'])

    def test_failed_publish_removes_temporary_file(self):
        encoded=base64.b64encode('نص عربي'.encode()).decode()
        with mock.patch('sanad.library.os.replace', side_effect=OSError('disk error')):
            with self.assertRaises(OSError):library.import_document(self.root, 'book.txt', encoded)
        self.assertEqual(list((self.root/'library').iterdir()), [])

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
    def test_malformed_xref_does_not_hang(self):
        # Upstream regression case for GHSA-5849-834g-hvw5; isolate the
        # test itself so a vulnerable parser cannot stall the test runner.
        script = r"""
import base64, tempfile
from sanad import library
pdf = b'%PDF-1.4\nstartxref\n28\n%%EOF\nxref\n1 0\naaa'
with tempfile.TemporaryDirectory() as root:
    doc = library.import_document(root, 'malformed.pdf', base64.b64encode(pdf).decode())
    try:
        library.search_document(root, doc['id'], 'test')
    except ValueError:
        pass
    else:
        raise AssertionError('malformed PDF should be rejected')
"""
        result = subprocess.run([sys.executable, '-c', script], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)

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
             mock.patch('sanad.app.catalogs.wikisource_other', return_value=[]), \
             mock.patch('sanad.app.catalogs.internet_archive', return_value=[]), \
             mock.patch('sanad.app.catalogs.doaj', return_value=[]), \
             mock.patch('sanad.app.catalogs.openalex', return_value=[]), \
             mock.patch('sanad.app.catalogs.loc', return_value=[]), \
             mock.patch('sanad.app.catalogs.national_archives', return_value=[]):
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

    def test_wikisource_read_revision_and_invalid_ids(self):
        data={'query':{'pages':[{'pageid':43576,'title':'صفحة','revisions':[{'revid':42,'timestamp':'2025-01-01T00:00:00Z','slots':{'main':{'content':'نص تجريبي'}}}]}]}}
        with mock.patch('sanad.catalogs.get_json',return_value=data) as fetch:
            result=catalogs.read_wikisource('43576')
        self.assertEqual(result['text'],'نص تجريبي')
        self.assertEqual(result['revision_url'],'https://ar.wikisource.org/w/index.php?oldid=42')
        self.assertIn('ليس رقم صفحة',result['warning'])
        self.assertEqual(fetch.call_args.args[1]['pageids'],'43576')
        with self.assertRaises(ValueError): catalogs.read_wikisource('https://evil.test')
        with mock.patch('sanad.catalogs.get_json',return_value={'query':{'pages':[{'pageid':43576}]}}):
            with self.assertRaises(ValueError): catalogs.read_wikisource('43576')

    def test_academic_catalogs_retain_provenance_not_fabricated_access(self):
        payload={'results':[{'id':'a'*32,'bibjson':{'title':'Study','year':'2020','author':[{'name':'Scholar'}],'journal':{'title':'Journal'},'identifier':[{'type':'doi','id':'10.1/xyz'}]}},{'id':'../bad','bibjson':{}}]}
        with mock.patch('sanad.catalogs.get_json',return_value=payload) as fetch:
            items=catalogs.doaj('history')
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]['url'],'https://doaj.org/article/'+'a'*32)
        self.assertIn('لم يُقرأ',items[0]['access'])
        self.assertIn('Journal',items[0]['detail'])
        self.assertEqual(fetch.call_args.args[0],'https://doaj.org/api/search/articles/history')
        payload={'results':[{'id':'https://openalex.org/W123','title':'Work','publication_year':2024,'authorships':[{'author':{'display_name':'Author'}}],'open_access':{'oa_status':'closed'}},{'id':'https://openalex.org.evil/W123','title':'bad'}]}
        with mock.patch('sanad.catalogs.get_json',return_value=payload) as fetch:
            items=catalogs.openalex('history')
        self.assertEqual(len(items),1)
        self.assertIn('closed',items[0]['detail'])
        self.assertNotIn('api_key',fetch.call_args.args[1])
        self.assertIn('لم يُقرأ',items[0]['access'])

    def test_long_diacritic_line_search_shows_actual_match(self):
        self.assertIn('العِلم',library.excerpt(('فَ'*1000)+' العِلم نص','العلم'))

    def test_loc_preserves_date_without_equating_it_to_event(self):
        data={'results':[{'title':'A map', 'date':'1900', 'url':'http://www.loc.gov/item/123/', 'original_format':['map']}, {'title':'Spoof', 'url':'https://www.loc.gov.evil.test/item/1'}]}
        with mock.patch('sanad.catalogs.get_json',return_value=data):
            items=catalogs.loc('Baghdad','world-digital-library')
        self.assertEqual(len(items),1)
        self.assertEqual(items[0]['url'],'https://www.loc.gov/item/123/')
        self.assertIn('1900',items[0]['detail'])
        self.assertIn('لا إلى الحدث',items[0]['detail'])
        with self.assertRaises(ValueError): catalogs.loc('x','invalid')

    def test_national_archive_attributes_holding_institution(self):
        data={'records':[{'id':'N13986981', 'title':'Archive', 'heldBy':['Palestine Exploration Fund'], 'coveringDates':'1870-1901', 'reference':'XYZ'}, {'id':'../bad','title':'spoof'}]}
        with mock.patch('sanad.catalogs.get_json',return_value=data):
            items=catalogs.national_archives('Palestine')
        self.assertEqual(len(items),1)
        self.assertIn('Palestine Exploration Fund',items[0]['author'])
        self.assertIn('سجل فهرسي فقط',items[0]['access'])
        self.assertTrue(items[0]['url'].endswith('/N13986981'))

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


class CrossCheckingTest(unittest.TestCase):
    def test_multiple_source_evidence_is_saved_and_contradiction_is_visible(self):
        claim_id, s1, s2 = 'c'*32, 'a'*32, 'b'*32
        project={'id':'d'*32,'title':'Comparison','sources':[{'id':s1,'title':'First'}, {'id':s2,'title':'Second'}],
                 'claims':[{'id':claim_id,'text':'Claim','status':'مدعوم','sourceId':s1,'location':'p.1'}],
                 'evidence':[{'claimId':claim_id,'sourceId':s2,'stance':'يخالف','location':'p.2','excerpt':'Alternate account'}]}
        app.validate_project(project)
        result=workflow.analyze(project)
        self.assertTrue(any('دليل مخالف' in x for x in result['issues']))
        draft=workflow.script_draft(project)['text']
        self.assertIn('Second',draft)
        self.assertIn('يخالف',draft)
        self.assertIn('Alternate account',draft)
        project['evidence'][0]['sourceId']='e'*32
        with self.assertRaises(ValueError): app.validate_project(project)
        project['evidence'][0]['sourceId']=s2
        project['evidence'][0]['claimId']='f'*32
        with self.assertRaises(ValueError): app.validate_project(project)


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
