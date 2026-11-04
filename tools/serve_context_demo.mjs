// Focused local verification wrapper; not the hosted production handler.
// Loopback only, no key creation/storage, no model call until explicit consent.
import http from 'node:http';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createDemoServer} from './serve_meta_invoice_demo.mjs';
import {createExtractor,ExtractionError} from '../backend/meta-invoice/extractor.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const extractor=createExtractor({apiKey:process.env.MODEL_API_KEY||'',approved:process.env.META_INVOICE_LIVE_APPROVED==='1',maxRequests:6});
const staticServer=createDemoServer({publicDir:path.join(root,'public'),extractor}),staticHandler=staticServer.listeners('request')[0];
const reply=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
 const host='127.0.0.1:'+req.socket.localPort;if(req.headers.host!==host||req.headers.origin&&req.headers.origin!=='http://'+host)return reply(res,403,{error:'origin_not_allowed'});
 if(req.url==='/api/invoice-draft/status'&&req.method==='GET')return reply(res,200,{...extractor.status(),humanVerification:false,capabilities:['evidence-v2','image','pdf','audio']});
 if(req.url!=='/api/invoice-draft')return staticHandler(req,res);
 if(req.method!=='POST'||req.headers['content-type']!=='application/json'||!['invoice-draft-v1','invoice-draft-v2'].includes(req.headers['x-monkee-request']))return reply(res,400,{error:'json_request_required'});
 try{
  const parts=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>Math.ceil(4*1024*1024/3)*4+16384)return reply(res,413,{error:'notes_too_large'});parts.push(c);}
  const input=JSON.parse(Buffer.concat(parts).toString('utf8'));if(!input||input.consent!==true)return reply(res,400,{error:'consent_required'});
  const v2=req.headers['x-monkee-request']==='invoice-draft-v2';
  if(!v2&&Object.keys(input).sort().join(',')!=='consent,notes')return reply(res,400,{error:'unexpected_fields'});
  // This local verification harness has no hosted human-check bypass: it is a
  // separate loopback process using the operator's own explicitly approved key.
  const answer=await extractor.extract(v2?{...input,token:'loopback-verification-only'}:input);return reply(res,200,answer);
 }catch(e){return reply(res,e instanceof ExtractionError?e.status:400,{error:e instanceof ExtractionError?e.code:'invalid_request'});}
});
const port=Number(process.env.META_INVOICE_PORT||8767);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Use an unprivileged loopback port.');
server.listen(port,'127.0.0.1',()=>console.log('Focused local verification: http://127.0.0.1:'+port+'/ — live configured: '+extractor.status().configured+'; no startup provider call; local session cap6, no retries.'));
