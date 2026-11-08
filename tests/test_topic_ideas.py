import unittest
from unittest.mock import patch
from sanad import wikipedia

class TopicIdeas(unittest.TestCase):
    def test_real_metadata_mapping_and_cursor(self):
        data={'continue':{'gcmcontinue':'page|d8a3|123'},'query':{'pages':[
            {'pageid':1,'ns':0,'title':'شخص','extract':'كان رحالة له رحلة ومخطوطات عن التاريخ والبلدان في ذلك العصر.'},
            {'pageid':2,'ns':0,'title':'قائمة الرحلات','extract':'نص طويل بما يكفي للاختبار عن البلدان والرحلات القديمة.'},
            {'pageid':3,'ns':0,'title':'توضيح','pageprops':{'disambiguation':''},'extract':'نص طويل بما يكفي للاختبار عن البلدان والرحلات القديمة.'},
            {'pageid':4,'ns':0,'title':'قصير','extract':'قصير'},
            {'pageid':True,'ns':0,'title':'خطأ','extract':'x'*50}]}}
        with patch.object(wikipedia,'get_json',return_value=data) as mock:
            result=wikipedia.topics('travel');self.assertEqual(len(result['topics']),1);self.assertEqual(result['topics'][0]['id'],'1');self.assertEqual(result['next_cursor'],'page|d8a3|123')
            wikipedia.topics('travel','',result['next_cursor']);self.assertEqual(mock.call_args.args[0]['gcmcontinue'],'page|d8a3|123')
        for args in [('evil','',''),('travel','x',''),('travel','','https://evil.test/'),('travel','abc','201')]:
            with self.assertRaises(ValueError): wikipedia.topics(*args)
        with patch.object(wikipedia,'get_json',return_value={'error':{'code':'ratelimited'}}):
            with self.assertRaises(ValueError):wikipedia.topics()
    def test_search_filters_unrelated_and_prioritizes_matching_title(self):
        data={'query':{'pages':[
            {'pageid':1,'ns':0,'title':'مغن معاصر','index':1,'extract':'مغن معاصر معروف يغني الأغاني في كثير من المدن والبلدان.'},
            {'pageid':2,'ns':0,'title':'أحمد بن فضلان','index':3,'extract':'رحالة كتب وصفًا في رحلته إلى بلدان بعيدة واكتشاف شعوب جديدة.'},
            {'pageid':3,'ns':0,'title':'فيلم تاريخي','index':2,'extract':'فيلم مستوحى من رحلة ابن فضلان ويتناول رحلته الشهيرة في القرن العاشر.'}]}}
        with patch.object(wikipedia,'get_json',return_value=data): r=wikipedia.topics('travel','ابن فضلان')
        self.assertEqual([x['id'] for x in r['topics']],['2','3'])

    def test_sections_are_from_matching_real_revision(self):
        payload={'parse':{'pageid':1,'title':'A','revid':123,'tocdata':{'sections':[{'tocLevel':1,'line':'الرحلة الأولى'},{'tocLevel':2,'line':'<b>المسار</b>'},{'tocLevel':1,'line':'المراجع'},{'tocLevel':1,'line':'الرحلة الأولى'}]}}}
        with patch.object(wikipedia,'get_json',return_value=payload):
            sections=wikipedia.topic_sections('1');self.assertEqual([x['title'] for x in sections['sections']],['الرحلة الأولى','المسار']);self.assertTrue(sections['revision_url'].endswith('oldid=123'))
            with self.assertRaises(ValueError):wikipedia.topic_sections('2')
