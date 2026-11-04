import {createExtractor,requestBody,ExtractionError,META_MODEL} from './extractor.mjs';
import {validateExtendedInput,MEDIA_LIMIT} from './extended.mjs';
// No product-use quota or notes storage. Each hosted request requires a fresh
// server-verified human-check token and explicit consent.
export const TURNSTILE_URL='https://challenges.cloudflare.com/turnstile/v0/siteverify';
export async function handleInvoiceDraft(request,env,{allowedOrigins,fetchImpl=fetch}={}){
  const origin=request.headers.get('Origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  const permitted=!!origin&&allowedOrigins?.has(origin);
  if(permitted)Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Monkee-Request'});
  const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(!permitted)return reply(403,{error:'origin_not_allowed'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const path=new URL(request.url).pathname;
  // Staging uses public dummy Turnstile keys for automated UI tests. Those
  // tokens must never authorize paid inference, even if a key is added there.
  // Keep real action/hostname checks unchanged in production.
  const testVerification=env.LICENSE_ENVIRONMENT==='staging'||env.TURNSTILE_TEST_MODE===true||env.TURNSTILE_TEST_MODE==='true'||/^[123]x0{31}AA$/.test(env.TURNSTILE_SECRET||'');
  const configured=!testVerification&&typeof env.MODEL_API_KEY==='string'&&env.MODEL_API_KEY.startsWith('LLM_')&&!!env.TURNSTILE_SECRET;
  if(path.endsWith('/status')&&request.method==='GET')return reply(200,{model:META_MODEL,configured,available:configured,humanVerification:true,capabilities:['evidence-v2','image','pdf','audio'],...(testVerification?{reason:'test_verification_live_model_disabled'}:{})});
  if(path!=='/invoice-draft'||request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  if(!configured)return reply(503,{error:testVerification?'test_verification_live_model_disabled':'not_configured'});
  const version=request.headers.get('X-Monkee-Request');
  if(request.headers.get('Content-Type')!=='application/json'||!['invoice-draft-v1','invoice-draft-v2'].includes(version))return reply(400,{error:'json_request_required'});
  let input;
  try{
    if(!request.body)throw new Error('body');const reader=request.body.getReader();const chunks=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>(version==='invoice-draft-v2'?Math.ceil(MEDIA_LIMIT/3)*4+16384:65536)){await reader.cancel();return reply(413,{error:'notes_too_large'});}chunks.push(value);}}finally{reader.releaseLock();}
    const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
    input=JSON.parse(new TextDecoder().decode(bytes));
    if(!input||input.consent!==true||typeof input.token!=='string'||!input.token||input.token.length>2048)throw new Error('consent');
    if(version==='invoice-draft-v2')await validateExtendedInput(input);
    else {if(Object.keys(input).sort().join(',')!=='consent,notes,token')throw new Error('fields');requestBody(input.notes);}
  }catch(e){const known=['pdf_needs_one_to_three_unencrypted_pages','audio_needs_60_seconds_mono_pcm','image_too_large','invalid_media','invalid_sources','sources_too_large'];return reply(400,{error:known.includes(e.message)?e.message:'invalid_notes_or_consent'});}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
  try{
    // Workers rejects redirect:'error' before dispatch. Manual never follows a
    // redirect, and the non-2xx check below fails closed without exposing secrets.
    const human=await fetchImpl(TURNSTILE_URL,{method:'POST',redirect:'manual',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET,response:input.token})});
    if(!human.ok)return reply(503,{error:'human_check_unavailable'});
    const result=await human.json();
    if(result.success!==true||result.action!=='invoice-draft'||result.hostname!==new URL(origin).hostname)return reply(403,{error:'human_check_failed'});
  }catch{return reply(503,{error:'human_check_unavailable'});}
  finally{clearTimeout(timer);}
  try{
    const extractor=createExtractor({apiKey:env.MODEL_API_KEY,approved:true,maxRequests:1,fetchImpl});
    return reply(200,await extractor.extract(input));
  }catch(e){return reply(e instanceof ExtractionError?e.status:502,{error:e instanceof ExtractionError?e.code:'provider_unavailable'});}
}
