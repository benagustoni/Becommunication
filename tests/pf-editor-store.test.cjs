'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createEditorStore}=require('../lib/pf-editor-store.cjs');
const draft={titre:'PF Nettoyage',presentation:'Présentation',horaires:'7j/7',prestations:'Nettoyage',promotion:'',bouton:'Devis'};
function setup(){let current=null;return createEditorStore({read:async()=>current,compareAndSwap:async(expected,next)=>{if((current?.revision??null)!==expected)return false;current=next;return true;}});}
test('enregistre et relit',async()=>{const s=setup();const a=await s.save(draft,null);assert.deepEqual(await s.read(),a);});
test('version suivante',async()=>{const s=setup();const a=await s.save(draft,null);const b=await s.save({...draft,titre:'Nouveau'},a.revision);assert.equal(b.previousRevision,a.revision);assert.notEqual(b.revision,a.revision);});
test('refuse version périmée',async()=>{const s=setup();await s.save(draft,null);await assert.rejects(s.save(draft,null),/revision_conflict/);});
test('refuse écriture concurrente',async()=>{const s=setup();const r=await Promise.allSettled([s.save(draft,null),s.save(draft,null)]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);});
test('refuse données invalides',async()=>{const s=setup();await assert.rejects(s.save({...draft,titre:''},null));assert.equal(await s.read(),null);});
