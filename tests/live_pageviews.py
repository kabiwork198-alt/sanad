"""Live Wikimedia public metrics probe, never substitutes fabricated values."""
from datetime import datetime, timedelta, timezone
from sanad import pageviews
try:
    end=datetime.now(timezone.utc).date()-timedelta(days=2)
    start=end-timedelta(days=59)
    result=pageviews.fetch('أحمد بن فضلان',start.strftime('%Y%m%d00'),end.strftime('%Y%m%d00'))
    items=result.get('items',[])
    print(f'::notice title=Live Wikimedia pageviews Windows::article=أحمد بن فضلان; days={len(items)}; first={start}; last={end}; recent_30={sum(i["views"] for i in items[-30:]) if len(items)==60 else "incomplete"}')
except Exception as exc:
    print('::notice title=Live Wikimedia pageviews Windows unavailable::'+type(exc).__name__+': '+str(exc)[:200])
