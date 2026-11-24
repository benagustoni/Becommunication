/* Galeries de prestations PF Nettoyage. Photos d'illustration, non présentées comme des interventions réalisées. 
   Pour ajouter une photo autorisée, déposer son fichier dans public/images/, puis ajouter une entrée dans la liste correspondante ci-dessous. */
(function(){
'use strict';
const galleries={
 'nettoyage-entretien':[
  ['/images/appartement-propre.jpg','Entretien d’un logement – illustration'],
  ['/images/accueil-femme-menage.webp','Personnel de nettoyage – illustration'],
  ['/images/logement-remise-cles.jpg','Logement propre – illustration']
 ],
 'fin-de-bail':[
  ['/images/nettoyage-fin-bail-pro.jpg','Nettoyage de fin de bail – illustration'],
  ['/images/specialite-fin-bail.jpg','Remise en état d’un logement – illustration'],
  ['/images/logement-remise-cles.jpg','Logement prêt pour restitution – illustration']
 ],
 'vitres':[
  ['/images/nettoyage-vitres-pro.jpg','Nettoyage de surfaces vitrées – illustration']
 ],
 'conciergerie':[
  ['/images/accueil-femme-menage.webp','Entretien professionnel – illustration'],
  ['/images/appartement-propre.jpg','Espace entretenu – illustration']
 ],
 'debarras':[
  ['/images/debarras-pro.jpg','Débarras – illustration'],
  ['/images/espaces-liberes.jpg','Espace libéré – illustration']
 ],
 'demenagement':[
  ['/images/espaces-liberes.jpg','Espace dégagé – illustration'],
  ['/images/logement-remise-cles.jpg','Logement préparé – illustration']
 ]
};
const key=location.pathname.split('/').pop().replace(/\.html$/,'');
const rows=galleries[key];if(!rows)return;
const anchor=document.querySelector('.others');if(!anchor)return;
const section=document.createElement('section');section.className='pf-gallery';section.id='galerie';
const heading=document.createElement('h2');heading.textContent='Galerie photos';section.append(heading);
const intro=document.createElement('p');intro.className='pf-gallery-intro';intro.textContent='Quelques photos d’illustration de cette prestation. Les réalisations de PF Nettoyage seront ajoutées progressivement.';section.append(intro);
const grid=document.createElement('div');grid.className='pf-gallery-grid';
for(const [src,alt] of rows){
 const button=document.createElement('button');button.type='button';button.className='pf-gallery-card';button.setAttribute('aria-label','Agrandir : '+alt);
 const img=document.createElement('img');img.src=src;img.alt=alt;img.loading='lazy';img.decoding='async';
 const caption=document.createElement('span');caption.textContent=alt;button.append(img,caption);
 img.addEventListener('error',()=>button.remove(),{once:true});
 button.addEventListener('click',()=>{const dialog=document.getElementById('pf-gallery-dialog');const big=dialog.querySelector('img');big.src=src;big.alt=alt;dialog.querySelector('p').textContent=alt;dialog.showModal();});
 grid.append(button);
}
section.append(grid);anchor.before(section);
const dialog=document.createElement('dialog');dialog.id='pf-gallery-dialog';dialog.className='pf-gallery-dialog';
const close=document.createElement('button');close.type='button';close.className='pf-gallery-close';close.textContent='Fermer ×';close.addEventListener('click',()=>dialog.close());
const large=document.createElement('img');large.alt='';const label=document.createElement('p');dialog.append(close,large,label);dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
document.body.append(dialog);
})();