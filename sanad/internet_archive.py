"""Opt-in retrieval of one public OCR file described by an Internet Archive item."""
import hashlib
import json
import re
import urllib.parse
import urllib.request

LIMIT = 16 * 1024 * 1024
WARNING = ('نص OCR آلي قد يحتوي أخطاء أو ينقصه سياق، ورقم السطر ليس صفحة الطبعة. '
           'الإتاحة لا تثبت حق إعادة الاستخدام؛ راجع حقوق المادة وطابق الاقتباس مع صور الأصل.')


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', value) or value in ('.', '..'):
        raise ValueError('معرّف Internet Archive غير صالح')
    return value


def truthy(value):
    return value is True or str(value).lower() in ('true', '1', 'yes')


def choose_file(data, ident):
    meta = data.get('metadata') if isinstance(data, dict) else None
    if not isinstance(meta, dict) or meta.get('identifier') != ident or meta.get('mediatype') != 'texts':
        raise ValueError('لم يُعثر على سجل نصي متاح')
    if truthy(data.get('is_dark')) or truthy(meta.get('access-restricted-item')) or meta.get('lending_edition') or meta.get('lending_identifier'):
        raise ValueError('المادة مقيّدة أو للإعارة؛ افتح سجلها ولا يتجاوز سَنَد القيود')
    files = data.get('files')
    if not isinstance(files, list): raise ValueError('قائمة الملفات غير متاحة')
    choices = []
    for item in files:
        if not isinstance(item, dict) or truthy(item.get('private')): continue
        name = item.get('name')
        if not isinstance(name, str) or not name.endswith('_djvu.txt') or len(name) > 255 or any(ord(c) < 32 or c in '/\\' for c in name): continue
        try: size = int(item.get('size', '0'))
        except (ValueError, TypeError): continue
        if size <= 0 or size > LIMIT: continue
        sha1 = item.get('sha1', '')
        choices.append((name, size, sha1 if isinstance(sha1, str) and re.fullmatch('[0-9a-fA-F]{40}', sha1) else ''))
    if not choices: raise ValueError('لا يوجد نص OCR عام مناسب حتى 16 ميجابايت في السجل؛ افتح الموقع أو أضف نسخة مسموحة')
    return sorted(choices)[0]


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urllib.parse.urlsplit(newurl)
        if u.scheme != 'https' or u.username or u.password or u.port or not (u.hostname == 'archive.org' or re.fullmatch(r'ia[0-9]+\.us\.archive\.org', u.hostname or '')):
            raise ValueError('إعادة توجيه Internet Archive غير مدعومة')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def read_bytes(url, limit):
    request = urllib.request.Request(url, headers={'User-Agent':'SanadStudio/0.1 (local research tool)', 'Accept':'*/*'})
    opener = urllib.request.build_opener(SafeRedirect())
    with opener.open(request, timeout=60) as response:
        if response.headers.get_content_type() == 'text/html': raise ValueError('لم يُرجع الموقع نصًا أو بيانات صالحة')
        if int(response.headers.get('Content-Length') or 0) > limit: raise ValueError('استجابة Internet Archive أكبر من الحد الآمن')
        raw = response.read(limit + 1)
    if len(raw) > limit: raise ValueError('استجابة Internet Archive أكبر من الحد الآمن')
    return raw


def read_text(ident):
    ident = identifier(ident)
    try: metadata = json.loads(read_bytes('https://archive.org/metadata/' + ident, 2_000_000))
    except (ValueError, UnicodeError) as exc: raise ValueError('تعذر قراءة بيانات Internet Archive') from exc
    name, size, sha1 = choose_file(metadata, ident)
    url = 'https://archive.org/cors/' + ident + '/' + urllib.parse.quote(name, safe='')
    raw = read_bytes(url, LIMIT)
    if len(raw) != size or (sha1 and hashlib.sha1(raw).hexdigest() != sha1.lower()):
        raise ValueError('تغير الملف أو لم يكتمل تنزيله؛ حاول مجددًا')
    try: text = raw.decode('utf-8-sig')
    except UnicodeError as exc: raise ValueError('ترميز نص OCR غير مدعوم') from exc
    if not text.strip() or '\x00' in text: raise ValueError('لم يُرجع الموقع نص OCR صالحًا')
    return {'text':text, 'filename':name, 'url':'https://archive.org/details/' + ident, 'file_url':'https://archive.org/download/'+ident+'/'+urllib.parse.quote(name, safe=''), 'sha1':sha1, 'warning':WARNING}
