import unittest
from unittest.mock import patch, MagicMock
from sanad import wikipedia, catalogs
from sanad.http_identity import USER_AGENT

class TopicIdeas(unittest.TestCase):
    def test_wikimedia_requests_identify_project(self):
        response=MagicMock();response.__enter__.return_value.read.return_value=b'{}'
        with patch('urllib.request.urlopen',return_value=response) as send:
            wikipedia.get_json({'action':'query'})
            self.assertEqual(send.call_args.args[0].get_header('User-agent'),USER_AGENT)
            catalogs.get_json('https://ar.wikisource.org/w/api.php',{'action':'query'})
            self.assertEqual(send.call_args.args[0].get_header('User-agent'),USER_AGENT)
        self.assertIn('https://github.com/kabiwork198-alt/sanad',USER_AGENT)

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
        for args in [([],'',''),({},'', ''),('evil','',''),('travel','x',''),('travel','','https://evil.test/'),('travel','abc','201')]:
            with self.assertRaises(ValueError): wikipedia.topics(*args)
        with patch.object(wikipedia,'get_json',return_value={'error':{'code':'ratelimited'}}):
            with self.assertRaises(ValueError):wikipedia.topics()
    def test_search_filters_unrelated_and_prioritizes_matching_title(self):
        data={'query':{'pages':[
            {'pageid':1,'ns':0,'title':'مغن معاصر','index':1,'extract':'مغن معاصر معروف يغني الأغاني في كثير من المدن والبلدان.'},
            {'pageid':2,'ns':0,'title':'أحمد بن فضلان','index':3,'extract':'رحالة كتب وصفًا في رحلته إلى بلدان بعيدة واكتشاف شعوب جديدة.'},
            {'pageid':3,'ns':0,'title':'فيلم تاريخي','index':2,'extract':'فيلم مستوحى من رحلة ابن فضلان ويتناول رحلته الشهيرة في القرن العاشر.'},
            {'pageid':4,'ns':0,'title':'سقف العالم (مسلسل)','index':4,'extract':'مسلسل عن رحلة ابن فضلان ويتناول سفارته إلى ملك الصقالبة.'},
            {'pageid':5,'ns':0,'title':'المحارب الثالث عشر','index':5,'extract':'المحارب الثالث عشر هو فيلم يتناول شخصية أحمد بن فضلان ورحلته.'}]}}
        with patch.object(wikipedia,'get_json',return_value=data): r=wikipedia.topics('travel','ابن فضلان')
        self.assertEqual([x['id'] for x in r['topics']],['2','3'])

    def test_sections_keep_distinct_anchors_and_allow_research_on_sources(self):
        rows=[{'tocLevel':1,'line':'مصادر الرحلة','number':'1','anchor':'مصادر_الرحلة'},
              {'tocLevel':2,'line':'الخزر','number':'2.1','anchor':'الخزر'},
              {'tocLevel':2,'line':'الخزر','number':'3.1','anchor':'الخزر_2'},
              {'tocLevel':1,'line':'هوامش','anchor':'هوامش'},
              {'tocLevel':1,'line':'المراجع','anchor':'المراجع'},
              {'tocLevel':1,'line':'عنوان آخر','anchor':'bad\nanchor'}]
        with patch.object(wikipedia,'get_json',return_value={'parse':{'pageid':1,'revid':456,'tocdata':{'sections':rows}}}):
            sections=wikipedia.topic_sections('1')['sections']
        self.assertEqual([x['title'] for x in sections],['مصادر الرحلة','الخزر','الخزر','عنوان آخر'])
        self.assertEqual([x['number'] for x in sections[:3]],['1','2.1','3.1'])
        self.assertIn('#%D9%85',sections[0]['url'])
        self.assertTrue(sections[2]['url'].endswith('_2'))
        self.assertFalse(sections[3]['url'])

    def test_sections_are_from_matching_real_revision(self):
        payload={'parse':{'pageid':1,'title':'A','revid':123,'tocdata':{'sections':[{'tocLevel':1,'line':'الرحلة الأولى'},{'tocLevel':2,'line':'<b>المسار</b>'},{'tocLevel':1,'line':'المراجع'},{'tocLevel':1,'line':'الرحلة الأولى'}]}}}
        with patch.object(wikipedia,'get_json',return_value=payload):
            sections=wikipedia.topic_sections('1');self.assertEqual([x['title'] for x in sections['sections']],['الرحلة الأولى','المسار']);self.assertTrue(sections['revision_url'].endswith('oldid=123'))
            with self.assertRaises(ValueError):wikipedia.topic_sections('2')
