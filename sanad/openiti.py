"""Opt-in search of the upstream OpenITI 2025.1.9 metadata snapshot.

The index is fetched from OpenITI on demand, not bundled or redistributed.
Results are catalog entries, not proof that a text is available or read.
"""
import functools
import re
import unicodedata
import urllib.request

REVISION = 'cfc4157a3cf2054c0888f133970a4eaa3e22e58c'
ROOT = 'https://github.com/OpenITI/RELEASE/blob/' + REVISION + '/'
INDEX_URL = 'https://raw.githubusercontent.com/OpenITI/RELEASE/' + REVISION + '/metadata/OpenITI_metadata_2025-1-9.tsv'
MAX_BYTES = 13_500_000
MAX_RESULTS = 25
WARNING = 'بحث في فهرس OpenITI 2025.1.9 فقط؛ لم يُقرأ النص. رخصة المجموعة CC BY-NC-SA 4.0 تقيد الاستخدام التجاري؛ راجع الحقوق والطبعة والإتاحة قبل النشر.'


def normalize(value):
    return ''.join(c for c in unicodedata.normalize('NFKC', str(value)).casefold() if not unicodedata.combining(c) and c != '\u0640')


@functools.lru_cache(maxsize=1)
def fetch_index():
    req = urllib.request.Request(INDEX_URL, headers={'User-Agent':'SanadStudio/0.1 (local research tool)', 'Accept':'text/plain'})
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('فهرس OpenITI أكبر من الحد الآمن؛ افتحه على موقعه')
    try:
        text = raw.decode('utf-8-sig')
    except UnicodeDecodeError as exc:
        raise ValueError('تعذر قراءة فهرس OpenITI') from exc
    headers = text.split('\n', 1)[0].split('\t')
    if not all(key in headers for key in ('version_uri','author_ar','author_lat','title_ar','title_lat','date','status','ed_info','local_path')):
        raise ValueError('صيغة فهرس OpenITI غير مدعومة')
    return text


def search_index(query, text):
    if not isinstance(query, str) or not query.strip() or len(query)>300:
        raise ValueError('أدخل عبارة بحث لا تتجاوز 300 حرف')
    needle = normalize(query.strip())
    terms = needle.split()
    if not terms:
        raise ValueError('عبارة البحث غير صالحة')
    lines = text.splitlines()
    if not lines:
        raise ValueError('فهرس OpenITI فارغ')
    headers = lines[0].lstrip('\ufeff').split('\t')
    required = ['version_uri','author_ar','author_lat','title_ar','title_lat','date','status','ed_info','local_path']
    if not all(x in headers for x in required):
        raise ValueError('صيغة فهرس OpenITI غير مدعومة')
    idx = {x:headers.index(x) for x in required}
    results = []
    count = 0
    for line in lines[1:]:
        values = line.split('\t')
        if len(values) < len(headers): continue
        data = {x:values[i] for x,i in idx.items()}
        path = data['local_path']
        parts = path.split('/')
        if len(parts)!=4 or parts[0]!='data' or any(not re.fullmatch(r'[A-Za-z0-9_.-]+', x) or x in ('.','..') for x in parts[1:]): continue
        combined = normalize(' '.join(data[x] for x in ('title_ar','title_lat','author_ar','author_lat','version_uri')))
        if not all(term in combined for term in terms): continue
        count += 1
        score = (0 if needle in normalize(data['title_ar']+' '+data['title_lat']) else 1,
                 0 if data['status'].lower() == 'pri' else 1)
        if len(results)<MAX_RESULTS or score < results[-1][0]:
            title = data['title_ar'] or data['title_lat'] or data['version_uri']
            item = {'title':title[:300], 'author':(data['author_ar'] or data['author_lat'])[:300],
                    'url':ROOT+path, 'detail':'معرّف النسخة: '+data['version_uri'][:200]+'؛ رمز السنة في الفهرس: '+(data['date'] or 'غير معروف')[:40]+' (ليس تاريخ الحدث)؛ حالة النسخة: '+(data['status'] or 'غير معروف')[:40]+'؛ بيانات الطبعة: '+(data['ed_info'] or 'غير معروفة')[:400],
                    'access':'سجل OpenITI؛ قد يتعذر فتح النص. لم يُقرأ آليًا. راجع الطبعة والرخصة، وبخاصة قيود الاستخدام التجاري.'}
            results.append((score,item))
            results.sort(key=lambda x:x[0])
            del results[MAX_RESULTS:]
    return {'query':query.strip(), 'total':count, 'results':[item for _,item in results], 'warning':WARNING}


def search(query):
    if not isinstance(query, str) or not query.strip() or len(query)>300 or not normalize(query).strip():
        raise ValueError('أدخل عبارة بحث لا تتجاوز 300 حرف')
    return search_index(query, fetch_index())
