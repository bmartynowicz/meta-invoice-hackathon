// Exercises the shipped pure parser and validation; no browser, storage or network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../source/invoice-generator/invoice-generator.html'),'utf8');
const pure=html.split('/*__JOB_NOTES_PURE_START__*/')[1].split('/*__JOB_NOTES_PURE_END__*/')[0];
const ctx={MTJobEvidence:require("../source/invoice-generator/wf/job-evidence.js")};vm.runInNewContext(pure,ctx,{timeout:1000});
const notes='For Example Studio\nProject: October website copy\n6 hours of copy editing at $90/hour\n2 landing pages at $150/page';
const answers=parsed=>({clientName:parsed.clientName,businessName:'Demo Studio',invoiceNumber:'DEMO-101',currency:'USD',issueDate:'2026-10-26',termsDays:'14',taxMode:'none',reviewed:true,items:parsed.items});
test('notes preserve source lines without inferring currency, dates or tax',()=>{
 const p=ctx.jobNotesParse(notes);assert.equal(p.items.length,2);assert.equal(p.items[0].description,'copy editing');assert.equal(p.items[1].description,'landing pages');assert.equal(p.items[0].source.line,3);assert.equal(p.items[0].source.text,notes.split('\n')[2]);assert.equal(p.currency,undefined);assert.equal(p.issueDate,undefined);assert.equal(p.taxRate,undefined);
});
test('confirmed draft maps to existing invoice fields and preserves caller input',()=>{
 const p=ctx.jobNotesParse(notes),before=JSON.stringify(p),draft=ctx.jobNotesDraft(p,answers(p));
 assert.equal(draft.dueDate,'2026-11-09');assert.equal(draft.items.reduce((s,item)=>s+item.qty*item.rate,0),840);assert.equal(draft.taxRate,0);assert.equal(draft.notes,'October website copy');assert.equal(draft.payment,'Payment due within 14 days.');assert.equal(JSON.stringify(p),before);assert.equal(draft.clientContact,undefined);assert.equal(draft.paymentReportedAt,undefined);
});
test('unmatched lines and duplicate client directives cannot disappear',()=>{
 const p=ctx.jobNotesParse(notes+'\nAdd travel, not sure how much\nFor Another Client');assert.equal(p.unparsed.length,2);assert.throws(()=>ctx.jobNotesDraft(p,answers(p)),/unmatched/);assert.equal(ctx.jobNotesDraft(p,{...answers(p),reviewedUnparsed:true}).clientName,'Example Studio');
});
test('missing or impossible facts and unchecked review block handoff',()=>{
 const p=ctx.jobNotesParse(notes),a=answers(p);
 for(const [key,value] of [['clientName',''],['businessName',''],['invoiceNumber',''],['currency',''],['currency','XYZ'],['issueDate','2026-02-30'],['termsDays','-1'],['termsDays','14.5'],['taxMode',''],['reviewed',false]])assert.throws(()=>ctx.jobNotesDraft(p,{...a,[key]:value}),undefined,key);
 assert.throws(()=>ctx.jobNotesDraft(p,{...a,taxMode:'percentage',taxRate:'101'}),/Tax rate/);
});
test('bad monetary precision, unbounded input and excess line count block handoff',()=>{
 const p=ctx.jobNotesParse(notes),a=answers(p);
 for(const value of ['-1','0.001','Infinity','1000001'])assert.throws(()=>ctx.jobNotesDraft(p,{...a,items:[{description:'work',qty:'1',rate:value}]}));
 assert.throws(()=>ctx.jobNotesParse('x'.repeat(12001)),/12,000/);assert.throws(()=>ctx.jobNotesDraft(p,{...a,items:[]}),/1 and 12/);assert.throws(()=>ctx.jobNotesDraft(p,{...a,items:Array(13).fill(p.items[0])}),/1 and 12/);
});
test('simple one-word work and zero-day terms are supported',()=>{
 const p=ctx.jobNotesParse('For Example Client\n2 logos at $15/logo'),d=ctx.jobNotesDraft(p,{...answers(p),termsDays:'0'});assert.equal(d.items[0].description,'logos');assert.equal(d.dueDate,'2026-10-26');assert.equal(d.payment,'Payment due on receipt.');
});

const facts=()=>({clientName:'Example Studio',project:'October website copy',lineItems:[{description:'copy editing',quantity:'6',rate:'90',sourceLine:3},{description:'landing pages',quantity:'2',rate:'150',sourceLine:4}],missingFields:['businessName','invoiceNumber','currency','invoiceDate','paymentTerms','taxTreatment']});
const completion=data=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(data)}}]});
test('a synthetic model completion enters the same source-linked, unconfirmed draft flow',()=>{
 const response=completion(facts()),before=JSON.stringify(response),p=ctx.jobNotesFromCompletion(notes,response);
 assert.equal(p.items[0].source.text,notes.split('\n')[2]);assert.equal(p.items[1].source.line,4);assert.equal(p.unparsed.length,0);assert.equal(p.currency,undefined);assert.equal(p.issueDate,undefined);assert.equal(p.taxRate,undefined);assert.throws(()=>ctx.jobNotesDraft(p,{...answers(p),reviewed:false}),/Review and confirm/);assert.equal(ctx.jobNotesDraft(p,answers(p)).dueDate,'2026-11-09');assert.equal(JSON.stringify(response),before);
});
test('fabricated or misplaced facts and duplicate work are rejected before review',()=>{
 for(const mutate of [d=>d.lineItems[0].rate='900',d=>d.lineItems[0].quantity='60',d=>d.lineItems[0].sourceLine=2,d=>d.lineItems[0].sourceLine=99,d=>d.lineItems[0].description='travel',d=>d.lineItems.push({...d.lineItems[0]}),d=>d.clientName='Another Studio',d=>d.project='October',d=>d.lineItems[0].rate=90]){
  const d=facts();mutate(d);assert.throws(()=>ctx.jobNotesFromCompletion(notes,completion(d)));
 }
});
test('truncation, refusal, malformed envelopes and tool calls cannot become invoice facts',()=>{
 const valid=completion(facts());
 for(const response of [null,{}, {...valid,choices:[]},{...valid,choices:[...valid.choices,...valid.choices]}, {choices:[{...valid.choices[0],finish_reason:'length'}]}, {choices:[{finish_reason:'stop',message:{role:'assistant',refusal:'No',content:valid.choices[0].message.content}}]}, {choices:[{finish_reason:'stop',message:{role:'assistant',content:valid.choices[0].message.content,tool_calls:[{}]}}]}, {choices:[{finish_reason:'stop',message:{role:'assistant',content:'```json\n{}\n```'}}]}])assert.throws(()=>ctx.jobNotesFromCompletion(notes,response));
});
test('model omissions retain unknown notes and cannot switch off local required fields',()=>{
 const d=facts();d.missingFields=[];
 const p=ctx.jobNotesFromCompletion(notes+'\nTravel amount is unconfirmed',completion(d));assert.equal(p.unparsed.length,1);assert.equal(p.unparsed[0].line,5);assert.throws(()=>ctx.jobNotesDraft(p,answers(p)),/unmatched/);assert.throws(()=>ctx.jobNotesDraft(p,{...answers(p),reviewedUnparsed:true,currency:''}),/currency/);
});
test('extra accounting fields and unsupported numeric precision do not cross the adapter',()=>{
 for(const mutate of [d=>d.total=840,d=>d.currency='USD',d=>d.lineItems[0].total=540,d=>d.lineItems[0].quantity='6.001',d=>d.missingFields=['API_KEY'],d=>d.missingFields=['currency','currency']]){const d=facts();mutate(d);assert.throws(()=>ctx.jobNotesFromCompletion(notes,completion(d)));}
 const d=facts();d.lineItems[0].rate='90.00';assert.equal(ctx.jobNotesFromCompletion(notes,completion(d)).items[0].rate,'90.00');
 assert.throws(()=>ctx.jobNotesFromCompletion(notes.replace('$90/hour','-$90/hour'),completion(facts())),/rate/);
});

test('null choices, unsupported calls and oversized content show a useful rejection',()=>{
 for(const message of [{role:'assistant',content:'x'.repeat(16385)},{role:'assistant',content:'{}',tool_calls:{}},{role:'assistant',content:'{}',function_call:{name:'issueInvoice'}}])assert.throws(()=>ctx.jobNotesFromCompletion(notes,{choices:[{finish_reason:'stop',message}]}),/extraction/i);
 assert.throws(()=>ctx.jobNotesFromCompletion(notes,{choices:[null]}),/incomplete or refused/);
});

test('omitted work and repeated headings remain visible with CRLF notes',()=>{
 const d=facts();d.lineItems.pop();
 const p=ctx.jobNotesFromCompletion((notes+'\nFor Example Studio').replace(/\n/g,'\r\n'),completion(d));
 assert.deepEqual(JSON.parse(JSON.stringify(p.unparsed)),[{line:4,text:'2 landing pages at $150/page'},{line:5,text:'For Example Studio'}]);
 assert.throws(()=>ctx.jobNotesDraft(p,answers(p)),/unmatched/);
});

test('an unsupported multi-source quantity stays blocked through the real invoice handoff',()=>{
 const sources=[{id:'s1',label:'Completed work',text:'For Example Studio\nProject: October website copy\ncopy editing: 6 hours completed'},{id:'s2',label:'Agreed quote',text:'copy editing agreed rate: $90/hour'}];
 const ref=(sourceId,line,quote)=>({sourceId,line,quote});
 const response=completion({clientName:'Example Studio',project:'October website copy',lineItems:[{description:'copy editing',quantity:'6 hours',rate:'90',work:ref('s1',3,'copy editing'),quantityEvidence:ref('s1',3,'6 hours'),rateEvidence:ref('s2',1,'$90/hour')}]});
 const p=ctx.MTJobEvidence.reconcile(sources,response);assert.equal(p.items[0].qty,'');assert.equal(p.items[0].rate,'90');assert.throws(()=>ctx.jobNotesDraft(p,{...answers(p),reviewedUnparsed:true}),/clarification/);assert.throws(()=>ctx.jobNotesDraft(p,{...answers(p),clarified:true,reviewedUnparsed:true}),/quantity/);
 const draft=ctx.jobNotesDraft(p,{...answers(p),clarified:true,reviewedUnparsed:true,items:[{...p.items[0],qty:'6'}]});assert.equal(draft.items[0].qty*draft.items[0].rate,540);
});
