import copy
import hashlib
import json
import unittest
from unittest import mock
from sanad import internet_archive as ia

TEXT='نص تجريبي\nعبارة للمراجعة'.encode()
ITEM={'metadata':{'identifier':'sample','mediatype':'texts'},'files':[{'name':'sample_djvu.txt','size':str(len(TEXT)),'sha1':hashlib.sha1(TEXT).hexdigest()}]}
class InternetArchiveTest(unittest.TestCase):
    def test_bounded_public_text_and_provenance(self):
        with mock.patch.object(ia,'read_bytes',side_effect=[json.dumps(ITEM).encode(),TEXT]) as read:
            value=ia.read_text('sample')
        self.assertEqual(value['text'],TEXT.decode())
        self.assertEqual(read.call_args_list[0].args,('https://archive.org/metadata/sample',2_000_000))
        self.assertEqual(read.call_args_list[1].args,('https://archive.org/cors/sample/sample_djvu.txt',ia.LIMIT))
        self.assertIn('ليس صفحة',value['warning'])
        self.assertEqual(value['sha1'],hashlib.sha1(TEXT).hexdigest())
    def test_restricted_and_bad_files_are_rejected(self):
        for edit in [lambda d:d['metadata'].update({'access-restricted-item':'true'}), lambda d:d['metadata'].update({'lending_edition':'book'}),lambda d:d.update({'is_dark':True}),lambda d:d['files'][0].update({'private':'true'}),lambda d:d['files'][0].update({'name':'../sample_djvu.txt'}),lambda d:d['files'][0].update({'size':ia.LIMIT+1})]:
            d=copy.deepcopy(ITEM);edit(d)
            with self.assertRaises(ValueError):ia.choose_file(d,'sample')
        for id in ['../foo','.', 'https://evil.test', 'a/b',None]:
            with mock.patch.object(ia,'read_bytes') as request:
                with self.assertRaises(ValueError):ia.read_text(id)
                request.assert_not_called()
    def test_incomplete_or_changed_text_rejected(self):
        with mock.patch.object(ia,'read_bytes',side_effect=[json.dumps(ITEM).encode(),b'bad']):
            with self.assertRaisesRegex(ValueError,'لم يكتمل'):ia.read_text('sample')
    def test_redirect_host_allowlist(self):
        import urllib.request
        req=urllib.request.Request('https://archive.org/cors/sample/sample_djvu.txt')
        h=ia.SafeRedirect()
        with self.assertRaises(ValueError):h.redirect_request(req,None,302,'',{},'https://archive.org.evil.example/test')
        self.assertIsNotNone(h.redirect_request(req,None,302,'',{},'https://ia123.us.archive.org/test'))
