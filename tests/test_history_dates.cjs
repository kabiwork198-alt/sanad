const assert=require('node:assert/strict');
const {hijriToGregorianEstimate:estimate}=require('../web/history-dates.js');
assert.equal(estimate('١٤٤٥'),2023);
assert.equal(estimate('۱۴۴۵'),2023);
assert.equal(estimate('923'),1517);
assert.equal(estimate('1'),622);
for(const bad of ['', '0', '-1', '3001', '1445.5', '1445 هـ', '１２３', {}, null]) assert.throws(()=>estimate(bad));
console.log('PASS: Hijri year approximation accepts Arabic/Persian digits and rejects invalid values');
