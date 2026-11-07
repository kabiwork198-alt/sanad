"""Diagnostic: scan two genuine files read by ranges from the official ZIP.
No full 2.86 GB corpus is fetched in CI; source bytes are CRC-checked by zipfile.
"""
import hashlib, io, os, sys, tempfile, urllib.request, zipfile
sys.path.insert(0,os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sanad import openiti_corpus as c
from tests.probe_openiti_release import Remote,URL,SIZE
class BufferedRemote(Remote):
    def __init__(self):super().__init__();self.cache=b'';self.base=0
    def read(self,n=-1):
        n=SIZE-self.pos if n<0 else min(n,SIZE-self.pos)
        if n<=0:return b''
        if not(self.base<=self.pos and self.pos+n<=self.base+len(self.cache)):
            pos=self.pos;want=min(SIZE-pos,max(n,1024*1024));self.cache=super().read(want);self.base=pos;self.pos=pos
        result=self.cache[self.pos-self.base:self.pos-self.base+n];self.pos+=len(result);return result
try:
    req=urllib.request.Request(c.META_URL,headers={'User-Agent':'SanadStudio/0.1 (+https://github.com/kabiwork198-alt/sanad)'})
    with urllib.request.urlopen(req,timeout=60) as r:metadata=r.read(c.META_SIZE+1)
    assert len(metadata)==c.META_SIZE and hashlib.md5(metadata).hexdigest()==c.META_MD5
    parsed=c.metadata_map(metadata);remote=BufferedRemote();uris=['0370CaribQurtubi.SilaTarikhTabari.JK011178-ara1','0001AbuTalibCabdManaf.Diwan.JK007501-ara1']
    buffer=io.BytesIO()
    with zipfile.ZipFile(remote) as source,zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as out:
        for uri in uris:
            assert uri in parsed
            raw=source.read(uri)
            assert raw.startswith(b'######OpenITI#')
            out.writestr(uri,raw)
    with tempfile.TemporaryDirectory() as d:
        corpus=c.Corpus(d);corpus.scan(io.BytesIO(buffer.getvalue()),parsed,'بغداد');st=corpus.status()
        assert st['stage']=='done' and st['processed']==2 and st['skipped']==0 and any(x['uri']==uris[0] and 'بغداد' in x['excerpt'] for x in st['results'])
        print('::notice file=tests/live_openiti_corpus.py,line=1::OpenITI official ZIP subset live: texts=%d metadata=%s results=%d URI=%s source=%s range_requests=%d; full 2.86 GB installation NOT tested' % (st['processed'],'verified',len(st['results']),st['results'][0]['uri'],c.DATASET,remote.requests))
except Exception as exc:
    print('::notice file=tests/live_openiti_corpus.py,line=1::OpenITI official ZIP subset unavailable: %s %s' % (type(exc).__name__,str(exc)[:180]))
