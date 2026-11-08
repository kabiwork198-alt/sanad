import unittest
from unittest.mock import patch
from sanad import catalogs

class SubpagesTest(unittest.TestCase):
    def test_pagination_and_filtering(self):
        calls=[]
        def get(host,params):
            calls.append((host,params))
            if params.get('prop')=='info': return {'query':{'pages':[{'pageid':1898,'title':'مقدمة ابن خلدون','ns':0}]}}
            return {'continue':{'apcontinue':'مقدمة_ابن_خلدون/صفحة_ثانية'},'query':{'allpages':[{'pageid':3941,'ns':0,'title':'مقدمة ابن خلدون/القسم الأول'}, {'pageid':3941,'ns':0,'title':'مقدمة ابن خلدون/مكرر'}, {'pageid':17,'ns':0,'title':'عمل آخر/شيء'}, {'pageid':18,'ns':1,'title':'مقدمة ابن خلدون/نقاش'}]}}
        with patch.object(catalogs,'get_json',new=get):
            r=catalogs.wikisource_subpages('1898','ar');self.assertEqual(len(r['pages']),1);self.assertTrue(r['truncated'])
            self.assertEqual(r['next_cursor'],'مقدمة_ابن_خلدون/صفحة_ثانية')
            catalogs.wikisource_subpages('1898','ar',r['next_cursor']);self.assertEqual(calls[-1][1]['apcontinue'],r['next_cursor'])
            with self.assertRaises(ValueError):catalogs.wikisource_subpages('1898','ar','عمل_آخر/صفحة')
        self.assertTrue(all(host=='https://ar.wikisource.org/w/api.php' for host,_ in calls))
    def test_malformed(self):
        for page,language,cursor in [('1','evil',''),('0','en',''),('1/../','en',''),('1','ar','a\n')]:
            with self.assertRaises(ValueError): catalogs.wikisource_subpages(page,language,cursor)
        with patch.object(catalogs,'get_json',return_value={'query':{'pages':[{'pageid':2,'ns':0,'title':'bad'}]}}):
            with self.assertRaises(ValueError):catalogs.wikisource_subpages('1','en')
