const A = require('../lib/pf-admin-auth.cjs');
module.exports = async function(req,res){
 A.noStore(res);
 if(req.method !== 'GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false});}
 try {
  const auth = await A.authorize(req);
  if(!auth)return res.status(401).json({ok:false});
  return res.status(200).json({ok:true,authenticated:true});
 } catch {
  return res.status(503).json({ok:false,error:'authentication_unavailable'});
 }
};
