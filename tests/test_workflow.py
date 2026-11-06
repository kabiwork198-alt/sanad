import json
import unittest
from unittest import mock
from sanad import app, workflow


def sample():
    return {
        'id': 'a' * 32, 'title': 'ابن خلدون', 'question': 'ما منهجه؟',
        'signals': [], 'sources': [{'id': 'b' * 32, 'title': 'مصدر تجريبي'}],
        'claims': [
            {'text': 'عبارة يراجعها المستخدم', 'status': 'مدعوم', 'sourceId': 'b' * 32, 'location': 'ص ١٠', 'notes': 'خلاف يحتاج مراجعة'},
            {'text': 'نسبة 94% غير متحقق منها', 'status': 'لم يُفحص'},
            {'text': 'رواية محل خلاف', 'status': 'محل خلاف'},
        ], 'scenes': [],
    }


class WorkflowTest(unittest.TestCase):
    def test_suggestions_are_templates_not_trend_assertions(self):
        result = workflow.suggestions(sample())
        self.assertEqual(len(result), 3)
        self.assertIn('ابن خلدون', result[0]['question'])
        self.assertNotIn('رائج', str(result))

    def test_report_exposes_missing_evidence_and_does_not_certify(self):
        report = workflow.analyze(sample())
        self.assertEqual(report['counts']['reviewed'], 1)
        self.assertTrue(any('لا توجد إشارات اهتمام' in x for x in report['issues']))
        self.assertTrue(any('لم يُفحص' in x for x in report['issues']))
        self.assertIn('لا يثبت صحة', report['warning'])

    def test_draft_only_uses_supported_claims_and_preserves_notes(self):
        result = workflow.script_draft(sample())
        self.assertEqual(result['included'], 1)
        self.assertIn('عبارة يراجعها المستخدم', result['text'])
        self.assertIn('مصدر تجريبي', result['text'])
        self.assertIn('ص ١٠', result['text'])
        self.assertIn('خلاف يحتاج مراجعة', result['text'])
        self.assertNotIn('نسبة 94%', result['text'])
        self.assertNotIn('رواية محل خلاف', result['text'])
        self.assertIn('لم تُدرج 2', result['text'])

    def test_local_model_prompt_is_reviewable_and_excludes_unchecked_claims(self):
        prompt = workflow.script_prompt(sample())
        self.assertIn('مصدر تجريبي', prompt)
        self.assertIn('خلاف يحتاج مراجعة', prompt)
        self.assertNotIn('نسبة 94%', prompt)
        self.assertIn('لا تخترع', prompt)

    def test_draft_requires_named_source_and_reviewed_claim(self):
        p = sample()
        p['claims'][0]['status'] = 'لم يُفحص'
        with self.assertRaises(ValueError): workflow.script_draft(p)
        p['claims'][0]['status'] = 'مدعوم'
        p['sources'][0]['title'] = ''
        with self.assertRaises(ValueError): workflow.script_draft(p)

    def test_incomplete_signal_is_flagged(self):
        p = sample()
        p['signals'] = [{'source': 'YouTube', 'query': 'تاريخ'}]
        self.assertTrue(any('ناقصة' in x for x in workflow.analyze(p)['issues']))

    def test_library_metadata_and_unsafe_keys(self):
        payload = {'docs': [
            {'key': '/works/OL123W', 'title': 'History', 'author_name': ['A'], 'first_publish_year': 2000},
            {'key': '//evil.example', 'title': 'bad'},
        ]}
        response = mock.MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(payload).encode()
        with mock.patch('sanad.app.urllib.request.urlopen', return_value=response):
            result = app.search_openlibrary('history')
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['url'], 'https://openlibrary.org/works/OL123W')
        self.assertEqual(result[0]['year'], '2000')
        with self.assertRaises(ValueError): app.search_openlibrary(' ')

if __name__ == '__main__': unittest.main()
