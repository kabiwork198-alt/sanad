import hashlib, io, tempfile, unittest, zipfile
from pathlib import Path
from unittest import mock
from sanad import openiti_corpus as c

U1='0001Author.Book.Edition-ara1';U2='0002Author.Work.Edition-ara1'
def fixture():
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr(U1,'######OpenITI#\nسطر أول\nكانت بَغْدَاد مدينة عظيمة\nختام')
        z.writestr(U2,'######OpenITI#\nوكانت بغداد مدينة واسعة\n')
        z.writestr('../unsafe','بغداد مدينة')
    meta=('version_uri\tauthor_ar\tauthor_lat\ttitle_ar\ttitle_lat\ted_info\n'+U1+'\tمؤلف\tAuthor\tكتاب أول\tBook\tطبعة أولى\n'+U2+'\tمؤلف ثان\tAuthor\tكتاب ثان\tWork\tطبعة ثانية\n').encode()
    return out.getvalue(),meta
class Resp(io.BytesIO):
    def __init__(self,data,status=200,headers=None):super().__init__(data);self.status=status;self.headers=headers or {}
class CorpusTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.zip,self.meta=fixture();self.c=c.Corpus(self.tmp.name)
        for name,value in [('ARCHIVE_SIZE',len(self.zip)),('ARCHIVE_MD5',hashlib.md5(self.zip).hexdigest()),('META_SIZE',len(self.meta)),('META_MD5',hashlib.md5(self.meta).hexdigest())]:
            patch=mock.patch.object(c,name,value);patch.start();self.addCleanup(patch.stop)
    def response(self,req,timeout=0):
        if req.full_url==c.META_URL:return Resp(self.meta)
        self.assertEqual(req.full_url,c.ARCHIVE_URL)
        h=req.get_header('Range')
        if h:
            start=int(h.split('=')[1].split('-')[0]);return Resp(self.zip[start:],206,{'Content-Range':f'bytes {start}-{len(self.zip)-1}/{len(self.zip)}'})
        return Resp(self.zip)
    def run_install(self):
        with mock.patch('urllib.request.urlopen',side_effect=self.response):
            self.c.install();self.c.thread.join(10)
        self.assertEqual(self.c.status()['stage'],'installed',self.c.status())
    def test_install_resumes_checksums_scans_actual_text_and_removes(self):
        self.c.root.mkdir(parents=True);self.c.part.write_bytes(self.zip[:20]);self.run_install();self.assertTrue(self.c.installed())
        self.c.search('بغداد مدينة');self.c.thread.join(10);s=self.c.status()
        self.assertEqual(s['stage'],'done');self.assertEqual(s['processed'],3);self.assertEqual(s['skipped'],1);self.assertTrue(s['partial']);self.assertEqual(len(s['results']),2)
        self.assertEqual(s['results'][0]['uri'],U1);self.assertIn('مدينة',s['results'][0]['excerpt']);self.assertIn('3',s['results'][0]['location']);self.assertEqual(s['results'][0]['edition'],'طبعة أولى');self.assertEqual(s['results'][0]['url'],c.DATASET)
        book=self.c.read_book(U1);self.assertIn('بَغْدَاد',book['text']);self.assertEqual(book['edition'],'طبعة أولى')
        for bad in ('../unsafe','https://evil.test/x','unknown'):
            with self.assertRaises(ValueError):self.c.read_book(bad)
        self.c.remove();self.assertFalse(self.c.installed());self.assertFalse(self.c.zip.exists())
    def test_corrupt_download_is_rejected(self):
        with mock.patch('urllib.request.urlopen',return_value=Resp(b'x'*len(self.zip))):
            self.c.install();self.c.thread.join(10)
        self.assertEqual(self.c.status()['stage'],'error');self.assertFalse(self.c.part.exists());self.assertFalse(self.c.installed())
    def test_result_limit_and_invalid_queries(self):
        self.run_install()
        for q in ('','ا',None,'x'*151):
            with self.assertRaises(ValueError):self.c.search(q)
        with mock.patch.object(c,'MAX_RESULTS',1):
            self.c.search('بغداد');self.c.thread.join(10);s=self.c.status()
        self.assertTrue(s['partial']);self.assertEqual(len(s['results']),1);self.assertLess(s['processed'],s['total'])
    def test_cancel_does_not_replace_existing_data(self):
        self.c.cancel_event.set()
        with self.assertRaises(c.Cancelled):self.c.scan(io.BytesIO(self.zip),c.metadata_map(self.meta),'بغداد')
    def test_normalization_parity(self):
        for x in ['بَغْدَاد','إِلَى','ﷲ','وَالعربية','Straße','المَدِينة']:
            self.assertEqual(c.normalize(x),c.library.normalize(x))
if __name__=='__main__':unittest.main()
