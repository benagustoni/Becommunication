'use strict';
const PDFDocument = require('pdfkit');

module.exports = function handler(req, res) {
  if (!['GET','HEAD'].includes(req.method)) {
    res.setHeader('Allow','GET, HEAD');
    return res.status(405).end('Méthode non autorisée');
  }
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition','inline; filename="PF-Nettoyage-Dossier-Interventions-Urgentes-Premium.pdf"');
  res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
  if (req.method === 'HEAD') return res.status(200).end();

  const doc = new PDFDocument({
    size:'A4', autoFirstPage:false, margin:0,
    info:{Title:'Dossier des interventions urgentes - PF Nettoyage',Author:'PF Nettoyage - Facility Services',Subject:'Prestations, conditions et règlement des interventions urgentes'}
  });
  doc.pipe(res);
  const W=595.28,H=841.89,L=52,R=543,CW=491;
  const N='#101F35',N2='#1D344C',G='#B79A68',INK='#24354A',MID='#667486',PALE='#F4F6F8',BORDER='#E3E8EC',WHITE='#FFFFFF';
  function txt(t,x,y,w,size=10,color=INK,font='Helvetica',opts={}) {
    doc.fillColor(color).font(font).fontSize(size).text(t,x,y,{width:w,lineGap:2,...opts});
  }
  function rule(y){doc.strokeColor(BORDER).lineWidth(.8).moveTo(L,y).lineTo(R,y).stroke();}
  function pageBase(num,label){
    doc.addPage({size:'A4',margin:0});
    doc.rect(0,0,W,12).fill(G);
    doc.rect(0,12,W,102).fill(N);
    txt('PF NETTOYAGE',L,33,280,18,WHITE,'Helvetica-Bold');
    txt('F A C I L I T Y   S E R V I C E S',L,61,365,8.3,'#D3C19E','Helvetica-Bold');
    txt(label,L,86,440,9.2,'#D9E2EC','Helvetica');
    rule(785);
    txt('PF NETTOYAGE  |  SUISSE ROMANDE',L,797,340,8,MID,'Helvetica-Bold');
    txt(String(num).padStart(2,'0')+' / 02',477,797,65,8,MID,'Helvetica',{align:'right'});
  }
  function heading(title,y){doc.rect(L,y,3,18).fill(G);txt(title,L+13,y,460,13,N,'Helvetica-Bold');}
  function box(x,y,w,h,fill=PALE){doc.roundedRect(x,y,w,h,8).fill(fill);doc.roundedRect(x,y,w,h,8).lineWidth(.7).strokeColor(BORDER).stroke();}
  function row(t,desc,y){
    box(L,y,CW,53,WHITE);
    doc.rect(L,y,5,53).fill(G);
    txt(t,L+18,y+10,178,10.3,N,'Helvetica-Bold');
    txt(desc,L+199,y+9,276,9.4,INK);
  }

  // PAGE 1 - Services et aperçu client
  pageBase(1,'DOSSIER OFFICIEL  /  PRÉSENTATION DES PRESTATIONS');
  txt('INTERVENTIONS URGENTES',L,138,CW,24,N,'Helvetica-Bold');
  txt('Un service prioritaire, une intervention encadrée.',L,174,CW,11,G,'Helvetica-Bold');
  txt('PF Nettoyage propose des interventions urgentes en Suisse romande pour les déménagements, le nettoyage, les fins de bail, les débarras et les évacuations. Les demandes peuvent être transmises 7 jours sur 7, sous réserve de disponibilité, de sécurité et des dispositions légales applicables.',L,210,CW,10.4,INK,'Helvetica',{lineGap:4});
  heading('DOMAINES D’INTERVENTION',285);
  row('Déménagement','Départ imprévu, déménagement anticipé ou logement à libérer rapidement.',319);
  row('Nettoyage & entretien','Après sinistre, dégât d’eau ou remise en état urgente.',379);
  row('Nettoyage de fin de bail','État des lieux imminent ou remise rapide des clés.',439);
  row('Débarras & évacuation','Évacuation d’encombrants et libération de locaux.',499);
  row('Déménagement + débarras','Transport de meubles, évacuation des objets et nettoyage final.',559);
  box(L,642,CW,94,'#F0F3F6');
  txt('IMPORTANT',L+16,656,CW-32,10.3,N,'Helvetica-Bold');
  txt('Une demande qualifiée d’urgente par le client ne constitue pas automatiquement une urgence légale autorisant le travail de nuit, du dimanche ou des jours fériés.',L+16,677,CW-32,9.6,INK);

  // PAGE 2 - Règlement, demandes et contacts
  pageBase(2,'DOSSIER OFFICIEL  /  CONDITIONS D’INTERVENTION');
  txt('RÈGLEMENT & PRISE EN CHARGE',L,138,CW,21,N,'Helvetica-Bold');
  txt('Des règles claires pour chaque intervention.',L,170,CW,10.8,G,'Helvetica-Bold');
  heading('LES 5 CONDITIONS ESSENTIELLES',210);
  const conditions=[
    ['01  DEMANDE PRIORITAIRE','La demande est examinée selon son urgence réelle et les disponibilités de PF Nettoyage.'],
    ['02  CONFIRMATION OBLIGATOIRE','Aucun déplacement ni créneau n’est garanti sans validation expresse de l’entreprise.'],
    ['03  TARIFS & DEVIS','L’estimation précise les prestations, le déplacement et les éventuelles majorations avant intervention, dans la mesure du possible.'],
    ['04  TRAVAIL DE NUIT & DIMANCHE','Les autorisations, dérogations ou exemptions applicables doivent être vérifiées avant toute planification.'],
    ['05  SÉCURITÉ & ACCÈS','Vérification des accès, du stationnement, de la manutention, des équipements et des conditions sur place.']
  ];
  let y=244;
  for(const [n,d] of conditions){
    box(L,y,CW,61,WHITE);
    txt(n,L+15,y+9,CW-30,9.7,N,'Helvetica-Bold');
    txt(d,L+15,y+28,CW-30,9.35,INK);
    y+=69;
  }
  heading('POUR UNE DEMANDE URGENTE',609);
  txt('Merci d’indiquer la prestation souhaitée, le lieu exact de l’intervention, la situation rencontrée ainsi que la date et le créneau horaire souhaités. Notre équipe vous recontacte pour confirmer les possibilités.',L,639,CW,9.7,INK);
  doc.roundedRect(L,697,CW,63,8).fill(N2);
  txt('CONTACT PRIORITAIRE',L+15,706,160,9.2,'#DDC79E','Helvetica-Bold');
  txt('+41 79 967 02 95  /  WhatsApp',L+15,723,270,11.1,WHITE,'Helvetica-Bold');
  txt('devis@pfnettoyage.ch',343,716,182,9.3,WHITE,'Helvetica-Bold',{align:'right'});
  txt('www.pfnettoyage.ch',343,734,182,8.9,'#DCE6F0','Helvetica',{align:'right'});
  doc.end();
};
