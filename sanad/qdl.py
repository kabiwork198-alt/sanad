"""Opt-in IIIF Content Search within one public Qatar Digital Library record."""
import json
import re
import urllib.parse
import urllib.request

IDENT = r'vdc_[0-9]{1,20}\.0x[0-9a-fA-F]{6,16}'
WARNING = ('مطابقات البحث تحدد صفحات محتملة فقط وقد تخطئ بسبب OCR أو نقص الفهرسة؛ '
           'افتح صورة الصفحة وراجع سياقها ورقمها وحقوقها. عدم العثور لا يثبت الغياب.')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def search(ident, query):
    if not isinstance(ident, str) or not re.fullmatch(IDENT, ident):
        raise ValueError('معرّف سجل مكتبة قطر غير صالح')
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200:
        raise ValueError('أدخل عبارة بحث من حرفين إلى 200 حرف')
    url = 'https://www.qdl.qa/en/annos/search/81055/' + ident + '?' + urllib.parse.urlencode({'q': query.strip()})
    req = urllib.request.Request(url, headers={'Accept':'application/json', 'User-Agent':'SanadStudio/0.1 (local research tool)'})
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(req, timeout=20) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ValueError('استجابة البحث كبيرة جدًا')
    data = json.loads(raw)
    if not isinstance(data, dict) or not isinstance(data.get('hits'), list):
        raise ValueError('الوثيقة لا تتيح نتائج بحث مدعومة؛ افتح سجل المكتبة')
    hits = []
    for hit in data['hits']:
        if not isinstance(hit, dict): continue
        item = hit.get('item-url')
        if not isinstance(item, str) or not re.fullmatch(r'81055/' + IDENT, item): continue
        match = hit.get('match')
        if not isinstance(match, str): match = ''
        hits.append({'url': 'https://www.qdl.qa/en/archive/' + item, 'match': match[:200]})
        if len(hits) >= 20: break
    total = data.get('within', {}).get('total') if isinstance(data.get('within'), dict) else None
    if not isinstance(total, int) or isinstance(total, bool) or total < 0: total = None
    return {'hits':hits, 'total':total, 'warning':WARNING}
