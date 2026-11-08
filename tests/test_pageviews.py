import unittest
from unittest.mock import patch,MagicMock
from sanad import pageviews

class PageviewTests(unittest.TestCase):
    def test_bounded_fixed_host_and_no_redirect(self):
        response=MagicMock(); response.__enter__.return_value.read.return_value=b'{"items":[]}'
        opener=MagicMock();opener.open.return_value=response
        with patch('sanad.pageviews.urllib.request.build_opener',return_value=opener) as factory:
            result=pageviews.fetch('أحمد بن فضلان','2026090600','2026110400')
        self.assertEqual(result,{'items':[]}); self.assertIsInstance(factory.call_args.args[0],pageviews.NoRedirect)
        url=opener.open.call_args.args[0].full_url
        self.assertTrue(url.startswith('https://wikimedia.org/api/rest_v1/metrics/pageviews/'));self.assertNotIn(' ',url)
    def test_reject_invalid_range_and_title(self):
        for title,start,end in [('x','2026090600','2026110300'),('x','2026023000','2026043000'),('bad\nheader','2026090600','2026110400'),([], '2026090600','2026110400')]:
            with self.assertRaises(ValueError):pageviews.fetch(title,start,end)
