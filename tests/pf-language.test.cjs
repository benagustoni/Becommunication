const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selectLanguage}=require('../lib/pf-language.cjs');
test('manual choice wins',()=>assert.equal(selectLanguage({preference:'it',acceptLanguage:'de-CH',canton:'BE'}),'it'));
test('browser preferences',()=>assert.equal(selectLanguage({acceptLanguage:'en-US,de-CH;q=0.9,fr;q=0.8'}),'de'));
test('canton fallback',()=>{assert.equal(selectLanguage({canton:'TI'}),'it');assert.equal(selectLanguage({canton:'ZH'}),'de');assert.equal(selectLanguage({canton:'NE'}),'fr');});
test('default and unsupported language',()=>assert.equal(selectLanguage({acceptLanguage:'en-US'}),'fr'));
