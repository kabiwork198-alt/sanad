"""Bounded real Wikimedia article pageviews; never extrapolate missing days."""
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from sanad.http_identity import USER_AGENT

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None

def fetch(article, start, end):
    if not isinstance(article,str) or not article.strip() or len(article)>200 or re.search(r'[\x00-\x1f\x7f]',article):
        raise ValueError('عنوان المقالة غير صالح')
    if not isinstance(start,str) or not isinstance(end,str) or not re.fullmatch(r'[0-9]{8}00',start) or not re.fullmatch(r'[0-9]{8}00',end):
        raise ValueError('الفترة غير صالحة')
    try: first=datetime.strptime(start,'%Y%m%d%H'); last=datetime.strptime(end,'%Y%m%d%H')
    except ValueError: raise ValueError('الفترة غير صالحة')
    if last-first != timedelta(days=59): raise ValueError('الفترة يجب أن تكون 60 يومًا')
    article=' '.join(article.strip().split()).replace(' ','_')
    if article in ('.','..'): raise ValueError('عنوان المقالة غير صالح')
    url='https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/ar.wikipedia/all-access/user/'+urllib.parse.quote(article,safe='')+'/daily/'+start+'/'+end
    req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':USER_AGENT})
    opener=urllib.request.build_opener(NoRedirect())
    with opener.open(req,timeout=20) as response: raw=response.read(1000001)
    if len(raw)>1000000: raise ValueError('استجابة المشاهدات كبيرة جدًا')
    return json.loads(raw)
