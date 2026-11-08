import unittest
from unittest.mock import patch
from sanad import open_access as oa

class OpenAccessTest(unittest.TestCase):
    def setUp(self):
        self.work={'id':'https://openalex.org/W2741809807','doi':'https://doi.org/10.7717/peerj.4375','title':'Article','locations':[
            {'is_oa':True,'landing_page_url':'https://repo.example/item','pdf_url':'https://repo.example/item.pdf','source':{'display_name':'Repository'},'version':'acceptedVersion','license':'cc-by'},
            {'is_oa':False,'pdf_url':'https://restricted.example/x'},
            {'is_oa':True,'landing_page_url':'http://insecure.example/x','pdf_url':'https://user:pass@repo.example/x'},
            {'is_oa':True,'landing_page_url':'https://repo.example/item'},
        ]}
    def test_identifier_and_mapping(self):
        with patch.object(oa,'fetch',return_value=self.work) as f:
            result=oa.search('https://doi.org/10.7717/peerj.4375')
            f.assert_called_once_with('10.7717/peerj.4375','doi')
        self.assertEqual(len(result['copies']),1)
        self.assertEqual(result['copies'][0]['version'],'acceptedVersion')
        self.assertIn('لم يُحمّل البرنامج نصًا',result['warning'])
        with patch.object(oa,'fetch',return_value=self.work): self.assertEqual(oa.search('w2741809807')['work_url'],self.work['id'])
    def test_reject_mismatch_and_injection(self):
        for x in ('https://attacker.test','10.7717/../evil','10.7717/a?x=1','10.7717/a#b','W123/../../','W1234567890123456'):
            with self.subTest(x=x), self.assertRaises(ValueError): oa.identifier(x)
        with patch.object(oa,'fetch',return_value=self.work):
            with self.assertRaises(ValueError): oa.search('W123')
            with self.assertRaises(ValueError): oa.search('10.7717/wrong')
        for link in ('https://user:secret@host/x','http://host/x','https://host:443/x','https://host\\@evil/x','https://host/white space'):
            self.assertEqual(oa.safe_link(link),'')
    def test_limit_and_empty(self):
        self.work['locations']=[{'is_oa':True,'landing_page_url':f'https://example.org/{i}'} for i in range(30)]
        with patch.object(oa,'fetch',return_value=self.work): r=oa.search('W2741809807')
        self.assertEqual(len(r['copies']),20); self.assertTrue(r['truncated'])
        self.work['locations']=[]
        with patch.object(oa,'fetch',return_value=self.work): self.assertEqual(oa.search('W2741809807')['copies'],[])
    def test_url_is_fixed_and_redirects_rejected(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self,*a): pass
            def read(self,n): return b'{}'
        with patch('urllib.request.build_opener') as opener:
            opener.return_value.open.return_value=Response()
            oa.fetch('10.7717/peerj.4375','doi')
            req=opener.return_value.open.call_args.args[0]
            self.assertTrue(req.full_url.startswith('https://api.openalex.org/works/doi:10.7717/peerj.4375?'))
            self.assertIsInstance(opener.call_args.args[0],oa.NoRedirect)
        with self.assertRaises(ValueError): oa.NoRedirect().redirect_request(None,None,302,'',{},'https://evil.test/')

class EndpointTest(unittest.TestCase):
    def test_local_http_route_and_rejection(self):
        import json, threading, urllib.request, urllib.error
        from http.server import ThreadingHTTPServer
        from sanad import app
        server=ThreadingHTTPServer(('127.0.0.1',0),app.Handler);old_port=app.PORT;app.PORT=server.server_port
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        base=f'http://127.0.0.1:{app.PORT}';headers={'X-Sanad-Token':app.TOKEN,'Origin':base,'Content-Type':'application/json'}
        work={'id':'https://openalex.org/W123','doi':None,'title':'Test','locations':[{'is_oa':True,'landing_page_url':'https://repo.example/item'}]}
        try:
            with patch.object(oa,'fetch',return_value=work):
                req=urllib.request.Request(base+'/api/openalex/locations',data=json.dumps({'identifier':'W123'}).encode(),headers=headers)
                with urllib.request.urlopen(req) as response: result=json.load(response)
                self.assertEqual(result['copies'][0]['landing_url'],'https://repo.example/item')
                req=urllib.request.Request(base+'/api/openalex/locations',data=json.dumps({'identifier':'https://evil.example/'}).encode(),headers=headers)
                with self.assertRaises(urllib.error.HTTPError): urllib.request.urlopen(req)
        finally:
            server.shutdown();server.server_close();thread.join();app.PORT=old_port
