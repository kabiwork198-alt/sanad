import json
import io
from email.message import Message
import unittest
from unittest import mock
from sanad import shamela

class ShamelaTest(unittest.TestCase):
    def test_search_only_maps_safe_pages_and_bounds_results(self):
        data={'layers':[{'results':[{'book_id':18147,'page_id':1517,'title':'كنز الدرر','author':'ابن الدواداري','preview':'نص تجريبي'},
                                    {'book_id':True,'page_id':1}, {'book_id':1,'page_id':'/bad'}, {'book_id':18147,'page_id':1517}]}]}
        with mock.patch('sanad.shamela.Session.call', return_value=data) as call:
            result=shamela.search(' تاريخ الطبري ')
        self.assertEqual(len(result['results']),1)
        self.assertEqual(result['results'][0]['url'],'https://shamela.ws/book/18147/1517')
        self.assertIn('ليست دليل',result['warning'])
        self.assertEqual(call.call_args.args,('shamela_find',{'keywords':['تاريخ الطبري'],'difficulty':'easy'}))
        with mock.patch('sanad.shamela.Session.call') as call:
            with self.assertRaises(ValueError): shamela.search('')
            call.assert_not_called()
    def test_open_is_bound_to_valid_fixed_page_and_preserves_caveat(self):
        data={'book_id':18147,'page_id':1517,'text':'نص الصفحة'}
        with mock.patch('sanad.shamela.Session.call',return_value=data) as call:
            result=shamela.read_page('18147','1517')
        self.assertEqual(result['url'],'https://shamela.ws/book/18147/1517')
        self.assertIn('مقتطع',result['warning'])
        self.assertEqual(call.call_args.args[0],'shamela_open')
        with mock.patch('sanad.shamela.Session.call') as call:
            for pair in [('https://evil','1'),('01','1'),('1','../x')]:
                with self.assertRaises(ValueError): shamela.read_page(*pair)
            call.assert_not_called()
        with mock.patch('sanad.shamela.Session.call',return_value={'book_id':42,'page_id':1517,'text':'x'}):
            with self.assertRaises(ValueError): shamela.read_page('18147','1517')
    def test_jsonrpc_handshake_and_session_binding(self):
        class Response(io.BytesIO):
            def __init__(self, payload, status=200, sid=''):
                super().__init__(payload)
                self.status=status
                self.headers=Message()
                self.headers['Content-Type']='application/json'
                if sid: self.headers['mcp-session-id']=sid
        reply={'jsonrpc':'2.0','id':2,'result':{'content':[{'type':'text','text':json.dumps({'layers':[]})}]}}
        responses=[Response(b'{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26"}}',sid='session-123'),Response(b'',202),Response(json.dumps(reply).encode())]
        session=shamela.Session()
        with mock.patch.object(session.opener,'open',side_effect=responses) as opener:
            self.assertEqual(session.call('shamela_find',{'keywords':['تاريخ']}),{'layers':[]})
            self.assertEqual(opener.call_count,3)
            self.assertTrue(all(c.args[0].full_url==shamela.URL for c in opener.call_args_list))
            self.assertEqual(opener.call_args_list[2].args[0].get_header('Mcp-session-id'),'session-123')
            self.assertEqual(json.loads(opener.call_args_list[2].args[0].data)['params']['name'],'shamela_find')

    def test_parse_sse_and_rpc_error(self):
        self.assertEqual(shamela._parse(b'event: message\ndata: {"id":2,"result":{}}\n\n','text/event-stream')['id'],2)
        with self.assertRaises(ValueError): shamela._parse(b'invalid','application/json')
        session=shamela.Session()
        with mock.patch.object(session,'request',side_effect=[{'protocolVersion':'2025-03-26'}, {}, {'isError':True}]):
            with self.assertRaises(ValueError): session.call('shamela_find',{})
