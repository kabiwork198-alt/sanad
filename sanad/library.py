"""Local user-provided documents. No network, DRM bypass, or code execution."""
import base64
import binascii
import hashlib
import re
import unicodedata
from pathlib import Path

MAX_FILE = 20 * 1024 * 1024
MAX_PAGES = 300
MAX_MATCHES = 12


def import_document(data_dir, name, encoded):
    if not isinstance(name, str) or not name.strip() or len(name) > 200:
        raise ValueError('اسم الملف غير صالح')
    suffix = Path(name.replace('\\', '/')).suffix.lower()
    if suffix not in ('.pdf', '.txt', '.md'):
        raise ValueError('الصيغ المدعومة حاليًا: PDF وTXT وMD')
    if not isinstance(encoded, str) or len(encoded) > (MAX_FILE * 4 // 3 + 16):
        raise ValueError('حجم الملف أكبر من 20 ميجابايت')
    try:
        content = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error):
        raise ValueError('بيانات الملف غير صالحة')
    if not content or len(content) > MAX_FILE:
        raise ValueError('الملف فارغ أو أكبر من 20 ميجابايت')
    if suffix == '.pdf' and b'%PDF-' not in content[:1024]:
        raise ValueError('الملف ليس PDF صالحًا بحسب ترويسته')
    if suffix != '.pdf':
        try:
            content.decode('utf-8-sig')
        except UnicodeDecodeError:
            raise ValueError('احفظ الملف النصي بترميز UTF-8 ثم أعد المحاولة')
    ident = hashlib.sha256(content).hexdigest()
    folder = Path(data_dir) / 'library'
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / (ident + '.bin')
    if not target.exists():
        # Hash-derived path and exclusive create avoid trusting a supplied filename.
        try:
            with target.open('xb') as f:
                f.write(content)
        except FileExistsError:
            pass
    return {'id': ident, 'name': name.replace('\\', '/').split('/')[-1], 'size': len(content), 'kind': suffix[1:]}


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if not unicodedata.combining(c) and c != '\u0640')


def excerpt(line, needle):
    """Keep the match visible even in long OCR/wiki lines with diacritics."""
    at = normalize(line).find(needle)
    if at < 0: return line[:1000]
    offset = 0
    original = 0
    for original, char in enumerate(line):
        offset += len(normalize(char))
        if offset > at: break
    start = max(0, original - 250)
    return ('…' if start else '') + line[start:start+1000] + ('…' if len(line)>start+1000 else '')


def search_document(data_dir, ident, query):
    if not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f]{64}', ident):
        raise ValueError('معرّف الملف غير صالح')
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200:
        raise ValueError('أدخل عبارة بحث من حرفين إلى 200 حرف')
    needle = normalize(query.strip())
    if not needle.strip():
        raise ValueError('عبارة البحث غير صالحة')
    path = Path(data_dir) / 'library' / (ident + '.bin')
    if not path.is_file():
        raise ValueError('الملف المحلي غير موجود؛ أضفه مجددًا')
    data = path.read_bytes()
    pdf = b'%PDF-' in data[:1024]
    total_pages = 1
    scanned = 0
    matches = []
    if pdf:
        try:
            from pypdf import PdfReader
        except ImportError:
            raise ValueError('قراءة PDF غير متاحة: ثبّت pypdf أو استخدم النسخة المحمولة التي تتضمنه')
        try:
            reader = PdfReader(path, strict=False)
            if reader.is_encrypted:
                raise ValueError('هذا الملف محمي أو مشفر؛ لا يتجاوز سَنَد الحماية. أضف نسخة مسموحة قابلة للقراءة.')
            total_pages = len(reader.pages)
            pages = ((i + 1, reader.pages[i].extract_text() or '') for i in range(min(total_pages, MAX_PAGES)))
            for page, text in pages:
                scanned += 1
                for line in text.splitlines():
                    if needle in normalize(line):
                        matches.append({'location': f'صفحة PDF {page}', 'text': excerpt(line, needle)})
                        if len(matches) >= MAX_MATCHES:
                            break
                if len(matches) >= MAX_MATCHES:
                    break
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError('تعذر قراءة PDF؛ قد يكون تالفًا أو غير مدعوم') from exc
    else:
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError:
            raise ValueError('تعذر قراءة الملف النصي')
        scanned = 1
        for number, line in enumerate(text.splitlines(), 1):
            if needle in normalize(line):
                matches.append({'location': f'السطر {number}', 'text': excerpt(line, needle)})
                if len(matches) >= MAX_MATCHES:
                    break
    return {'matches': matches, 'scanned': scanned, 'total': total_pages, 'partial': scanned < total_pages or len(matches) >= MAX_MATCHES, 'warning': 'النص مستخرج آليًا وقد يتضمن أخطاء. طابقه مع النسخة الأصلية. لا يُقرأ النص من الصور الممسوحة ضوئيًا دون OCR.'}
