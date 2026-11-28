'use strict';
const {validateDraft}=require('./pf-editor-validation.cjs');
const {randomUUID}=require('node:crypto');
function createEditorStore(adapter){
 if(!adapter||typeof adapter.read!=='function'||typeof adapter.compareAndSwap!=='function')throw Error('storage_unavailable');
 return {
  async read(){return await adapter.read();},
  async save(input,expectedRevision){
   const content=validateDraft(input);
   if(expectedRevision!==null&&typeof expectedRevision!=='string')throw Error('invalid_revision');
   const current=await adapter.read();
   if((current?.revision??null)!==expectedRevision)throw Error('revision_conflict');
   const next={revision:randomUUID(),previousRevision:expectedRevision,updatedAt:new Date().toISOString(),content};
   if(!await adapter.compareAndSwap(expectedRevision,next))throw Error('revision_conflict');
   return next;
  }
 };
}
module.exports={createEditorStore};
