'use strict';
const nodemailer=require('nodemailer');
const {randomUUID}=require('node:crypto');
const EMAIL=/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;
const recent=new Map();
function str(v,max,required=false,multiline=false){if(typeof v!=='string'||v.length>max||(required&&!v.trim())||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/:/[\u0000-\u001f]/).test(v))throw Error('invalid_input');return v.trim();}
function doc(f){if(!f||typeof f!=='object')throw Error('invalid_file');const name=str(f.name,110,true);if(/[\\/]/.test(name))throw Error('invalid_file');const ext=name.split('.').pop().toLowerCase();const types={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};if(!types[ext]||f.type!==types[ext]||typeof f.data!=='string'||f.data.length>1400000||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.data))throw Error('invalid_file');const buffer=Buffer.from(f.data,'base64');if(!buffer.length||buffer.length>1000000||buffer.toString('base64')!==f.data)throw Error('invalid_file');if(ext==='pdf'&&buffer.subarray(0,5).toString()!=='%PDF-')throw Error('invalid_file');if(ext==='png'&&buffer.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('invalid_file');if((ext==='jpg'||ext==='jpeg')&&buffer.subarray(0,3).toString('hex')!=='ffd8ff')throw Error('invalid_file');return {filename:name,content:buffer,contentType:f.type};}
module.exports=async function prestataires(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({ok:false,error:'method_not_allowed'});}
 const origin=String(req.headers.origin||'');
 if(origin&&!['https://www.pfnettoyage.ch','https://pfnettoyage.ch'].includes(origin))return res.status(403).json({ok:false,error:'forbidden'});
 let p,attachments;
 try{
  let b=req.body;if(typeof b==='string')b=JSON.parse(b);
  if(!b||typeof b!=='object'||Array.isArray(b)||Buffer.byteLength(JSON.stringify(b),'utf8')>3000000)throw Error('invalid_input');
  if(b.website)return res.status(200).json({ok:true,skipped:true});
  if(b.acceptPrivacy!==true)throw Error('invalid_input');
  p={entreprise:str(b.entreprise,150,true),contact:str(b.contact,120,true),email:str(b.email,254,true),telephone:str(b.telephone,60,true),ide:str(b.ide||'',40),commune:str(b.commune,130,true),regions:str(b.regions,400,true),prestations:str(b.prestations,600,true),description:str(b.description,2500,true,true),acceptPrivacy:true};
  if(!EMAIL.test(p.email))throw Error('invalid_input');
  if(!Array.isArray(b.documents)||b.documents.length>2)throw Error('invalid_file');
  attachments=b.documents.map(doc);
  if(attachments.reduce((n,a)=>n+a.content.length,0)>1800000)throw Error('invalid_file');
 }catch(e){return res.status(400).json({ok:false,error:e.message==='invalid_file'?'invalid_file':'invalid_request'});}
 const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0].trim();
 const now=Date.now();for(const [k,t]of recent)if(now-t>60000)recent.delete(k);
 if(recent.has(ip))return res.status(429).json({ok:false,error:'please_wait'});
 recent.set(ip,now);
 const host=(process.env.SMTP_HOST||'').trim();const port=Number(process.env.SMTP_PORT);const user=(process.env.SMTP_USER||'').trim();let pass=process.env.SMTP_PASSWORD||'';
 if(host.toLowerCase()==='smtp.gmail.com'&&/^(?:[a-z]{16}|[a-z]{4}( [a-z]{4}){3})$/i.test(pass.trim()))pass=pass.trim().replace(/ /g,'');
 if(!host||![465,587].includes(port)||!EMAIL.test(user)||!pass||/[^a-z0-9.-]/i.test(host))return res.status(503).json({ok:false,error:'sending_unavailable'});
 const ref='PREST-'+randomUUID();
 const txt=['CANDIDATURE PRESTATAIRE / PARTENAIRE PF NETTOYAGE','Référence : '+ref,'Entreprise : '+p.entreprise,'Contact : '+p.contact,'E-mail : '+p.email,'Téléphone : '+p.telephone,'N° IDE (facultatif) : '+(p.ide||'Non indiqué'),'Commune : '+p.commune,'Régions : '+p.regions,'Activités : '+p.prestations,'Documents : '+attachments.length,'','Présentation :',p.description,'','Candidature soumise à examen. Aucun partenariat automatique.'].join('\n');
 const transport=nodemailer.createTransport({host,port,secure:port===465,requireTLS:port===587,auth:{user,pass},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:18000});
 try{const result=await transport.sendMail({from:'PF Nettoyage – Prestataires <'+user+'>',to:'pfnettoyage@gmail.com',replyTo:p.email,subject:'Candidature prestataire – '+p.entreprise+' – '+ref,text:txt,attachments});if(!result.accepted.some(a=>a.toLowerCase()==='pfnettoyage@gmail.com'))throw Error('not_accepted');console.log('prestataire_sent',{ref,accepted:true,attachments:attachments.length});return res.status(200).json({ok:true,reference:ref});}
 catch(e){console.error('prestataire_send_failed',{ref,code:e.code||'SEND_FAILED'});return res.status(502).json({ok:false,error:'sending_failed'});}
 finally{transport.close();}
};