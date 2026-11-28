const test=require('node:test');const assert=require('node:assert/strict');const {validateDraft}=require('../lib/pf-editor-validation.cjs');
const draft={titre:' PF Nettoyage ',presentation:'Présentation',horaires:'7j/7',prestations:'Nettoyage',promotion:'',bouton:'Devis'};
test('normalise un brouillon valide',()=>assert.equal(validateDraft(draft).titre,'PF Nettoyage'));
test('refuse les champs inconnus',()=>assert.throws(()=>validateDraft({...draft,admin:true})));
test('refuse un titre vide',()=>assert.throws(()=>validateDraft({...draft,titre:' '})));
test('refuse un texte trop long',()=>assert.throws(()=>validateDraft({...draft,presentation:'a'.repeat(2001)})));
test('refuse les types inattendus',()=>assert.throws(()=>validateDraft({...draft,bouton:42})));
test('refuse les caractères de contrôle',()=>assert.throws(()=>validateDraft({...draft,titre:'a\u0000b'})));
