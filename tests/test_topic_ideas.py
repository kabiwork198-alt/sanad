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
    def test_sections_are_from_matching_real_revision(self):
        payload={'parse':{'pageid':1,'title':'A','revid':123,'tocdata':{'sections':[{'tocLevel':1,'line':'الرحلة الأولى'},{'tocLevel':2,'line':'<b>المسار</b>'},{'tocLevel':1,'line':'المراجع'},{'tocLevel':1,'line':'الرحلة الأولى'}]}}}
        with patch.object(wikipedia,'get_json',return_value=payload):
            sections=wikipedia.topic_sections('1');self.assertEqual([x['title'] for x in sections['sections']],['الرحلة الأولى','المسار']);self.assertTrue(sections['revision_url'].endswith('oldid=123'))
            with self.assertRaises(ValueError):wikipedia.topic_sections('2')
