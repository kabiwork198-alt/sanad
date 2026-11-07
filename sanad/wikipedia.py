"""Topic leads and citation breadcrumbs from Arabic Wikipedia, not source verification."""
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser

API = 'https://ar.wikipedia.org/w/api.php?'
CATEGORY = 'تصنيف:تاريخ إسلامي'


def get_json(params):
    params = dict(params, format='json', formatversion='2')
    request = urllib.request.Request(API + urllib.parse.urlencode(params), headers={'Accept': 'application/json', 'User-Agent': 'SanadStudio/0.1 (local research tool)'})
    with urllib.request.urlopen(request, timeout=15) as response:
        data = response.read(3_000_001)
    if len(data) > 3_000_000:
        raise ValueError('استجابة ويكيبيديا كبيرة جدًا')
    return json.loads(data)


def topics():
    data = get_json({'action':'query', 'list':'categorymembers', 'cmtitle':CATEGORY, 'cmtype':'page', 'cmlimit':'24'})
    found = []
    for item in data.get('query', {}).get('categorymembers', []):
        ident, title = item.get('pageid'), item.get('title')
        if isinstance(ident, int) and ident > 0 and isinstance(title, str) and title.strip():
            found.append({'title': title[:200], 'url': f'https://ar.wikipedia.org/?curid={ident}'})
    return found


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
