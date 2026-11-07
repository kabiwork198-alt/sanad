import unittest
from unittest import mock
from sanad import catalogs

class OpenLibraryEditionTests(unittest.TestCase):
    def test_editions_preserve_exact_edition_and_only_safe_archive_ids(self):
        data={'size':22,'entries':[{'key':'/books/OL23411889M','title':'History','ocaid':'shorthistoryofsa00alis','publish_date':'1916','publishers':['Macmillan'],'languages':[{'key':'/languages/eng'}],'works':[{'key':'/works/OL63194W'}]},
              {'key':'/books/OL42M','title':'Bad archive','ocaid':'../evil'},
              {'key':'/books/OL43M','works':[{'key':'/works/OL999W'}]}, {'key':'/books/../bad'}]}
        with mock.patch('sanad.catalogs.get_json',return_value=data) as fetch:
            result=catalogs.openlibrary_editions('OL63194W')
        self.assertEqual(result['work_url'],'https://openlibrary.org/works/OL63194W')
        self.assertEqual(result['editions'][0]['archive_url'],'https://archive.org/details/shorthistoryofsa00alis')
        self.assertEqual(result['editions'][0]['edition_url'],'https://openlibrary.org/books/OL23411889M')
        self.assertEqual(result['editions'][0]['date'],'1916')
        self.assertEqual(result['editions'][0]['language'],'eng')
        self.assertEqual(result['editions'][1]['archive_url'],'')
        self.assertEqual(len(result['editions']),2)
        self.assertFalse(result['has_more'])
        self.assertIn('ليست إثباتًا',result['warning'])
        self.assertEqual(fetch.call_args.args[1],{'limit':'20','offset':'0'})

    def test_bounds_reject_arbitrary_urls_and_pages_and_support_pagination(self):
        for work in ['https://evil.test','OL1W/../evil','OL1M','../../foo']:
            with mock.patch('sanad.catalogs.get_json') as request:
                with self.assertRaises(ValueError):catalogs.openlibrary_editions(work)
                request.assert_not_called()
        for offset in [-20, 1, 1001, True, '20']:
            with self.assertRaises(ValueError):catalogs.openlibrary_editions('OL1W',offset)
        entries=[{'key':f'/books/OL{i}M'} for i in range(1,21)]
        with mock.patch('sanad.catalogs.get_json',return_value={'size':21,'entries':entries}):
            self.assertTrue(catalogs.openlibrary_editions('OL1W')['has_more'])
        with mock.patch('sanad.catalogs.get_json',return_value={'size':1021,'entries':entries}):
            last=catalogs.openlibrary_editions('OL1W',1000)
            self.assertFalse(last['has_more'])
            self.assertTrue(last['truncated'])
        with mock.patch('sanad.catalogs.get_json',return_value={'entries':'not a list'}):
            with self.assertRaises(ValueError):catalogs.openlibrary_editions('OL1W')

if __name__=='__main__':unittest.main()
