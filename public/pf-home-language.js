(()=>{'use strict';
const rows=window.PFHomeLanguageRows;if(!Array.isArray(rows))return;
const langs=['fr','de','it'],map=new Map(rows.map(r=>[r[0],r]));
const nodes=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
while(walker.nextNode()){const n=walker.currentNode,p=n.parentElement;if(!p||p.closest('script,style,textarea,option,[contenteditable]'))continue;const row=map.get(n.nodeValue.trim());if(row)nodes.push([n,n.nodeValue,row]);}
const select=document.createElement('select');select.setAttribute('aria-label','Langue / Sprache / Lingua');
for(const l of langs){const o=document.createElement('option');o.value=l;o.textContent=l.toUpperCase();select.append(o);}
const host=document.querySelector('header')||document.body;host.append(select);
function apply(l){if(!langs.includes(l))l='fr';const i=langs.indexOf(l);for(const [n,original,row] of nodes)n.nodeValue=original.replace(original.trim(),row[i]);select.value=l;document.documentElement.lang=l+'-CH';}
let lang='fr';try{lang=localStorage.getItem('pf-language')||(navigator.languages||[]).map(v=>v.toLowerCase().split('-')[0]).find(v=>langs.includes(v))||'fr';}catch{}apply(lang);
select.addEventListener('change',()=>{apply(select.value);try{localStorage.setItem('pf-language',select.value);}catch{}});
})();