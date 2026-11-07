"""Explicit opt-in, read-only access to the official Shamela MCP service.

The upstream service may change or impose limits. It is not a bulk downloader.
"""
import json
import re
import urllib.request
import urllib.error

URL = 'https://mcp.shamela.ws/'
MAX_RESPONSE = 2_000_000

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('رفض سَنَد إعادة توجيه اتصال الشاملة')


def _parse(body, content_type):
    try:
        text = body.decode('utf-8')
        if 'text/event-stream' in content_type:
            data = next((line[5:].strip() for line in text.splitlines() if line.startswith('data:')), '')
            return json.loads(data)
        return json.loads(text)
    except (UnicodeDecodeError, ValueError, StopIteration) as exc:
        raise ValueError('تعذر قراءة استجابة الشاملة') from exc


class Session:
    def __init__(self):
        self.session = ''
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, method, params, ident=None):
        body = {'jsonrpc':'2.0','method':method,'params':params}
        if ident is not None: body['id'] = ident
        headers = {'Content-Type':'application/json', 'Accept':'application/json, text/event-stream', 'User-Agent':'SanadStudio/0.1 (local research tool)'}
        if self.session: headers['Mcp-Session-Id'] = self.session
        request = urllib.request.Request(URL, data=json.dumps(body, ensure_ascii=False).encode('utf-8'), headers=headers)
        try:
            response = self.opener.open(request, timeout=45)
        except urllib.error.HTTPError as exc:
            if exc.code == 429: raise ValueError('بلغت حد طلبات الشاملة؛ حاول لاحقًا ولا تتجاوز الحد') from exc
            raise ValueError('تعذر اتصال الشاملة (HTTP %d)' % exc.code) from exc
        with response:
            sid = response.headers.get('mcp-session-id', '')
            if sid:
                if not re.fullmatch(r'[A-Za-z0-9._~+\-/=]{1,256}', sid): raise ValueError('معرّف جلسة الشاملة غير صالح')
                self.session = sid
            content = response.read(MAX_RESPONSE + 1)
            if len(content) > MAX_RESPONSE: raise ValueError('استجابة الشاملة أكبر من الحد الآمن')
            if ident is None and (response.status in (202,204) or (response.status == 200 and not content)): return {}
            data = _parse(content, response.headers.get('Content-Type', ''))
        if not isinstance(data, dict) or data.get('id') != ident or data.get('error'):
            raise ValueError('تعذر تنفيذ طلب الشاملة؛ ربما بلغت حد الخدمة أو تغيرت واجهتها')
        return data.get('result', {})

    def call(self, tool, args):
        init = self.request('initialize', {'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'SanadStudio','version':'1.0'}}, 1)
        if not isinstance(init, dict) or not init.get('protocolVersion'):
            raise ValueError('تعذر بدء جلسة الشاملة')
        self.request('notifications/initialized', {}, None)
        result = self.request('tools/call', {'name':tool,'arguments':args}, 2)
        if not isinstance(result, dict) or result.get('isError'): raise ValueError('تعذر تنفيذ بحث الشاملة؛ تحقق من العبارة أو حد الخدمة')
        content = result.get('content') or []
        if not isinstance(content, list): raise ValueError('صيغة استجابة الشاملة غير مدعومة')
        text = next((item.get('text') for item in content if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str)), '')
        try: parsed = json.loads(text)
        except (ValueError, TypeError) as exc: raise ValueError('صيغة استجابة الشاملة غير مدعومة') from exc
        if not isinstance(parsed, dict): raise ValueError('صيغة استجابة الشاملة غير مدعومة')
        return parsed


def search(query):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 200: raise ValueError('أدخل عبارة من حرفين إلى 200 حرف')
    data = Session().call('shamela_find', {'keywords':[query.strip()], 'difficulty':'easy'})
    layers = data.get('layers')
    if not isinstance(layers, list): raise ValueError('صيغة نتائج الشاملة غير مدعومة')
    results, seen = [], set()
    for layer in layers[:5]:
        if not isinstance(layer, dict) or not isinstance(layer.get('results'), list): continue
        for item in layer['results']:
            if not isinstance(item, dict): continue
            book, page = item.get('book_id'), item.get('page_id')
            if type(book) is not int or type(page) is not int or not (0 < book <= 999999999 and 0 < page <= 999999999): continue
            if (book,page) in seen: continue
            seen.add((book,page))
            preview = str(item.get('preview') or '')[:700]
            results.append({'title':str(item.get('title') or 'بلا عنوان')[:300], 'author':str(item.get('author') or '')[:300],
                            'url':f'https://shamela.ws/book/{book}/{page}', 'book_id':str(book), 'page_id':str(page),
                            'detail':('معاينة بحث مبتورة: '+preview if preview else 'صفحة مرشحة من الشاملة؛ افتح الصفحة وراجع السياق.'),
                            'access':'نتيجة بحث من الشاملة؛ المعاينة ليست دليلًا قبل فتح صفحة المصدر والتحقق من الحقوق والسياق.'})
            if len(results)>=25: break
        if len(results)>=25: break
    return {'query':query.strip(),'results':results,'warning':'النتائج قد تكون ناقصة. معاينة البحث ليست دليلًا حتى تفتح الصفحة وتراجع السياق والنسبة والحقوق.'}


def read_page(book_id, page_id):
    if not all(isinstance(x,str) and re.fullmatch(r'[1-9][0-9]{0,8}',x) for x in (book_id,page_id)):
        raise ValueError('معرّف كتاب أو صفحة الشاملة غير صالح')
    book, page = int(book_id), int(page_id)
    data = Session().call('shamela_open', {'book_id':book,'page_id':page,'field':'body','max_chars':10000})
    if data.get('book_id') != book or data.get('page_id') != page or not isinstance(data.get('text'),str) or not data['text'].strip():
        raise ValueError('صفحة الشاملة غير متاحة أو جاءت استجابتها غير متوقعة')
    return {'text':data['text'][:10000], 'url':f'https://shamela.ws/book/{book}/{page}',
            'warning':'نص صفحة واحدة من الشاملة وقد يكون مقتطعًا أو يضم حواشي. رقم السطر ليس صفحة الطبعة؛ تحقق من الموضع والسياق والحقوق في صفحة المصدر.'}
