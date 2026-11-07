"""Public catalog search. Results are leads, not proof of access or rights."""
import json
import re
import urllib.parse
import urllib.request


def get_json(host, params):
    url = host + '?' + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={'Accept':'application/json', 'User-Agent':'SanadStudio/0.1 (local research tool)'})
    with urllib.request.urlopen(req, timeout=15) as response:
        data = response.read(2_000_001)
    if len(data) > 2_000_000:
        raise ValueError('استجابة الفهرس كبيرة جدًا')
    return json.loads(data)


def wikisource(query):
    data = get_json('https://ar.wikisource.org/w/api.php', {'action':'query','list':'search','srsearch':query,'srnamespace':'0','srlimit':'10','format':'json','formatversion':'2'})
    items = []
    for item in data.get('query', {}).get('search', []):
        ident, title = item.get('pageid'), item.get('title')
        if isinstance(ident, int) and ident > 0 and isinstance(title, str) and title.strip():
            items.append({'title':title[:300], 'url':f'https://ar.wikisource.org/?curid={ident}', 'author':'',
                          'detail':'نتيجة في ويكي مصدر العربية؛ طابق النص والطبعة مع المصدر الأصلي.',
                          'access':'صفحة ضمن مكتبة نصية؛ لم يُقرأ نصها آليًا. راجع الإتاحة والترخيص والطبعة.'})
    return items


def internet_archive(query):
    # Quote metacharacters as a literal phrase, not arbitrary Solr syntax.
    phrase = query.replace('\\', '\\\\').replace('"', '\\"')
    data = get_json('https://archive.org/advancedsearch.php', {'q':f'"{phrase}" AND mediatype:texts','fl[]':['identifier','title','creator','year'],'rows':'10','output':'json'})
    items = []
    for item in data.get('response', {}).get('docs', []):
        ident = item.get('identifier', '')
        if not isinstance(ident, str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}', ident):
            continue
        creator = item.get('creator', '')
        if isinstance(creator, list):
            creator = ', '.join(str(x) for x in creator[:5])
        title = item.get('title') or ident
        if isinstance(title, list): title = title[0] if title else ident
        year = item.get('year', '')
        items.append({'title':str(title)[:300], 'url':'https://archive.org/details/'+ident, 'author':str(creator)[:300],
                      'detail':'سنة النشر المفهرسة: '+str(year or 'غير معروفة')+'؛ قد يكون السجل غير دقيق أو مكررًا.',
                      'access':'سجل كتاب في Internet Archive؛ لا يضمن الإتاحة أو التنزيل أو الترخيص.'})
    return items


def loc(query, collection):
    """Search two fixed LOC collections; do not infer access rights from a result."""
    if collection == 'world-digital-library':
        params = {'fo':'json', 'at':'results', 'c':'8', 'q':query}
    elif collection == 'chronicling-america':
        params = {'fo':'json', 'at':'results', 'c':'8', 'dl':'page', 'qs':query}
    else:
        raise ValueError('مجموعة غير مدعومة')
    data = get_json('https://www.loc.gov/collections/' + collection + '/', params)
    items = []
    for item in data.get('results', []):
        raw_url = item.get('url') or item.get('id') or ''
        parsed = urllib.parse.urlparse(raw_url if isinstance(raw_url, str) else '')
        if parsed.hostname not in ('www.loc.gov', 'loc.gov') or parsed.scheme not in ('http', 'https') or parsed.username or parsed.password:
            continue
        url = urllib.parse.urlunparse(('https', parsed.netloc, parsed.path, parsed.params, parsed.query, parsed.fragment))
        title = item.get('title') or 'بلا عنوان'
        if isinstance(title, list): title = title[0] if title else 'بلا عنوان'
        date = str(item.get('date') or 'غير معروف')[:100]
        raw_kind = item.get('original_format') or []
        if isinstance(raw_kind, str): raw_kind = [raw_kind]
        kind = ', '.join(str(x) for x in raw_kind[:4]) if isinstance(raw_kind, list) else ''
        restricted = 'يذكر السجل وجود تقييد.' if item.get('access_restricted') is True else 'تحقق من الإتاحة والحقوق في السجل.'
        if collection == 'chronicling-america':
            kind = 'صفحة صحيفة أمريكية؛ تحقق من التاريخ وصورة الصفحة وأخطاء OCR. ' + kind
        items.append({'title':str(title)[:300], 'url':url, 'author':'مكتبة الكونغرس / الجهة الحافظة كما في السجل',
                      'detail':'التاريخ في السجل: ' + date + '؛ النوع: ' + (kind or 'غير محدد') + '؛ قد يشير التاريخ إلى النشر أو إنشاء المادة لا إلى الحدث.',
                      'access':'سجل أرشيفي؛ لم تُقرأ المادة أو يثبت ترخيص استخدامها. ' + restricted})
    return items


def national_archives(query):
    data = get_json('https://discovery.nationalarchives.gov.uk/API/search/v1/records', {'sps.searchQuery':query, 'sps.resultsPageSize':'8'})
    items = []
    for item in data.get('records', []):
        ident = item.get('id', '')
        if not isinstance(ident, str) or not re.fullmatch(r'[A-Za-z0-9]{1,40}', ident):
            continue
        held = item.get('heldBy') or []
        if isinstance(held, str): held = [held]
        held_text = ', '.join(str(x) for x in held[:4]) if isinstance(held, list) else ''
        reference = item.get('reference') or item.get('formerReferencePro') or 'غير مذكور'
        items.append({'title':str(item.get('title') or 'بلا عنوان')[:300],
                      'url':'https://discovery.nationalarchives.gov.uk/details/r/'+ident,
                      'author':held_text or 'الجهة الحافظة غير محددة',
                      'detail':'رقم المرجع: '+str(reference)[:200]+'؛ التواريخ الواردة: '+str(item.get('coveringDates') or 'غير معروفة')[:100]+'؛ حالة الإغلاق في السجل: '+str(item.get('closureStatus') or 'غير معروفة')[:30],
                      'access':'سجل فهرسي فقط؛ قد يكون لدى مؤسسة أخرى أو غير مرقمن أو يتطلب رسومًا أو إذنًا.'})
    return items
