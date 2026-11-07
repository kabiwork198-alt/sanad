import io,json,unittest
from email.message import Message
from unittest import mock
from sanad import alexandria_archive as aa

SEARCH={'results':[{'category':'article','title':'تاريخ الإسكندرية','id':2,'url':'https://www.alexandria-archive.com/article/2','snippet':'نبذة للمراجعة'},{'url':'https://www.alexandria-archive.com.evil.test/a','title':'bad'}]}
ARTICLE={'id':2,'titleAr':'تاريخ الإسكندرية','author':'المؤلف','published':'2025-01-01','url':'https://www.alexandria-archive.com/article/2','readMoreUrl':'https://www.alexandria-archive.com/article/2','access':{'full':False,'requiresSignIn':True},'provenance':{'rights':'حقوق محفوظة'},'_mcp_content':[{'type':'text','text':'هذه نبذة عامة للمراجعة'}]}
class AlexandriaTests(unittest.TestCase):
    def test_search_and_host_boundary(self):
        with mock.patch.object(aa.Session,'call',return_value=SEARCH) as call: result=aa.search(' الإسكندرية ')
        self.assertEqual(call.call_args.args,('search_archive',{'query':'الإسكندرية'}));self.assertEqual(len(result['results']),1)
        self.assertIn('راجع',result['results'][0]['access'])
        for url in ['https://www.alexandria-archive.com.evil.test/a','https://user@www.alexandria-archive.com/a','https://www.alexandria-archive.com:abcd/a','http://www.alexandria-archive.com/a']:
            self.assertEqual(aa.canonical_url(url),'')
    def test_preview_only_requires_matching_id_and_public_flag(self):
        with mock.patch.object(aa.Session,'call',return_value=ARTICLE) as call: result=aa.read_article('2')
        self.assertEqual(call.call_args.args,('get_article',{'id':2}));self.assertEqual(result['author'],'المؤلف');self.assertIn('نبذة عامة',result['warning']);self.assertEqual(result['rights'],'حقوق محفوظة')
        for bad in [{**ARTICLE,'id':3},{**ARTICLE,'access':{'full':True}},{**ARTICLE,'access':{}},{**ARTICLE,'url':'https://www.alexandria-archive.com/article/3'}]:
            with mock.patch.object(aa.Session,'call',return_value=bad):
                with self.assertRaises(ValueError):aa.read_article('2')
        for ident in ['../a','01','https://evil.test',None]:
            with mock.patch.object(aa.Session,'call') as call:
                with self.assertRaises(ValueError):aa.read_article(ident)
                call.assert_not_called()
    def test_structured_mcp_result(self):
        session=aa.Session()
        with mock.patch.object(session,'request',side_effect=[{'protocolVersion':'2025-03-26'},{},{'structuredContent':SEARCH,'content':[]}]) as request:
            self.assertEqual(session.call('search_archive',{'query':'x'}),{**SEARCH,'_mcp_content':[]})
            self.assertEqual(request.call_count,3)
