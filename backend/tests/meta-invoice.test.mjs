import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {createExtractor,META_URL,requestBody} from '../meta-invoice/extractor.mjs';
import {createDemoServer} from '../../tools/serve_meta_invoice_demo.mjs';
const notes='For Example Studio\n6 hours of copy editing at $90/hour';
const completion={choices:[{finish_reason:'stop',message:{role:'assistant',content:'{"clientName":"Example Studio"}'}}]};
const response=()=>Response.json(completion);
const configured=(overrides={})=>createExtractor({apiKey:'LLM_synthetic_test_only',approved:true,fetchImpl:async()=>response(),...overrides});
test('explicit approval, app key and per-request consent gate every provider call',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return response();};
 for(const options of [{},{apiKey:'LLM_synthetic_test_only'},{approved:true}]){
  const x=createExtractor({...options,fetchImpl});await assert.rejects(x.extract({notes,consent:true}),/not_configured/);
 }
 const x=configured({fetchImpl});await assert.rejects(x.extract({notes}),/consent_required/);assert.equal(calls,0);
});
test('fixed official destination, schema, token bound, no retries, no provider metadata egress',async()=>{
 let calls=0;const x=configured({fetchImpl:async(url,options)=>{calls++;assert.equal(url,META_URL);assert.equal(options.redirect,'manual');const b=JSON.parse(options.body);assert.equal(b.max_completion_tokens,1024);assert.equal(b.stream,false);assert.equal(b.messages[1].content,notes);assert.equal(b.response_format.json_schema.schema.additionalProperties,false);return Response.json({...completion,private_provider_field:'not exposed'});}});
 const answer=await x.extract({notes,consent:true});assert.equal(calls,1);assert.equal(answer.private_provider_field,undefined);assert.equal(x.status().attempted,1);assert(!JSON.stringify(x.status()).includes('LLM_'));
});
test('input limits are checked before spending a slot',async()=>{
 const x=configured();for(const n of ['',null,'x'.repeat(12001)])await assert.rejects(x.extract({notes:n,consent:true}));assert.equal(x.status().attempted,0);assert.equal(requestBody(notes).model,'muse-spark-1.3');
});
test('provider redirects fail without following Location or retrying',async()=>{
 for(const status of [301,302,303,307,308]){
  const calls=[];const x=configured({fetchImpl:async(url,options)=>{calls.push(url);assert.equal(options.redirect,'manual');return new Response(null,{status,headers:{Location:'https://foreign.example/never-follow'}});}});
  await assert.rejects(x.extract({notes,consent:true}),e=>e.message==='provider_failed');
  assert.deepEqual(calls,[META_URL]);assert.equal(x.status().attempted,1);
 }
});
test('uncertain failures and provider errors consume slots without retry',async()=>{
 let calls=0;const x=configured({maxRequests:1,fetchImpl:async()=>{calls++;throw new Error('private provider/key data');}});
 await assert.rejects(x.extract({notes,consent:true}),e=>e.message==='provider_unavailable');await assert.rejects(x.extract({notes,consent:true}),/request_cap_reached/);assert.equal(calls,1);
 for(const status of [401,429,500]){const y=configured({fetchImpl:async()=>new Response('sensitive provider error',{status})});await assert.rejects(y.extract({notes,consent:true}),e=>!e.message.includes('sensitive'));assert.equal(y.status().attempted,1);}
});
test('concurrent attempts cannot spend a second slot',async()=>{
 let finish;const x=configured({fetchImpl:()=>new Promise(r=>{finish=r;})});const first=x.extract({notes,consent:true});await assert.rejects(x.extract({notes,consent:true}),/request_in_progress/);finish(response());await first;assert.equal(x.status().attempted,1);
});
test('timeouts, oversized, malformed, refused, truncated and tool-call responses stop safely',async()=>{
 const timeout=configured({timeoutMs:5,fetchImpl:(_u,o)=>new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('aborted'))))});await assert.rejects(timeout.extract({notes,consent:true}),/provider_timeout/);
 const invalid=[new Response('x'.repeat(32769)),new Response('not json'),Response.json({choices:[]}),Response.json({choices:[{...completion.choices[0],finish_reason:'length'}]}),Response.json({choices:[{finish_reason:'stop',message:{...completion.choices[0].message,tool_calls:{}}}]}),Response.json({choices:[{finish_reason:'stop',message:{...completion.choices[0].message,refusal:'no'}}]})];
 for(const value of invalid)await assert.rejects(configured({fetchImpl:async()=>value}).extract({notes,consent:true}));
});
test('loopback bridge blocks foreign origin/host, missing JSON header, private files and absent consent',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mt-meta-test-'));fs.writeFileSync(path.join(dir,'index.html'),'synthetic');
 let calls=0;const x=configured({fetchImpl:async()=>{calls++;return response();}}),server=createDemoServer({publicDir:dir,extractor:x});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const headers={'Content-Type':'application/json','X-Monkee-Request':'invoice-draft-v1'};
 assert.equal((await fetch(base+'/api/invoice-draft/status')).status,200);assert.equal(calls,0);
 assert.equal((await fetch(base+'/api/invoice-draft',{method:'POST',headers:{...headers,Origin:'https://foreign.example'},body:JSON.stringify({notes,consent:true})})).status,403);
 assert.equal((await fetch(base+'/api/invoice-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,400);
 assert.equal((await fetch(base+'/api/invoice-draft',{method:'POST',headers,body:JSON.stringify({notes,consent:false})})).status,400);assert.equal(calls,0);
 assert.equal((await fetch(base+'/api/invoice-draft',{method:'POST',headers,body:JSON.stringify({notes,consent:true})})).status,200);assert.equal(calls,1);
 assert.equal((await fetch(base+'/.git/config')).status,404);
 const badHost=await new Promise(resolve=>{const req=http.get(base+'/',{headers:{Host:'foreign.example'}},r=>{r.resume();resolve(r.statusCode);});req.on('error',resolve);});assert.equal(badHost,403);
 assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert(path.basename(dir).startsWith('mt-meta-test-'));fs.rmSync(dir,{recursive:true});
});
