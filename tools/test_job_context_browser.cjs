'use strict';
// All provider/human-check responses are synthetic. Fresh browser; loopback only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),arg=process.argv.indexOf('--build');if(arg<0)throw Error('--build required');
const build=path.resolve(process.argv[arg+1]);if(!build.startsWith(root+path.sep)||path.basename(build)!=='public')throw Error('Isolated public build required');
const out=path.join(root,'reports/licensing-repair/job-context');fs.mkdirSync(out,{recursive:true});
const work='For Example Studio\nProject: November copy\ncopy editing: 6 hours completed\nlanding pages: 2 pages completed; travel price still unconfirmed';
const quote='copy editing agreed rate: $90/hour\nlanding pages agreed rate: $150/page';
const ref=(sourceId,line,quote)=>({sourceId,line,quote});
const facts=()=>({clientName:'Example Studio',project:'November copy',lineItems:[{description:'copy editing',quantity:'6',rate:'90',work:ref('s1',3,'copy editing'),quantityEvidence:ref('s1',3,'6 hours'),rateEvidence:ref('s2',1,'$90/hour')},{description:'landing pages',quantity:'2',rate:'150',work:ref('s1',4,'landing pages'),quantityEvidence:ref('s1',4,'2 pages'),rateEvidence:ref('s2',2,'$150/page')}]});
const completion=data=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(data)}}]});
const report={provider:'SIMULATED ONLY; zero provider calls',checks:[],errors:[],screenshots:[],pdfs:[],http:[]};
let server,browser,origin,modelCalls=0,reads=[],mode='valid';
async function check(name,fn){await fn();report.checks.push(name);console.log('PASS '+name);}
(async()=>{
 const {handleInvoiceDraft,TURNSTILE_URL}=await import(pathToFileURL(path.join(root,'backend/meta-invoice/worker-route.mjs')));
 const {PDFDocument}=require('../tooling/node_modules/pdf-lib');
 const pdf=await PDFDocument.create();pdf.addPage().drawText(quote,{x:40,y:700,size:16});const pdfBytes=await pdf.save();
 const wav=Buffer.alloc(44+3200);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(3200,40);
 server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/invoice-draft')){
   const parts=[];for await(const c of req)parts.push(c);const url='https://worker.example'+req.url.replace('/api','');
   const headers=new Headers(req.headers);headers.set('Origin',origin);
   const request=new Request(url,{method:req.method,headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
   const answer=await handleInvoiceDraft(request,{MODEL_API_KEY:'LLM_synthetic_only',TURNSTILE_SECRET:'synthetic_only',LICENSE_ENVIRONMENT:'production'},{allowedOrigins:new Set([origin]),fetchImpl:async(url,o)=>{
    if(url===TURNSTILE_URL)return Response.json({success:true,action:'invoice-draft',hostname:'127.0.0.1'});
    modelCalls++;const body=JSON.parse(o.body),part=body.messages[1].content;
    if(Array.isArray(part)){reads.push(part[1].type);return Response.json(completion({text:quote,uncertainties:[]}));}
    const d=facts();if(mode==='missing'){d.lineItems[0].rate='';d.lineItems[0].rateEvidence=null;}if(mode==='bad-role'){d.lineItems[0].rate='6';d.lineItems[0].rateEvidence=ref('s1',3,'6 hours');}
    return Response.json(completion(d));
   }});const answerBytes=Buffer.from(await answer.arrayBuffer());report.http.push({path:req.url,status:answer.status,...(answer.status>=400?{error:JSON.parse(answerBytes).error}:{})});res.writeHead(answer.status,Object.fromEntries(answer.headers));res.end(answerBytes);return;
  }
  const file=path.resolve(build,'.'+decodeURIComponent(req.url.split('?')[0])+(req.url.split('?')[0].endsWith('/')?'index.html':''));
  if(!file.startsWith(build+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,chromiumSandbox:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||chromium.executablePath()});
 for(const width of [1440,390,320]){
  const ctx=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',acceptDownloads:true});
  await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await ctx.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',r=>r.fulfill({contentType:'application/javascript',body:"window.turnstile={render:(s,o)=>{queueMicrotask(()=>o.callback('synthetic-human'));return 'test-widget'},remove:()=>{}}"}));
  await ctx.addInitScript(()=>localStorage.setItem('mt_onboarding_v1',JSON.stringify({skipped:true})));
  const p=await ctx.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());
  const back=async()=>{if(await p.locator('#jobNotesReview').isVisible())await p.locator('#jobNotesBack').click();};
  const evidence=async()=>{for(const summary of await p.locator('.job-item-evidence summary').all())await summary.click();};
  const send=async()=>{await back();if(!await p.locator('#jobNotesMetaOptions').evaluate(e=>e.open))await p.locator('#jobNotesMetaOptions>summary').click();await p.locator('#jobNotesMetaConsent').check();await p.locator('#jobNotesMetaScan').click();};
  try{
   mode='valid';await p.goto(origin);await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesIntake').waitFor({state:'visible'});
   await check(width+'px: record and upload are visible beside notes; keyboard upload opens the existing chooser without a request',async()=>{
    assert(await p.locator('#jobNotesRecord').isVisible());assert(await p.locator('#jobNotesUpload').isVisible());assert(!await p.locator('#jobNotesIntake').evaluate(e=>e.open));const before=modelCalls;
    const choosing=p.waitForEvent('filechooser');await p.locator('#jobNotesUpload').focus();await p.keyboard.press('Enter');const chooser=await choosing;assert.equal(await chooser.element().getAttribute('id'),'jobNotesFile');await chooser.setFiles([]);assert(await p.locator('#jobNotesIntake').evaluate(e=>e.open));assert.equal(modelCalls,before);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('#jobNotesQuickAdd').screenshot({path:path.join(out,'quick-add-'+width+'.png')});await p.locator('#jobNotesIntake summary').click();
   });
   await p.locator('#jobNotesIntake summary').click();await p.locator('#jobNotesInput').fill(work);await p.locator('#clientName').fill('Existing unsaved invoice');
   await check(width+'px: cross-note evidence and same-line uncertainty preserve current invoice',async()=>{
    await p.locator('#jobNotesAddSource').click();await p.locator('#jobNotesSources textarea').fill(quote);await p.locator('#jobNotesSources input[type=checkbox]').check();await send();await p.locator('#jobNotesReview').waitFor({state:'visible'});
    assert.equal(await p.locator('#clientName').inputValue(),'Existing unsaved invoice');assert.equal(await p.locator('#jobNotesItems .job-notes-item').count(),2);await evidence();assert.match(await p.locator('#jobNotesItems').innerText(),/Additional note 1/);assert.match(await p.locator('#jobNotesUnparsed').innerText(),/travel price still unconfirmed/);assert.equal(await p.locator('#jobNotesReviewed').isChecked(),false);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   });
   await check(width+'px: clarification is explicit and reviewed handoff totals 840',async()=>{
    mode='missing';await send();await p.locator('#jobNotesClarifications').waitFor({state:'visible'});assert.match(await p.locator('#jobNotesQuestions').innerText(),/agreed rate/);assert.equal(await p.locator('#jobNotesSubtotal').innerText(),'USD 300.00');assert.match(await p.locator('#jobNotesSubtotalDetail').innerText(),/1 need work, quantity or rate/);assert.match(await p.locator('.job-source-choices').innerText(),/Additional note 1, line 1:.*90/);await p.locator('#jobNotesDemoAnswers').click();const choice=p.getByRole('button',{name:'Use 90 as rate for copy editing',exact:true});await choice.focus();await p.keyboard.press('Enter');assert.equal(await p.locator('#jobNotesItems [data-job-key=rate]').first().inputValue(),'90');assert.equal(await p.locator('#jobNotesSubtotal').innerText(),'USD 840.00');assert.equal(await p.locator('#jobNotesReviewed').isChecked(),false);assert.equal(await p.locator('#jobNotesClarified').isChecked(),false);assert.equal(await p.evaluate(()=>document.activeElement.getAttribute('data-job-key')),'rate');assert.equal(await p.locator('#clientName').inputValue(),'Existing unsaved invoice');await p.locator('#jobNotesUnparsedReviewed').check();await p.locator('#jobNotesReplace').check();await p.locator('#jobNotesReviewed').check();await p.locator('#jobNotesApply').click();assert.match(await p.locator('#jobNotesError').innerText(),/clarification/);assert.match(await p.locator('#jobNotesReadiness').innerText(),/clarification/);assert.equal(await p.locator('#clientName').inputValue(),'Existing unsaved invoice');
    await p.locator('#jobNotesClarified').check();await p.locator('#jobNotesReviewed').check();assert.match(await p.locator('#jobNotesReadiness').innerText(),/Ready for the invoice editor/);await p.locator('#jobNotesApply').click();await p.locator('#jobNotesPanel').waitFor({state:'hidden'});assert.equal(await p.locator('#clientName').inputValue(),'Example Studio');assert.match(await p.locator('#invoicePreview').innerText(),/840\.00/);
    const file=path.join(out,'context-invoice-'+width+'.pdf'),download=p.waitForEvent('download');await p.getByRole('button',{name:'Download PDF',exact:true}).first().click();if(await p.locator('#payCheckModal').evaluate(e=>e.classList.contains('open')))await p.locator('#payCheckAnyway').click();await (await download).saveAs(file);assert(fs.readFileSync(file).subarray(0,5).equals(Buffer.from('%PDF-')));report.pdfs.push(path.relative(root,file));await p.locator('#doneClose').click();
   });
   await check(width+'px: source-linked conflict choices update the subtotal without approving or changing the invoice',async()=>{
    await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesSources textarea').fill(quote+'\ncopy editing proposed rate: $95/hour');await p.locator('#jobNotesSources input[type=checkbox]').check();mode='valid';await send();await p.locator('#jobNotesClarifications').waitFor({state:'visible'});assert.match(await p.locator('#jobNotesQuestions').innerText(),/Source rates: 90, 95/);await p.locator('#jobNotesDemoAnswers').click();assert.equal(await p.locator('#jobNotesSubtotal').innerText(),'USD 300.00');
    await p.getByRole('button',{name:'Use 95 as rate for copy editing',exact:true}).click();assert.equal(await p.locator('#jobNotesSubtotal').innerText(),'USD 870.00');await p.getByRole('button',{name:'Use 90 as rate for copy editing',exact:true}).click();assert.equal(await p.locator('#jobNotesSubtotal').innerText(),'USD 840.00');
    const omit=p.locator('#jobNotesItems [data-job-omit]').first();await omit.check();assert.equal(await p.locator('#jobNotesSubtotal').innerText(),'USD 300.00');assert.match(await p.locator('#jobNotesSubtotalDetail').innerText(),/1 left off/);await omit.uncheck();assert.equal(await p.locator('#jobNotesSubtotal').innerText(),'USD 840.00');assert.equal(await p.locator('#jobNotesReviewed').isChecked(),false);assert.equal(await p.locator('#jobNotesClarified').isChecked(),false);assert.match(await p.locator('#invoicePreview').innerText(),/840\.00/);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.locator('#jobNotesClarifications').screenshot({path:path.join(out,'conflict-choices-'+width+'.png')});await p.locator('.job-review-subtotal').screenshot({path:path.join(out,'review-subtotal-'+width+'.png')});
    await back();await p.locator('#jobNotesSources textarea').fill(quote);await p.locator('#jobNotesSources input[type=checkbox]').check();
   });
   if(width===1440){
    await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesInput').fill(work);mode='bad-role';await send();await p.getByText('Meta reconciled the sources. Check the evidence and resolve any questions before using this draft.',{exact:true}).waitFor();await p.locator('#jobNotesClarifications').waitFor({state:'visible'});assert.equal(await p.locator('#jobNotesItems [data-job-key=rate]').first().inputValue(),'');assert.equal(await p.locator('#jobNotesItems [data-job-key=rate]').nth(1).inputValue(),'150');assert.match(await p.locator('#jobNotesQuestions').innerText(),/Source rates: 90/);assert.equal(await p.locator('#jobNotesClarified').isChecked(),false);assert.equal(await p.locator('#clientName').inputValue(),'Example Studio');report.checks.push('fabricated time-as-price stays blank with a clarification; valid work and current invoice survive');
    const png=Buffer.from(await p.evaluate(text=>{const c=document.createElement('canvas');c.width=900;c.height=200;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,900,200);x.fillStyle='#111';x.font='24px sans-serif';text.split('\n').forEach((s,i)=>x.fillText(s,20,50+i*45));return c.toDataURL('image/png').split(',')[1];},quote),'base64');
    for(const [name,mime,bytes,part] of [['quote.pdf','application/pdf',pdfBytes,'file'],['voice.wav','audio/wav',wav,'input_audio'],['quote.png','image/png',png,'image_url']]){
     await back();await p.locator('#jobNotesSources button').click();const before=modelCalls;
     await p.locator('#jobNotesFile').setInputFiles({name,mimeType:mime,buffer:Buffer.from(bytes)});await p.getByText(/is ready\. With consent/).waitFor();assert.equal(modelCalls,before);
     if(mime.startsWith('image/'))await p.waitForFunction(()=>document.querySelector('#jobNotesMediaPreview img')?.naturalWidth>0);
     if(mime.startsWith('audio/'))await p.waitForFunction(()=>document.querySelector('#jobNotesMediaPreview audio')?.readyState>=1);
     await send();await p.getByText('Transcription received. Check it against the original, then confirm before reconciling.',{exact:true}).waitFor();assert.equal(reads.at(-1),part);assert.equal(await p.locator('#jobNotesSources input[type=checkbox]').isChecked(),false);assert.equal(await p.locator('#jobNotesSources textarea').inputValue(),quote);assert.equal(await p.locator('#clientName').inputValue(),'Example Studio');report.checks.push(name+': local preview, explicit upload, documented part, unconfirmed transcript and invoice preservation');
     mode='valid';await send();assert.match(await p.locator('#jobNotesError').innerText(),/confirm each additional source/);assert.equal(modelCalls,before+1);
    }
    await p.locator('#jobNotesSources button').click();
    await p.evaluate(()=>{const ac=new AudioContext(),osc=ac.createOscillator(),dest=ac.createMediaStreamDestination();osc.connect(dest);osc.start();window.__syntheticAudio={ac,osc,stream:dest.stream};Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{await ac.resume();return dest.stream;}}});});
    await p.locator('#jobNotesRecord').click();await p.getByText(/Recording on this device/).waitFor();await p.waitForTimeout(350);await p.locator('#jobNotesRecord').click();await p.getByText(/is ready\. With consent/).waitFor();await send();await p.getByText('Transcription received. Check it against the original, then confirm before reconciling.',{exact:true}).waitFor();assert.equal(reads.at(-1),'input_audio');assert(await p.evaluate(()=>window.__syntheticAudio.stream.getTracks().every(t=>t.readyState==='ended')));await p.evaluate(async()=>{window.__syntheticAudio.osc.stop();await window.__syntheticAudio.ac.close();});report.checks.push('synthetic oscillator only: MediaRecorder to mono WAV to transcription; tracks stopped, no physical microphone');
    await p.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic denial','NotAllowedError');};});await p.locator('#jobNotesRecord').click();await p.getByText('Microphone access was not granted. Upload a clip or paste a transcript.',{exact:true}).waitFor();assert.equal(await p.locator('#jobNotesRecord').textContent(),'Record voice note');report.checks.push('denied microphone offers upload or transcript fallback without a provider request');
   }
   const shot=path.join(out,'context-'+width+'.png');await p.screenshot({path:shot,fullPage:false});report.screenshots.push(path.relative(root,shot));
   await check(width+'px: keyboard close restores entry focus',async()=>{if(await p.locator('#jobNotesPanel').isHidden())await p.locator('#jobNotesPrimary').click();await p.locator('#jobNotesClose').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>document.activeElement.id),'jobNotesPrimary');});
  }finally{report.lastUI={status:await p.locator('#jobNotesMetaStatus').textContent().catch(()=>''),error:await p.locator('#jobNotesError').textContent().catch(()=>''),errors:report.errors};await p.screenshot({path:path.join(out,'last-ui-'+width+'.png'),fullPage:false}).catch(()=>{});await ctx.close();}
 }
 assert.deepEqual(report.errors,[]);report.passed=true;
})().catch(e=>{report.passed=false;report.failure=e.stack;console.error(e.stack);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'browser-report.json'),JSON.stringify(report,null,2));if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));});
