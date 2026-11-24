'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const home=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const smtp=fs.readFileSync(path.join(__dirname,'../api/devis.js'),'utf8');
test('le site conserve le logo officiel et les fonctions essentielles',()=>{
 for(const marker of ['pf-logo-inline','id="quote-form"','id="agenda"','id="galerie"','id="pf-devis-photos"','href="#devis"']){
  assert.ok(home.includes(marker),'Manque : '+marker);
 }
});
test('les améliorations restent limitées et compatibles mobile',()=>{
 for(const marker of ['id="pf-polish-safe-2026"','pf-polish-benefits-grid','pf-devis-guide','pf-gallery-context','@media(max-width:740px)']){
  assert.ok(home.includes(marker),'Manque : '+marker);
 }
});
test('les photos de démonstration sont annoncées comme illustrations',()=>{
 assert.match(home,/Elles ne représentent pas des interventions réalisées/);
 assert.match(home,/Les images présentées sont des illustrations/);
});
test('un devis n est confirmé qu après acceptation serveur',()=>{
 assert.ok(smtp.includes('assertAccepted(result, config.to)'));
 assert.ok(smtp.includes('confirmationSent'));
 assert.ok(smtp.includes('createQuoteAttachment'));
 assert.ok(smtp.includes('photoAttachments'));
});
