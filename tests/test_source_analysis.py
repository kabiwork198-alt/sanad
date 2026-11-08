import base64
import tempfile
import unittest
from pathlib import Path
from sanad import library

class SourceReadingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
    def store(self, name, data):
        return library.import_document(self.root, name, base64.b64encode(data).decode())['id']
    def test_text_segments_no_lost_characters_and_positions(self):
        text = 'مطلع المصدر\n' + ('عربية A\n' * 700)
        result = library.analysis_segments(self.root, self.store('source.txt', text.encode()))
        self.assertEqual(''.join(s['text'] for s in result['segments']), text)
        self.assertFalse(result['partial'])
        self.assertGreater(len(result['segments']), 1)
        self.assertIn('محارف النص 1–1800', result['segments'][0]['location'])
    def test_limit_is_explicit_and_exact_boundary_not_partial(self):
        n = library.ANALYSIS_CHARS * library.ANALYSIS_SEGMENTS
        for size, partial in [(n, False), (n+1, True)]:
            result = library.analysis_segments(self.root, self.store('s.txt', ('ن'*size).encode()))
            self.assertEqual(result['partial'], partial)
            self.assertEqual(len(result['segments']), 200)
            self.assertEqual(sum(len(s['text']) for s in result['segments']), n)
            if partial:
                tail=library.analysis_segments(self.root, self.store('s.txt', ('ن'*size).encode()), result['next_cursor'])
                self.assertEqual(''.join(x['text'] for x in tail['segments']), 'ن')
                self.assertFalse(tail['partial'])
                self.assertIn(str(n+1),tail['segments'][0]['location'])
    def test_blank_pdf_pages_not_claimed_readable(self):
        from pypdf import PdfWriter
        import io
        writer=PdfWriter();writer.add_blank_page(width=100,height=100);buffer=io.BytesIO();writer.write(buffer)
        result = library.analysis_segments(self.root, self.store('s.pdf', buffer.getvalue()))
        self.assertEqual(result['empty_pages'], [1]);self.assertFalse(result['segments'])
        self.assertEqual(result['scanned'], 1)
    def test_text_pdf_page_provenance_and_page_cap(self):
        from pypdf import PdfWriter
        from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
        import io
        w=PdfWriter();page=w.add_blank_page(width=300,height=300)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'), NameObject('/Subtype'):NameObject('/Type1'), NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):w._add_object(font)})})
        stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 10 200 Td (Historical witness text) Tj ET')
        page[NameObject('/Contents')]=w._add_object(stream)
        for _ in range(300):w.add_blank_page(width=100,height=100)
        buffer=io.BytesIO();w.write(buffer)
        result=library.analysis_segments(self.root,self.store('text.pdf',buffer.getvalue()))
        self.assertIn('Historical witness text', result['segments'][0]['text'])
        self.assertIn('صفحة PDF 1', result['segments'][0]['location'])
        self.assertEqual(result['scanned'],300);self.assertEqual(result['total'],301)
        self.assertTrue(result['partial']);self.assertEqual(len(result['empty_pages']),299)
        tail=library.analysis_segments(self.root,self.store('text.pdf',buffer.getvalue()),result['next_cursor'])
        self.assertEqual(tail['empty_pages'],[301]);self.assertFalse(tail['partial'])
        self.assertEqual(result['next_cursor'],{'page':301,'offset':0})
    def test_bad_cursors_rejected(self):
        ident=self.store('s.txt',b'abc')
        for cursor in ({'offset': -1}, {'offset':True}, {'offset':4}, {'page':1}, {'offset':0,'extra':1}, []):
            with self.assertRaises(ValueError):library.analysis_segments(self.root,ident,cursor)
    def test_corrupt_file_not_sent(self):
        ident=self.store('s.txt',b'original')
        (self.root/'library'/(ident+'.bin')).write_bytes(b'tampered')
        with self.assertRaises(ValueError):library.analysis_segments(self.root, ident)
