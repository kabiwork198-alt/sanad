import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from tools.ocr_benchmark import distance, evaluate, measures, normalized


class TestOcrBenchmark(unittest.TestCase):
    def test_edit_distance(self):
        self.assertEqual(distance('kitten', 'sitting'), 3)
        self.assertEqual(distance([], ['a']), 1)
        self.assertEqual(distance(['a', 'b'], ['b', 'a']), 2)
        with self.assertRaises(ValueError): distance('abc', 'abc', 8)

    def test_arabic_and_blank_reference(self):
        self.assertEqual(normalized(' بَغـداد  العِلم\n'), 'بغداد العلم')
        result = measures('بَغداد العلم', 'بغداد العلم')
        self.assertEqual(result['cer_raw']['edits'], 1)
        self.assertEqual(result['cer_normalized']['edits'], 0)
        self.assertEqual(result['wer_normalized']['rate'], 0)
        self.assertIsNone(measures('', 'نص')['cer_raw']['rate'])

    def test_sanad_numbered_pages_alignment_and_injection_safety(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); ref=root/'ref'; ref.mkdir(); ocr=root/'sanad.txt'
            (ref/'001.txt').write_text('أحمد\n#SANAD-PAGE:999',encoding='utf8')
            (ref/'003.txt').write_text('بغداد',encoding='utf8')
            ocr.write_text('#SANAD-OCR-TEXT-1\n#SANAD-PAGE:1\n| أحمد\n| #SANAD-PAGE:999\n#SANAD-PAGE:3\n| بغداد\n',encoding='utf8')
            result=evaluate(ref,ocr)
            self.assertEqual(result['aggregate']['cer_raw']['rate'],0)
            self.assertEqual(len(result['pages']),2)
            ocr.write_text('#SANAD-OCR-TEXT-1\n#SANAD-PAGE:1\n| أحمد\n',encoding='utf8')
            with self.assertRaisesRegex(ValueError,'غير متطابقة'): evaluate(ref,ocr)
            ocr.write_text('#SANAD-OCR-TEXT-1\n#SANAD-PAGE:1\n| أحمد\n#SANAD-PAGE:1\n| مكرر\n',encoding='utf8')
            with self.assertRaisesRegex(ValueError,'مكررة'): evaluate(ref,ocr)

    def test_complete_alignment_weighted_aggregate_and_private_text(self):
        with tempfile.TemporaryDirectory() as d:
            ref, hyp = Path(d)/'reference', Path(d)/'result'; ref.mkdir(); hyp.mkdir()
            (ref/'01.txt').write_text('abcd', encoding='utf8'); (hyp/'01.txt').write_text('abxd', encoding='utf8')
            (ref/'02.txt').write_text('a', encoding='utf8'); (hyp/'02.txt').write_text('a', encoding='utf8')
            (ref/'03.txt').write_text('', encoding='utf8'); (hyp/'03.txt').write_text('extra', encoding='utf8')
            report=evaluate(ref,hyp)
            self.assertEqual(report['aggregate']['cer_raw']['rate'], .2)
            self.assertEqual(report['aggregate']['cer_raw']['pages_without_reference_units'],1)
            self.assertNotIn('abxd', json.dumps(report))
            (hyp/'02.txt').unlink()
            with self.assertRaises(ValueError):evaluate(ref,hyp)
            process=subprocess.run([sys.executable,'tools/ocr_benchmark.py','--reference',str(ref),'--hypothesis',str(hyp)],capture_output=True,text=True)
            self.assertNotEqual(process.returncode,0)


if __name__ == '__main__': unittest.main()
