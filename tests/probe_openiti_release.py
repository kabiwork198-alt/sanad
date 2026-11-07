"""Inspect only the ZIP central directory of the official OpenITI PRI release."""
import io, urllib.request, zipfile
URL='https://zenodo.org/api/records/18613982/files/OpenITI-pri-data_v9.zip/content'
SIZE=2861555297
class Remote(io.RawIOBase):
    def __init__(self):self.pos=0;self.requests=0
    def seekable(self):return True
    def tell(self):return self.pos
    def seek(self,offset,whence=0):
        self.pos=offset if whence==0 else self.pos+offset if whence==1 else SIZE+offset
        return self.pos
    def read(self,n=-1):
        n=SIZE-self.pos if n<0 else min(n,SIZE-self.pos)
        if n<=0:return b''
        if n>32*1024*1024:raise ValueError('central directory too large')
        req=urllib.request.Request(URL,headers={'Range':f'bytes={self.pos}-{self.pos+n-1}','User-Agent':'SanadStudio/0.1 (+https://github.com/kabiwork198-alt/sanad)'})
        with urllib.request.urlopen(req,timeout=60) as r:
            if r.status!=206:raise ValueError('range request returned '+str(r.status))
            data=r.read(n+1)
        if len(data)!=n:raise ValueError('range size mismatch')
        self.requests+=1;self.pos+=len(data);return data
if __name__ == "__main__":
    try:
        f=Remote()
        with zipfile.ZipFile(f) as z:
            members=z.infolist();files=[i for i in members if not i.is_dir()]
            print('::notice file=tests/probe_openiti_release.py,line=1::OpenITI primary ZIP directory: files=%d unpacked=%d ranges=%d examples=%s' % (len(files),sum(i.file_size for i in files),f.requests,[i.filename for i in files[:8]]))
    except Exception as exc:
        print('::notice file=tests/probe_openiti_release.py,line=1::OpenITI ZIP diagnostic unavailable: %s %s' % (type(exc).__name__,str(exc)[:160]))
