import {test} from 'node:test';import assert from 'node:assert/strict';
import pdfLib from '../../tooling/node_modules/pdf-lib/cjs/index.js';
import {extendedRequestBody,validateExtendedInput,MEDIA_LIMIT,contextSchema} from '../meta-invoice/extended.mjs';
import {handleInvoiceDraft,TURNSTILE_URL} from '../meta-invoice/worker-route.mjs';
const model='muse-spark-1.3',consent=true,token='synthetic-human-only';
const sources=[{id:'s1',label:'Work',text:'copy editing: 6 hours completed'},{id:'s2',label:'Quote',text:'copy editing: $90/hour'}];
const base={operation:'reconcile',sources,consent,token};
const media=(mime,bytes)=>({operation:'read',media:{mime,data:Buffer.from(bytes).toString('base64')},consent,token});
const origin='https://monkeetools.pages.dev',env={MODEL_API_KEY:'LLM_synthetic_only',TURNSTILE_SECRET:'synthetic_only',LICENSE_ENVIRONMENT:'production'};
const request=input=>new Request('https://worker.example/invoice-draft',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Monkee-Request':'invoice-draft-v2'},body:JSON.stringify(input)});
test('cross-note schema has independent field evidence, bounded completion and no accounting inference',async()=>{
 const b=await extendedRequestBody(base,model);assert.equal(b.model,model);assert.equal(b.max_completion_tokens,4096);assert.equal(b.stream,false);assert.equal(b.messages[1].content,JSON.stringify(sources));const schema=b.response_format.json_schema.schema;assert.equal(schema.additionalProperties,false);assert('quantityEvidence' in schema.properties.lineItems.items.properties);assert(!('total' in schema.properties));
});
test('inline photo, PDF and WAV use documented parts and never persistent file upload',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7uUAAAAASUVORK5CYII=','base64');
 const doc=await pdfLib.PDFDocument.create();doc.addPage();const pdf=await doc.save();
 const wav=Buffer.alloc(44+3200);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(3200,40);
 for(const [mime,bytes,type] of [['image/png',png,'image_url'],['application/pdf',pdf,'file'],['audio/wav',wav,'input_audio']]){const b=await extendedRequestBody(media(mime,bytes),model);const part=b.messages[1].content[1];assert.equal(part.type,type);assert(!JSON.stringify(b).includes('file_id'));if(type==='file')assert(part.file.file_data.startsWith('data:application/pdf;base64,'));if(type==='input_audio')assert.equal(part.input_audio.format,'wav');}
});
test('malformed/oversized/URL media, encrypted/long PDFs and long audio stop before any external request',async()=>{
 const doc=await pdfLib.PDFDocument.create();for(let i=0;i<4;i++)doc.addPage();
 const cases=[{...base,operation:'something'}, {...base,sources:[...sources,sources[0]]}, {...base,sources:[{id:'s1',label:'x',text:'x'.repeat(12001)}]},media('application/pdf',await doc.save()),media('application/pdf',Buffer.from('%PDF-invalid')),media('image/jpeg',Buffer.from('wrong')),media('audio/wav',Buffer.alloc(100)),{operation:'read',media:{mime:'image/jpeg',data:'https://foreign.example/pixel'},consent,token},{operation:'read',media:{mime:'image/jpeg',data:'A'.repeat(Math.ceil(MEDIA_LIMIT/3)*4+4)},consent,token}];
 for(const input of cases){let calls=0;await assert.rejects(validateExtendedInput(input));const r=await handleInvoiceDraft(request(input),env,{allowedOrigins:new Set([origin]),fetchImpl:async()=>{calls++;throw Error('NO_NETWORK');}});assert(r.status>=400);assert.equal(calls,0);}
});
test('v2 hosted operation requires consent plus verified human before exactly one provider call',async()=>{
 const calls=[];const fetchImpl=async(url,o)=>{calls.push(url);const b=JSON.parse(o.body);if(url===TURNSTILE_URL){assert.equal(b.response,token);assert(!('sources' in b));return Response.json({success:true,action:'invoice-draft',hostname:'monkeetools.pages.dev'});}assert.equal(b.max_completion_tokens,4096);return Response.json({choices:[{finish_reason:'stop',message:{role:'assistant',content:'{}'}}]});};
 assert.equal((await handleInvoiceDraft(request({...base,consent:false}),env,{allowedOrigins:new Set([origin]),fetchImpl})).status,400);assert.equal(calls.length,0);
 assert.equal((await handleInvoiceDraft(request(base),env,{allowedOrigins:new Set([origin]),fetchImpl})).status,200);assert.equal(calls.length,2);
});

test('reconciliation schema requires plain decimals and the prompt keeps units in evidence',async()=>{
 const properties=contextSchema.properties.lineItems.items.properties;
 for(const field of ['quantity','rate']){const r=new RegExp(properties[field].pattern);for(const value of ['','0','6','6.25'])assert(r.test(value));for(const value of ['6 hours','$90','-1','1.234'])assert(!r.test(value));}
 const body=await extendedRequestBody(base,model);assert.match(body.messages[0].content,/plain nonnegative decimal strings/);assert.match(body.messages[0].content,/units and currency in the evidence quotes/);
});
test('canonical WAV accepts exactly sixty seconds and rejects the next sample before inference',async()=>{
 function wav(seconds){const bytes=Buffer.alloc(44+Math.round(seconds*16000)*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(16000,24);bytes.writeUInt32LE(32000,28);bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);return bytes;}
 await validateExtendedInput(media('audio/wav',wav(60)));
 const input=media('audio/wav',wav(60+1/16000));await assert.rejects(validateExtendedInput(input),/audio_needs_60_seconds_mono_pcm/);let calls=0;const response=await handleInvoiceDraft(request(input),env,{allowedOrigins:new Set([origin]),fetchImpl:async()=>{calls++;throw Error('NO_NETWORK');}});assert(response.status>=400);assert.equal(calls,0);
});
