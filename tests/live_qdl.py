"""Diagnostic, not a release gate: public example, no user data."""
from sanad import qdl
try:
    result=qdl.search('vdc_100000000881.0x0000ce','Dhofar')
    print('::notice file=tests/live_qdl.py,line=1::QDL live search: total=%s pages=%s first=%s' % (result['total'],len(result['hits']),result['hits'][0]['url'] if result['hits'] else 'none'))
except Exception as exc:
    print('::notice file=tests/live_qdl.py,line=1::QDL live unavailable: %s: %s' % (type(exc).__name__, str(exc)[:180]))
