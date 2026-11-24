'use strict';
const crypto=require('node:crypto');
const BASE='https://www.pfnettoyage.ch';
const COOKIE='pf_admin_session';
const SCOPES='openid email https://www.googleapis.com/auth/gmail.modify';
const STATUSES=['À examiner','En discussion','Acceptée','Non retenue'];
function cfg(){const id=(process.env.GMAIL_CLIENT_ID||'').trim(),secret=(process.env.GMAIL_CLIENT_SECRET||'').trim();if(!id||!secret)throw Error('oauth_not_configured');const allowed=(process.env.ADMIN_ALLOWED_EMAILS||'pfnettoyage@gmail.com').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);return {id,secret,allowed};}
function key(){return crypto.createHash('sha256').update('pf-nettoyage/admin/cookie/v1|'+cfg().secret).digest();}
function seal(value){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);const enc=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),enc]).toString('base64url');}
function unseal(s){if(!s||s.length>3900)return null;try{const v=Buffer.from(s,'base64url');if(v.length<29)return null;const decipher=crypto.createDecipheriv('aes-256-gcm',key(),v.subarray(0,12));decipher.setAuthTag(v.subarray(12,28));return JSON.parse(Buffer.concat([decipher.update(v.subarray(28)),decipher.final()]).toString('utf8'));}catch{return null;}}
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)).filter(k=>k[0]));}
function setCookie(res,name,value,maxAge){res.setHeader('Set-Cookie',name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age='+maxAge);}
function clearCookie(res,name){setCookie(res,name,'',0);}
function session(req){const c=unseal(cookies(req)[COOKIE]);if(!c||typeof c.email!=='string'||typeof c.refresh!=='string'||!c.refresh||!c.csrf||!Number.isFinite(c.expires)||c.expires<Date.now()||!cfg().allowed.includes(c.email.toLowerCase()))return null;return c;}
async function tokenRequest(body){const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok||!data.access_token)throw Error('google_oauth_failed');return data;}
async function google(path,token,options={}){const r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})},signal:AbortSignal.timeout(12000)});const txt=await r.text();let data={};try{data=JSON.parse(txt)}catch{};if(!r.ok)throw Error('gmail_'+r.status);return data;}
async function authorize(req){const s=session(req);if(!s)return null;const c=cfg();try{const token=await tokenRequest({client_id:c.id,client_secret:c.secret,refresh_token:s.refresh,grant_type:'refresh_token'});const profile=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});const identity=await profile.json();if(!profile.ok||String(identity.email||'').toLowerCase()!==s.email.toLowerCase()||!identity.verified_email)return null;return {session:s,token:token.access_token};}catch{return null;}}
function noStore(res){res.setHeader('Cache-Control','no-store, private');res.setHeader('X-Content-Type-Options','nosniff');}
module.exports={BASE,COOKIE,SCOPES,STATUSES,cfg,seal,unseal,cookies,setCookie,clearCookie,session,tokenRequest,google,authorize,noStore};
