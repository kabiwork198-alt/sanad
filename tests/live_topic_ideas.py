"""Diagnostic using actual Arabic Wikipedia responses; no fallback data."""
from sanad import wikipedia
import urllib.error
try:
    found=wikipedia.topics('travel','ابن فضلان')
    first=[x['title'] for x in found['topics'][:4]]
    sections=wikipedia.topic_sections('129569')
    print('::notice title=Live Arabic topic ideas Windows::titles='+str(first)+'; revision='+sections['revision_url']+'; sections='+str([{'title':x['title'],'url':x['url']} for x in sections['sections'][:6]]))
except urllib.error.HTTPError as exc:
    headers={k:exc.headers.get(k) for k in ('Retry-After','Content-Type','X-Cache') if exc.headers and exc.headers.get(k)}
    print('::notice title=Live Arabic topic ideas Windows HTTP::status='+str(exc.code)+'; headers='+str(headers)+'; no automatic retry')
except Exception as exc:
    print('::notice title=Live Arabic topic ideas Windows unavailable::'+type(exc).__name__+': '+str(exc)[:300])
