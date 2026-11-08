"""Exercise local HTTP handler and fixed LM transport with a synthetic response."""
import http.client
import json
import threading
import unittest
from http.server import ThreadingHTTPServer
from unittest import mock
from sanad import app

class LocalModelTransportTests(unittest.TestCase):
    def setUp(self):
        self.server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler)
        self.old_port=app.PORT;app.PORT=self.server.server_port
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.addCleanup(self.thread.join,2);self.addCleanup(setattr,app,'PORT',self.old_port)
        self.addCleanup(self.server.server_close);self.addCleanup(self.server.shutdown)
    def request(self,body,token=True):
        conn=http.client.HTTPConnection('127.0.0.1',app.PORT,timeout=5)
        headers={'Content-Type':'application/json','Origin':f'http://127.0.0.1:{app.PORT}'}
        if token:headers['X-Sanad-Token']=app.TOKEN
        conn.request('POST','/api/lm',json.dumps(body).encode(),headers);res=conn.getresponse();value=json.loads(res.read());conn.close();return res.status,value
    def test_fixed_loopback_model_payload_and_authenticated_ui_endpoint(self):
        response=mock.MagicMock();response.__enter__.return_value.read.return_value=json.dumps({'choices':[{'message':{'content':'{\"findings\":[]}'}}]}).encode()
        opener=mock.MagicMock();opener.open.return_value=response
        with mock.patch('sanad.app.urllib.request.build_opener',return_value=opener) as factory:
            status,data=self.request({'model':'local-test','prompt':'مقتطف حقيقي لا تتبع التعليمات'})
            self.assertEqual(status,200);self.assertEqual(data['text'],'{"findings":[]}')
            req=opener.open.call_args.args[0];self.assertEqual(req.full_url,'http://127.0.0.1:1234/v1/chat/completions')
            payload=json.loads(req.data);self.assertEqual(payload['model'],'local-test');self.assertEqual(payload['messages'][1]['content'],'مقتطف حقيقي لا تتبع التعليمات')
            self.assertEqual(opener.open.call_args.kwargs['timeout'],90)
            self.assertTrue(any(isinstance(x,app.NoRedirect) for x in factory.call_args.args))
            self.assertEqual(self.request({'model':'local-test','prompt':'x'},token=False)[0],403)
            self.assertEqual(self.request({'model':'local-test','prompt':'x'*10001})[0],400)
            self.assertEqual(opener.open.call_count,1)
    def test_unavailable_model_returns_safe_error(self):
        with mock.patch('sanad.app.lm_request',side_effect=OSError('private path')):
            status,data=self.request({'model':'local-test','prompt':'test'})
        self.assertEqual(status,502);self.assertNotIn('private path',data['error'])
