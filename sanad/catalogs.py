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
    if collection in ('world-digital-library', 'islamic-manuscripts-from-mali'):
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
        if collection == 'islamic-manuscripts-from-mali':
            kind = 'مخطوطات مالي الإسلامية؛ قد تكون النتيجة وصفًا فقط، وراجع الصورة وحقوقها. ' + kind
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


def doaj(query):
    """Search DOAJ's public article catalog; do not automatically copy article text."""
    url = 'https://doaj.org/api/search/articles/' + urllib.parse.quote(query, safe='')
    data = get_json(url, {'page':'1','pageSize':'10'})
    items = []
    for record in data.get('results', []):
        ident = record.get('id', '')
        if not isinstance(ident, str) or not re.fullmatch(r'[a-f0-9]{32}', ident):
            continue
        bib = record.get('bibjson') or {}
        if not isinstance(bib, dict): continue
        authors = bib.get('author') or []
        names = ', '.join(str(x.get('name','')) for x in authors[:5] if isinstance(x,dict)) if isinstance(authors,list) else ''
        journal = bib.get('journal') or {}
        if not isinstance(journal,dict): journal={}
        identifiers = bib.get('identifier') or []
        doi = next((str(x.get('id','')) for x in identifiers if isinstance(x,dict) and x.get('type')=='doi'), '') if isinstance(identifiers,list) else ''
        items.append({'title':str(bib.get('title') or 'بلا عنوان')[:300], 'author':names[:300],
                      'url':'https://doaj.org/article/'+ident,
                      'detail':'سنة نشر الدراسة: '+str(bib.get('year') or 'غير معروفة')[:40]+'؛ المجلة: '+str(journal.get('title') or 'غير معروفة')[:200]+'؛ DOI: '+doi[:200],
                      'access':'سجل دراسة في DOAJ؛ تحقق من النص الكامل والرخصة لدى الناشر. لم يُقرأ النص آليًا.'})
    return items


def openalex(query):
    """Anonymous OpenAlex search only; no account or paid API key is used."""
    data = get_json('https://api.openalex.org/works', {'search':query,'per_page':'10','select':'id,title,publication_year,authorships,open_access'})
    items = []
    for record in data.get('results', []):
        ident = record.get('id', '')
        if not isinstance(ident,str) or not re.fullmatch(r'https://openalex\.org/W[0-9]+',ident): continue
        authors = record.get('authorships') or []
        names = ', '.join(str((x.get('author') or {}).get('display_name','')) for x in authors[:5] if isinstance(x,dict) and isinstance(x.get('author'),dict)) if isinstance(authors,list) else ''
        oa = record.get('open_access') or {}
        if not isinstance(oa,dict): oa={}
        status = str(oa.get('oa_status') or 'غير معروف')[:80]
        items.append({'title':str(record.get('title') or 'بلا عنوان')[:300], 'author':names[:300], 'url':ident,
                      'detail':'سنة نشر الدراسة: '+str(record.get('publication_year') or 'غير معروفة')[:40]+'؛ حالة الوصول بحسب الفهرس: '+status,
                      'access':'سجل OpenAlex؛ تحقق من النص الكامل والرخصة والإتاحة الحالية. لم يُقرأ النص آليًا.'})
    return items


def read_wikisource(page_id):
    """Fetch one selected public Wikisource revision; do not crawl or execute wikitext."""
    if not isinstance(page_id, str) or not re.fullmatch(r'[1-9][0-9]{0,12}', page_id):
        raise ValueError('معرّف صفحة ويكي مصدر غير صالح')
    data = get_json('https://ar.wikisource.org/w/api.php', {'action':'query','prop':'revisions','pageids':page_id,'rvprop':'ids|timestamp|content','rvslots':'main','format':'json','formatversion':'2'})
    pages = data.get('query', {}).get('pages', [])
    page = pages[0] if len(pages)==1 else {}
    revision = (page.get('revisions') or [{}])[0]
    text = ((revision.get('slots') or {}).get('main') or {}).get('content')
    rev = revision.get('revid')
    if str(page.get('pageid')) != page_id or not isinstance(rev,int) or rev<=0 or not isinstance(text,str) or not text.strip():
        raise ValueError('الصفحة غير متاحة أو لا تحتوي نصًا قابلًا للقراءة')
    if len(text.encode('utf-8')) > 1_800_000:
        raise ValueError('الصفحة أكبر من الحد الآمن. افتحها على الموقع أو اختر صفحة أصغر.')
    return {'title':str(page.get('title') or 'بلا عنوان')[:300], 'page_id':page_id, 'revision_id':str(rev),
            'timestamp':str(revision.get('timestamp') or ''), 'text':text,
            'revision_url':'https://ar.wikisource.org/w/index.php?oldid='+str(rev),
            'warning':'النص خام بصيغة ويكي وقد يكون فهرسًا أو جزءًا من كتاب، لا كتابًا كاملًا. رقم السطر ليس رقم صفحة الطبعة. تحقق من النسخة والترخيص وطابقها مع المصدر.'}


def wikisource_other(query, language):
    """Search fixed Wikisource language editions; records are not yet texts."""
    labels = {'en':'الإنجليزية', 'fr':'الفرنسية'}
    if language not in labels: raise ValueError('لغة ويكي مصدر غير مدعومة')
    data = get_json('https://' + language + '.wikisource.org/w/api.php', {'action':'query','list':'search','srsearch':query,'srnamespace':'0','srlimit':'10','format':'json','formatversion':'2'})
    items = []
    for item in data.get('query', {}).get('search', []):
        ident, title = item.get('pageid'), item.get('title')
        if isinstance(ident, int) and not isinstance(ident, bool) and ident > 0 and isinstance(title, str) and title.strip():
            items.append({'title':title[:300], 'url':f'https://{language}.wikisource.org/?curid={ident}', 'author':'',
                          'detail':'نتيجة في ويكي مصدر '+labels[language]+'؛ راجع النسخة والطبعة والترجمة.',
                          'access':'سجل صفحة؛ لم يُقرأ النص بعد. راجع الترخيص والسياق.'})
    return items


def read_wikisource_rendered(page_id, language):
    """Extract bounded plain text from one rendered Wikisource page, never execute HTML."""
    from html.parser import HTMLParser
    if language not in ('ar', 'en', 'fr'): raise ValueError('لغة ويكي مصدر غير مدعومة')
    if not isinstance(page_id, str) or not re.fullmatch(r'[1-9][0-9]{0,12}', page_id):
        raise ValueError('معرّف صفحة ويكي مصدر غير صالح')
    data = get_json('https://' + language + '.wikisource.org/w/api.php', {'action':'parse','pageid':page_id,'prop':'text|revid','format':'json','formatversion':'2'})
    item = data.get('parse') if isinstance(data, dict) else None
    if not isinstance(item, dict) or str(item.get('pageid')) != page_id or not isinstance(item.get('revid'), int) or isinstance(item.get('revid'), bool) or item['revid'] <= 0 or not isinstance(item.get('text'), str):
        raise ValueError('الصفحة المعروضة غير متاحة أو استجابة ويكي غير صالحة')
    class PlainText(HTMLParser):
        blocks = {'p','div','br','li','tr','h1','h2','h3','h4','h5','h6','section','blockquote'}
        excluded = {'script','style','noscript','iframe','object','svg','canvas'}
        def __init__(self):
            super().__init__(convert_charrefs=True); self.parts=[]; self.skip_tag=None; self.skip_depth=0
        def handle_starttag(self, tag, attrs):
            if self.skip_tag:
                if tag == self.skip_tag: self.skip_depth += 1
            elif tag in self.excluded: self.skip_tag=tag; self.skip_depth=1
            elif tag in self.blocks: self.parts.append('\n')
        def handle_startendtag(self, tag, attrs):
            if not self.skip_tag and tag in self.blocks: self.parts.append('\n')
        def handle_endtag(self, tag):
            if self.skip_tag:
                if tag == self.skip_tag:
                    self.skip_depth -= 1
                    if not self.skip_depth: self.skip_tag=None
            elif tag in self.blocks: self.parts.append('\n')
        def handle_data(self, value):
            if not self.skip_tag: self.parts.append(value)
    parser=PlainText();parser.feed(item['text']);text=''.join(parser.parts).strip()
    if not text or len(text.encode('utf-8')) > 1_800_000:
        raise ValueError('النص غير متاح أو أكبر من الحد الآمن')
    rev = str(item['revid'])
    return {'title':str(item.get('title') or 'بلا عنوان')[:300], 'page_id':page_id, 'language':language, 'revision_id':rev,
            'revision_url':'https://'+language+'.wikisource.org/w/index.php?oldid='+rev, 'text':text,
            'warning':'نص آلي مستخرج من صفحة معروضة وقد يضم ترويسات وحواشي أو أخطاء؛ المراجعة تخص الصفحة وقد يتغير المحتوى المضمّن والقوالب. رقم السطر ليس صفحة الطبعة. راجع صورة المصدر والطبعة والترجمة والحقوق.'}
