import unittest
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
    def test_retry_only_requested_provider(self):
        with mock.patch('sanad.app.catalogs.doaj',return_value=[{'title':'x'}]) as source, \
             mock.patch('sanad.app.catalogs.openalex') as other:
            result=app.research_search('history','DOAJ')
        self.assertEqual(len(result['providers']),1)
        self.assertEqual(result['results'][0]['provider'],'DOAJ')
        source.assert_called_once();other.assert_not_called()
        with self.assertRaises(ValueError): app.research_search('history','invalid')
