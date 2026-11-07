'use strict';
const assert=require('node:assert/strict');require('../web/text-alignment.js');const D=globalThis.SanadTextAlignment;
function check(a,b){const r=D.align(a,b);assert.equal(r.first.map(x=>x.text).join(''),a);assert.equal(r.second.map(x=>x.text).join(''),b);assert.equal(r.first.filter(x=>x.same).map(x=>x.text).join(''),r.second.filter(x=>x.same).map(x=>x.text).join(''));return r}
let r=check('سافر أحمد إلى بغداد.','سافر أحمد من بغداد!');assert.ok(r.first.some(x=>!x.same&&x.text.includes('إلى')));assert.ok(r.second.some(x=>!x.same&&x.text.includes('من')));
r=check('أحمد بن يحيى','احمد بن يحيي');assert.ok(r.first.some(x=>!x.same&&x.text.includes('أحمد')));assert.ok(r.second.some(x=>!x.same&&x.text.includes('احمد')));
r=check('نَص\n صحيح','نص صحيح');assert.ok(r.first.some(x=>!x.same));assert.ok(r.second.some(x=>!x.same));
r=check('نص مكرر مكرر','مكرر نص مكرر');assert.ok(r.first.some(x=>!x.same));
assert.ok(check('وحدة واحدة','وحدة واحدة').first.every(x=>x.same));assert.throws(()=>D.align('','test'));assert.throws(()=>D.align('a'.repeat(5001),'b'));assert.throws(()=>D.align('a '.repeat(401),'b'));check('a '.repeat(400),'b '.repeat(400));
// Assert both texts survive tricky Unicode, punctuation, whitespace and adversarial HTML.
for(const [a,b] of [['<img src=x onerror=alert(1)>','<b>نص</b>'],['\n a\t😀\r\n',' a  😀\n'],['قَالَ أَحْمَدُ','قال أحمد']])check(a,b);
console.log('PASS: exact reversible bounded Arabic word alignment; whitespace, punctuation, marks and ambiguous repetition');
