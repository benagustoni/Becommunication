'use strict';
const supported=['fr','de','it'];
function normalize(value){const lang=String(value||'').trim().toLowerCase().split(/[-_]/)[0];return supported.includes(lang)?lang:null;}
function selectLanguage({preference,acceptLanguage='',canton}={}){
 const manual=normalize(preference);if(manual)return manual;
 const languages=String(acceptLanguage).split(',').map((v,i)=>{const [tag,...params]=v.trim().split(';');const weight=params.find(p=>p.trim().startsWith('q='));return {lang:normalize(tag),q:weight?Number(weight.trim().slice(2)):1,i};}).filter(v=>v.lang&&v.q>0&&v.q<=1).sort((a,b)=>b.q-a.q||a.i-b.i);
 if(languages.length)return languages[0].lang;
 const c=String(canton||'').toUpperCase();
 if(c==='TI')return 'it';
 if(['ZH','LU','ZG','UR','SZ','OW','NW','GL','SH','AR','AI','SG','TG','AG','BS','BL','SO'].includes(c))return 'de';
 return 'fr';
}
module.exports={selectLanguage,supported};
