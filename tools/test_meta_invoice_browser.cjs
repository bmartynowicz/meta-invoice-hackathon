'use strict';
// Synthetic provider responses only. Never uses an owner browser, real key or model API.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),arg=process.argv.indexOf('--build');
if(arg<0)throw new Error('--build required');
const build=path.resolve(process.argv[arg+1]);
if(!build.startsWith(root+path.sep)||path.basename(build)!=='public')throw new Error('Expected isolated public build');
const out=path.join(root,'reports/licensing-repair/meta-invoice');fs.mkdirSync(out,{recursive:true});
const notes='For Example Studio\nProject: November website copy\ncopy editing: 6 hours @ $90 per hour\nlanding pages: 2 @ $150 each\nTravel cost to confirm';
const facts=()=>({clientName:'Example Studio',project:'November website copy',lineItems:[{description:'copy editing',quantity:'6',rate:'90',sourceLine:3},{description:'landing pages',quantity:'2',rate:'150',sourceLine:4}],missingFields:['businessName','invoiceNumber','currency','invoiceDate','paymentTerms','taxTreatment']});
const completion=data=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(data)}}]});
const report={provider:'SIMULATED ONLY; zero Meta calls',checks:[],screenshots:[],pdfs:[],errors:[]};
let browser;
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
(async()=>{
 const {createExtractor}=await import(pathToFileURL(path.join(root,'backend/meta-invoice/extractor.mjs')));
 const {createDemoServer}=await import(pathToFileURL(path.join(root,'tools/serve_meta_invoice_demo.mjs')));
 browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath()});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:844}]){
  let calls=0,finish,hold=false,mode='valid';
  const extractor=createExtractor({apiKey:'LLM_synthetic_test_only',approved:true,maxRequests:10,fetchImpl:async()=>{
   calls++;if(hold)await new Promise(r=>finish=r);
   if(mode==='failure')throw new Error('synthetic outage');
   const data=facts();if(mode==='fabricated')data.lineItems[0].rate='900';
   return Response.json(completion(data));
  }});
  const server=createDemoServer({publicDir:build,extractor});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const origin='http://127.0.0.1:'+server.address().port;
  const ctx=await browser.newContext({viewport,acceptDownloads:true,serviceWorkers:'block'});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());
  try{
   await p.goto(origin);await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesMetaOptions').waitFor({state:'visible'});await p.locator('#jobNotesMetaOptions>summary').click();
   await check(`${viewport.width}px: consent and no automatic model call`,async()=>{
    assert.equal(calls,0);assert(await p.locator('#jobNotesMetaScan').isDisabled());
    await p.locator('#jobNotesInput').fill(notes);assert(await p.locator('#jobNotesMetaScan').isDisabled());
    assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   });
   await check(`${viewport.width}px: source-linked Meta proposal preserves existing invoice until confirmation`,async()=>{
    const before=await p.locator('#invoiceForm').evaluate(el=>Array.from(el.querySelectorAll('input,textarea,select')).map(x=>[x.id,x.value,x.checked]));
    await p.locator('#jobNotesMetaConsent').check();await p.locator('#jobNotesMetaScan').click();
    await p.getByText(/Meta Muse Spark 1.3 response received and source-checked/).waitFor();assert.equal(calls,1);
    assert.equal(await p.locator('#jobNotesReviewed').isChecked(),false);assert.equal(await p.locator('#jobNotesCurrency').inputValue(),'USD');assert.match(await p.locator('#jobNotesDefaultsSummary').innerText(),/USD.*due in 14 days.*no tax/);
    const after=await p.locator('#invoiceForm').evaluate(el=>Array.from(el.querySelectorAll('input,textarea,select')).map(x=>[x.id,x.value,x.checked]));assert.deepEqual(after,before);
    for(const summary of await p.locator('.job-item-evidence summary').all())await summary.click();assert((await p.locator('#jobNotesItems').innerText()).includes('Note 3: copy editing: 6 hours @ $90 per hour'));
    assert(await p.locator('#jobNotesUnparsed').isVisible());
    await p.locator('#jobNotesPanel').evaluate(el=>{const label=document.createElement('p');label.textContent='SYNTHETIC REGRESSION: simulated Meta response; no live provider call.';label.style.cssText='padding:10px;background:#fff3cd;font-weight:bold';el.prepend(label);});
    const proposalShot=path.join(out,`meta-proposal-${viewport.width}.png`);await p.locator('#jobNotesPanel').screenshot({path:proposalShot});report.screenshots.push(path.relative(root,proposalShot));
    await p.locator('#jobNotesDemoAnswers').click();await p.locator('#jobNotesApply').click();assert((await p.locator('#jobNotesError').innerText()).includes('Review and confirm'));
    await p.locator('#jobNotesReviewed').check();await p.locator('#jobNotesApply').click();assert((await p.locator('#jobNotesError').innerText()).includes('unmatched'));
    await p.locator('#jobNotesUnparsedReviewed').check();await p.locator('#jobNotesReviewed').check();
    if(await p.locator('#jobNotesReplace').isVisible())await p.locator('#jobNotesReplace').check();
    await p.locator('#jobNotesReviewed').check();await p.locator('#jobNotesApply').click();
    await p.locator('#jobNotesPanel').waitFor({state:'hidden'});assert.equal(await p.locator('#clientName').inputValue(),'Example Studio');
    const total=await p.locator('#invoicePreview').innerText();assert(total.includes('840.00'));
    const download=p.waitForEvent('download');await p.getByRole('button',{name:'Download PDF',exact:true}).first().click();
    if(await p.locator('#payCheckModal').evaluate(e=>e.classList.contains('open')))await p.locator('#payCheckAnyway').click();
    const pdf=await download;const pdfPath=path.join(out,`synthetic-invoice-${viewport.width}.pdf`);await pdf.saveAs(pdfPath);const bytes=fs.readFileSync(pdfPath);assert(bytes.subarray(0,5).equals(Buffer.from('%PDF-')));assert(bytes.length>3000);report.pdfs.push(path.relative(root,pdfPath));await p.locator('#doneClose').click();
    const shot=path.join(out,`reviewed-invoice-${viewport.width}.png`);await p.screenshot({path:shot,fullPage:true});report.screenshots.push(path.relative(root,shot));
   });
   await check(`${viewport.width}px: changed notes discard an in-flight response`,async()=>{
    await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesInput').fill(notes);await p.locator('#jobNotesMetaConsent').check();hold=true;
    await p.locator('#jobNotesMetaScan').click();await p.getByText('Asking Meta for suggestions. Your invoice has not changed.',{exact:true}).waitFor();
    await p.locator('#jobNotesInput').fill(notes+'\nChanged after request');finish();hold=false;
    await p.getByText('Notes changed or the panel closed. The earlier Meta response was discarded.',{exact:true}).waitFor();assert(await p.locator('#jobNotesReview').isHidden());assert.equal(await p.locator('#clientName').inputValue(),'Example Studio');
   });
   await check(`${viewport.width}px: fabricated and failed responses never change invoice`,async()=>{
    await p.locator('#jobNotesInput').fill(notes);mode='fabricated';await p.locator('#jobNotesMetaConsent').check();await p.locator('#jobNotesMetaScan').click();
    await p.getByText('Meta response rejected by the source checks. Your invoice has not changed.',{exact:true}).waitFor();assert(await p.locator('#jobNotesReview').isHidden());
    mode='failure';await p.locator('#jobNotesMetaConsent').check();await p.locator('#jobNotesMetaScan').click();await p.getByText('No Meta draft was applied.',{exact:true}).waitFor();
    assert.equal(calls,4);assert.equal(await p.locator('#clientName').inputValue(),'Example Studio');assert(!(await p.locator('#jobNotesMetaConsent').isChecked()));
    await p.locator('#jobNotesScan').click();assert(await p.locator('#jobNotesReview').isVisible());assert.equal(calls,4);
   });
   if(viewport.width===1440){
    let humanLoads=0,hostedCalls=0;
    await ctx.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',r=>{humanLoads++;return r.fulfill({contentType:'application/javascript',body:"window.turnstile={render:(_selector,o)=>{window.__releaseSyntheticHuman=()=>o.callback('synthetic_human_token');return 'synthetic_widget';},remove:()=>{window.__humanRemoved=true;}};"});});
    await ctx.route(origin+'/api/invoice-draft/status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({model:'muse-spark-1.3',configured:false,available:false,humanVerification:true,reason:'test_verification_live_model_disabled'})}));
    await ctx.addInitScript(()=>localStorage.setItem('mt_onboarding_v1',JSON.stringify({skipped:true})));
    await p.reload();await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesMetaOptions').waitFor({state:'visible'});await p.locator('#jobNotesMetaOptions>summary').click();await p.locator('#jobNotesInput').fill(notes);
    await check('staging test verification disables live calls while preserving local review',async()=>{
      await p.getByText('Staging uses test verification. Live Meta is disabled here; local parsing and PDF export still work.',{exact:true}).waitFor();
      await p.locator('#jobNotesMetaConsent').check();assert(await p.locator('#jobNotesMetaScan').isDisabled());assert.equal(humanLoads,0);assert.equal(hostedCalls,0);
      await p.locator('#clientName').fill('Existing staging draft');
      await p.locator('#jobNotesScan').click();assert(await p.locator('#jobNotesReview').isVisible());assert.equal(await p.locator('#clientName').inputValue(),'Existing staging draft');
    });
    await ctx.unroute(origin+'/api/invoice-draft/status');
    await ctx.route(origin+'/api/invoice-draft/status',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({model:'muse-spark-1.3',configured:true,available:true,humanVerification:true})}));
    await ctx.route(origin+'/api/invoice-draft',r=>{const input=r.request().postDataJSON();assert.equal(input.token,'synthetic_human_token');assert.equal(input.consent,true);assert.equal(input.notes,notes);hostedCalls++;return r.fulfill({contentType:'application/json',body:JSON.stringify(completion(facts()))});});
    await ctx.addInitScript(()=>localStorage.setItem('mt_onboarding_v1',JSON.stringify({skipped:true})));
    await p.reload();await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesMetaOptions').waitFor({state:'visible'});await p.locator('#jobNotesMetaOptions>summary').click();await p.locator('#jobNotesInput').fill(notes);
    await check('hosted human verification loads only after consent and gates the request',async()=>{
      assert.equal(humanLoads,0);assert.equal(hostedCalls,0);await p.locator('#jobNotesMetaConsent').check();
      await p.waitForFunction(()=>typeof window.__releaseSyntheticHuman==='function');assert.equal(humanLoads,1);assert(await p.locator('#jobNotesMetaScan').isDisabled());
      await p.evaluate(()=>window.__releaseSyntheticHuman());await p.locator('#jobNotesMetaScan').click();await p.getByText(/Meta Muse Spark 1.3 response received and source-checked/).waitFor();
      assert.equal(hostedCalls,1);assert.equal(await p.locator('#jobNotesMetaConsent').isChecked(),false);assert(await p.evaluate(()=>window.__humanRemoved===true));
    });
   }
  }finally{await ctx.close();await new Promise(r=>server.close(r));}
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.passed=false;report.failure=e.stack;console.error(e.stack);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();fs.writeFileSync(path.join(out,'browser-result.json'),JSON.stringify(report,null,2));});
