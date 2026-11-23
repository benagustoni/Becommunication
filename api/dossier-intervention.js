'use strict';
const PDFDocument = require('pdfkit');

module.exports = function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end('Méthode non autorisée');
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="PF-Nettoyage-Interventions-Urgentes.pdf"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (req.method === 'HEAD') return res.status(200).end();

  const doc = new PDFDocument({size:'A4', margins:{top:56,bottom:54,left:55,right:55},info:{Title:'PF Nettoyage - Interventions urgentes',Author:'PF Nettoyage - Facility Services'}});
  doc.pipe(res);
  const navy='#14243B', gold='#B28A50', dark='#243449', grey='#586476';
  const left=55, width=485;
  function line(y){doc.strokeColor('#E6E9EE').lineWidth(0.8).moveTo(left,y).lineTo(left+width,y).stroke();}
  function heading(t){doc.moveDown(0.65).font('Helvetica-Bold').fontSize(13).fillColor(navy).text(t);doc.moveDown(0.35);}
  function body(t){doc.font('Helvetica').fontSize(10.3).fillColor(dark).text(t,{lineGap:3});}
  function item(t){doc.font('Helvetica').fontSize(10.1).fillColor(dark).text('• '+t,{indent:8,lineGap:3});doc.moveDown(0.25);}
  doc.rect(0,0,595.28,145).fill(navy);
  doc.fillColor('#E8D0A3').font('Helvetica-Bold').fontSize(12).text('PF NETTOYAGE  —  FACILITY SERVICES',left,47);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(22).text('INTERVENTIONS URGENTES',left,75);
  doc.fillColor('#D3DEEB').font('Helvetica').fontSize(11).text('Suisse romande  |  Demandes 7 jours sur 7',left,112);
  doc.y=167;
  body('PF Nettoyage propose des interventions urgentes pour les déménagements, le nettoyage, les fins de bail, les débarras et les évacuations. Toute intervention dépend des disponibilités, de la sécurité et du cadre légal.');
  heading('PRESTATIONS & SITUATIONS');
  const rows=[
  ['Déménagement','Départ imprévu, libération rapide d’un logement'],
  ['Nettoyage & entretien','Après sinistre, dégât d’eau, remise en état urgente'],
  ['Nettoyage de fin de bail','État des lieux imminent, remise rapide des clés'],
  ['Débarras & évacuation','Encombrants, logement ou locaux à libérer'],
  ['Déménagement et débarras','Transport de meubles, évacuation et nettoyage final']
  ];
  let yy=doc.y+6;
  rows.forEach((r,i)=>{let h=44;if(i%2===0){doc.roundedRect(left,yy,width,h,5).fill('#F3F5F8');}doc.font('Helvetica-Bold').fontSize(9.5).fillColor(navy).text(r[0],left+10,yy+10,{width:164});doc.font('Helvetica').fontSize(9.3).fillColor(dark).text(r[1],left+183,yy+9,{width:286});yy+=h+3;});
  doc.y=yy+8;
  heading('RÈGLEMENT DES INTERVENTIONS URGENTES');
  item('Demande prioritaire : traitement selon les disponibilités de PF Nettoyage.');
  item('Confirmation : aucun déplacement sans validation de l’entreprise.');
  item('Devis : estimation du tarif, du déplacement et des majorations éventuelles avant intervention.');
  item('Nuit, dimanche et jours fériés : vérification préalable des autorisations ou exemptions légales applicables.');
  item('Sécurité : accès aux locaux, stationnement, manutention et conditions de travail à vérifier.');
  doc.moveDown(0.35);line(doc.y+5);doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(navy).text('À RETENIR');
  doc.font('Helvetica').fontSize(9.3).fillColor(grey).text('Une urgence déclarée par le client ne constitue pas automatiquement une urgence légale permettant le travail de nuit ou du dimanche.',{lineGap:2});
  doc.addPage();
  doc.rect(0,0,595.28,96).fill(navy);
  doc.fillColor('#E8D0A3').font('Helvetica-Bold').fontSize(12).text('PF NETTOYAGE  —  FACILITY SERVICES',left,32);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(18).text('UN BESOIN URGENT ?',left,54);
  doc.y=128;
  body('Un déménagement imprévu ? Un logement à remettre rapidement en état ? Un débarras ou un nettoyage urgent ? Notre équipe étudie votre demande et vous confirme la prise en charge.');
  heading('NOS INTERVENTIONS');
  ['Déménagements urgents','Nettoyage et entretien','Nettoyage de fin de bail','Débarras et évacuation','Déménagement avec nettoyage complet'].forEach(item);
  heading('CONDITIONS DE PRISE EN CHARGE');
  body('Demandes d’urgence 7 jours sur 7. Intervention sous réserve de confirmation, de disponibilité et des dispositions légales applicables. La date et l’heure souhaitées doivent être précisées pour les demandes urgentes.');
  heading('CONTACT DIRECT');
  doc.font('Helvetica-Bold').fontSize(13).fillColor(navy).text('Téléphone / WhatsApp : +41 79 967 02 95');
  doc.moveDown(0.45);body('E-mail : devis@pfnettoyage.ch');body('Site : www.pfnettoyage.ch');
  doc.moveDown(1.3);line(doc.y);doc.moveDown(0.8);
  doc.font('Helvetica-Oblique').fontSize(11).fillColor(gold).text('PF Nettoyage — Votre partenaire de confiance en Suisse romande.',{align:'center'});
  doc.end();
};