'use strict';
const crypto=require('node:crypto');
const A=require('../lib/pf-admin-auth.cjs');
const LABEL_PREFIX='PF Prestataires - ';
function fail(res,status,error){return res.status(status).json({ok:false,error});}
function adminOrigin(){
 const configured=(process.env.ADMIN_BASE_URL||'').trim();
 if(!configured&&process.env.VERCEL_ENV!=='preview')return A.BASE;
 try{
  const url=new URL(configured);
  if(url.protocol==='https:'&&!url.username&&!url.password&&url.pathname==='/'&&!url.search&&!url.hash)return url.origin;
 }catch{}
 throw Error('admin_origin_not_configured');
}
async function getLabels(token){const all=(await A.google('labels',token)).labels||[];return all.filter(x=>x.name&&x.name.startsWith(LABEL_PREFIX));}
async function list(req,res,auth){const token=auth.token;const query='subject:"Candidature prestataire"';const data=await A.google('messages?'+new URLSearchParams({q:query,maxResults:'45'}),token);const labels=await getLabels(token);
 const statuses=Object.fromEntries(labels.map(l=>[l.id,l.name.slice(LABEL_PREFIX.length)]));
 const messages=await Promise.all((data.messages||[]).slice(0,45).map(async(item)=>{try{const m=await A.google('messages/'+encodeURIComponent(item.id)+'?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date',token);const hs=Object.fromEntries((m.payload&&m.payload.headers||[]).map(h=>[h.name.toLowerCase(),h.value]));return {id:m.id,threadId:m.threadId,subject:hs.subject||'',from:hs.from||'',date:hs.date||'',snippet:(m.snippet||'').slice(0,350),status:(m.labelIds||[]).map(id=>statuses[id]).find(Boolean)||'À examiner'};}catch{return null;}}));
 return res.status(200).json({ok:true,email:auth.session.email,csrf:auth.session.csrf,statuses:A.STATUSES,messages:messages.filter(Boolean)});}
async function change(req,res,auth){if(String(req.headers.origin||'')!==adminOrigin())return fail(res,403,'forbidden_origin');if(String(req.headers['x-admin-csrf']||'')!==auth.session.csrf)return fail(res,403,'invalid_csrf');const body=req.body||{};if(!body.id||!/^[a-zA-Z0-9]{8,32}$/.test(body.id)||!A.STATUSES.includes(body.status))return fail(res,400,'invalid_request');
 const token=auth.token;const labels=await getLabels(token);let selected=labels.find(l=>l.name===LABEL_PREFIX+body.status);
 if(!selected){selected=await A.google('labels',token,{method:'POST',body:JSON.stringify({name:LABEL_PREFIX+body.status,labelListVisibility:'labelShow',messageListVisibility:'show'})});}
 await A.google('messages/'+encodeURIComponent(body.id)+'/modify',token,{method:'POST',body:JSON.stringify({addLabelIds:[selected.id],removeLabelIds:labels.filter(l=>l.id!==selected.id).map(l=>l.id)})});
 return res.status(200).json({ok:true,status:body.status});}
module.exports=async function admin(req,res){A.noStore(res);try{
 const url=new URL(req.url,'https://www.pfnettoyage.ch');const mode=url.searchParams.get('mode')||'';
 if(mode==='login'&&req.method==='GET'){const c=A.cfg();const redirect=adminOrigin()+'/api/admin';const state=crypto.randomBytes(24).toString('base64url');A.setCookie(res,'pf_admin_oauth_state',A.seal({state,at:Date.now()}),600);const q=new URLSearchParams({client_id:c.id,redirect_uri:redirect,response_type:'code',scope:A.SCOPES,state,access_type:'offline',prompt:'consent',include_granted_scopes:'true'});return res.redirect(302,'https://accounts.google.com/o/oauth2/v2/auth?'+q);}
 if(req.method==='GET'&&url.searchParams.has('code')){const st=A.unseal(A.cookies(req).pf_admin_oauth_state),state=url.searchParams.get('state')||'';A.clearCookie(res,'pf_admin_oauth_state');if(!st||!state||state!==st.state||Date.now()-st.at>600000)return res.redirect(302,'/administration.html?error=session');
 const c=A.cfg();const token=await A.tokenRequest({client_id:c.id,client_secret:c.secret,code:url.searchParams.get('code'),redirect_uri:adminOrigin()+'/api/admin',grant_type:'authorization_code'});
 const pr=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(10000)});const user=await pr.json();const email=String(user.email||'').toLowerCase();
 if(!pr.ok||!user.verified_email||!c.allowed.includes(email)||!token.refresh_token){return res.redirect(302,'/administration.html?error=access');}
 A.setCookie(res,A.COOKIE,A.seal({email,refresh:token.refresh_token,csrf:crypto.randomBytes(24).toString('base64url'),expires:Date.now()+604800000}),604800);
 return res.redirect(302,'/administration.html');
 }
 if(mode==='logout'){A.clearCookie(res,A.COOKIE);return res.redirect(302,'/administration.html');}
 const auth=await A.authorize(req);
 if(!auth)return fail(res,401,'not_authenticated');
 if(mode==='data'&&req.method==='GET')return await list(req,res,auth);
 if(mode==='status'&&req.method==='POST')return await change(req,res,auth);
 return fail(res,405,'method_not_allowed');
 }catch(e){console.error('admin_api_error',{code:e.message||'unknown'});return fail(res,503,['oauth_not_configured','admin_origin_not_configured'].includes(e.message)?e.message:'service_unavailable');}};
