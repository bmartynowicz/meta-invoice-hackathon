/* Pure evidence checks shared by browser review and offline tests. No I/O. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MTJobEvidence=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const decimal=/^\d+(?:\.\d{1,2})?$/;
  function checkNumericEvidence(input){
    if(!input||typeof input!=='object')return false;const {text,span,role,value}=input;
    if(typeof text!=='string'||!Array.isArray(span)||span.length!==2||!span.every(Number.isInteger)||!['quantity','unitPrice'].includes(role)||typeof value!=='string'||!decimal.test(value)||Number(value)>1000000)return false;
    const [start,end]=span;if(start<0||end<=start||end>text.length)return false;
    const token=text.slice(start,end),before=text.slice(0,start),after=text.slice(end);
    if(!decimal.test(token)||Number(token)!==Number(value)||/[\d.,]$/.test(before)||/^[\d.,]/.test(after)||/(?:[-+−]|\bminus)\s*[$€£]?\s*$/i.test(before))return false;
    const currency=/(?:[$€£]|\b(?:USD|EUR|GBP|CAD|AUD|JPY))\s*$/i.test(before);
    const rateTail=/^\s*(?:\/|per\s+)(?:hour|hr|day|page|item|unit|each|logo|visit|mile|km|piece|session|project|job)\b/i.test(after)||/^\s*each\b/i.test(after);
    if(role==='unitPrice')return currency||rateTail;
    // A currency/rate token can never be recycled as the quantity.
    return !currency&&!rateTail&&(/^\s+(?!(?:dollars?|USD|EUR|GBP|CAD|AUD|JPY|percent|per|each)\b)[a-z][a-z -]*/i.test(after)||(/^\s*(?:@|at\s+[$€£])/i.test(after)&&/[a-z]/i.test(before)));
  }
  function numericSpans(text){return Array.from(text.matchAll(/\d+(?:\.\d+)?/g),m=>({value:m[0],span:[m.index,m.index+m[0].length]}));}
  function legacyEvidence(text,value,role){const matches=numericSpans(text).filter(x=>checkNumericEvidence({text,span:x.span,role,value}));return matches.length===1?matches[0]:null;}
  function remainingClauses(text,descriptions){
    return text.split(/;|\n|\.(?=\s+[A-Z])/).map(s=>s.trim()).filter(Boolean).filter(clause=>{
      if(/\b(?:unconfirmed|not confirmed|to confirm|TBD|unsure|unknown|not sure|pending|price still|cost still|later|do not bill|don't bill)\b/i.test(clause)||!descriptions.some(d=>clause.toLowerCase().includes(d.toLowerCase())))return true;
      // Conservatively retain material outside the recognized work and unit/rate
      // scaffolding. A model citing one part of a line cannot consume the rest.
      let rest=clause.toLowerCase();for(const d of descriptions)rest=rest.replace(d.toLowerCase(),' ');
      if(numericSpans(rest).length>2)return true;
      rest=rest.replace(/\d+(?:\.\d+)?/g,' ');
      const residual=(rest.match(/[a-z]+/g)||[]).filter(w=>!['hours','hour','hrs','hr','h','days','day','pages','page','items','item','units','unit','logos','logo','visits','visit','miles','mile','km','pieces','piece','sessions','session','projects','project','jobs','job','each','at','per','of','completed','complete','agreed','rate','usd','eur','gbp','cad','aud','jpy'].includes(w));
      return residual.length>0;
    });
  }
  function validateSources(sources){
    if(!Array.isArray(sources)||sources.length<1||sources.length>4)throw Error('Add between one and four sources.');
    const ids=new Set();let total=0;
    for(const s of sources){if(!s||typeof s!=='object'||Object.keys(s).sort().join(',')!=='id,label,text'||!/^s[1-4]$/.test(s.id)||ids.has(s.id)||typeof s.label!=='string'||!s.label.trim()||s.label.length>100||typeof s.text!=='string'||!s.text.trim()||s.text.length>12000)throw Error('Invalid source. Confirm the text of each source first.');ids.add(s.id);total+=s.text.length;}
    if(total>24000)throw Error('Use at most 24,000 characters across sources.');return sources;
  }
  function exactKeys(o,keys){return o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));}
  function completionData(response){
    const c=response?.choices?.[0],m=c?.message;
    if(!Array.isArray(response?.choices)||response.choices.length!==1||c?.finish_reason!=='stop'||m?.role!=='assistant'||m.refusal||m.function_call||(m.tool_calls!=null&&(!Array.isArray(m.tool_calls)||m.tool_calls.length))||typeof m.content!=='string'||m.content.length>65536)throw Error('The extraction was incomplete or refused. Keep your original sources.');
    try{return JSON.parse(m.content);}catch{throw Error('The extraction did not contain valid JSON.');}
  }
  const words=s=>s.toLowerCase().match(/[a-z]{3,}/g)?.filter(w=>!['the','for','and','with','work','hours','hour','each','rate','per','agreed','completed'].includes(w))||[];
  function sourceCandidates(lines,description,role){
    return lines.filter(l=>words(description).some(w=>words(l.text).includes(w))).flatMap(l=>numericSpans(l.text).filter(x=>checkNumericEvidence({text:l.text,span:x.span,role,value:x.value})).map(x=>({...l,value:x.value,span:x.span})));
  }
  function reviewSubtotal(items){
    let subtotal=0,pricedCount=0,needsDetails=0,excludedCount=0;
    for(const item of items){
      if(item.excluded){excludedCount++;continue;}
      if(!String(item.description||'').trim()||![item.qty,item.rate].every(v=>typeof v==='string'&&decimal.test(v.trim())&&Number(v)<=1000000)){needsDetails++;continue;}
      subtotal+=Number(item.qty)*Number(item.rate);pricedCount++;
    }
    return {subtotal,pricedCount,needsDetails,excludedCount,includedCount:pricedCount+needsDetails};
  }
  function reconcile(sources,response){
    validateSources(sources);const data=completionData(response);
    if(!exactKeys(data,['clientName','project','lineItems'])||!Array.isArray(data.lineItems)||!data.lineItems.length||data.lineItems.length>12)throw Error('Expected one to twelve evidence-linked work items.');
    const lines=sources.flatMap(s=>s.text.split(/\r?\n/).map((text,i)=>({sourceId:s.id,label:s.label,line:i+1,text})));
    function literal(v,label){if(typeof v!=='string'||v.length>300||/[\r\n]/.test(v)||(v&&!lines.some(l=>l.text.includes(v))))throw Error('Unsupported '+label+'.');return v;}
    const clientName=literal(data.clientName,'client name'),project=literal(data.project,'project');
    const headings=lines.filter(l=>/^For\s+/i.test(l.text.trim())).map(l=>l.text.trim().replace(/^For\s+/i,''));
    if(new Set(headings).size>1)throw Error('Sources name different clients. Keep one client in this draft.');
    if(headings.length&&clientName!==headings[0])throw Error('The proposed client changed your explicit heading.');
    const projects=lines.filter(l=>/^Project:\s*/i.test(l.text.trim())).map(l=>l.text.trim().replace(/^Project:\s*/i,''));
    if(new Set(projects).size>1)throw Error('Sources name different projects. Keep one project in this draft.');
    if(projects.length&&project!==projects[0])throw Error('The proposed project changed your explicit heading.');
    const used=new Map(),seen=new Set(),questions=[];
    function ref(r,value,role,description){
      if(!exactKeys(r,['sourceId','line','quote'])||typeof r.quote!=='string'||!r.quote||r.quote.length>600||!Number.isInteger(r.line))throw Error('Missing field evidence.');
      const line=lines.find(l=>l.sourceId===r.sourceId&&l.line===r.line);if(!line||!line.text.includes(r.quote)||line.text.indexOf(r.quote)!==line.text.lastIndexOf(r.quote))throw Error('Evidence quote is absent or ambiguous.');
      if(!words(description).some(w=>words(line.text).includes(w)))throw Error('The quantity or rate is not linked to this work.');
      const from=line.text.indexOf(r.quote),to=from+r.quote.length;
      const matches=numericSpans(line.text).filter(x=>x.span[0]>=from&&x.span[1]<=to&&checkNumericEvidence({text:line.text,span:x.span,role,value}));
      if(matches.length!==1)throw Error('A proposed '+role+' has no unique, correctly labelled number.');
      const key=line.sourceId+':'+line.line;used.set(key,[...(used.get(key)||[]),description]);return {...line,quote:r.quote,span:matches[0].span};
    }
    function candidatesFor(description,role){
      const candidates=sourceCandidates(lines,description,role).map(x=>Number(x.value));
      return [...new Set(candidates)].sort((a,b)=>a-b);
    }
    const items=data.lineItems.map((item,index)=>{
      if(!exactKeys(item,['description','quantity','rate','work','quantityEvidence','rateEvidence']))throw Error('Unexpected work-item fields.');
      const description=literal(item.description,'work description'),w=item.work;
      if(!description||!exactKeys(w,['sourceId','line','quote']))throw Error('Missing work evidence.');
      const source=lines.find(l=>l.sourceId===w.sourceId&&l.line===w.line);
      if(!source||typeof w.quote!=='string'||!source.text.includes(w.quote)||!w.quote.includes(description))throw Error('Work description is absent from its source.');
      const id=w.sourceId+':'+w.line+':'+description.toLowerCase();if(seen.has(id))throw Error('Duplicate work item.');seen.add(id);
      const refs={work:{...source,quote:w.quote}};const out={description,qty:item.quantity,rate:item.rate,source,evidence:refs};
      const key=source.sourceId+':'+source.line;used.set(key,[...(used.get(key)||[]),description]);
      for(const [field,modelField,role,refField] of [['qty','quantity','quantity','quantityEvidence'],['rate','rate','unitPrice','rateEvidence']]){
        const v=item[modelField],label=field==='qty'?'How many '+description+' units should be billed?':'What agreed rate should be used for '+description+'?';
        if(v===''){questions.push({item:index,field,label,reason:item[refField]===null?'missing':'unsupported_evidence',options:candidatesFor(description,role)});continue;}
        try{refs[field]=ref(item[refField],v,role,description);}catch{
          out[field]='';questions.push({item:index,field,label,reason:'unsupported_evidence',options:candidatesFor(description,role)});continue;
        }
        const candidates=candidatesFor(description,role);
        if(candidates.length>1){out[field]='';questions.push({item:index,field,label:'Sources disagree. Confirm the '+(field==='rate'?'agreed rate':'quantity to bill')+' for '+description+'.',reason:'conflict',options:candidates});}
      }
      return out;
    });
    items.forEach((item,index)=>{if(items.slice(0,index).some(other=>other.description.toLowerCase()===item.description.toLowerCase()))questions.push({item:index,field:'duplicate',reason:'possible_duplicate',label:'Confirm this is separate billable work, or leave it off to avoid billing twice: '+item.description+'.'});});
    const unparsed=lines.flatMap(l=>{
      if(!l.text.trim()||/^For\s+/i.test(l.text.trim())||/^Project:\s*/i.test(l.text.trim()))return [];
      const descriptions=used.get(l.sourceId+':'+l.line)||[];
      return (descriptions.length?remainingClauses(l.text,descriptions):[l.text]).map(text=>({...l,text}));
    });
    for(const question of questions){if(['qty','rate'].includes(question.field))question.candidates=sourceCandidates(lines,items[question.item].description,question.field==='qty'?'quantity':'unitPrice');}
    return {clientName,project,items,unparsed,questions,sources:sources.map(s=>({...s})),extraction:'multi_source_evidence_checked'};
  }
  return {checkNumericEvidence,legacyEvidence,remainingClauses,validateSources,completionData,reviewSubtotal,reconcile};
});
