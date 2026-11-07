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
