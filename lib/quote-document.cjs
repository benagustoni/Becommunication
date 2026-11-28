const PDFDocument = require('pdfkit');
const { randomBytes } = require('node:crypto');
const logo = require('node:path').join(__dirname, 'pf-logo.png');


async function createQuoteAttachment(p) {
  const lang=['fr','de','it'].includes(p.language)?p.language:'fr';
  const dictionary=new Map([["DEMANDE DE DEVIS","OFFERTANFRAGE","RICHIESTA DI PREVENTIVO"],["DEMANDE DE DEVIS - SUITE","OFFERTANFRAGE - FORTSETZUNG","RICHIESTA DI PREVENTIVO - SEGUITO"],["Demande de devis - PF Nettoyage","Offertanfrage - PF Nettoyage","Richiesta di preventivo - PF Nettoyage"],["Récapitulatif de votre formulaire | Reçu le ","Zusammenfassung Ihrer Anfrage | Eingang am ","Riepilogo della richiesta | Ricevuta il "],["1. COORDONNÉES DU DEMANDEUR","1. KONTAKTDATEN","1. DATI DEL RICHIEDENTE"],["2. PRESTATION ET INTERVENTION","2. LEISTUNG UND EINSATZ","2. SERVIZIO E INTERVENTO"],["Référence","Referenz","Riferimento"],["Nom et prénom","Vor- und Nachname","Nome e cognome"],["Téléphone","Telefon","Telefono"],["Adresse e-mail","E-Mail-Adresse","Indirizzo e-mail"],["Prestation souhaitée","Gewünschte Leistung","Servizio desiderato"],["Profil du demandeur","Profil der anfragenden Person","Profilo del richiedente"],["Nombre de pièces","Anzahl Zimmer","Numero di locali"],["Date souhaitée","Wunschdatum","Data desiderata"],["Intervention urgente","Dringender Einsatz","Intervento urgente"],["Créneau horaire","Zeitfenster","Fascia oraria"],["Nombre de photos jointes","Anzahl beigefügter Fotos","Numero di foto allegate"],["Région de l’intervention","Einsatzregion","Regione dell’intervento"],["Commune de l’intervention","Einsatzgemeinde","Comune dell’intervento"],["Adresse de l’intervention","Einsatzadresse","Indirizzo dell’intervento"],["3. ITINÉRAIRE DU DÉMÉNAGEMENT","3. UMZUGSROUTE","3. PERCORSO DEL TRASLOCO"],[" MESSAGE DU DEMANDEUR"," NACHRICHT"," MESSAGGIO DEL RICHIEDENTE"],["Cette demande ne confirme aucun rendez-vous. Contactez le demandeur pour préparer son devis.","Diese Anfrage bestätigt keinen Termin. Kontaktieren Sie die anfragende Person für die Offerte.","Questa richiesta non conferma alcun appuntamento. Contattare il richiedente per preparare il preventivo."],["Non renseigné","Nicht angegeben","Non indicato"],["À convenir","Zu vereinbaren","Da concordare"],["Oui","Ja","Sì"],["Non","Nein","No"],[" (suite)"," (Fortsetzung)"," (seguito)"],["Point A - Départ","Punkt A - Abfahrt","Punto A - Partenza"],["Point B - Destination","Punkt B - Ziel","Punto B - Destinazione"],[" : région"," : Region"," : regione"],[" : commune"," : Gemeinde"," : comune"],[" : rue et numéro"," : Strasse und Nummer"," : via e numero"]].map(r=>[r[0],r]));
  const tr=v=>dictionary.get(v)?.[['fr','de','it'].indexOf(lang)]||v;
  const value = v => v === undefined || v === null || v === '' ? tr('Non renseigné') : String(v);
  const doc = new PDFDocument({
    size: 'A4', margins: {top: 48, bottom: 65, left: 48, right: 48},
    bufferPages: true, pdfVersion: '1.7', userPassword: '',
    ownerPassword: randomBytes(32).toString('hex'),
    permissions: {printing: 'highResolution', modifying: false, copying: false,
      annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false},
    info: {Title: tr('Demande de devis - PF Nettoyage'), Author: 'PF Nettoyage - Facility Services'}
  });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const left = 40, width = doc.page.width - 80, limit = doc.page.height - 86;
  const dark = '#133c46', teal = '#159e9b', pale = '#e6f4f3', line = '#d1e2e2';
  let y = 0, rowNumber = 0;
  const header = (continued = false) => {
    doc.rect(0, 0, doc.page.width, continued ? 98 : 126).fill(dark);
    doc.rect(0, continued ? 98 : 126, doc.page.width, 5).fill(teal);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(23).text('PF NETTOYAGE', left, 26);
    doc.font('Helvetica').fontSize(10).text('FACILITY SERVICES', left, 56);
    doc.font('Helvetica-Bold').fontSize(continued ? 12 : 17)
      .text(continued ? tr('DEMANDE DE DEVIS - SUITE') : tr('DEMANDE DE DEVIS'), left, continued ? 77 : 87);
    const logoWidth = continued ? 100 : 125;
    const logoX = doc.page.width - 40 - logoWidth;
    const logoY = continued ? 12 : 17;
    doc.image(logo, logoX, logoY, {fit:[logoWidth, continued ? 70 : 92], align:'center'});
    y = continued ? 122 : 149;
    if (!continued) {
      doc.fillColor('#536d72').font('Helvetica').fontSize(9)
        .text(tr('Récapitulatif de votre formulaire | Reçu le ')+new Date().toLocaleString(lang+'-CH', {timeZone:'Europe/Zurich'}), left, y);
      y += 27;
    }
  };
  const nextPage = () => { doc.addPage(); header(true); };
  const ensure = height => { if (y + height > limit) nextPage(); };
  const section = title => {
    ensure(85);
    doc.roundedRect(left, y, width, 27, 3).fill(pale);
    doc.rect(left, y, 4, 27).fill(teal);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(dark).text(title, left+13, y+9, {width:width-26});
    y += 34; rowNumber = 0;
  };
  const wrap = (text, maxWidth, fontSize=10) => {
    doc.font('Helvetica').fontSize(fontSize);
    const lines=[];
    for (const paragraph of String(text).split(/\r?\n/)) {
      let current='';
      for (const word of paragraph.split(/\s+/)) {
        if (!word) continue;
        if (doc.widthOfString(current ? current+' '+word : word) <= maxWidth) {
          current=current ? current+' '+word : word;
        } else {
          if(current) lines.push(current);
          current='';
          for (const character of word) {
            if(doc.widthOfString(current+character)>maxWidth && current) {lines.push(current);current='';}
            current+=character;
          }
        }
      }
      lines.push(current);
    }
    return lines.length ? lines : [''];
  };
  const field = (label, v) => {
    let lines=wrap(value(v), width-191);
    let continued=false;
    while(lines.length) {
      ensure(38);
      const count=Math.min(lines.length, Math.max(1,Math.floor((limit-y-16)/14)));
      const chunk=lines.splice(0,count), h=Math.max(32,chunk.length*14+16);
      doc.rect(left,y,width,h).fill(rowNumber++%2 ? '#ffffff' : '#f5f9f9');
      doc.rect(left,y,175,h).fill('#edf4f4');
      doc.strokeColor(line).lineWidth(.4).rect(left,y,width,h).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(dark)
        .text(label+(continued ? tr(' (suite)') : ''),left+10,y+10,{width:155,lineGap:1});
      doc.font('Helvetica').fontSize(10).fillColor('#20383d')
        .text(chunk.join('\n'),left+185,y+9,{width:width-195,lineGap:2});
      y+=h;continued=true;
    }
  };
  header();
  section(tr('1. COORDONNÉES DU DEMANDEUR'));
  field(tr('Référence'),p.reference);
  field(tr('Nom et prénom'), p.name);
  field(tr('Téléphone'), p.telephone);
  field(tr('Adresse e-mail'), p.email);
  y+=13;
  section(tr('2. PRESTATION ET INTERVENTION'));
  field(tr('Prestation souhaitée'), p.service);
  const description = value(p.description);
  const profileMatch = description.match(/\n\nProfil du demandeur : ([^\r\n]*)\s*$/);
  field(tr('Profil du demandeur'), p.situation || p.profile || (profileMatch ? profileMatch[1] : ''));
  field(tr('Nombre de pièces'), p.pieces);
  field(tr('Date souhaitée'), p.desiredDate || tr('À convenir'));
  field(tr('Intervention urgente'),p.urgent ? tr('Oui') : tr('Non'));
  field(tr('Créneau horaire'),p.preferredTime || tr('À convenir'));
  field(tr('Nombre de photos jointes'),Array.isArray(p.photos) ? String(p.photos.length) : '0');
  if(p.location) {
    field(tr('Région de l’intervention'), p.location.region);
    field(tr('Commune de l’intervention'), p.location.commune);
    if(p.location.address) field(tr('Adresse de l’intervention'), p.location.address);
  }
  const moving = p.from || p.to || p.service === 'Déménagement';
  if(moving) {
    y+=13;section(tr('3. ITINÉRAIRE DU DÉMÉNAGEMENT'));
    for(const [label, point] of [[tr('Point A - Départ'),p.from],[tr('Point B - Destination'),p.to]]) {
      field(label+tr(' : région'),point?.region);
      field(label+tr(' : commune'),point?.commune);
      field(label+tr(' : rue et numéro'),point?.address);
    }
  }
  y+=13;section((moving ? '4.' : '3.')+tr(' MESSAGE DU DEMANDEUR'));
  let messageLines=wrap(profileMatch ? description.slice(0,profileMatch.index) || tr('Non renseigné') : description,width-28,11);
  while(messageLines.length) {
    ensure(44);
    const count=Math.min(messageLines.length,Math.max(1,Math.floor((limit-y-24)/16)));
    const chunk=messageLines.splice(0,count),h=Math.max(66,chunk.length*16+24);
    if(y+h>limit)nextPage();
    doc.roundedRect(left,y,width,h,3).fillAndStroke('#f8fbfb',line);
    doc.font('Helvetica').fontSize(11).fillColor('#20383d')
      .text(chunk.join('\n'),left+14,y+12,{width:width-28,lineGap:3});
    y+=h+12;
  }
  ensure(38);
  doc.font('Helvetica').fontSize(8).fillColor('#536d72')
    .text(tr('Cette demande ne confirme aucun rendez-vous. Contactez le demandeur pour préparer son devis.'),left,y,{width});
  const range=doc.bufferedPageRange();
  for(let i=range.start;i<range.start+range.count;i++) {
    doc.switchToPage(i);
    const bottom=doc.page.height-51;
    const savedBottom=doc.page.margins.bottom;doc.page.margins.bottom=0;
    doc.rect(left,bottom-13,width,2).fill(teal);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(dark)
      .text('PF NETTOYAGE - FACILITY SERVICES',left,bottom,{width});
    doc.font('Helvetica').fontSize(8).fillColor('#536d72')
      .text('+41 79 967 02 95 | pfnettoyage@gmail.com | www.pfnettoyage.ch',left,bottom+13,{width});
    doc.text((i+1)+' / '+range.count,left,bottom+13,{width,align:'right'});
    doc.page.margins.bottom=savedBottom;
  }
  doc.end();
  const safeName = String(p.name || 'demande').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9-]+/g, '_').slice(0,70);
  return {filename: 'Demande_de_devis_'+safeName+'.pdf', content: await completed, contentType: 'application/pdf'};
}
module.exports = {createQuoteAttachment};
