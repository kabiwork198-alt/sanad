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
_ARABIC_VARIANTS = str.maketrans({'أ':'ا', 'إ':'ا', 'آ':'ا', 'ٱ':'ا', 'ى':'ي'})


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


def normalize(text, mode='basic'):
    value = ''.join(c for c in unicodedata.normalize('NFKC', text).casefold() if not unicodedata.combining(c) and c != '\u0640')
    return value.translate(_ARABIC_VARIANTS) if mode == 'arabic-variants' else value


def excerpt(line, needle, mode='basic', at=None):
    """Keep the selected match visible even in long lines with diacritics."""
    if at is None: at = normalize(line, mode).find(needle)
    if at < 0: return line[:1000]
    offset = 0
    original = 0
    for original, char in enumerate(line):
        offset += len(normalize(char, mode))
        if offset > at: break
    start = max(0, original - 250)
    return ('…' if start else '') + line[start:start+1000] + ('…' if len(line)>start+1000 else '')


def search_document(data_dir, ident, query, mode='basic'):
    if not isinstance(ident, str) or not re.fullmatch(r'[0-9a-f]{64}', ident):
        raise ValueError('معرّف الملف غير صالح')
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200:
        raise ValueError('أدخل عبارة بحث من حرفين إلى 200 حرف')
    if mode not in ('basic', 'arabic-variants'):
        raise ValueError('نمط مطابقة البحث غير صالح')
    needle = normalize(query.strip(), mode)
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
                    if needle in normalize(line, mode):
                        matches.append({'location': f'صفحة PDF {page}', 'text': excerpt(line, needle, mode)})
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
        is_batch_ocr = text.startswith('#SANAD-OCR-TEXT-1\n')
        paginated_page = None
        carry = []
        # Count physical LF/CRLF lines consistently with the browser; Unicode
        # separators inside a line are text, not source line breaks.
        lines = re.split(r'\r?\n', text)
        for number, line in enumerate(lines, 1):
            if is_mineru or is_batch_ocr:
                marker = re.fullmatch(r'#SANAD-PAGE:([1-9][0-9]{0,6})', line)
                if marker:
                    paginated_page = int(marker.group(1))
                    continue
                if paginated_page is not None and line.startswith('| ') and needle in normalize(line[2:], mode):
                    engine = 'MinerU' if is_mineru else 'OCR المحلي'
                    matches.append({'location': f'صفحة PDF {paginated_page} بحسب {engine}؛ طابقها بالأصل', 'text': excerpt(line[2:], needle, mode)})
            elif is_openiti:
                if not line.strip() or line.startswith('# ' ) or line.startswith('### '):
                    carry = []
                cleaned = re.sub(r'^~~\s?', '', line)
                previous = ' '.join(part for _, part in carry)
                joined = (previous + ' ' if previous else '') + cleaned
                previous_length = len(normalize(previous, mode))
                pos = normalize(joined, mode).find(needle, max(0, previous_length - len(needle) + 1))
                if pos >= 0 and pos + len(needle) > previous_length:
                    # Locate the *selected* occurrence, not the first match in the
                    # context or the oldest retained line. Earlier matches may be
                    # hundreds of characters away and have already been reported.
                    first = number
                    if pos < previous_length:
                        offset = 0
                        for carried_line, part in carry:
                            end = offset + len(normalize(part, mode))
                            if pos < end:
                                first = carried_line
                                break
                            offset = end + 1  # separator inserted by join
                    location = f'السطر {number}' if first == number else f'الأسطر {first}–{number}'
                    matches.append({'location': location + ' (نص OpenITI الخام، ليس رقم صفحة)', 'text': excerpt(joined, needle, mode, pos)})
                carry.append((number, cleaned[-400:]))
                carry = carry[-6:]
                while sum(len(part) for _, part in carry) > 800 and len(carry) > 1:
                    carry.pop(0)
            elif needle in normalize(line, mode):
                matches.append({'location': f'السطر {number}', 'text': excerpt(line, needle, mode)})
            if len(matches) >= MAX_MATCHES:
                break
    warning = 'النص مستخرج آليًا وقد يتضمن أخطاء. طابقه مع النسخة الأصلية. لا يُقرأ النص من الصور الممسوحة ضوئيًا دون OCR.'
    if not pdf and is_batch_ocr:
        warning = 'نص OCR المحلي تقريبي وقد يتضمن صفحات فارغة أو أخطاء؛ طابق المقتطف ورقم الصفحة مع الأصل والطبعة.'
    if not pdf and is_mineru:
        warning = 'نتيجة MinerU مستوردة وقد تحذف عناصر أو تخطئ في ترتيب العربية وقراءة الصفحات. رقم الصفحة من ملف النتيجة؛ طابقه مع الأصل والطبعة.'
    if not pdf and is_openiti:
        warning = 'نص OpenITI الخام قد يحتوي وسومًا وأخطاء؛ الأسطر ليست صفحات الطبعة. طابق المقتطف مع الأصل وراجع الحقوق.'
    if mode == 'arabic-variants':
        warning += ' مطابقة مرنة للألف والياء فقط؛ قد تشمل أسماء مختلفة ولا تشمل جميع اختلافات التهجئة.'
    return {'match_mode': mode, 'matches': matches, 'scanned': scanned, 'total': total_pages, 'partial': scanned < total_pages or len(matches) >= MAX_MATCHES, 'warning': warning}

# One session's bounded reading set; no OCR or remote access is attempted.
ANALYSIS_CHARS = 1800
ANALYSIS_SEGMENTS = 200

def analysis_segments(data_dir, ident, cursor=None):
    """Extract one bounded consecutive batch, with a resumable position.

    Positions refer to extracted Unicode text, not printed page numbers. A
    cursor is local to the content-addressed file and is never a filesystem path.
    """
    data = read_verified_document(data_dir, ident)
    pdf = b'%PDF-' in data[:1024]
    segments, empty_pages = [], []
    scanned, next_cursor = 0, None
    if cursor is None:
        cursor = {'page': 1, 'offset': 0} if pdf else {'offset': 0}
    keys = {'page', 'offset'} if pdf else {'offset'}
    if not isinstance(cursor, dict) or set(cursor) != keys or any(type(v) is not int or v < 0 for v in cursor.values()) or (pdf and cursor['page'] < 1):
        raise ValueError('موضع الاستكمال غير صالح')
    if pdf:
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(data), strict=False)
            if reader.is_encrypted:
                raise ValueError('الملف مشفر؛ أضف نسخة مسموحة قابلة للقراءة')
            total = len(reader.pages)
            start_page = cursor['page'] - 1
            if start_page >= total:
                raise ValueError('موضع الصفحة خارج الملف')
            for page in range(start_page, min(total, start_page + MAX_PAGES)):
                text = reader.pages[page].extract_text() or ''
                scanned += 1
                start = cursor['offset'] if page == start_page else 0
                if start > len(text):
                    raise ValueError('موضع المحرف خارج الصفحة')
                if not text.strip():
                    empty_pages.append(page + 1)
                    continue
                for offset in range(start, len(text), ANALYSIS_CHARS):
                    if len(segments) >= ANALYSIS_SEGMENTS:
                        next_cursor = {'page': page + 1, 'offset': offset}
                        break
                    piece = text[offset:offset + ANALYSIS_CHARS]
                    segments.append({'location': f'صفحة PDF {page + 1}، محارف النص المستخرج {offset + 1}–{offset + len(piece)}', 'text': piece})
                if next_cursor:
                    break
            if next_cursor is None and start_page + scanned < total:
                next_cursor = {'page': start_page + scanned + 1, 'offset': 0}
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError('تعذر استخراج نص PDF؛ قد يكون تالفًا أو غير مدعوم') from exc
    else:
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError as exc:
            raise ValueError('تعذر قراءة الملف النصي بترميز UTF-8') from exc
        total = 1
        scanned = 1
        start = cursor['offset']
        if start > len(text):
            raise ValueError('موضع المحرف خارج الملف')
        for offset in range(start, len(text), ANALYSIS_CHARS):
            if len(segments) >= ANALYSIS_SEGMENTS:
                next_cursor = {'offset': offset}
                break
            piece = text[offset:offset + ANALYSIS_CHARS]
            segments.append({'location': f'محارف النص {offset + 1}–{offset + len(piece)} (ليست صفحات الطبعة)', 'text': piece})
    return {'segments': segments, 'kind': 'pdf' if pdf else 'text', 'scanned': scanned, 'total': total,
            'partial': next_cursor is not None, 'next_cursor': next_cursor, 'cursor': cursor,
            'empty_pages': empty_pages, 'segment_limit': ANALYSIS_SEGMENTS,
            'warning': 'النص مستخرج آليًا؛ الصفحات بلا نص قد تكون صورًا أو فارغة، والموضع ليس رقم صفحة الطبعة. طابق النص والأصل والحقوق.'}
