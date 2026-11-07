"""Explicit opt-in, read-only access to the Alexandria Archive MCP service.

The upstream service may change or impose limits. It is not a bulk downloader.
"""
import json
import re
import urllib.request
import urllib.error

URL = 'https://www.alexandria-archive.com/mcp'
MAX_RESPONSE = 2_000_000

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('رفض سَنَد إعادة توجيه اتصال أرشيف الإسكندرية')


def _parse(body, content_type):
    try:
        text = body.decode('utf-8')
        if 'text/event-stream' in content_type:
            data = next((line[5:].strip() for line in text.splitlines() if line.startswith('data:')), '')
            return json.loads(data)
        return json.loads(text)
    except (UnicodeDecodeError, ValueError, StopIteration) as exc:
        raise ValueError('تعذر قراءة استجابة أرشيف الإسكندرية') from exc


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
            if exc.code == 429: raise ValueError('بلغت حد طلبات أرشيف الإسكندرية؛ حاول لاحقًا ولا تتجاوز الحد') from exc
            raise ValueError('تعذر اتصال أرشيف الإسكندرية (HTTP %d)' % exc.code) from exc
        with response:
            sid = response.headers.get('mcp-session-id', '')
            if sid:
                if not re.fullmatch(r'[A-Za-z0-9._~+\-/=]{1,256}', sid): raise ValueError('معرّف جلسة أرشيف الإسكندرية غير صالح')
                self.session = sid
            content = response.read(MAX_RESPONSE + 1)
            if len(content) > MAX_RESPONSE: raise ValueError('استجابة أرشيف الإسكندرية أكبر من الحد الآمن')
            if ident is None and (response.status in (202,204) or (response.status == 200 and not content)): return {}
            data = _parse(content, response.headers.get('Content-Type', ''))
        if not isinstance(data, dict) or data.get('id') != ident or data.get('error'):
            raise ValueError('تعذر تنفيذ طلب أرشيف الإسكندرية؛ ربما بلغت حد الخدمة أو تغيرت واجهتها')
        return data.get('result', {})

    def call(self, tool, args):
        init = self.request('initialize', {'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'SanadStudio','version':'1.0'}}, 1)
        if not isinstance(init, dict) or not init.get('protocolVersion'):
            raise ValueError('تعذر بدء جلسة أرشيف الإسكندرية')
        self.request('notifications/initialized', {}, None)
        result = self.request('tools/call', {'name':tool,'arguments':args}, 2)
        if not isinstance(result, dict) or result.get('isError'): raise ValueError('تعذر تنفيذ بحث أرشيف الإسكندرية؛ تحقق من العبارة أو حد الخدمة')
        structured = result.get('structuredContent')
        content = result.get('content') or []
        if not isinstance(content, list): raise ValueError('صيغة استجابة أرشيف الإسكندرية غير مدعومة')
        if isinstance(structured, dict): return {**structured, '_mcp_content':content}
        text = next((item.get('text') for item in content if isinstance(item, dict) and item.get('type') == 'text' and isinstance(item.get('text'), str)), '')
        try: parsed = json.loads(text)
        except (ValueError, TypeError) as exc: raise ValueError('صيغة استجابة أرشيف الإسكندرية غير مدعومة') from exc
        if not isinstance(parsed, dict): raise ValueError('صيغة استجابة أرشيف الإسكندرية غير مدعومة')
        return parsed



import urllib.parse


def canonical_url(value):
    if not isinstance(value, str) or len(value) > 2000: return ''
    try:
        parsed = urllib.parse.urlsplit(value)
        if parsed.scheme != 'https' or parsed.hostname != 'www.alexandria-archive.com' or parsed.username or parsed.password or parsed.port:
            return ''
        return value
    except ValueError:
        return ''


def search(query):
    if not isinstance(query, str) or not 2 <= len(query.strip()) <= 300:
        raise ValueError('أدخل عبارة من حرفين إلى 300 حرف')
    data=Session().call('search_archive', {'query':query.strip()})
    if not isinstance(data.get('results'), list): raise ValueError('صيغة نتائج الأرشيف غير مدعومة')
    results=[]
    for item in data['results'][:50]:
        if not isinstance(item,dict): continue
        url=canonical_url(item.get('url'))
        if not url: continue
        title=item.get('title');snippet=item.get('snippet');category=item.get('category')
        results.append({'title':str(title or 'بلا عنوان')[:300], 'author':'', 'url':url,
                        'detail':'النوع: '+str(category or 'غير معروف')[:80]+'؛ معاينة بحث: '+(snippet[:700] if isinstance(snippet,str) else ''),
                        'access':'نتيجة من أرشيف الإسكندرية؛ راجع النص والحقوق لدى الأرشيف قبل استخدامها.'})
        if len(results)>=20: break
    return {'query':query.strip(),'results':results,'warning':'نتائج محدودة؛ المعاينة لا تضمن النص الكامل أو الحق في إعادة الاستخدام. راجع مصدر المادة وحقوقها.'}


def read_article(article_id):
    if not isinstance(article_id,str) or not re.fullmatch(r'[1-9][0-9]{0,8}',article_id): raise ValueError('معرّف المقال غير صالح')
    ident=int(article_id);data=Session().call('get_article',{'id':ident})
    access=data.get('access');content=data.get('_mcp_content');url=canonical_url(data.get('url'))
    if type(data.get('id')) is not int or data['id']!=ident or url != f'https://www.alexandria-archive.com/article/{ident}' or not isinstance(access,dict) or access.get('full') is not False or not isinstance(content,list):
        raise ValueError('لم يُرجع الأرشيف نبذة عامة قابلة للعرض؛ افتح المقال على الموقع')
    text='\n'.join(x['text'] for x in content if isinstance(x,dict) and x.get('type')=='text' and isinstance(x.get('text'),str))
    if not text.strip() or len(text.encode('utf-8'))>500_000: raise ValueError('نبذة المقال غير متاحة أو أكبر من الحد الآمن')
    read_more=canonical_url(data.get('readMoreUrl')) or url
    provenance=data.get('provenance') if isinstance(data.get('provenance'),dict) else {}
    return {'text':text,'url':url,'read_more_url':read_more,'author':str(data.get('author') or '')[:300],
            'title':str(data.get('titleAr') or data.get('title') or '')[:300], 'published':str(data.get('published') or '')[:100],
            'rights':str(provenance.get('rights') or 'غير مبيّنة؛ راجع سياسة الأرشيف')[:1000],
            'warning':'هذه نبذة عامة وليست المقال الكامل. قراءة المقال كاملة قد تتطلب حسابًا لدى الأرشيف؛ لا تعني الإتاحة إذن إعادة النشر. راجع حقوق المادة وصاحبها.'}
