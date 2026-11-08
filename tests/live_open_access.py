"""Optional live diagnosis; upstream/network/CORS availability is not guaranteed."""
from sanad.open_access import search
try:
    result=search('10.7717/peerj.4375')
    print('OpenAlex live: work=',result['work_url'],'reported HTTPS open locations=',len(result['copies']),'; links and rights not verified')
except Exception as exc:
    print('OpenAlex live: unavailable:',type(exc).__name__,str(exc)[:300])
