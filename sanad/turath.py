"""Explicit opt-in, read-only access to the Turath MCP service.

The upstream service may change or impose limits. It is not a bulk downloader.
"""
import json
import re
import urllib.request
import urllib.error

URL = 'https://mcp.turath.io/mcp/'
MAX_RESPONSE = 2_000_000

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('رفض سَنَد إعادة توجيه اتصال تراث')


def _parse(body, content_type):
    try:
        text = body.decode('utf-8')
        if 'text/event-stream' in content_type:
            data = next((line[5:].strip() for line in text.splitlines() if line.startswith('data:')), '')
            return json.loads(data)
        return json.loads(text)
    except (UnicodeDecodeError, ValueError, StopIteration) as exc:
        raise ValueError('تعذر قراءة استجابة تراث') from exc


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
            if exc.code == 429: raise ValueError('بلغت حد طلبات تراث؛ حاول لاحقًا ولا تتجاوز الحد') from exc
            raise ValueError('تعذر اتصال تراث (HTTP %d)' % exc.code) from exc
        with response:
            sid = response.headers.get('mcp-session-id', '')
            if sid:
                if not re.fullmatch(r'[A-Za-z0-9._~+\-/=]{1,256}', sid): raise ValueError('معرّف جلسة تراث غير صالح')
                self.session = sid
            content = response.read(MAX_RESPONSE + 1)
            if len(content) > MAX_RESPONSE: raise ValueError('استجابة تراث أكبر من الحد الآمن')
            if ident is None and (response.status in (202,204) or (response.status == 200 and not content)): return {}
            data = _parse(content, response.headers.get('Content-Type', ''))
        if not isinstance(data, dict) or data.get('id') != ident or data.get('error'):
            raise ValueError('تعذر تنفيذ طلب تراث؛ ربما بلغت حد الخدمة أو تغيرت واجهتها')
        return data.get('result', {})

    def call(self, tool, args):
        init = self.request('initialize', {'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'SanadStudio','version':'1.0'}}, 1)
        if not isinstance(init, dict) or not init.get('protocolVersion'):
            raise ValueError('تعذر بدء جلسة تراث')
        self.request('notifications/initialized', {}, None)
        result = self.request('tools/call', {'name':tool,'arguments':args}, 2)
        if not isinstance(result, dict) or result.get('isError'): raise ValueError('تعذر تنفيذ بحث تراث؛ تحقق من العبارة أو حد الخدمة')
        content = result.get('content') or []
        if not isinstance(content, list): raise ValueError('صيغة استجابة تراث غير مدعومة')
        text = next((item.get('text') for item in content if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str)), '')
        try: parsed = json.loads(text)
        except (ValueError, TypeError) as exc: raise ValueError('صيغة استجابة تراث غير مدعومة') from exc
        if not isinstance(parsed, dict): raise ValueError('صيغة استجابة تراث غير مدعومة')
        return parsed



def search(query):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 300: raise ValueError('أدخل عبارة من حرفين إلى 300 حرف')
    data = Session().call('search_turath', {'q':query.strip(), 'page':1})
    if not isinstance(data.get('results'), list): raise ValueError('صيغة نتائج تراث غير مدعومة')
    results, seen = [], set()
    for item in data['results'][:50]:
        if not isinstance(item, dict): continue
        meta = item.get('meta') if isinstance(item.get('meta'), dict) else {}
        book, page = item.get('book_id'), meta.get('page_id')
        if type(book) is not int or type(page) is not int or not (0 < book <= 999999999 and 0 < page <= 999999999) or (book, page) in seen: continue
        seen.add((book, page))
        title = meta.get('book_name'); author = meta.get('author_name')
        snippet = item.get('snip') if isinstance(item.get('snip'),str) else ''
        vol = str(meta.get('vol') or '')[:30]; printed = str(meta.get('page') or '')[:30]
        results.append({'title':str(title or 'بلا عنوان')[:300], 'author':str(author or '')[:300],
                        'url':f'https://app.turath.io/book/{book}?page={page}', 'book_id':str(book), 'page_id':str(page),
                        'detail':f'المجلد بحسب تراث: {vol or "غير معروف"}؛ الصفحة بحسب تراث: {printed or "غير معروفة"}. معاينة بحث: {snippet[:700]}',
                        'access':'بحث في تراث؛ المعاينة غير كافية للاستشهاد. افتح صفحة المصدر وراجع السياق والطبعة والحقوق.'})
        if len(results) >= 20: break
    return {'query':query.strip(), 'results':results, 'warning':'نتائج الصفحة الأولى فقط وقد تكون ناقصة؛ افتح الصفحة الأصلية وراجع السياق والطبعة والحقوق قبل الاستشهاد.'}


def read_page(book_id, page_id):
    if not all(isinstance(x, str) and re.fullmatch(r'[1-9][0-9]{0,8}', x) for x in (book_id, page_id)):
        raise ValueError('معرّف كتاب أو صفحة تراث غير صالح')
    book, page = int(book_id), int(page_id)
    data = Session().call('get_page', {'book_id':book, 'page_id':page})
    text = data.get('text')
    if data.get('book_id') != book or data.get('page_id') != page or not isinstance(text, str) or not text.strip() or len(text.encode('utf-8')) > 1_800_000:
        raise ValueError('صفحة تراث غير متاحة أو جاءت استجابتها غير متوقعة')
    meta = data.get('meta') if isinstance(data.get('meta'), dict) else {}
    return {'text':text, 'url':f'https://app.turath.io/book/{book}?page={page}', 'volume':str(meta.get('vol') or '')[:30], 'printed_page':str(meta.get('page') or '')[:30],
            'warning':'نص صفحة واحدة من تراث وقد يحتوي أخطاء أو حواشي. معرّف الصفحة الداخلي ليس رقم صفحة الطبعة؛ تحقق من موضع الصفحة والسياق والطبعة والحقوق في المصدر.'}
