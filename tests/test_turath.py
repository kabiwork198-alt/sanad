import unittest
from unittest import mock
from sanad import turath

SAMPLE={'count':2,'results':[{'book_id':123,'meta':{'page_id':456,'page':39,'vol':'2','book_name':'تاريخ بغداد','author_name':'المؤلف'},'snip':'فتح بغداد','link':'https://evil.test'}, {'book_id':True,'meta':{'page_id':456}}]}
PAGE={'book_id':123,'page_id':456,'text':'مقدمة\nفتح بغداد للمراجعة','meta':{'page':39,'vol':'2'}}
class TurathTest(unittest.TestCase):
    def test_search_uses_fixed_tool_and_canonical_url(self):
        with mock.patch.object(turath.Session,'call',return_value=SAMPLE) as call:
            result=turath.search(' فتح بغداد ')
        self.assertEqual(call.call_args.args,('search_turath',{'q':'فتح بغداد','page':1}))
        self.assertEqual(len(result['results']),1)
        self.assertEqual(result['results'][0]['url'],'https://app.turath.io/book/123?page=456')
        self.assertIn('الصفحة بحسب تراث: 39',result['results'][0]['detail'])
        with mock.patch.object(turath.Session,'call') as call:
            with self.assertRaises(ValueError):turath.search('')
            call.assert_not_called()
    def test_read_is_single_page_and_checks_ids(self):
        with mock.patch.object(turath.Session,'call',return_value=PAGE) as call:
            result=turath.read_page('123','456')
        self.assertEqual(call.call_args.args,('get_page',{'book_id':123,'page_id':456}))
        self.assertEqual(result['printed_page'],'39')
        self.assertIn('ليس رقم صفحة',result['warning'])
        for book,page in [('1','../x'),('01','1'),('https://evil','1')]:
            with mock.patch.object(turath.Session,'call') as call:
                with self.assertRaises(ValueError):turath.read_page(book,page)
                call.assert_not_called()
        with mock.patch.object(turath.Session,'call',return_value={**PAGE,'book_id':124}):
            with self.assertRaises(ValueError):turath.read_page('123','456')
