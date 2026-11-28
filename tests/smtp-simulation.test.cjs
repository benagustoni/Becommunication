'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const nodemailer=require('nodemailer');
const net=require('node:net');
test('quote and customer acknowledgement with real PDF, simulated transport', async (t)=>{
 const messages=[];
 t.mock.method(net,'connect',()=>{throw new Error('Network forbidden in test');});
 t.mock.method(nodemailer,'createTransport',()=>({sendMail:async m=>{messages.push(m);return {accepted:[m.to]};},close(){}}));
 const env={SMTP_HOST:'smtp.example.invalid',SMTP_PORT:'465',SMTP_USER:'test@example.invalid',SMTP_PASSWORD:'fictional-test-only',QUOTE_FROM_EMAIL:'test@example.invalid',QUOTE_TO_EMAIL:'office@example.invalid',QUOTE_CC_EMAIL:''};
 const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));
 Object.assign(process.env,env);
 try {
 const handler=require('../api/devis.js');
 let status,body;
 const res={setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;},end(){}};
 await handler({method:'POST',headers:{'x-forwarded-for':'192.0.2.10'},body:{name:'Client fictif',telephone:'000',email:'client@example.invalid',service:'Nettoyage',description:'Test uniquement',location:{region:'Test',commune:'Test'}}},res);
 assert.equal(status,200);assert.equal(body.confirmationSent,true);assert.equal(messages.length,2);
 assert.equal(messages[0].to,'office@example.invalid');assert.equal(messages[1].to,'client@example.invalid');
 for(const m of messages){assert.ok(Buffer.isBuffer(m.attachments[0].content));assert.equal(m.attachments[0].content.subarray(0,5).toString(),'%PDF-');}
 } finally {for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});
