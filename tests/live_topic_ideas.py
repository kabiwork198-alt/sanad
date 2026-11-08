"""Diagnostic using actual Arabic Wikipedia responses; no fallback data."""
from sanad import wikipedia
try:
    found=wikipedia.topics('travel','ابن فضلان')
    first=[x['title'] for x in found['topics'][:4]]
    sections=wikipedia.topic_sections('129569')
    print('::notice title=Live Arabic topic ideas Windows::titles='+str(first)+'; revision='+sections['revision_url']+'; sections='+str([x['title'] for x in sections['sections'][:6]]))
except Exception as exc:
    print('::notice title=Live Arabic topic ideas Windows unavailable::'+type(exc).__name__+': '+str(exc)[:300])
