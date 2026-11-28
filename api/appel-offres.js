'use strict';

const privacyFooter = 'Protection des données — PF Nettoyage utilise vos données pour traiter votre demande et vous recontacter. Informations sur vos droits selon la loi fédérale sur la protection des données (LPD, RS 235.1) : https://www.pfnettoyage.ch/confidentialite.html';

const nodemailer = require('nodemailer');
const { randomUUID } = require('node:crypto');
const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const recent = new Map();
const TYPES = {
  pdf: ['application/pdf'],
  png: ['image/png'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};
function field(v, max, required = false, multiline = false) {
  if (typeof v !== 'string' || v.trim().length > max || (required && !v.trim()) || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/ : /[\u0000-\u001f]/).test(v)) throw Error('invalid_input');
  return v.trim();
}
function validateFile(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) throw Error('invalid_file');
  const name = field(f.name, 120, true);
  if (/[\\/]/.test(name)) throw Error('invalid_file');
  const ext = name.split('.').pop().toLowerCase();
  if (!TYPES[ext] || !TYPES[ext].includes(f.type)) throw Error('invalid_file');
  if (typeof f.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data)) throw Error('invalid_file');
  const content = Buffer.from(f.data, 'base64');
  if (!content.length || content.length > 950000 || content.toString('base64') !== f.data) throw Error('invalid_file');
  const prefix = content.subarray(0, 8);
  if (ext === 'pdf' && prefix.subarray(0, 5).toString() !== '%PDF-') throw Error('invalid_file');
  if (ext === 'png' && prefix.toString('hex') !== '89504e470d0a1a0a') throw Error('invalid_file');
  if (['jpg','jpeg'].includes(ext) && prefix.subarray(0, 3).toString('hex') !== 'ffd8ff') throw Error('invalid_file');
  if (ext === 'docx' && prefix.subarray(0, 2).toString() !== 'PK') throw Error('invalid_file');
  if (ext === 'doc' && prefix.toString('hex') !== 'd0cf11e0a1b11ae1') throw Error('invalid_file');
  return { filename:name, content, contentType:f.type };
}
module.exports = async function appelOffres(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({ok:false,error:'method_not_allowed'}); }
  const origin = String(req.headers.origin || '');
  if (origin && !['https://www.pfnettoyage.ch','https://pfnettoyage.ch'].includes(origin)) return res.status(403).json({ok:false,error:'forbidden'});
  let data, attachments;
  try {
    data = req.body;
    if (typeof data === 'string') data = JSON.parse(data);
    if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 4000000) throw Error('invalid_input');
    if (data.website) return res.status(200).json({ok:true,skipped:true});
    data = {
      entreprise:field(data.entreprise,160,true), contact:field(data.contact,160,true),
      email:field(data.email,254,true), telephone:field(data.telephone,50,true),
      commune:field(data.commune,160,true), prestation:field(data.prestation,140,true),
      delai:field(data.delai || '',120), description:field(data.description,6000,true,true),
      documents:data.documents
    };
    if (!EMAIL.test(data.email) || /[\r\n]/.test(data.entreprise+data.contact+data.email+data.telephone)) throw Error('invalid_input');
    if (!Array.isArray(data.documents) || data.documents.length > 3) throw Error('invalid_file');
    attachments=data.documents.map(validateFile);
    if (attachments.reduce((n,a)=>n+a.content.length,0)>2600000) throw Error('invalid_file');
  } catch(e) { return res.status(400).json({ok:false,error:e.message==='invalid_file'?'invalid_file':'invalid_request'}); }
  const ip=String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now=Date.now();for(const [k,t] of recent)if(now-t>60000)recent.delete(k);
  if(recent.has(ip))return res.status(429).json({ok:false,error:'please_wait'});
  recent.set(ip,now);
  const host=(process.env.SMTP_HOST||'').trim();
  const port=Number(process.env.SMTP_PORT);
  const user=(process.env.SMTP_USER||'').trim();
  let pass=process.env.SMTP_PASSWORD||'';
  if(host==='smtp.gmail.com')pass=pass.trim().replace(/ /g,'');
  if(!host||![465,587].includes(port)||!EMAIL.test(user)||!pass) return res.status(503).json({ok:false,error:'sending_unavailable'});
  const ref='AO-'+randomUUID();
  const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port===587,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:18000});
  const content=[
    'APPEL D\'OFFRES - PF NETTOYAGE / FACILITY SERVICES',
    'Référence : '+ref,
    'Entreprise / gérance : '+data.entreprise,
    'Contact : '+data.contact,'E-mail : '+data.email,'Téléphone : '+data.telephone,
    'Lieu / commune : '+data.commune,'Prestation : '+data.prestation,
    'Délai : '+(data.delai||'À convenir'),
    'Documents joints : '+attachments.length,'','DESCRIPTION :',data.description
  ].join('\n');
  try {
    const result=await transport.sendMail({
      from:'PF Nettoyage – Appels d\'offres <'+user+'>',
      to:'pfnettoyage@gmail.com', replyTo:data.email,
      subject:'Appel d\'offres - '+data.entreprise+' - '+ref,
      text: content + '\n\n' + privacyFooter, attachments
    });
    if(!result.accepted.some(a=>a.toLowerCase()==='pfnettoyage@gmail.com'))throw Error('not_accepted');
    console.log('appel_offres_sent',{ref,accepted:true,attachments:attachments.length});
    return res.status(200).json({ok:true,reference:ref});
  } catch(e) {
    console.error('appel_offres_send_failed',{ref,code:e.code||'SEND_FAILED'});
    return res.status(502).json({ok:false,error:'sending_failed'});
  } finally { transport.close(); }
};
