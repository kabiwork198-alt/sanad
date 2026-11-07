import unittest
from unittest import mock
from sanad import catalogs

class WikisourceMultilingualTest(unittest.TestCase):
    def test_other_language_search_has_original_provenance(self):
        data={'query':{'search':[{'pageid':3599134,'title':'Histoire des Berbères'}, {'pageid':'x','title':'bad'}]}}
        with mock.patch('sanad.catalogs.get_json',return_value=data) as fetch:
            result=catalogs.wikisource_other('Ibn Khaldoun','fr')
        self.assertEqual(result[0]['url'],'https://fr.wikisource.org/?curid=3599134')
        self.assertIn('لم يُقرأ',result[0]['access'])
        self.assertEqual(fetch.call_args.args[0],'https://fr.wikisource.org/w/api.php')
        with self.assertRaises(ValueError):catalogs.wikisource_other('x','fr.evil.test')

    def test_rendered_text_includes_transclusion_but_drops_active_content(self):
        data={'parse':{'pageid':3599134,'title':'Nefouça','revid':11490985,'text':'<div><style>secret style</style><p>Histoire &amp; Nefouça</p><script>bad()</script><p>texte inclus</p></div>'}}
        with mock.patch('sanad.catalogs.get_json',return_value=data) as fetch:
            result=catalogs.read_wikisource_rendered('3599134','fr')
        self.assertIn('Histoire & Nefouça',result['text']);self.assertIn('texte inclus',result['text'])
        self.assertNotIn('bad()',result['text']);self.assertNotIn('secret style',result['text'])
        self.assertEqual(result['revision_url'],'https://fr.wikisource.org/w/index.php?oldid=11490985')
        self.assertIn('قد يتغير المحتوى',result['warning'])
        self.assertEqual(fetch.call_args.args[1]['prop'],'text|revid')
        for language in ('../bad','http://evil','de'):
            with self.assertRaises(ValueError):catalogs.read_wikisource_rendered('3599134',language)
        with self.assertRaises(ValueError):catalogs.read_wikisource_rendered('../x','fr')
        data['parse']['pageid']=42
        with mock.patch('sanad.catalogs.get_json',return_value=data):
            with self.assertRaises(ValueError):catalogs.read_wikisource_rendered('3599134','fr')

if __name__=='__main__':unittest.main()
