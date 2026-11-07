"""Local user-provided documents. No network, DRM bypass, or code execution."""
import base64
import binascii
import hashlib
import io
import os
import tempfile
import threading
import re
import unicodedata
from pathlib import Path

MAX_FILE = 20 * 1024 * 1024
MAX_PAGES = 300
MAX_MATCHES = 12
_IMPORT_LOCK = threading.Lock()


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
    # Publish only a fully written file. Serialize imports within this process so
    # a simultaneous import cannot mistake an in-progress write for corruption.
    with _IMPORT_LOCK:
        if not target.exists():
            fd, temporary = tempfile.mkstemp(prefix='.import-', dir=folder)
            try:
                with os.fdopen(fd, 'wb') as f:
                    f.write(content)
                os.replace(temporary, target)
            finally:
                try: os.unlink(temporary)
                except FileNotFoundError: pass
        if target.stat().st_size != len(content) or hashlib.sha256(target.read_bytes()).hexdigest() != ident:
            raise ValueError('الملف المحلي الموجود تالف؛ لم يُستبدل. احتفظ بنسخة منه وأعد إرفاق الملف بعد حل المشكلة')
    return {'id': ident, 'name': name.replace('\\', '/').split('/')[-1], 'size': len(content), 'kind': suffix[1:]}


def read_verified_document(data_dir, ident):
    """Read a bounded content-addressed file and reject changed/corrupt data."""
    if not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f]{64}', ident):
        raise ValueError('معرّف الملف غير صالح')
    path = Path(data_dir) / 'library' / (ident + '.bin')
    if not path.is_file():
        raise ValueError('ملف مرتبط مفقود؛ أعد إرفاقه')
    with path.open('rb') as f:
        data = f.read(MAX_FILE + 1)
    if not data or len(data) > MAX_FILE or hashlib.sha256(data).hexdigest() != ident:
        raise ValueError('ملف مرتبط تالف أو لا تطابق بصمته المعرّف')
    return data


def export_document(data_dir, ident):
    """Export only a content-addressed local file, verifying it before backup."""
    data = read_verified_document(data_dir, ident)
    kind = 'pdf' if b'%PDF-' in data[:1024] else 'txt'
    return {'id': ident, 'name': ident + '.' + kind, 'size': len(data),
            'content': base64.b64encode(data).decode('ascii')}


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
    data = read_verified_document(data_dir, ident)
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
            reader = PdfReader(io.BytesIO(data), strict=False)
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
        is_openiti = text.startswith('######OpenITI#')
        is_mineru = text.startswith('#SANAD-MINERU-TEXT-1\n')
        mineru_page = None
        carry = []
        for number, line in enumerate(text.splitlines(), 1):
            if is_mineru:
                marker = re.fullmatch(r'#SANAD-PAGE:([1-9][0-9]{0,6})', line)
                if marker:
                    mineru_page = int(marker.group(1))
                    continue
                if mineru_page is not None and line.startswith('| ') and needle in normalize(line[2:]):
                    matches.append({'location': f'صفحة PDF {mineru_page} بحسب MinerU؛ طابقها بالأصل', 'text': excerpt(line[2:], needle)})
            elif is_openiti:
                if not line.strip() or line.startswith('# ' ) or line.startswith('### '):
                    carry = []
                cleaned = re.sub(r'^~~\s?', '', line)
                previous = ' '.join(part for _, part in carry)
                joined = (previous + ' ' if previous else '') + cleaned
                previous_length = len(normalize(previous))
                pos = normalize(joined).find(needle, max(0, previous_length - len(needle) + 1))
                if pos >= 0 and pos + len(needle) > previous_length:
                    first = number if needle in normalize(cleaned) else (carry[0][0] if carry else number)
                    location = f'السطر {number}' if first == number else f'الأسطر {first}–{number}'
                    matches.append({'location': location + ' (نص OpenITI الخام، ليس رقم صفحة)', 'text': excerpt(joined, needle)})
                carry.append((number, cleaned[-400:]))
                carry = carry[-6:]
                while sum(len(part) for _, part in carry) > 800 and len(carry) > 1:
                    carry.pop(0)
            elif needle in normalize(line):
                matches.append({'location': f'السطر {number}', 'text': excerpt(line, needle)})
            if len(matches) >= MAX_MATCHES:
                break
    warning = 'النص مستخرج آليًا وقد يتضمن أخطاء. طابقه مع النسخة الأصلية. لا يُقرأ النص من الصور الممسوحة ضوئيًا دون OCR.'
    if not pdf and is_mineru:
        warning = 'نتيجة MinerU مستوردة وقد تحذف عناصر أو تخطئ في ترتيب العربية وقراءة الصفحات. رقم الصفحة من ملف النتيجة؛ طابقه مع الأصل والطبعة.'
    if not pdf and is_openiti:
        warning = 'نص OpenITI الخام قد يحتوي وسومًا وأخطاء؛ الأسطر ليست صفحات الطبعة. طابق المقتطف مع الأصل وراجع الحقوق.'
    return {'matches': matches, 'scanned': scanned, 'total': total_pages, 'partial': scanned < total_pages or len(matches) >= MAX_MATCHES, 'warning': warning}
