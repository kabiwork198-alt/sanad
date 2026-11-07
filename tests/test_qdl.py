import json
import unittest
from unittest import mock
from sanad import qdl


class QdlTest(unittest.TestCase):
    def test_search_maps_only_valid_page_ids_and_preserves_bounds(self):
        payload = {'within':{'total':2}, 'hits':[{'item-url':'81055/vdc_100064303797.0x000004','match':'Dhofar'}, {'item-url':'../../evil','match':'bad'}]}
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload).encode()
        opener = mock.MagicMock()
        opener.open.return_value = response
        with mock.patch('sanad.qdl.urllib.request.build_opener', return_value=opener):
            result = qdl.search('vdc_100000000881.0x0000ce','Dhofar')
        self.assertEqual(result['total'], 2)
        self.assertEqual(len(result['hits']), 1)
        self.assertEqual(result['hits'][0]['url'], 'https://www.qdl.qa/en/archive/81055/vdc_100064303797.0x000004')
        request = opener.open.call_args.args[0]
        self.assertTrue(request.full_url.startswith('https://www.qdl.qa/en/annos/search/81055/'))
        self.assertIn('q=Dhofar', request.full_url)
        self.assertIn('لا يثبت الغياب', result['warning'])

    def test_rejects_bad_input_and_unavailable_search(self):
        for ident in ['../bad', 'vdc_1.0x00/../evil', 'https://evil.test']:
            with self.assertRaises(ValueError): qdl.search(ident, 'word')
        with self.assertRaises(ValueError): qdl.search('vdc_100000000881.0x0000ce', 'x')
        response=mock.MagicMock(); response.__enter__.return_value.read.return_value=b'{}'
        opener=mock.MagicMock(); opener.open.return_value=response
        with mock.patch('sanad.qdl.urllib.request.build_opener',return_value=opener):
            with self.assertRaises(ValueError): qdl.search('vdc_100000000881.0x0000ce','Dhofar')

if __name__ == '__main__': unittest.main()
