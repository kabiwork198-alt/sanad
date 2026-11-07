"""Optional whole-corpus search, on an official, locally downloaded OpenITI ZIP.

No corpus texts are bundled. Installation is explicit and verifies the publisher's
fixed byte counts and checksums. Search is a bounded-memory streaming scan, not
an index: it may take a long time, and can be cancelled.
"""
import csv
import hashlib
import io
import json
import re
import shutil
import threading
import unicodedata
import urllib.request
import zipfile
from pathlib import Path

from sanad import library

DATASET='https://zenodo.org/records/18613982'
ARCHIVE_URL='https://zenodo.org/api/records/18613982/files/OpenITI-pri-data_v9.zip/content'
META_URL='https://zenodo.org/api/records/18613982/files/OpenITI_metadata_2025-1-9_pri.tsv/content'
ARCHIVE_SIZE=2861555297
ARCHIVE_MD5='67e93d2669ac9e78204bbe4200748749'
META_SIZE=7012606
META_MD5='b786907514b438a5a27558f521c312a1'
MAX_RESULTS=100
MAX_PER_BOOK=2
WARNING=('بحث في نسخة OpenITI الأساسية 2025.1.9 فقط، لا في كل المكتبات أو كل طبعات العمل. '
         'رخصة CC BY-NC-SA 4.0 تقيد الاستخدام التجاري؛ راجع حقوق النص والطبعة، ورقم السطر ليس رقم الصفحة. '
         'قد تفوت المطابقة بسبب اختلاف الرسم أو الوسوم أو التهجئة. راجع الأصل والسياق.')
# Fast equivalent of library.normalize's combining-mark and tatweel removal.
REMOVE_MARKS={c:None for c in range(0x110000) if unicodedata.combining(chr(c))}
REMOVE_MARKS[0x640]=None

def normalize(text):
    return unicodedata.normalize('NFKC',text).casefold().translate(REMOVE_MARKS)

def metadata_map(data):
    try:
        text=data.decode('utf-8-sig')
        reader=csv.DictReader(io.StringIO(text),delimiter='\t')
        required={'version_uri','author_ar','author_lat','title_ar','title_lat','ed_info'}
        if not required.issubset(set(reader.fieldnames or [])): raise ValueError('صيغة بيانات OpenITI غير مدعومة')
        out={}
        for row in reader:
            uri=row.get('version_uri','')
            if not re.fullmatch(r'[A-Za-z0-9_.-]{1,500}',uri) or uri in out:continue
            out[uri]={k:(row.get(k) or '')[:500] for k in required}
        if not out:raise ValueError('بيانات OpenITI فارغة')
        return out
    except (UnicodeError,csv.Error) as exc:raise ValueError('تعذر قراءة بيانات OpenITI') from exc

def member_metadata(metadata,name):
    # Some primary ZIP members carry a status suffix not present in version_uri.
    key=name
    if key not in metadata:
        for suffix in ('.completed','.mARkdown','.inProgress','.automARkdown'):
            if name.endswith(suffix) and name[:-len(suffix)] in metadata:
                key=name[:-len(suffix)];break
    return key,metadata.get(key) or {'title_ar':'','title_lat':'','author_ar':'','author_lat':'','ed_info':''},key not in metadata

class Cancelled(Exception):pass

class Corpus:
    def __init__(self,root):
        self.root=Path(root)/'openiti-corpus';self.zip=self.root/'OpenITI-pri-data_v9.zip';self.part=self.root/'OpenITI-pri-data_v9.zip.part';self.meta=self.root/'metadata.tsv';self.marker=self.root/'verified.json'
        self.lock=threading.Lock();self.cancel_event=threading.Event();self.thread=None
        self.state={'stage':'idle','error':'','processed':0,'total':0,'bytes':0,'expected_bytes':ARCHIVE_SIZE,'results':[],'partial':False,'query':'','skipped':0,'offset':0}
    def _update(self,**kw):
        with self.lock:self.state.update(kw)
    def installed(self):
        try:
            return (self.zip.stat().st_size==ARCHIVE_SIZE and self.meta.stat().st_size==META_SIZE and json.loads(self.marker.read_text('utf-8'))=={'archive_md5':ARCHIVE_MD5,'metadata_md5':META_MD5})
        except (OSError,ValueError,TypeError):return False
    def status(self):
        with self.lock:result={**self.state,'results':list(self.state['results'])}
        result.update({'installed':self.installed(),'dataset':DATASET,'warning':WARNING})
        return result
    def _start(self,fn,**state):
        with self.lock:
            if self.thread and self.thread.is_alive():raise ValueError('توجد مهمة OpenITI قيد التنفيذ؛ أوقفها أو انتظر انتهاءها')
            self.cancel_event.clear();self.state={'stage':'starting','error':'','processed':0,'total':0,'bytes':0,'expected_bytes':ARCHIVE_SIZE,'results':[],'partial':False,'query':'','skipped':0,'offset':0,**state}
            self.thread=threading.Thread(target=self._run,args=(fn,),daemon=True);self.thread.start()
    def _run(self,fn):
        try:fn()
        except Cancelled:self._update(stage='cancelled',partial=True)
        except Exception as exc:self._update(stage='error',error=(str(exc) or type(exc).__name__)[:300],partial=True)
    def _check(self):
        if self.cancel_event.is_set():raise Cancelled()
    def cancel(self):
        with self.lock:
            if not self.thread or not self.thread.is_alive():return False
            self.cancel_event.set();return True
    def install(self):
        if self.installed():raise ValueError('المجموعة مثبتة بالفعل')
        self._start(self._install)
    def _install(self):
        self.root.mkdir(parents=True,exist_ok=True)
        if self.zip.exists() and not self.part.exists() and not self.marker.exists():self.zip.replace(self.part)
        if self.part.exists() and self.part.stat().st_size>ARCHIVE_SIZE:self.part.unlink()
        start=self.part.stat().st_size if self.part.exists() else 0
        if shutil.disk_usage(self.root).free < ARCHIVE_SIZE-start+100*1024*1024:raise ValueError('لا توجد مساحة كافية لإكمال التنزيل؛ تحتاج نحو 3 جيجابايت إضافية')
        if start<ARCHIVE_SIZE:
            self._update(stage='downloading',bytes=start)
            headers={'User-Agent':'SanadStudio/0.1 (+https://github.com/kabiwork198-alt/sanad)'}
            if start:headers['Range']=f'bytes={start}-'
            req=urllib.request.Request(ARCHIVE_URL,headers=headers)
            with urllib.request.urlopen(req,timeout=60) as response:
                if start and response.status==206:
                    if not (response.headers.get('Content-Range') or '').startswith(f'bytes {start}-'):raise ValueError('استجابة استكمال التنزيل غير صالحة')
                    mode='ab'
                elif response.status==200:
                    start=0;mode='wb'
                else:raise ValueError('تعذر تنزيل المجموعة من Zenodo')
                with self.part.open(mode) as f:
                    count=start
                    while True:
                        self._check();block=response.read(1024*1024)
                        if not block:break
                        count+=len(block)
                        if count>ARCHIVE_SIZE:raise ValueError('حجم تنزيل OpenITI غير مطابق')
                        f.write(block);self._update(bytes=count)
            if count!=ARCHIVE_SIZE:raise ValueError('لم يكتمل التنزيل؛ أعد المحاولة لاستكماله')
        self._check();self._update(stage='verifying',bytes=0,expected_bytes=ARCHIVE_SIZE)
        digest=hashlib.md5();count=0
        with self.part.open('rb') as f:
            while True:
                self._check();block=f.read(1024*1024)
                if not block:break
                digest.update(block);count+=len(block);self._update(bytes=count)
        if count!=ARCHIVE_SIZE or digest.hexdigest()!=ARCHIVE_MD5:
            self.part.unlink(missing_ok=True);raise ValueError('فشل تحقق بصمة المجموعة؛ حُذف التنزيل التالف')
        self._check();self._update(stage='metadata',bytes=0,expected_bytes=META_SIZE)
        req=urllib.request.Request(META_URL,headers={'User-Agent':'SanadStudio/0.1 (+https://github.com/kabiwork198-alt/sanad)'})
        with urllib.request.urlopen(req,timeout=60) as r:data=r.read(META_SIZE+1)
        if len(data)!=META_SIZE or hashlib.md5(data).hexdigest()!=META_MD5:raise ValueError('فشل التحقق من بيانات وصف المجموعة')
        metadata_map(data);self._check()
        with zipfile.ZipFile(self.part) as z:
            if len(z.infolist())>20000 or not z.infolist():raise ValueError('صيغة أرشيف المجموعة غير مدعومة')
        self.meta.write_bytes(data);self.part.replace(self.zip)
        self.marker.write_text(json.dumps({'archive_md5':ARCHIVE_MD5,'metadata_md5':META_MD5}),encoding='utf-8')
        self._update(stage='installed',bytes=ARCHIVE_SIZE,expected_bytes=ARCHIVE_SIZE)
    def remove(self):
        # Only these fixed, application-owned files are removed, after explicit confirmation.
        with self.lock:
            if self.thread and self.thread.is_alive():raise ValueError('أوقف المهمة أولًا وانتظر انتهاءها')
            for path in (self.zip,self.part,self.meta,self.marker):path.unlink(missing_ok=True)
            self.state={'stage':'idle','error':'','processed':0,'total':0,'bytes':0,'expected_bytes':ARCHIVE_SIZE,'results':[],'partial':False,'query':'','skipped':0,'offset':0}

    def search(self,query,offset=0):
        if not self.installed():raise ValueError('المجموعة غير مثبتة؛ نزّلها أولًا')
        if not isinstance(query,str) or not 2<=len(query.strip())<=150 or not normalize(query.strip()).strip():raise ValueError('أدخل عبارة بحث من حرفين إلى 150 حرفًا')
        if type(offset) is not int or not 0<=offset<=20000:raise ValueError('صفحة النتائج غير صالحة')
        query=query.strip();self._start(lambda:self._search(query,offset),query=query,offset=offset)
    def _search(self,query,offset):
        data=self.meta.read_bytes()
        if len(data)!=META_SIZE or hashlib.md5(data).hexdigest()!=META_MD5:raise ValueError('بيانات المجموعة تالفة؛ أعد تثبيتها')
        self.scan(self.zip,metadata_map(data),query,offset)
    def read_book(self,uri):
        if not self.installed():raise ValueError('المجموعة غير مثبتة')
        if not isinstance(uri,str) or not re.fullmatch(r'[A-Za-z0-9_.-]{1,500}',uri):raise ValueError('معرّف النسخة غير صالح')
        data=self.meta.read_bytes()
        if len(data)!=META_SIZE or hashlib.md5(data).hexdigest()!=META_MD5:raise ValueError('بيانات المجموعة تالفة')
        member=uri;uri,item,metadata_missing=member_metadata(metadata_map(data),member)
        try:
            with zipfile.ZipFile(self.zip) as z:
                info=z.getinfo(member)
                if info.file_size>16*1024*1024 or info.is_dir() or info.flag_bits&1:raise ValueError('النص أكبر من 16 ميجابايت أو غير متاح للحفظ؛ استخدم المقتطفات أو افتح المصدر')
                with z.open(info) as f:raw=f.read(16*1024*1024+1)
        except KeyError as exc:raise ValueError('النسخة غير موجودة في الأرشيف') from exc
        except (zipfile.BadZipFile,RuntimeError,EOFError) as exc:raise ValueError('تعذر قراءة النسخة من الأرشيف؛ قد يكون تالفًا') from exc
        if not raw or len(raw)>16*1024*1024:raise ValueError('حجم النص غير صالح')
        try:text=raw.decode('utf-8-sig')
        except UnicodeError as exc:raise ValueError('ترميز النسخة غير مدعوم') from exc
        return {'uri':uri,'member':member,'metadata_missing':metadata_missing,'text':text,'title':item['title_ar'] or item['title_lat'] or uri,'author':item['author_ar'] or item['author_lat'],'edition':item['ed_info'],'url':DATASET,'warning':WARNING}

    def scan(self,archive,metadata,query,offset=0):
        needle=normalize(query);self._update(stage='searching',query=query)
        count=0;skipped=0;matches=[];limit_reached=False;books_capped=0;seen=0
        with zipfile.ZipFile(archive) as z:
            entries=[x for x in z.infolist() if not x.is_dir()];total=len(entries);self._update(total=total)
            for info in entries:
                self._check();name=info.filename
                if not re.fullmatch(r'[A-Za-z0-9_.-]{1,500}',name) or info.file_size>512*1024*1024 or info.flag_bits&1:
                    skipped+=1;count+=1;self._update(processed=count,skipped=skipped);continue
                uri,m,metadata_missing=member_metadata(metadata,name);line_base=1;overlap='';last_offset=-1;position=0;book_hits=0
                try:
                    with z.open(info) as raw,io.TextIOWrapper(raw,encoding='utf-8-sig',errors='strict') as stream:
                        while True:
                            self._check();chunk=stream.read(65536)
                            if not chunk:break
                            combined=overlap+chunk;normal=normalize(combined);at=normal.find(needle)
                            while at>=0:
                                normalized_count=0;idx=0
                                for idx,ch in enumerate(combined):
                                    normalized_count+=len(normalize(ch))
                                    if normalized_count>at:break
                                absolute=position-len(overlap)+idx
                                if absolute<=last_offset:
                                    # A previously returned hit in the overlap must not mask a new hit.
                                    at=normal.find(needle,at+1);continue
                                line=max(1,line_base-overlap.count('\n')+combined[:idx].count('\n'))
                                start=max(0,idx-250);snippet=('…' if start else '')+combined[start:start+1000]+('…' if len(combined)>start+1000 else '')
                                seen+=1
                                if seen>offset:
                                    matches.append({'uri':uri,'member':name,'metadata_missing':metadata_missing,'title':m['title_ar'] or m['title_lat'] or uri,'author':m['author_ar'] or m['author_lat'],'edition':m['ed_info'],'location':f'السطر التقريبي {line} في نص OpenITI الخام','excerpt':snippet,'url':DATASET})
                                    self._update(results=list(matches))
                                last_offset=absolute;book_hits+=1
                                break
                            if len(matches)>=MAX_RESULTS:limit_reached=True;break
                            if book_hits>=MAX_PER_BOOK:books_capped+=1;break
                            position+=len(chunk);line_base+=chunk.count('\n');overlap=combined[-512:]
                    count+=1
                except (UnicodeError,zipfile.BadZipFile,RuntimeError,OSError):
                    skipped+=1;count+=1
                self._update(processed=count,skipped=skipped)
                if limit_reached:break
        self._update(stage='done',results=matches,processed=count,total=total,skipped=skipped,books_capped=books_capped,partial=limit_reached or skipped>0 or books_capped>0)
