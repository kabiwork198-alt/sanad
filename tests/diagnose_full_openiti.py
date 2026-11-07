"""Opt-in expensive diagnostic: install the exact official 2.86 GB release
and search it. No corpus content is committed or uploaded as an artifact.
"""
import os, sys, tempfile, time, zipfile
sys.path.insert(0,os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from sanad import openiti_corpus
report=lambda msg:print('::notice file=tests/diagnose_full_openiti.py,line=1::'+msg,flush=True)
def wait(job,limit):
    deadline=time.monotonic()+limit;last=0
    while job.thread.is_alive():
        job.thread.join(5)
        if time.monotonic()-last>30:
            s=job.status();print('OpenITI diagnostic progress: stage=%s bytes=%s processed=%s total=%s' % (s['stage'],s['bytes'],s['processed'],s['total']),flush=True);last=time.monotonic()
        if time.monotonic()>deadline:
            job.cancel();job.thread.join(75);raise TimeoutError('diagnostic timed out')
    return job.status()
try:
    with tempfile.TemporaryDirectory() as folder:
        job=openiti_corpus.Corpus(folder);job.install();state=wait(job,1200)
        if state['stage']!='installed' or not state['installed']:raise RuntimeError('full installation %s %s' % (state['stage'],state['error']))
        job.search('بغداد');state=wait(job,600)
        if state['stage']!='done':raise RuntimeError('search %s %s' % (state['stage'],state['error']))
        if not state['results']:raise RuntimeError('search returned no results')
        with zipfile.ZipFile(job.zip) as archive:
            first=next((r for r in state['results'] if archive.getinfo(r['uri']).file_size<=16*1024*1024),None)
        if not first:raise RuntimeError('all sample matches exceed per-book save limit')
        book=job.read_book(first['uri'])
        report('OpenITI full official installation and local search: installed=true, processed=%d/%d, skipped=%d, partial=%s, matches=%d, first=%s, saved_book_characters=%d' % (state['processed'],state['total'],state['skipped'],state['partial'],len(state['results']),first['uri'],len(book['text'])))
except Exception as exc:
    report('OpenITI full installation or search unavailable: %s %s' % (type(exc).__name__,str(exc)[:180]))
