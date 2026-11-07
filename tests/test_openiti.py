import unittest
import io
import tempfile
import base64
from sanad import library
from unittest import mock
from sanad import openiti, app

HEADER = 'version_uri\tauthor_ar\tauthor_lat\ttitle_ar\ttitle_lat\tdate\tstatus\ted_info\tlocal_path\n'
ROW = '0310Tabari.Tarikh.X-ara1\tالطبري\tTabari\tتاريخ الطبري\tTarikh\t0310\tpri\tطبعة\tdata/0310Tabari/0310Tabari.Tarikh/0310Tabari.Tarikh.X-ara1\n'
BAD = 'bad\tالطبري\tTabari\tتاريخ الطبري\tTarikh\t0310\tpri\t\tdata/../evil/file\n'

class OpenitiTest(unittest.TestCase):
    def test_matches_real_fields_with_safe_snapshot_link(self):
        result=openiti.search_index('تاريخ الطبري',HEADER+ROW+BAD)
        self.assertEqual(result['total'],1)
        self.assertEqual(result['results'][0]['title'],'تاريخ الطبري')
        self.assertTrue(result['results'][0]['url'].startswith(openiti.ROOT))
        self.assertIn('ليس تاريخ الحدث',result['results'][0]['detail'])
        self.assertIn('تقي',result['warning'])
        self.assertIn('لم يُقرأ',result['warning'])
        self.assertEqual(openiti.search_index('  طَبَرِي  ',HEADER+ROW)['total'],1)
    def test_validates_before_network(self):
        with mock.patch('sanad.openiti.fetch_index') as fetch:
            with self.assertRaises(ValueError): openiti.search('')
            fetch.assert_not_called()
    def test_bounded_results_counts_all(self):
        result=openiti.search_index('الطبري',HEADER+ROW*30)
        self.assertEqual(result['total'],30)
        self.assertEqual(len(result['results']),25)
    def test_read_selected_text_and_reject_unsafe_path(self):
        path='data/0310Tabari/0310Tabari.Tarikh/0310Tabari.Tarikh.X-ara1'
        content='######OpenITI#\n\n# نص في دفتر\n~~كان كثيرا ما ينظر\n'.encode()
        with mock.patch('urllib.request.urlopen', return_value=io.BytesIO(content)) as fetch:
            result=openiti.read_text(path)
            self.assertTrue(result['text'].startswith('######OpenITI#'))
            self.assertIn(openiti.REVISION,result['url'])
            self.assertIn('raw.githubusercontent.com',fetch.call_args.args[0].full_url)
        for bad in ['https://evil.example/a','data/../x/y','data/a/b/..','data/a/b/x%2fy','data/a/b/x?query']:
            with self.assertRaises(ValueError): openiti.read_text(bad)
        with mock.patch('urllib.request.urlopen',return_value=io.BytesIO(b'<html>error</html>')):
            with self.assertRaises(ValueError): openiti.read_text(path)
        with tempfile.TemporaryDirectory() as folder:
            doc=library.import_document(folder,'book.txt',base64.b64encode(content).decode())
            result=library.search_document(folder,doc['id'],'دفتر كان كثيرا')
            self.assertEqual(len(result['matches']),1)
            self.assertIn('ليس رقم صفحة',result['matches'][0]['location'])
            self.assertIn('دفتر كان كثيرا',result['matches'][0]['text'])

    def test_selected_openiti_occurrence_has_its_own_location_and_excerpt(self):
        cases = [
            ('######OpenITI#\n# تمهيد سابق\n~~تفاصيل أخرى\n~~ورد القاضي\n~~بغداد بعدها\n',
             'القاضي بغداد', 'الأسطر 4–5', 'القاضي بغداد'),
            ('######OpenITI#\r\n# مقدمة\u2028تتمة\r\n~~ورد القاضي\r\n~~بغداد بعدها\r\n',
             'القاضي بغداد', 'الأسطر 3–4', 'القاضي بغداد'),
            ('######OpenITI#\n# رواية موثقة قديمة\n~~' + 'ب' * 300 + '\n~~' + 'س' * 1300 + ' رواية موثقة حديثة\n',
             'رواية موثقة', 'السطر 4', 'رواية موثقة حديثة'),
        ]
        with tempfile.TemporaryDirectory() as folder:
            for text, query, location, excerpt in cases:
                doc = library.import_document(folder, 'book.txt', base64.b64encode(text.encode()).decode())
                matches = library.search_document(folder, doc['id'], query)['matches']
                self.assertIn(location, matches[-1]['location'])
                self.assertIn(excerpt, matches[-1]['text'])

    def test_retry_only_requested_provider(self):
        with mock.patch('sanad.app.catalogs.doaj',return_value=[{'title':'x'}]) as source, \
             mock.patch('sanad.app.catalogs.openalex') as other:
            result=app.research_search('history','DOAJ')
        self.assertEqual(len(result['providers']),1)
        self.assertEqual(result['results'][0]['provider'],'DOAJ')
        source.assert_called_once();other.assert_not_called()
        with self.assertRaises(ValueError): app.research_search('history','invalid')
