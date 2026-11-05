const {test}=require('node:test'),assert=require('node:assert/strict');
const {checkNumericEvidence,remainingClauses,reconcile,reviewSubtotal}=require('../../source/invoice-generator/wf/job-evidence.js');
// Adversarial ideas adapted from the retained Picard/Groq proposal. Its original
// span/return-value contract was incorrect; these corrected tests execute locally.
const specimen=(text,token,role,value=token)=>({text,span:[text.indexOf(token),text.indexOf(token)+token.length],role,value});
test('six positive role/precision/UTF-16 cases adapted from Picard',()=>{
 for(const input of [specimen('6 hours of copy editing at $90/hour','6','quantity'),specimen('6 hours of copy editing at $90/hour','90','unitPrice'),specimen('2 landing pages at $150/page','2','quantity'),specimen('2 landing pages at $150/page','150','unitPrice'),specimen('🧰 1.5 hours of repairs at $75.50/hour','1.5','quantity'),specimen('10 items @ $10 each','10 each'.slice(0,2),'quantity')])assert.equal(checkNumericEvidence(input),true,JSON.stringify(input));
 assert.equal(checkNumericEvidence(specimen('Copy editing rate: $90/hour','90','unitPrice','90.00')),true);
});
test('eight invalid numeric-role, boundary and fabricated-value cases adapted from Picard',()=>{
 for(const input of [specimen('copy editing: 6 hours @ $90 per hour','6','unitPrice'),specimen('copy editing: 6 hours @ $90 per hour','90','quantity'),specimen('-6 hours','6','quantity'),specimen('6 hours at -$90/hour','90','unitPrice'),specimen('6 hours at $90/hour','90','unitPrice','900'),specimen('6 hours','6','quantity','6.001'),{text:'60 hours',span:[0,1],role:'quantity',value:'6'},{text:'$90/hour',span:[0,3],role:'unitPrice',value:'90'}])assert.equal(checkNumericEvidence(input),false,JSON.stringify(input));
});
test('same-line unresolved travel survives a recognized work clause',()=>{
 assert.deepEqual(remainingClauses('copy editing: 6 hours @ $90/hour; travel price still unconfirmed',['copy editing']),['travel price still unconfirmed']);
  assert.deepEqual(remainingClauses('copy editing: 6 hours @ $90/hour plus travel $50',['copy editing']),['copy editing: 6 hours @ $90/hour plus travel $50']);
});
const sources=[{id:'s1',label:'Completed work',text:'For Example Studio\nProject: November copy\ncopy editing: 6 hours completed\nlanding pages: 2 pages completed; travel cost to confirm'},{id:'s2',label:'Agreed quote',text:'copy editing agreed rate: $90/hour\nlanding pages agreed rate: $150/page'}];
const ref=(sourceId,line,quote)=>({sourceId,line,quote});
const facts=()=>({clientName:'Example Studio',project:'November copy',lineItems:[{description:'copy editing',quantity:'6',rate:'90',work:ref('s1',3,'copy editing'),quantityEvidence:ref('s1',3,'6 hours'),rateEvidence:ref('s2',1,'$90/hour')},{description:'landing pages',quantity:'2',rate:'150',work:ref('s1',4,'landing pages'),quantityEvidence:ref('s1',4,'2 pages'),rateEvidence:ref('s2',2,'$150/page')}]});
const completion=data=>({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(data)}}]});
test('cross-note quantities and agreed rates retain independent evidence and total 840 deterministically',()=>{
 const p=reconcile(sources,completion(facts()));assert.equal(p.items.reduce((n,i)=>n+Number(i.qty)*Number(i.rate),0),840);assert.equal(p.items[0].evidence.rate.sourceId,'s2');assert.equal(p.items[0].evidence.qty.sourceId,'s1');assert.equal(p.unparsed.length,1);assert.match(p.unparsed[0].text,/travel/);assert.equal(p.questions.length,0);assert.deepEqual(p.sources,sources);
});
test('missing or conflicting rates become targeted questions rather than invented prices',()=>{
 const d=facts();d.lineItems[0].rate='';d.lineItems[0].rateEvidence=null;
 assert.equal(reconcile(sources,completion(d)).questions[0].reason,'missing');
 const p=reconcile([...sources,{id:'s3',label:'Second quote',text:'copy editing rate: $95/hour'}],completion(facts()));assert.equal(p.items[0].rate,'');assert.equal(p.questions[0].reason,'conflict');assert.deepEqual(p.questions[0].options,[90,95]);
});

test('rate choices retain the exact source and never offer a time quantity as a price',()=>{
 const p=reconcile([...sources,{id:'s3',label:'Voice note',text:'copy editing proposed rate: $95/hour'}],completion(facts()));
 const q=p.questions.find(q=>q.field==='rate');assert.deepEqual(q.candidates.map(c=>Number(c.value)),[90,95]);
 assert.equal(q.candidates[0].label,'Agreed quote');assert.equal(q.candidates[0].sourceId,'s2');assert.equal(q.candidates[0].line,1);assert.equal(q.candidates[0].text,'copy editing agreed rate: $90/hour');
 assert.equal(q.candidates[1].label,'Voice note');assert.equal(q.candidates[1].text.slice(...q.candidates[1].span),'95');assert.equal(p.items[0].rate,'');
});

test('review subtotal counts only included, fully specified work without inventing missing values',()=>{
 const items=[{description:'copy editing',qty:'6',rate:''},{description:'landing pages',qty:'2',rate:'150'},{description:'travel',qty:'',rate:'',excluded:true}];
 const before=JSON.stringify(items);assert.deepEqual(reviewSubtotal(items),{subtotal:300,pricedCount:1,needsDetails:1,excludedCount:1,includedCount:2});
 items[0].rate='90';assert.equal(reviewSubtotal(items).subtotal,840);items[0].rate='95';assert.equal(reviewSubtotal(items).subtotal,870);items[0].rate='';assert.equal(JSON.stringify(items),before);
});

test('review subtotal handles zero, decimal precision and invalid input like the handoff',()=>{
 for(const invalid of ['', '-1','1.001','Infinity','1000001','1e2'])assert.equal(reviewSubtotal([{description:'work',qty:'2',rate:invalid}]).needsDetails,1,invalid);
 assert.equal(reviewSubtotal([{description:'',qty:'1',rate:'90'}]).needsDetails,1);
 assert.deepEqual(reviewSubtotal([{description:'no charge',qty:'1',rate:'0'},{description:'work',qty:'1.5',rate:'75.50'}]),{subtotal:113.25,pricedCount:2,needsDetails:0,excludedCount:0,includedCount:2});
});
test('unsupported numeric evidence becomes a blank clarification without losing valid work',()=>{
 for(const edit of [d=>{d.lineItems[0].rate='6';d.lineItems[0].rateEvidence=ref('s1',3,'6 hours');},d=>d.lineItems[0].rateEvidence.quote='$900/hour',d=>d.lineItems[0].rateEvidence=ref('s2',2,'$150/page')]){const d=facts();edit(d);const p=reconcile(sources,completion(d));assert.equal(p.items[0].rate,'');assert.equal(p.items[0].evidence.rate,undefined);assert.equal(p.items[0].qty,'6');assert.equal(p.items[1].rate,'150');assert.equal(p.questions[0].reason,'unsupported_evidence');assert.deepEqual(p.questions[0].options,[90]);}
 const d=facts();d.lineItems.push({...d.lineItems[0]});assert.throws(()=>reconcile(sources,completion(d)),/Duplicate work/);
});
test('unit-bearing, invented and non-string quantities require explicit correction',()=>{
 for(const quantity of ['6 hours','60',6]){const d=facts();d.lineItems[0].quantity=quantity;const p=reconcile(sources,completion(d));assert.equal(p.items[0].qty,'');assert.equal(p.items[0].evidence.qty,undefined);assert.equal(p.items[0].rate,'90');assert.equal(p.items[1].qty,'2');assert.equal(p.questions[0].reason,'unsupported_evidence');assert.deepEqual(p.questions[0].options,[6]);}
});
test('a missing value with an evidence object cannot promote that object into a fact',()=>{
 const d=facts();d.lineItems[0].quantity='';const p=reconcile(sources,completion(d));assert.equal(p.items[0].qty,'');assert.equal(p.items[0].evidence.qty,undefined);assert.equal(p.questions[0].reason,'unsupported_evidence');assert.deepEqual(p.questions[0].options,[6]);
});
test('conflicting client headings and unbounded source sets stop reconciliation',()=>{
 assert.throws(()=>reconcile([...sources,{id:'s3',label:'Other client',text:'For Other Company'}],completion(facts())),/different clients/);
 assert.throws(()=>reconcile([...sources,...sources],completion(facts())),/Invalid source/);
});
test('conflicting quantities and repeated work require clarification, and project headings cannot change',()=>{
 const p=reconcile([...sources,{id:'s3',label:'Another work note',text:'copy editing: 8 hours completed'}],completion(facts()));assert.equal(p.items[0].qty,'');assert.equal(p.questions[0].field,'qty');assert.deepEqual(p.questions[0].options,[6,8]);
 const data=facts();data.project='';assert.throws(()=>reconcile(sources,completion(data)),/project changed/);
 const repeated=facts();repeated.lineItems.push({...repeated.lineItems[0],work:ref('s2',1,'copy editing')});assert.equal(reconcile(sources,completion(repeated)).questions.at(-1).reason,'possible_duplicate');
});
