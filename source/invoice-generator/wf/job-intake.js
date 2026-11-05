/* Ephemeral multimodal intake. Nothing is uploaded until explicit consent + click. */
window.MTJobIntake={create:function({$,invalidate,fail}){
  let sources=[],media=null,previewUrl='',recorder=null,stream=null,stopTimer=null,version=0,preparing=false,captureVersion=0;
  const list=$('jobNotesSources'),status=$('jobNotesIntakeStatus');
  function changed(){version++;invalidate();}
  function clearPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl='';$('jobNotesMediaPreview').replaceChildren();}
  function notice(message){status.textContent=message;}
  function render(){
    list.replaceChildren();sources.forEach((s,index)=>{
      const row=document.createElement('section');row.className='job-source';
      const heading=document.createElement('h4');heading.textContent=s.label;row.append(heading);
      if(s.uncertainties?.length){const p=document.createElement('p');p.className='fine';p.textContent='Check: '+s.uncertainties.join('; ');row.append(p);}
      const label=document.createElement('label');label.textContent='Source text';const text=document.createElement('textarea');text.rows=4;text.maxLength=12000;text.value=s.text;text.setAttribute('aria-label',s.label+' text');
      text.addEventListener('input',()=>{s.text=text.value;s.confirmed=false;check.checked=false;changed();});label.append(text);row.append(label);
      const confirm=document.createElement('label');confirm.className='checkline';const check=document.createElement('input');check.type='checkbox';check.checked=s.confirmed;check.addEventListener('change',()=>{s.confirmed=check.checked;changed();});confirm.append(check,document.createTextNode('I checked this text against the original source.'));row.append(confirm);
      const remove=document.createElement('button');remove.type='button';remove.className='linklike';remove.textContent='Remove source';remove.addEventListener('click',()=>{sources.splice(index,1);render();changed();});row.append(remove);list.append(row);
    });
  }
  function bytesBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
  async function wav(file){
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Audio decoding is unavailable. Paste a transcript instead.');
    const ac=new Audio();let buffer;try{buffer=await ac.decodeAudioData(await file.arrayBuffer());}finally{await ac.close();}
    if(!Number.isFinite(buffer.duration)||buffer.duration<=0||buffer.duration>60)throw Error('Use an audio clip of at most 60 seconds.');
    const offline=new OfflineAudioContext(1,Math.ceil(buffer.duration*16000),16000),node=offline.createBufferSource();node.buffer=buffer;node.connect(offline.destination);node.start();
    const mono=(await offline.startRendering()).getChannelData(0),bytes=new Uint8Array(44+mono.length*2),v=new DataView(bytes.buffer);
    const str=(at,s)=>{for(let i=0;i<s.length;i++)bytes[at+i]=s.charCodeAt(i);};str(0,'RIFF');v.setUint32(4,bytes.length-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,mono.length*2,true);
    mono.forEach((x,i)=>v.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,x))*(x<0?32768:32767)),true));return bytes;
  }
  async function prepare(file){
    if(!file)return;if(sources.length>=3){fail('Keep at most three additional sources. Remove one first.');return;}
    changed();const current=version;media=null;clearPreview();preparing=true;notice('Preparing the selected file on this device…');
    try{
      if(file.size>4*1024*1024)throw Error('Choose a file no larger than 4 MB.');
      let bytes,mime,label=file.name||'Voice note';
      if(['image/jpeg','image/png','image/webp'].includes(file.type)){
        const image=await createImageBitmap(file);try{
          if(image.width*image.height>24000000)throw Error('Use a photo smaller than 24 megapixels.');
          const scale=Math.min(1,2048/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
          const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.88));if(!blob)throw Error('Photo could not be prepared.');bytes=new Uint8Array(await blob.arrayBuffer());mime='image/jpeg';
        }finally{image.close();}
      }else if(file.type==='application/pdf'||/\.pdf$/i.test(file.name||'')){bytes=new Uint8Array(await file.arrayBuffer());mime='application/pdf';}
      else if(file.type.startsWith('audio/')||/\.(wav|mp3|m4a|ogg|webm)$/i.test(file.name||'')){bytes=await wav(file);mime='audio/wav';}
      else throw Error('Choose a photo, PDF or audio clip.');
      if(current!==version)return;if(bytes.length>4*1024*1024)throw Error('Prepared file is too large.');
      media={mime,data:bytesBase64(bytes),label};previewUrl=URL.createObjectURL(new Blob([bytes],{type:mime}));
      const view=document.createElement(mime.startsWith('image/')?'img':mime.startsWith('audio/')?'audio':'a');
      if(view.tagName==='IMG'){view.src='data:'+mime+';base64,'+media.data;view.alt='Selected job-source photo';}
      else if(view.tagName==='A'){view.href=previewUrl;view.target='_blank';view.rel='noopener noreferrer';view.textContent='Preview selected PDF';}
      else {view.src=previewUrl;view.controls=true;} $('jobNotesMediaPreview').append(view);
      notice(label+' is ready. With consent, Meta will read it; you must check the text before invoice extraction. PDF limit: 3 unencrypted pages.');
      invalidate();
    }catch(e){if(current===version){media=null;fail(e.message);notice('Nothing uploaded.');}}
    finally{preparing=false;invalidate();}
  }
  $('jobNotesFile').addEventListener('change',event=>prepare(event.target.files[0]));
  $('jobNotesUpload').addEventListener('click',()=>{$('jobNotesIntake').open=true;$('jobNotesFile').click();});
  $('jobNotesClearMedia').addEventListener('click',()=>{media=null;clearPreview();$('jobNotesFile').value='';notice('Selected file removed.');changed();});
  $('jobNotesAddSource').addEventListener('click',()=>{
    if(sources.length>=3){fail('Keep at most three additional sources.');return;}
    sources.push({label:'Additional note '+(sources.length+1),text:'',confirmed:false});render();changed();list.lastElementChild.querySelector('textarea').focus();
  });
  function stopRecording(){if(stopTimer)clearTimeout(stopTimer);stopTimer=null;if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;$('jobNotesRecordLabel').textContent='Record voice note';}
  $('jobNotesRecord').addEventListener('click',async()=>{
    $('jobNotesIntake').open=true;
    if(recorder?.state==='recording'){stopRecording();return;}
    if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){fail('Voice recording is unavailable. Upload an audio clip or paste a transcript.');return;}
    const capture=++captureVersion;
    try{
      const granted=await navigator.mediaDevices.getUserMedia({audio:true});if(capture!==captureVersion){granted.getTracks().forEach(t=>t.stop());return;}stream=granted;const chunks=[];recorder=new MediaRecorder(stream);
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{const blob=new Blob(chunks,{type:recorder.mimeType});if(capture===captureVersion&&blob.size)prepare(new File([blob],'Voice note.webm',{type:blob.type}));};recorder.start();
      $('jobNotesRecordLabel').textContent='Stop recording';notice('Recording on this device. Stops after 60 seconds; nothing has been uploaded.');stopTimer=setTimeout(stopRecording,60000);
    }catch{stopRecording();fail('Microphone access was not granted. Upload a clip or paste a transcript.');}
  });
  window.addEventListener('pagehide',()=>{stopRecording();clearPreview();});
  return {
    operation:()=>media?'read':'reconcile',
    hasSources:()=>sources.length>0,
    preparing:()=>preparing,
    request(){
      if(preparing||recorder?.state==='recording')throw Error('Finish preparing or recording the source first.');
      if(media)return {operation:'read',media:{mime:media.mime,data:media.data}};
      if(sources.some(s=>!s.confirmed||!s.text.trim()))throw Error('Check and confirm each additional source before reconciliation.');
      const all=[];if($('jobNotesInput').value.trim())all.push({id:'s1',label:'Job notes',text:$('jobNotesInput').value});
      sources.forEach((s,i)=>all.push({id:'s'+(i+2),label:s.label.slice(0,100),text:s.text}));MTJobEvidence.validateSources(all);return {operation:'reconcile',sources:all};
    },
    acceptRead(response){
      const data=MTJobEvidence.completionData(response);
      if(!data||Object.keys(data).sort().join(',')!=='text,uncertainties'||typeof data.text!=='string'||!data.text.trim()||data.text.length>12000||!Array.isArray(data.uncertainties)||data.uncertainties.length>30||data.uncertainties.some(x=>typeof x!=='string'||x.length>400))throw Error('The transcription was incomplete. Keep the original file.');
      sources.push({label:media.label.slice(0,100),text:data.text,uncertainties:data.uncertainties,confirmed:false});media=null;render();notice('Check the transcription against the preview, correct it, then confirm it. No invoice has changed.');list.lastElementChild.querySelector('textarea').focus();
    },
    close(){captureVersion++;stopRecording();version++;},
    reset(){captureVersion++;stopRecording();version++;sources=[];media=null;clearPreview();$('jobNotesFile').value='';render();notice('');invalidate();},
    enable(){ $('jobNotesIntake').hidden=false;$('jobNotesQuickAdd').hidden=false; }
  };
}};
