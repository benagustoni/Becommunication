'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const handlerPath=path.resolve(__dirname,'../api/devis.js');
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(24),Buffer.from([0,0,0,0,73,69,78,68,0,0,0,0])]);
function requestData(){return {name:'Client test',telephone:'+41 79 123 45 67',email:'client@example.test',service:'Nettoyage & entretien',description:'Test automatique, sans envoi réel.',location:{region:'Neuchâtel',commune:'Le Locle'},preferredTime:'À convenir'};}
async function fixture(fn){
 const keys=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASSWORD','QUOTE_FROM_EMAIL','QUOTE_TO_EMAIL','QUOTE_CC_EMAIL'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{SMTP_HOST:'smtp.gmail.com',SMTP_PORT:'465',SMTP_USER:'devis@pfnettoyage.ch',SMTP_PASSWORD:'test-credential',QUOTE_FROM_EMAIL:'PF Nettoyage <devis@pfnettoyage.ch>',QUOTE_TO_EMAIL:'pfnettoyage@gmail.com',QUOTE_CC_EMAIL:''});
 let mails=[],pdfCalls=0,transports=0;
 const load=Module._load;
 Module._load=function(id,parent,isMain){
  if(id==='nodemailer')return {createTransport(){transports++;return {sendMail:async(mail)=>{mails.push(mail);return {accepted:[mail.to]};},close(){}};}};
  if(id==='../lib/quote-document.cjs')return {createQuoteAttachment:async p=>{pdfCalls++;return {filename:'recap.pdf',content:Buffer.from('%PDF-1.7\n'+'.'.repeat(140)),contentType:'application/pdf'};}};
  return load.apply(this,arguments);
 };
 delete require.cache[handlerPath];
 let handler;
 try{handler=require(handlerPath);}finally{Module._load=load;}
 async function invoke(body){
  const req={method:'POST',body,headers:{'x-forwarded-for':'192.0.2.'+Math.floor(Math.random()*200+20)}};
  const res={setHeader(){},status(code){this.statusCode=code;return this;},json(obj){this.body=obj;return this;}};
  await handler(req,res);return res;
 }
 try{await fn({invoke,mails,pdfCalls:()=>pdfCalls,transports:()=>transports});}
 finally{delete require.cache[handlerPath];for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}
test('attaches official quote PDF and validated PNG to business only, sends PDF receipt',async()=>{
 await fixture(async({invoke,mails,pdfCalls})=>{
  const body={...requestData(),photos:[{type:'image/png',data:png.toString('base64')}]};
  const res=await invoke(body);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.ok,true);
  assert.equal(res.body.confirmationSent,true);
  assert.equal(mails.length,2);
  assert.equal(mails[0].attachments.length,2);
  assert.equal(mails[0].attachments[0].filename,'recap.pdf');
  assert.equal(mails[0].attachments[1].contentType,'image/png');
  assert.equal(mails[1].attachments.length,1);
  assert.equal(pdfCalls(),1);
 });
});
test('rejects invalid image content without sending mail',async()=>{
 await fixture(async({invoke,mails,pdfCalls})=>{
  for(const photos of [
   [{type:'image/png',data:Buffer.from('not a png').toString('base64')}],
   [{type:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')}],
   [{type:'image/png',data:png.toString('base64')},{type:'image/png',data:png.toString('base64')},{type:'image/png',data:png.toString('base64')}]
  ]){
   const res=await invoke({...requestData(),photos});
   assert.equal(res.statusCode,400);
  }
  assert.equal(mails.length,0);
  assert.equal(pdfCalls(),0);
 });
});
test('rejects requests with oversized image payloads',async()=>{
 await fixture(async({invoke,mails})=>{
  const res=await invoke({...requestData(),photos:[{type:'image/png',data:'A'.repeat(610100)}]});
  assert.equal(res.statusCode,400);
  assert.equal(mails.length,0);
 });
});
