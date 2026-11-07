"""Local-first Sanad Studio; Python standard library only."""
import json
import concurrent.futures
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime, timezone
from contextlib import closing
from pathlib import Path

from sanad import library, workflow, wikipedia, catalogs, openiti

def runtime_paths():
    # PyInstaller extracts bundled static assets to _MEIPASS, which is temporary.
    # User data must live elsewhere so it survives closing or updating the exe.
    if getattr(sys, 'frozen', False):
        root = Path(getattr(sys, '_MEIPASS', Path(sys.executable).resolve().parent))
        if os.environ.get('SANAD_DATA_DIR'):
            default_data = Path(os.environ['SANAD_DATA_DIR'])
        else:
            local_app_data = os.environ.get('LOCALAPPDATA')
            default_data = (Path(local_app_data) if local_app_data else Path.home() / 'AppData' / 'Local') / 'SanadStudio'
    else:
        root = Path(__file__).resolve().parent.parent
        default_data = root / '.sanad-data'
    data = Path(os.environ.get('SANAD_DATA_DIR') or default_data).expanduser().resolve()
    return root.resolve(), data


ROOT, DATA = runtime_paths()
DB = DATA / 'sanad.sqlite3'
HOST, PORT = '127.0.0.1', 8765
TOKEN = secrets.token_urlsafe(32)
MAX_BODY = 5 * 1024 * 1024
COLLECTIONS = ('signals', 'sources', 'claims', 'scenes', 'events', 'evidence')


def connect():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB, timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, updated INTEGER NOT NULL, data TEXT NOT NULL)')
    return db


def validate_project(project):
    if not isinstance(project, dict):
        raise ValueError('صيغة المشروع غير صحيحة')
    ident = project.get('id')
    if not isinstance(ident, str) or not re.fullmatch(r'[a-f0-9]{32}', ident):
        raise ValueError('معرّف المشروع غير صحيح')
    title = project.get('title')
    if not isinstance(title, str) or not title.strip() or len(title) > 200:
        raise ValueError('أدخل عنوانًا بين حرف و200 حرف')
    for key in COLLECTIONS:
        value = project.get(key, [])
        if not isinstance(value, list) or len(value) > 500 or not all(isinstance(v, dict) for v in value):
            raise ValueError('قائمة غير صالحة: ' + key)
    fields = {'title', 'question', 'angle', 'audience', 'ideaStatus', 'researchNotes', 'outline', 'script', 'english', 'translationNotes', 'productionNotes', 'reviewNotes'}
    for key in fields:
        if key in project and (not isinstance(project[key], str) or len(project[key]) > 250_000):
            raise ValueError('حقل نصي غير صالح: ' + key)
    for group in COLLECTIONS:
        for item in project.get(group, []):
            if any(not isinstance(k, str) or not isinstance(v, str) or len(v) > 250_000 for k, v in item.items()):
                raise ValueError('عنصر غير صالح في ' + group)
    source_ids = [x.get('id') for x in project.get('sources', [])]
    if any(not isinstance(i, str) or not re.fullmatch(r'[a-f0-9]{32}', i) for i in source_ids) or len(set(source_ids)) != len(source_ids):
        raise ValueError('معرّفات المصادر غير صالحة أو مكررة')
    for group, year_field in (('events', 'sortYear'), ('sources', 'workYear')):
        for item in project.get(group, []):
            year = item.get(year_field, '').strip()
            if year and (not re.fullmatch(r'[0-9]{1,4}', year) or not 1 <= int(year) <= 9999):
                raise ValueError('سنة الترتيب يجب أن تكون سنة ميلادية من 1 إلى 9999 أو تترك فارغة')
    for event in project.get('events', []):
        if event.get('sourceId') and event['sourceId'] not in source_ids:
            raise ValueError('الحدث يشير إلى مصدر غير موجود')
    statuses = {'لم يُفحص', 'مدعوم', 'محل خلاف', 'غير مدعوم', 'يتعذر التحقق'}
    claim_ids = [c['id'] for c in project.get('claims', []) if c.get('id')]
    if any(not re.fullmatch(r'[a-f0-9]{32}', ident) for ident in claim_ids) or len(set(claim_ids)) != len(claim_ids):
        raise ValueError('معرّفات الادعاءات غير صالحة أو مكررة')
    for entry in project.get('evidence', []):
        if entry.get('claimId') not in claim_ids:
            raise ValueError('دليل المقارنة يشير إلى ادعاء غير موجود')
        if entry.get('sourceId') and entry['sourceId'] not in source_ids:
            raise ValueError('دليل المقارنة يشير إلى مصدر غير موجود')
        if entry.get('stance', 'غير محسوم') not in {'يدعم', 'يخالف', 'يضيف سياقًا', 'غير محسوم'}:
            raise ValueError('موقف دليل المقارنة غير صالح')
    for claim in project.get('claims', []):
        if claim.get('status', 'لم يُفحص') not in statuses:
            raise ValueError('حالة الادعاء غير صالحة')
        if claim.get('sourceId') and claim['sourceId'] not in source_ids:
            raise ValueError('الادعاء يشير إلى مصدر غير موجود')
        if claim.get('status') == 'مدعوم' and (not claim.get('sourceId') or not claim.get('location', '').strip()):
            raise ValueError('الادعاء المدعوم يحتاج مصدرًا وموضعًا')
    encoded = json.dumps(project, ensure_ascii=False)
    if len(encoded.encode('utf-8')) > MAX_BODY:
        raise ValueError('المشروع أكبر من الحد المسموح')
    return encoded


def save_project(project):
    encoded = validate_project(project)
    with closing(connect()) as db, db:
        db.execute('INSERT INTO projects (id,title,updated,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,updated=excluded.updated,data=excluded.data', (project['id'], project['title'].strip(), int(time.time()), encoded))


def all_projects():
    with closing(connect()) as db, db:
        return [json.loads(row[0]) for row in db.execute('SELECT data FROM projects ORDER BY updated DESC, rowid DESC')]


def search_crossref(query):
    query = query.strip()
    if not query or len(query) > 300:
        raise ValueError('أدخل عبارة بحث لا تتجاوز 300 حرف')
    url = 'https://api.crossref.org/works?' + urllib.parse.urlencode({'query.bibliographic': query, 'rows': 10, 'select': 'DOI,title,author,published,URL,type'})
    req = urllib.request.Request(url, headers={'User-Agent': 'SanadStudio/0.1 (local editorial research tool)', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.loads(response.read(2_000_000))
    result = []
    for item in payload.get('message', {}).get('items', []):
        titles = item.get('title') or []
        authors = item.get('author') or []
        result.append({'title': str(titles[0]) if titles else 'بلا عنوان', 'author': ', '.join((' '.join(filter(None, [x.get('given'), x.get('family')])) for x in authors[:5])), 'url': str(item.get('URL', '')), 'doi': str(item.get('DOI', '')), 'type': str(item.get('type', ''))})
    return result


def search_openlibrary(query):
    if not isinstance(query, str) or not query.strip() or len(query) > 300:
        raise ValueError('أدخل عبارة بحث لا تتجاوز 300 حرف')
    params = {'q': query.strip(), 'limit': 10, 'fields': 'key,title,author_name,first_publish_year'}
    req = urllib.request.Request('https://openlibrary.org/search.json?' + urllib.parse.urlencode(params), headers={'Accept': 'application/json', 'User-Agent': 'SanadStudio/0.1'})
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.loads(response.read(2_000_000))
    results = []
    for item in payload.get('docs', []):
        key = item.get('key', '')
        if not isinstance(key, str) or not re.fullmatch(r'/works/OL[0-9]+W', key):
            continue
        authors = item.get('author_name') or []
        results.append({'title': str(item.get('title', 'بلا عنوان')), 'author': ', '.join(str(a) for a in authors[:5]), 'url': 'https://openlibrary.org' + key, 'year': str(item.get('first_publish_year', ''))})
    return results


def search_youtube(query, key):
    if not isinstance(query, str) or not query.strip() or len(query) > 300:
        raise ValueError('أدخل عبارة بحث لا تتجاوز 300 حرف')
    if not isinstance(key, str) or not key.strip() or len(key) > 500:
        raise ValueError('أدخل مفتاح YouTube Data API في جهازك')
    params = {'part': 'snippet', 'type': 'video', 'maxResults': 15, 'q': query.strip(), 'key': key.strip()}
    url = 'https://www.googleapis.com/youtube/v3/search?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'SanadStudio/0.1'})
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.loads(response.read(2_000_000))
    output = []
    for item in payload.get('items', []):
        video_id = item.get('id', {}).get('videoId', '')
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
            continue
        snippet = item.get('snippet', {})
        output.append({'title': snippet.get('title', ''), 'channel': snippet.get('channelTitle', ''), 'published': snippet.get('publishedAt', ''), 'url': 'https://www.youtube.com/watch?v=' + video_id})
    return output


def search_commons(query):
    params = {'action': 'query', 'generator': 'search', 'gsrsearch': query, 'gsrnamespace': 6,
              'gsrlimit': 8, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'format': 'json', 'formatversion': 2}
    url = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'User-Agent': 'SanadStudio/0.1 (local research tool)'})
    with urllib.request.urlopen(req, timeout=15) as response:
        payload = json.loads(response.read(2_000_000))
    result = []
    for page in payload.get('query', {}).get('pages', []):
        info = (page.get('imageinfo') or [{}])[0]
        meta = info.get('extmetadata') or {}
        license_name = (meta.get('LicenseShortName') or {}).get('value', '')
        # The page URL is for human review; the program does not auto-download the image.
        description = info.get('descriptionurl', '')
        if not isinstance(description, str) or not description.startswith('https://commons.wikimedia.org/'):
            continue
        result.append({'title': str(page.get('title', '')), 'url': description,
                       'author': '', 'detail': 'ترخيص مذكور في السجل: ' + str(license_name or 'غير معروف') + '؛ يلزم فحص صفحة الملف والحقوق.',
                       'access': 'سجل مادة مرئية — تحقق من الأصل والنسبة والترخيص'})
    return result


def research_search(query, provider=None):
    if not isinstance(query, str) or not query.strip() or len(query) > 300:
        raise ValueError('أدخل عبارة بحث من حرف إلى 300 حرف')
    query = query.strip()
    def crossref():
        return [{'title': x['title'], 'url': x['url'], 'author': x['author'], 'detail': 'DOI: ' + x['doi'], 'access': 'بيانات فهرسية — تحقق من النص الكامل'} for x in search_crossref(query)]
    def openlibrary():
        return [{'title': x['title'], 'url': x['url'], 'author': x['author'], 'detail': 'سنة طبعة مفهرسة: ' + x['year'], 'access': 'بيانات فهرسية — تحقق من النص الكامل'} for x in search_openlibrary(query)]
    providers = [('Crossref', crossref), ('Open Library', openlibrary), ('Wikimedia Commons', lambda: search_commons(query)), ('إحالات ويكيبيديا العربية', lambda: wikipedia.citations(query)), ('ويكي مصدر العربية', lambda: catalogs.wikisource(query)), ('Internet Archive', lambda: catalogs.internet_archive(query)), ('DOAJ', lambda: catalogs.doaj(query)), ('OpenAlex', lambda: catalogs.openalex(query)), ('المكتبة الرقمية العالمية', lambda: catalogs.loc(query, 'world-digital-library')), ('صحف Chronicling America', lambda: catalogs.loc(query, 'chronicling-america')), ('الأرشيف الوطني البريطاني (Windows)', lambda: catalogs.national_archives(query))]
    if provider is not None:
        if not isinstance(provider, str) or provider not in [name for name, _ in providers]:
            raise ValueError('المصدر غير مدعوم')
        providers = [(name, fn) for name, fn in providers if name == provider]
    results, states = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(providers)) as pool:
        futures = [(name, pool.submit(fn)) for name, fn in providers]
        for name, future in futures:
            try:
                items = future.result()
                results.extend(dict(x, provider=name) for x in items)
                states.append({'provider': name, 'status': 'اكتمل', 'count': len(items), 'reason': ''})
            except Exception as exc:
                # A failed source is not the same as an empty search result.
                reason = f'HTTP {exc.code}' if isinstance(exc, urllib.error.HTTPError) else ('انتهت مهلة الاتصال' if isinstance(exc, TimeoutError) else 'تحقق من الاتصال أو إتاحة الخدمة')
                states.append({'provider': name, 'status': 'تعذر الاتصال أو قراءة الاستجابة', 'count': 0, 'reason': reason})
    return {'query': query, 'searched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'providers': states, 'results': results,
            'warning': 'النتائج سجلات بحث وليست إثباتًا لقراءة النص أو صحة النسبة أو رخصة الاستخدام. لا يشمل البحث كل المكتبات.'}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def lm_request(path, body=None):
    # Fixed loopback endpoint only; never let model-suggested URLs or code execute.
    url = 'http://127.0.0.1:1234' + path
    headers = {'Content-Type': 'application/json'}
    payload = json.dumps(body).encode('utf-8') if body is not None else None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(urllib.request.Request(url, data=payload, headers=headers), timeout=90) as response:
        return json.loads(response.read(2_000_000))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Do not log content or queries; this process is intended for local use.
        pass

    def send(self, status, content, ctype='application/json; charset=utf-8'):
        if not isinstance(content, bytes):
            content = json.dumps(content, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
        self.end_headers()
        self.wfile.write(content)

    def allowed_host(self):
        return self.headers.get('Host', '').lower() in (f'127.0.0.1:{PORT}', f'localhost:{PORT}')

    def valid_request(self):
        origin = self.headers.get('Origin')
        return self.allowed_host() and (origin in (f'http://127.0.0.1:{PORT}', f'http://localhost:{PORT}') or (self.command == 'GET' and origin is None)) and secrets.compare_digest(self.headers.get('X-Sanad-Token', ''), TOKEN)

    def do_GET(self):
        if not self.allowed_host():
            return self.send(403, {'error': 'طلب غير مسموح'})
        path = urllib.parse.urlsplit(self.path).path
        if path in ('/', '/index.html', '/app.js', '/style.css'):
            name = 'index.html' if path in ('/', '/index.html') else path[1:]
            content = (ROOT / 'web' / name).read_bytes()
            if name == 'index.html':
                content = content.replace(b'__SANAD_TOKEN__', TOKEN.encode('ascii'))
            return self.send(200, content, {'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript; charset=utf-8', 'style.css': 'text/css; charset=utf-8'}[name])
        if path == '/api/projects' and self.valid_request():
            return self.send(200, {'projects': all_projects()})
        return self.send(404, {'error': 'غير موجود'})

    def do_POST(self):
        if not self.valid_request():
            return self.send(403, {'error': 'طلب غير مسموح'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            request_path = urllib.parse.urlsplit(self.path).path
            body_limit = (library.MAX_FILE * 4 // 3 + 8192) if request_path == '/api/library/import' else MAX_BODY
            if length <= 0 or length > body_limit:
                raise ValueError('حجم الطلب غير صالح')
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict):
                raise ValueError('صيغة الطلب غير صحيحة')
            path = urllib.parse.urlsplit(self.path).path
            if path == '/api/topics':
                return self.send(200, {'topics': wikipedia.topics(), 'searched_at': datetime.now(timezone.utc).isoformat(timespec='seconds')})
            if path == '/api/wikisource/read':
                return self.send(200, catalogs.read_wikisource(body.get('page_id', '')))
            if path == '/api/openiti/search':
                return self.send(200, openiti.search(body.get('query', '')))
            if path == '/api/research':
                return self.send(200, research_search(body.get('query', ''), body.get('provider')))
            if path == '/api/library/import':
                return self.send(200, {'document': library.import_document(DATA, body.get('name', ''), body.get('content', ''))})
            if path == '/api/library/search':
                return self.send(200, library.search_document(DATA, body.get('id', ''), body.get('query', '')))
            if path == '/api/save':
                save_project(body.get('project'))
                return self.send(200, {'ok': True})
            if path == '/api/delete':
                ident = body.get('id', '')
                if not isinstance(ident, str) or not re.fullmatch(r'[a-f0-9]{32}', ident):
                    raise ValueError('معرّف غير صالح')
                with closing(connect()) as db, db:
                    db.execute('DELETE FROM projects WHERE id=?', (ident,))
                return self.send(200, {'ok': True})
            if path in ('/api/suggestions', '/api/analyze', '/api/draft', '/api/prepare-prompt'):
                project = body.get('project')
                validate_project(project)
                if path == '/api/suggestions':
                    return self.send(200, {'suggestions': workflow.suggestions(project)})
                if path == '/api/analyze':
                    return self.send(200, workflow.analyze(project))
                if path == '/api/prepare-prompt':
                    return self.send(200, {'prompt': workflow.script_prompt(project)})
                return self.send(200, workflow.script_draft(project))
            if path == '/api/openlibrary':
                return self.send(200, {'results': search_openlibrary(body.get('query', ''))})
            if path == '/api/youtube':
                return self.send(200, {'results': search_youtube(body.get('query', ''), body.get('key', ''))})
            if path == '/api/crossref':
                query = body.get('query', '')
                if not isinstance(query, str):
                    raise ValueError('عبارة البحث غير صالحة')
                return self.send(200, {'results': search_crossref(query)})
            if path == '/api/lm':
                prompt, model = body.get('prompt', ''), body.get('model', '')
                if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 10000 or not isinstance(model, str) or not model.strip() or len(model) > 200:
                    raise ValueError('أدخل اسم النموذج والطلب، بحد أقصى 10000 حرف')
                result = lm_request('/v1/chat/completions', {'model': model, 'messages': [{'role': 'system', 'content': 'أنت مساعد تحرير. لا تختلق المراجع أو الاقتباسات، واذكر حدود معرفتك. إجابتك مسودة تحتاج مراجعة بشرية.'}, {'role': 'user', 'content': prompt}], 'temperature': 0.4, 'max_tokens': 1000})
                text = result['choices'][0]['message']['content']
                if not isinstance(text, str):
                    raise ValueError('استجابة النموذج غير صالحة')
                return self.send(200, {'text': text[:30000]})
            self.send(404, {'error': 'غير موجود'})
        except (ValueError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
            self.send(400, {'error': str(exc) or 'بيانات غير صالحة'})
        except (urllib.error.URLError, TimeoutError, OSError):
            self.send(502, {'error': 'تعذر الاتصال بالخدمة. تحقق من الاتصال أو تشغيل الخادم المحلي وحاول مجددًا.'})


def main():
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(errors='replace')
    connect().close()
    try:
        server = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        print('تعذر تشغيل سَنَد. قد يكون المنفذ 8765 مستخدمًا:', exc, file=sys.stderr)
        return 1
    print(f'سَنَد يعمل محليًا: http://{HOST}:{PORT}/\nلإيقافه اضغط Ctrl+C في هذه النافذة.')
    threading.Timer(0.7, lambda: webbrowser.open(f'http://{HOST}:{PORT}/')).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0

if __name__ == '__main__':
    sys.exit(main())
