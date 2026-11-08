"""Discover reported open copies of a single DOI or OpenAlex work; never download them."""
import json
import re
import urllib.parse
import urllib.request

WARNING = ('روابط أبلغ عنها OpenAlex ولم يتحقق سَنَد من إتاحتها أو تطابق النسخة أو الترخيص. '
           'قد تكون مسودة أو نسخة مقبولة؛ راجع الناشر والمستودع والطبعة والحقوق قبل الاعتماد أو النشر. '
           'لم يُحمّل البرنامج نصًا. عدم وجود رابط لا يثبت غياب نسخة متاحة.')


def identifier(value):
    if not isinstance(value, str): raise ValueError('أدخل DOI أو معرّف عمل OpenAlex')
    value = value.strip()
    if re.fullmatch(r'[Ww][0-9]{1,15}', value): return value.upper(), 'work'
    value = re.sub(r'^https://(?:dx\.)?doi\.org/', '', value, flags=re.I)
    value = re.sub(r'^doi:\s*', '', value, flags=re.I)
    if not re.fullmatch(r'10\.[0-9]{4,9}/[A-Za-z0-9._;()/:+\-]{1,200}', value, re.I) or any(x in ('.','..') for x in value.split('/')):
        raise ValueError('معرّف غير صالح أو غير مدعوم؛ أدخل DOI واضحًا أو معرّف W من OpenAlex')
    return value, 'doi'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('رفض سَنَد إعادة توجيه طلب OpenAlex؛ افتح السجل بنفسك')


def fetch(work, kind):
    # Construct a fixed OpenAlex API URL, never fetch a URL returned in metadata.
    key = work if kind == 'work' else 'doi:' + urllib.parse.quote(work, safe='/;():+._-')
    url = 'https://api.openalex.org/works/' + key + '?select=id,doi,title,open_access,locations'
    req = urllib.request.Request(url, headers={'Accept':'application/json', 'User-Agent':'SanadStudio/0.1 (local research tool)'})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=20) as response:
        raw = response.read(2_000_001)
    if len(raw) > 2_000_000: raise ValueError('استجابة OpenAlex أكبر من الحد الآمن')
    return json.loads(raw)


def safe_link(value):
    if not isinstance(value, str) or len(value) > 2000 or not re.match(r'^https://[A-Za-z0-9.-]+(?:[/?#]|$)', value) or any(ord(c)<=32 or ord(c)==127 or c=='\\' for c in value): return ''
    try:
        u=urllib.parse.urlsplit(value)
        if u.scheme!='https' or not u.hostname or u.username or u.password or u.port: return ''
        return value
    except ValueError:
        return ''


def search(value):
    work, kind = identifier(value)
    data = fetch(work, kind)
    if not isinstance(data,dict) or not isinstance(data.get('id'),str) or not re.fullmatch(r'https://openalex\.org/W[0-9]{1,15}',data['id']):
        raise ValueError('استجابة OpenAlex غير صالحة')
    if kind == 'work' and data['id'].split('/')[-1] != work:
        raise ValueError('معرّف العمل في الاستجابة لا يطابق الطلب؛ افتح السجل للتحقق')
    if kind == 'doi' and str(data.get('doi') or '').lower() != ('https://doi.org/'+work).lower():
        raise ValueError('DOI في الاستجابة لا يطابق الطلب؛ افتح السجل للتحقق')
    locations=data.get('locations')
    if not isinstance(locations,list): raise ValueError('بيانات مواقع OpenAlex غير متاحة')
    copies=[];seen=set()
    for item in locations[:100]:
        if not isinstance(item,dict) or item.get('is_oa') is not True: continue
        landing,pdf=safe_link(item.get('landing_page_url')),safe_link(item.get('pdf_url'))
        if landing in seen: landing=''
        if pdf in seen or pdf==landing: pdf=''
        if not (landing or pdf): continue
        seen.update(x for x in (landing,pdf) if x)
        source=item.get('source') if isinstance(item.get('source'),dict) else {}
        copies.append({'landing_url':landing,'pdf_url':pdf,'source':str(source.get('display_name') or 'غير معروف')[:300],
                       'version':str(item.get('version') or 'غير معروفة')[:100], 'license':str(item.get('license') or 'غير معروفة')[:100]})
        if len(copies)>=20: break
    return {'identifier':work,'work_url':data['id'],'doi':str(data.get('doi') or '')[:500],
            'title':str(data.get('title') or 'بلا عنوان')[:300], 'copies':copies,
            'truncated':len(locations)>100 or len(copies)>=20, 'warning':WARNING}
