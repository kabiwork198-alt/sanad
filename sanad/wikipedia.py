"""Topic leads and citation breadcrumbs from Arabic Wikipedia, not source verification."""
import json
import re
import urllib.parse
import urllib.request
import unicodedata
from html.parser import HTMLParser
from sanad.http_identity import USER_AGENT

API = 'https://ar.wikipedia.org/w/api.php?'
CATEGORY = 'تصنيف:تاريخ إسلامي'


def get_json(params):
    params = dict(params, format='json', formatversion='2')
    request = urllib.request.Request(API + urllib.parse.urlencode(params), headers={'Accept': 'application/json', 'User-Agent': USER_AGENT})
    with urllib.request.urlopen(request, timeout=15) as response:
        data = response.read(3_000_001)
    if len(data) > 3_000_000:
        raise ValueError('استجابة ويكيبيديا كبيرة جدًا')
    return json.loads(data)


TOPIC_CATEGORIES = {
    'travel': ('الرحالة والطرق', 'تصنيف:رحالة مسلمون'),
    'andalus': ('الأندلس', 'تصنيف:تاريخ الأندلس'),
    'battles': ('المعارك والأحداث', 'تصنيف:معارك العرب'),
    'maghreb': ('المغرب', 'تصنيف:تاريخ المغرب'),
    'islamic': ('التاريخ الإسلامي', 'تصنيف:تاريخ إسلامي'),
}


def topics(category='travel', query='', cursor=''):
    if not isinstance(category,str) or category not in TOPIC_CATEGORIES: raise ValueError('مسار الموضوعات غير صالح')
    if not isinstance(query,str) or len(query)>120 or any(ord(c)<32 and c not in '\t\n\r' for c in query): raise ValueError('عبارة البحث غير صالحة')
    query=' '.join(query.split())
    if query and len(query)<2: raise ValueError('أدخل كلمتين أو حرفين على الأقل')
    if not isinstance(cursor,str) or len(cursor)>600: raise ValueError('مؤشر النتائج غير صالح')
    params={'action':'query','prop':'extracts|pageprops','exintro':'1','explaintext':'1','exsentences':'2','exlimit':'12','ppprop':'disambiguation'}
    label,cat=TOPIC_CATEGORIES[category]
    if query:
        if cursor and (not re.fullmatch(r'[0-9]{1,3}',cursor) or int(cursor)>200): raise ValueError('مؤشر البحث غير صالح')
        params.update({'generator':'search','gsrsearch':query,'gsrnamespace':'0','gsrlimit':'12'})
        if cursor: params['gsroffset']=cursor
    else:
        if cursor and not re.fullmatch(r'page\|[0-9a-f]{1,550}\|[0-9]{1,13}',cursor): raise ValueError('مؤشر التصنيف غير صالح')
        params.update({'generator':'categorymembers','gcmtitle':cat,'gcmtype':'page','gcmlimit':'12'})
        if cursor: params.update({'gcmcontinue':cursor,'continue':'gcmcontinue||'})
    data=get_json(params)
    if not isinstance(data,dict) or data.get('error'): raise ValueError('تعذر قراءة استجابة ويكيبيديا')
    raw=(data.get('query') or {}).get('pages',[])
    if not isinstance(raw,list): raise ValueError('استجابة ويكيبيديا غير صالحة')
    seen=set();found=[]
    for item in raw[:12]:
        if not isinstance(item,dict):continue
        ident,title,extract=item.get('pageid'),item.get('title'),item.get('extract')
        if not isinstance(ident,int) or isinstance(ident,bool) or not 0<ident<10**13 or ident in seen or item.get('ns')!=0 or not isinstance(title,str) or not title.strip() or len(title)>200 or not isinstance(extract,str): continue
        if isinstance(item.get('pageprops'),dict) and 'disambiguation' in item['pageprops']: continue
        title=' '.join(title.split()); extract=' '.join(extract.split())
        if len(extract)<40 or re.match(r'^(?:قائمة|تصنيف|بوابة|[0-9٠-٩]{3,4}\s)',title):continue
        seen.add(ident);score=sum(term in extract for term in ('رحل','رسالة','مخطوط','معركة','حصار','تجارة','رحلة','مقاومة','هجرة','ترجم'))
        found.append({'id':str(ident),'title':title,'url':f'https://ar.wikipedia.org/?curid={ident}','extract':extract[:350]+('…' if len(extract)>350 else ''),'score':score,'index':item.get('index') if isinstance(item.get('index'),int) else 9999})
    def norm(value):
        value=unicodedata.normalize('NFKD',value).lower().translate(str.maketrans({'أ':'ا','إ':'ا','آ':'ا','ٱ':'ا','ى':'ي'}))
        return ''.join(c for c in value if not unicodedata.combining(c))
    terms=[t for t in re.findall(r'[^\W_]+',norm(query)) if len(t)>=3 and t not in ('ابن','تاريخ','كتاب','على','إلى','الى')]
    if not any(t in norm(query) for t in ('مسلسل','فيلم','روايه')):
        found=[x for x in found if not re.search(r'\((?:مسلسل|فيلم|رواية)(?:\s|\))',x['title']) and not re.search(r'(?:هو|هي)\s+(?:فيلم|مسلسل|رواية)\b',x['extract'][:250])]
    if terms: found=[x for x in found if any(t in norm(x['title']+' '+x['extract']) for t in terms)]
    found.sort(key=(lambda x:(-sum(t in norm(x['title']) for t in terms),-sum(t in norm(x['extract']) for t in terms),x['index'])) if query else (lambda x:-x['score']))
    for row in found: row.pop('score');row.pop('index')
    continuation=data.get('continue') if isinstance(data,dict) and isinstance(data.get('continue'),dict) else {}
    nextval=continuation.get('gsroffset') if query else continuation.get('gcmcontinue')
    nextval=str(nextval) if nextval is not None else ''
    if query and (not re.fullmatch(r'[0-9]{1,3}',nextval or '') or int(nextval)>200):nextval=''
    if not query and not re.fullmatch(r'page\|[0-9a-f]{1,550}\|[0-9]{1,13}',nextval or ''):nextval=''
    return {'topics':found,'category':category,'category_label':label,'query':query,'next_cursor':nextval,
            'origin_url':'https://ar.wikipedia.org/wiki/'+urllib.parse.quote(cat.replace(' ','_'))}


def topic_sections(page_id):
    if not isinstance(page_id,str) or not re.fullmatch(r'[1-9][0-9]{0,12}',page_id): raise ValueError('معرّف المقالة غير صالح')
    data=get_json({'action':'parse','pageid':page_id,'prop':'tocdata|revid'})
    item=data.get('parse') if isinstance(data,dict) else None
    if not isinstance(item,dict) or str(item.get('pageid'))!=page_id or not isinstance(item.get('revid'),int) or isinstance(item.get('revid'),bool) or item['revid']<=0: raise ValueError('تعذر قراءة فهرس المقالة')
    raw=item.get('tocdata',{}).get('sections',[]) if isinstance(item.get('tocdata'),dict) else []
    if not isinstance(raw,list): raise ValueError('فهرس المقالة غير صالح')
    revision_url='https://ar.wikipedia.org/w/index.php?oldid='+str(item['revid'])
    sections=[];seen=set()
    for row in raw[:200]:
        if not isinstance(row,dict) or row.get('tocLevel') not in (1,2):continue
        line=row.get('line')
        if not isinstance(line,str):continue
        line=' '.join(re.sub(r'<[^>]*>','',line).split())
        if len(line)<3 or len(line)>120 or any(c in line for c in '<>') or re.search(r'^(?:المراجع|المصادر|الهوامش|هوامش|وصلات خارجية|انظر أيض[اًا]|ملاحظات|فهرس المراجع|المعلومات الكاملة للمراجع)(?:\s|$)',line):continue
        anchor=row.get('anchor'); url=''
        if isinstance(anchor,str) and 0<len(anchor)<=300 and not re.search(r'[\x00-\x1f\x7f]',anchor):
            try: url=revision_url+'#'+urllib.parse.quote(anchor,safe='')
            except UnicodeEncodeError: pass
        key=url or line
        if key in seen:continue
        seen.add(key)
        number=row.get('number')
        number=number if isinstance(number,str) and re.fullmatch(r'[0-9]{1,3}(?:\.[0-9]{1,3}){0,3}',number) else ''
        sections.append({'title':line,'number':number,'url':url})
        if len(sections)>=40:break
    return {'page_id':page_id,'title':str(item.get('title') or '')[:200],'revision_url':revision_url,
            'sections':sections,'warning':'حتى 40 عنوانًا مناسبًا من أول 200 قسم في المستويين الأولين؛ قد تُستبعد أقسام أخرى. العناوين إرشادية وليست حقائق مثبتة أو قائمة مصادر؛ راجع المصادر الأصلية.'}


class Citations(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.current = None
        self.items = []

    def handle_starttag(self, tag, attrs):
        if tag == 'li':
            if self.depth:
                self.depth += 1
            else:
                ident = dict(attrs).get('id', '')
                if ident.startswith('cite_note-'):
                    self.depth, self.current = 1, {'id':ident, 'text':[]}

    def handle_endtag(self, tag):
        if tag == 'li' and self.depth:
            self.depth -= 1
            if not self.depth:
                text = re.sub(r'\s+', ' ', ' '.join(self.current['text'])).strip()
                if text:
                    self.items.append((self.current['id'], text[:600]))
                self.current = None

    def handle_data(self, data):
        if self.depth:
            self.current['text'].append(data)


def citations(query):
    search = get_json({'action':'query', 'list':'search', 'srsearch':query, 'srlimit':'1', 'srnamespace':'0'})
    items = search.get('query', {}).get('search', [])
    if not items:
        return []
    page = items[0]
    ident = page.get('pageid')
    if not isinstance(ident, int) or ident <= 0:
        return []
    parsed = get_json({'action':'parse', 'pageid':ident, 'prop':'text'})
    text = parsed.get('parse', {}).get('text', '')
    if not isinstance(text, str):
        raise ValueError('استجابة ويكيبيديا غير صالحة')
    parser = Citations()
    parser.feed(text)
    title = str(page.get('title', ''))[:200]
    return [{'title': citation[:200], 'author':'',
             'url': f'https://ar.wikipedia.org/?curid={ident}#{urllib.parse.quote(ref_id, safe="-_:.")}',
             'detail': f'مرجع مذكور في مقالة ويكيبيديا «{title}»: {citation} — تحقق من المصدر الأصلي.',
             'access':'إحالة في ويكيبيديا، لم يُقرأ المصدر الأصلي؛ تحقق من مطابقتها للموضوع والإتاحة والحقوق.'}
            for ref_id, citation in parser.items[:15]]
