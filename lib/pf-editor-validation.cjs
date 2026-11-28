'use strict';
const limits=Object.freeze({titre:180,presentation:2000,horaires:300,prestations:2000,promotion:1000,bouton:100});
function validateDraft(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('invalid_draft');
 const keys=Object.keys(value);
 if(keys.length!==Object.keys(limits).length||keys.some(k=>!Object.hasOwn(limits,k)))throw new Error('invalid_fields');
 const result={};
 for(const [key,max] of Object.entries(limits)){
  if(typeof value[key]!=='string'||value[key].length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[key]))throw new Error('invalid_field');
  result[key]=value[key].trim();
 }
 if(!result.titre||!result.bouton)throw new Error('required_field');
 return result;
}
module.exports={validateDraft};
