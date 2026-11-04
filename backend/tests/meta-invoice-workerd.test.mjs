import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from '../../tooling/node_modules/esbuild/lib/main.js';
import {Miniflare,Response,convertV4MiniflareOptions} from '../../tooling/node_modules/miniflare/dist/src/index.js';
import pdfLib from '../../tooling/node_modules/pdf-lib/cjs/index.js';

test('real Workers runtime dispatches both requests and never follows redirects',async()=>{
 const origin='https://monkeetools.pages.dev';
 const bundle=await build({stdin:{contents:`import {handleInvoiceDraft} from '../meta-invoice/worker-route.mjs';
  export default {fetch(request,env){return handleInvoiceDraft(request,env,{allowedOrigins:new Set(['${origin}'])});}};`,
  resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'meta-runtime-test.mjs'},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
 const human='https://challenges.cloudflare.com/turnstile/v0/siteverify',model='https://api.meta.ai/v1/chat/completions';
 let mode='success';const calls=[];
 const options=convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,modules:true,name:'meta-runtime-test',compatibilityDate:'2026-09-15',
  script:bundle.outputFiles[0].text,bindings:{MODEL_API_KEY:'LLM_synthetic_runtime_only',TURNSTILE_SECRET:'synthetic_human_check_only',LICENSE_ENVIRONMENT:'production'},
  outboundService:async request=>{
   // The local outbound bridge reconstructs its Request. Test the observable
   // redirect behavior below; transport unit tests separately inspect the mode.
   calls.push(request.url);const body=await request.json();
   if(request.url===human){assert.equal(body.secret,'synthetic_human_check_only');assert(!('notes' in body));
    if(mode==='human-redirect')return new Response(null,{status:302,headers:{Location:'https://foreign.example/never-follow'}});
    return Response.json({success:true,action:'invoice-draft',hostname:'monkeetools.pages.dev'});
   }
   assert.equal(request.url,model);assert.equal(body.max_completion_tokens,1024);
   if(mode==='model-redirect')return new Response(null,{status:307,headers:{Location:'https://foreign.example/never-follow'}});
   return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'{}'}}]});
  }});
 const mf=new Miniflare({...options,telemetry:{enabled:false}});
 const send=()=>mf.dispatchFetch('https://worker.example/invoice-draft',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Monkee-Request':'invoice-draft-v1'},body:JSON.stringify({notes:'copy editing: 6 hours @ $90 per hour',consent:true,token:'synthetic_one_time_token'})});
 try{
  assert.equal((await send()).status,200);assert.deepEqual(calls,[human,model]);
  calls.length=0;mode='human-redirect';const rejectedHuman=await send();assert.equal(rejectedHuman.status,503);assert.equal((await rejectedHuman.json()).error,'human_check_unavailable');assert.deepEqual(calls,[human]);
  calls.length=0;mode='model-redirect';const rejectedModel=await send();assert.equal(rejectedModel.status,502);assert.equal((await rejectedModel.json()).error,'provider_failed');assert.deepEqual(calls,[human,model]);
 }finally{await mf.dispose();}
});

test('real Workers runtime handles v2 cross-note and inline PDF without a file-storage API',async()=>{
 const bundle=await build({stdin:{contents:`import {handleInvoiceDraft} from '../meta-invoice/worker-route.mjs';export default {fetch(request,env){return handleInvoiceDraft(request,env,{allowedOrigins:new Set(['https://monkeetools.pages.dev'])});}};`,resolveDir:fileURLToPath(new URL('.',import.meta.url)),sourcefile:'extended-runtime-test.mjs'},bundle:true,write:false,format:'esm',platform:'browser',logLevel:'silent'});
 const calls=[];const mf=new Miniflare({...convertV4MiniflareOptions({host:'127.0.0.1',port:0,cf:false,modules:true,name:'extended-runtime-test',compatibilityDate:'2026-09-15',script:bundle.outputFiles[0].text,bindings:{MODEL_API_KEY:'LLM_synthetic_runtime_only',TURNSTILE_SECRET:'synthetic_only',LICENSE_ENVIRONMENT:'production'},outboundService:async request=>{
  calls.push(request.url);const body=await request.json();if(request.url.includes('siteverify'))return Response.json({success:true,action:'invoice-draft',hostname:'monkeetools.pages.dev'});
  assert.equal(request.url,'https://api.meta.ai/v1/chat/completions');assert.equal(body.max_completion_tokens,4096);return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'{}'}}]});
 }}),telemetry:{enabled:false}});
 const send=input=>mf.dispatchFetch('https://worker.example/invoice-draft',{method:'POST',headers:{Origin:'https://monkeetools.pages.dev','Content-Type':'application/json','X-Monkee-Request':'invoice-draft-v2'},body:JSON.stringify({...input,consent:true,token:'synthetic_only'})});
 try{
  assert.equal((await send({operation:'reconcile',sources:[{id:'s1',label:'Work',text:'copy editing: 6 hours completed'},{id:'s2',label:'Quote',text:'copy editing: $90/hour'}]})).status,200);
  const doc=await pdfLib.PDFDocument.create();doc.addPage().drawText('copy editing: $90/hour');assert.equal((await send({operation:'read',media:{mime:'application/pdf',data:Buffer.from(await doc.save()).toString('base64')}})).status,200);
  assert.equal(calls.length,4);assert(calls.every(u=>u.endsWith('/siteverify')||u.endsWith('/chat/completions')));
 }finally{await mf.dispose();}
});
