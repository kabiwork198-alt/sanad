#!/usr/bin/env python3
"""Offline page-aligned OCR CER/WER evaluation. Never uploads or embeds input text."""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

MAX_BYTES = 2 * 1024 * 1024
MAX_PAGES = 500
DEFAULT_MAX_CELLS = 25_000_000


def distance(reference, hypothesis, max_cells=DEFAULT_MAX_CELLS):
    """Levenshtein edit distance with linear memory and a bounded work budget."""
    if len(reference) * len(hypothesis) > max_cells:
        raise ValueError('صفحة تتجاوز حد عمليات المقارنة؛ استخدم صفحات أقصر أو ارفع --max-cells صراحة')
    if len(hypothesis) > len(reference):
        reference, hypothesis = hypothesis, reference
    previous = list(range(len(hypothesis) + 1))
    for i, a in enumerate(reference, 1):
        row = [i]
        for j, b in enumerate(hypothesis, 1):
            row.append(min(row[-1] + 1, previous[j] + 1, previous[j - 1] + (a != b)))
        previous = row
    return previous[-1]


def normalized(text):
    """NFKC, remove combining marks and tatweel, collapse whitespace; retain punctuation."""
    text = unicodedata.normalize('NFKC', text)
    text = ''.join(c for c in text if not unicodedata.combining(c) and c != '\u0640')
    return re.sub(r'\s+', ' ', text).strip()


def measures(reference, hypothesis, max_cells=DEFAULT_MAX_CELLS):
    # Normalize line endings only for raw scoring; no hidden case or spelling changes.
    reference = reference.replace('\r\n', '\n').replace('\r', '\n')
    hypothesis = hypothesis.replace('\r\n', '\n').replace('\r', '\n')
    nr, nh = normalized(reference), normalized(hypothesis)
    output = {}
    for key, left, right in [('cer_raw', reference, hypothesis),
                              ('cer_normalized', nr, nh),
                              ('wer_normalized', nr.split(), nh.split())]:
        if not left:
            output[key] = {'edits': None, 'reference_units': 0, 'rate': None}
            continue
        edits = distance(left, right, max_cells)
        output[key] = {'edits': edits, 'reference_units': len(left), 'rate': edits / len(left)}
    return output


def read_page(path):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError(f'الملف {path.name} أكبر من 2 ميبيبايت')
    return path.read_text(encoding='utf-8-sig')


def read_sanad_pages(path):
    if path.stat().st_size > 20 * 1024 * 1024:
        raise ValueError('نص OCR أكبر من 20 ميبيبايت')
    text = path.read_text(encoding='utf-8-sig')
    lines = text.split('\n')
    if not lines or lines[0] != '#SANAD-OCR-TEXT-1':
        raise ValueError('صيغة نص OCR المرقم غير صالحة')
    pages = {}; current = None
    for line in lines[1:]:
        match = re.fullmatch(r'#SANAD-PAGE:([1-9][0-9]{0,6})', line)
        if match:
            current = int(match.group(1))
            if current in pages or len(pages) >= 300:
                raise ValueError('صفحة مكررة أو عدد الصفحات أكبر من 300')
            pages[current] = []
        elif line.startswith('| ') and current is not None:
            pages[current].append(line[2:])
        elif line == '' and current is not None:
            continue
        else:
            raise ValueError('سطر غير صالح في نص OCR المرقّم')
    if not pages:
        raise ValueError('لا توجد صفحات في نص OCR المرقم')
    return {number:'\n'.join(lines) for number, lines in pages.items()}


def evaluate(refdir, hypdir, max_cells=DEFAULT_MAX_CELLS):
    if not refdir.is_dir() or not (hypdir.is_dir() or hypdir.is_file()):
        raise ValueError('مجلد المرجع ومجلد النتيجة أو ملف OCR المرقّم مطلوبان')
    refs = {p.name: p for p in refdir.glob('*.txt') if p.is_file()}
    numbered = read_sanad_pages(hypdir) if hypdir.is_file() else None
    hyps = {p.name: p for p in hypdir.glob('*.txt') if p.is_file()} if numbered is None else {}
    if not refs or len(refs) > MAX_PAGES:
        raise ValueError('يجب أن يحتوي المرجع من صفحة إلى 500 صفحة بصيغة TXT')
    if numbered is None:
        if refs.keys() != hyps.keys():
            missing, extra = sorted(refs.keys() - hyps.keys()), sorted(hyps.keys() - refs.keys())
            raise ValueError('الأسماء غير متطابقة؛ ناقص في النتيجة: '+', '.join(missing)+'؛ زائد: '+', '.join(extra))
    else:
        ids = {}
        for name in refs:
            stem = Path(name).stem
            if not re.fullmatch(r'[0-9]{1,7}', stem) or int(stem) < 1 or int(stem) in ids:
                raise ValueError('عند استخدام ملف سَنَد سمِّ صفحات المرجع بأرقام PDF فريدة، مثل 001.txt')
            ids[int(stem)] = name
        if ids.keys() != numbered.keys():
            missing, extra = sorted(ids.keys()-numbered.keys()), sorted(numbered.keys()-ids.keys())
            raise ValueError('أرقام الصفحات غير متطابقة؛ ناقص في OCR: '+str(missing)+'؛ زائد في OCR: '+str(extra))
    pages = []
    for name in sorted(refs):
        try:
            hypothesis = read_page(hyps[name]) if numbered is None else numbered[int(Path(name).stem)]
            scores = measures(read_page(refs[name]), hypothesis, max_cells)
        except (UnicodeError, ValueError) as exc:
            raise ValueError(f'{name}: {exc}') from exc
        pages.append({'page': name, 'metrics': scores})
    totals = {}
    for key in ('cer_raw', 'cer_normalized', 'wer_normalized'):
        valid = [p['metrics'][key] for p in pages if p['metrics'][key]['reference_units']]
        edits = sum(x['edits'] for x in valid)
        units = sum(x['reference_units'] for x in valid)
        totals[key] = {'edits': edits, 'reference_units': units, 'rate': edits / units if units else None,
                       'pages_scored': len(valid), 'pages_without_reference_units': len(pages)-len(valid)}
    return {'schema': 'sanad-ocr-benchmark-v1', 'pages': pages, 'aggregate': totals,
            'method': {'alignment': 'same filename per page' if numbered is None else 'same PDF page number, from Sanad OCR text', 'distance': 'Levenshtein insertions, deletions and substitutions',
                       'cer_raw': 'Unicode code points; normalize line endings only',
                       'cer_normalized': 'NFKC; remove combining marks and tatweel; collapse whitespace; keep punctuation',
                       'wer_normalized': 'same normalization, split on whitespace',
                       'aggregation': 'sum edits / sum reference units; pages with empty reference units excluded',
                       'warning': 'Results depend on ground truth and sample; review rights and representativeness. Not manuscript accuracy.'}}


def main():
    parser = argparse.ArgumentParser(description='قياس OCR محليًا لصفحات مرجعية ونتائج متطابقة الأسماء دون رفع النصوص')
    parser.add_argument('--reference', required=True, type=Path, help='مجلد النصوص المرجعية المصححة، صفحة لكل ملف TXT')
    parser.add_argument('--hypothesis', required=True, type=Path, help='مجلد نصوص OCR بأسماء المرجع أو ملف سَنَد OCR المرقم' )
    parser.add_argument('--max-cells', type=int, default=DEFAULT_MAX_CELLS, help='الحد الأقصى لحاصل ضرب طولي كل مقارنة')
    args = parser.parse_args()
    if args.max_cells < 1:
        parser.error('--max-cells must be positive')
    try:
        report = evaluate(args.reference, args.hypothesis, args.max_cells)
    except (OSError, ValueError) as exc:
        print('تعذر القياس:', exc, file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
