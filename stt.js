// Recording is opt-in. Only raw mono PCM reaches our server; nothing submits a plan.
const STT_MAX_SECONDS=60,STT_RATE=16000;
let sttSession=null,sttBlocked='',sttDisplay={phase:'idle',message:''};
const sttNode=id=>document.getElementById?.(id)||document.querySelector?.('#'+id);
function sttSupported(){return Boolean(globalThis.isSecureContext&&globalThis.navigator?.mediaDevices?.getUserMedia&&(globalThis.AudioContext||globalThis.webkitAudioContext))}
function sttHeroControlsHTML(){
  return '<div class="stt-controls"><div class="stt-actions"><button id="stt-mic" class="stt-mic" type="button" aria-label="语音输入" aria-pressed="false" aria-describedby="stt-status"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6"/></svg><span>语音输入</span></button><button id="stt-cancel" class="stt-cancel" type="button" hidden>取消</button><span id="stt-timer" class="stt-timer" aria-live="off" hidden><span class="stt-timer-dot" aria-hidden="true"></span>录音计时 <span id="stt-elapsed">00:00 / 01:00</span></span></div><span id="stt-status" class="stt-status" role="status" aria-live="polite">点麦克风说话，结束后文字填入，可编辑再规划</span></div><div id="stt-result-wrap" class="stt-result-wrap" hidden><label for="stt-result">识别文字（输入框空间不足，请选中复制后编辑）</label><textarea id="stt-result" rows="3" readonly aria-label="待填入的识别文字"></textarea></div>';
}
function sttHeroPresent(input){return Boolean(input&&input.isConnected!==false&&sttNode('ai-hero-input')===input&&!document.hidden&&(typeof activeView==='undefined'||activeView==='gallery')&&!document.querySelector?.('dialog[open]'))}
function sttPlanningBusy(){return Boolean((typeof aiHeroBusy!=='undefined'&&aiHeroBusy)||(typeof briefBusy!=='undefined'&&briefBusy))}
function sttCurrent(session){return sttSession===session&&!session.cancelled&&sttHeroPresent(session.input)&&!sttPlanningBusy()}
function sttSetUI(phase='idle',message=''){
  sttDisplay={phase,message};
  const button=sttNode('stt-mic'),status=sttNode('stt-status'),cancel=sttNode('stt-cancel'),timer=sttNode('stt-timer');if(!button)return;
  const unavailable=sttBlocked||(!sttSupported()?'当前浏览器无法使用麦克风，请直接输入文字':'');
  const labels={idle:'语音输入',requesting:'取消等待',recording:'结束录音',recognizing:'识别中…',error:'重新录音'};
  button.dataset.state=phase;button.setAttribute?.('aria-pressed',String(phase==='recording'));
  button.setAttribute?.('aria-label',labels[phase]||labels.idle);
  const label=button.querySelector?.('span');if(label)label.textContent=labels[phase]||labels.idle;
  button.disabled=Boolean(unavailable||sttPlanningBusy()||phase==='recognizing');button.title=unavailable||'';
  if(cancel){cancel.hidden=!['requesting','recording','recognizing'].includes(phase);cancel.disabled=false;cancel.setAttribute?.('aria-label',phase==='recognizing'?'取消语音识别':'取消录音')}
  if(timer)timer.hidden=phase!=='recording';
  // This live region reports phase changes only. The separate clock is not announced every second.
  if(status){status.dataset.state=phase;status.textContent=message||unavailable||'点麦克风说话，结束后文字填入，可编辑再规划'}
}
function sttNow(){return typeof globalThis.performance?.now==='function'?performance.now():Date.now()}
function sttRecordingSeconds(session){
  // The clock is actual recording time. Captured samples also bound the duration if UI timers lag.
  const clock=Math.max(0,(sttNow()-session.startedAt)/1000),captured=session.samples/session.rate;
  return Math.min(STT_MAX_SECONDS,Math.floor(Math.max(clock,Number.isFinite(captured)?captured:0)));
}
function sttRefreshClock(session){
  if(!sttCurrent(session)||session.phase!=='recording')return;
  const seconds=sttRecordingSeconds(session),clock=sttNode('stt-elapsed');
  if(clock)clock.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0')+' / 01:00';
  session.clockTimer=setTimeout(()=>sttRefreshClock(session),1000);
}
function sttReleaseAudio(session){
  clearTimeout(session.timer);session.timer=0;clearTimeout(session.clockTimer);session.clockTimer=0;
  clearTimeout(session.resumeTimer);session.resumeCancel?.();session.resumeCancel=null;
  if(session.processor){session.processor.onaudioprocess=null;if(session.processor.port)session.processor.port.onmessage=null}
  for(const node of [session.source,session.processor,session.gain]){try{node?.disconnect()}catch{}}
  for(const track of session.stream?.getTracks?.()||[]){try{track.stop()}catch{}}
  session.stream=null;
  const context=session.context;session.context=null;
  try{Promise.resolve(context?.close?.()).catch(()=>{})}catch{}
}
function sttReleaseUpload(session){
  clearTimeout(session.uploadTimer);
  session.deadline?.removeEventListener?.('abort',session.deadlineHandler);session.deadline=null;
}
function cancelSTTHero(message=''){
  const session=sttSession;if(!session)return;
  session.cancelled=true;sttSession=null;session.abort?.abort();sttReleaseUpload(session);sttReleaseAudio(session);session.chunks=[];
  sttSetUI('idle',message);
}
function refreshSTTHero(){
  if(sttSession&&(!sttHeroPresent(sttSession.input)||sttPlanningBusy()))cancelSTTHero();
  else if(!sttSession)sttSetUI(sttDisplay.phase,sttDisplay.message);
}
// Average source samples within each output interval, including fractional edges.
// Upsampling uses interpolation. DataView fixes little-endian byte order on every host.
function sttEncodePCM(chunks,sourceRate){
  const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0),samples=new Float32Array(length);let offset=0;
  for(const chunk of chunks){samples.set(chunk,offset);offset+=chunk.length}
  const count=Math.min(STT_RATE*STT_MAX_SECONDS,Math.floor(length*STT_RATE/sourceRate));
  const bytes=new Uint8Array(count*2),view=new DataView(bytes.buffer),ratio=sourceRate/STT_RATE;
  for(let i=0;i<count;i++){
    let value=0;
    if(ratio<1){const position=i*ratio,left=Math.floor(position),fraction=position-left;value=(samples[left]||0)*(1-fraction)+(samples[Math.min(left+1,length-1)]||0)*fraction}
    else{
      const start=i*ratio,end=(i+1)*ratio;
      for(let j=Math.floor(start);j<Math.ceil(end);j++)value+=(samples[j]||0)*Math.max(0,Math.min(j+1,end)-Math.max(j,start));
      value/=ratio;
    }
    value=Math.max(-1,Math.min(1,Number.isFinite(value)?value:0));view.setInt16(i*2,Math.round(value*(value<0?32768:32767)),true);
  }
  return bytes;
}
function sttCapture(session,chunk){
  if(!sttCurrent(session)||session.phase!=='recording'||!chunk?.length)return;
  const left=Math.max(0,Math.floor(session.rate*STT_MAX_SECONDS)-session.samples),copy=new Float32Array(chunk.subarray(0,left));
  if(copy.length){session.chunks.push(copy);session.samples+=copy.length}
  if(session.samples>=session.rate*STT_MAX_SECONDS)void stopSTTHero(session);
}
async function sttCreateProcessor(session){
  const context=session.context;
  if(context.audioWorklet&&typeof globalThis.AudioWorkletNode==='function'&&globalThis.URL?.createObjectURL){
    // A same-origin Blob worklet keeps audio processing off the UI thread.
    const code='class TravelPCM extends AudioWorkletProcessor{process(inputs){const channels=inputs[0];if(channels?.length){const mono=new Float32Array(channels[0].length);for(const channel of channels)for(let i=0;i<mono.length;i++)mono[i]+=channel[i]/channels.length;this.port.postMessage(mono,[mono.buffer])}return true}}registerProcessor("travel-pcm",TravelPCM)';
    const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    try{
      await context.audioWorklet.addModule(url);
      if(!sttCurrent(session))return null;
      const processor=new AudioWorkletNode(context,'travel-pcm',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      processor.port.onmessage=event=>sttCapture(session,event.data);return processor;
    }catch{if(!sttCurrent(session))return null}
    finally{URL.revokeObjectURL(url)}
  }
  if(!sttCurrent(session))return null;
  const processor=context.createScriptProcessor(4096,1,1);
  processor.onaudioprocess=event=>sttCapture(session,event.inputBuffer.getChannelData(0));return processor;
}
async function startSTTHero(){
  if(!sttSupported()||sttBlocked||sttPlanningBusy())return;
  const input=sttNode('ai-hero-input');if(!sttHeroPresent(input))return;
  const session={input,phase:'requesting',chunks:[],samples:0,timer:0,cancelled:false};sttSession=session;
  const overflow=sttNode('stt-result-wrap');if(overflow)overflow.hidden=true;
  sttSetUI('requesting','请允许使用麦克风；可点击取消等待');
  try{
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    session.context=new Context();
    // Resume is called during the original click gesture, including on iOS.
    let resumeError;
    const resume=Promise.resolve(session.context.resume?.()).catch(error=>{resumeError=error});
    const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
    if(!sttCurrent(session)){for(const track of stream.getTracks())track.stop();return}
    session.stream=stream;
    const resumeDeadline=new Promise((resolve,reject)=>{session.resumeCancel=resolve;session.resumeTimer=setTimeout(()=>reject(Error('Audio did not start')),10000)});
    await Promise.race([resume,resumeDeadline]);clearTimeout(session.resumeTimer);session.resumeCancel=null;
    if(!sttCurrent(session))return;
    if(resumeError||(typeof session.context.state==='string'&&session.context.state!=='running'))throw Error('Audio did not start');
    session.rate=session.context.sampleRate;
    if(!Number.isFinite(session.rate)||session.rate<8000||session.rate>192000)throw Error('Audio format unavailable');
    session.processor=await sttCreateProcessor(session);if(!sttCurrent(session)||!session.processor)return;
    session.source=session.context.createMediaStreamSource(stream);session.gain=session.context.createGain();session.gain.gain.value=0;
    session.source.connect(session.processor);session.processor.connect(session.gain);session.gain.connect(session.context.destination);
    session.phase='recording';session.startedAt=sttNow();sttSetUI('recording','正在录音，点「结束录音」转文字；最长 60 秒');sttRefreshClock(session);
    session.timer=setTimeout(()=>{if(sttCurrent(session))void stopSTTHero(session)},STT_MAX_SECONDS*1000);
  }catch(error){
    if(sttSession!==session||session.cancelled)return;
    const denied=['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error?.name);
    if(denied)sttBlocked='麦克风未获授权，请直接输入文字';
    else if(['NotFoundError','DevicesNotFoundError','NotReadableError'].includes(error?.name))sttBlocked='麦克风不可用，请直接输入文字';
    cancelSTTHero();sttSetUI(sttBlocked?'idle':'error',sttBlocked||'暂时无法录音，可以重新录音或直接输入文字');
  }
}
async function stopSTTHero(session=sttSession){
  if(!session||!sttCurrent(session)||session.phase!=='recording')return;
  session.phase='recognizing';sttReleaseAudio(session);sttSetUI('recognizing','录音已结束，正在上传并识别；可取消，不会自动提交规划');
  try{
    const audio=sttEncodePCM(session.chunks,session.rate);session.chunks=[];
    if(!audio.length){sttSession=null;sttSetUI('error','没录到声音，可以重新录音；原输入保持不变');return}
    session.abort=new AbortController();
    // Includes both the response headers and its JSON body. Older browsers use
    // the same deadline through our existing AbortController.
    session.deadlineHandler=()=>{session.timedOut=true;session.abort.abort()};
    if(typeof globalThis.AbortSignal?.timeout==='function'){
      session.deadline=AbortSignal.timeout(100000);session.deadline.addEventListener('abort',session.deadlineHandler,{once:true});
    }else session.uploadTimer=setTimeout(session.deadlineHandler,100000);
    const response=await fetch('/api/stt',{method:'POST',headers:{'Content-Type':'application/octet-stream'},credentials:'same-origin',body:audio,signal:session.abort.signal});
    let result={};try{result=await response.json()}catch{}
    if(!sttCurrent(session))return;
    if(session.timedOut)throw Error('语音识别超时，请稍后重试');
    if(!response.ok){
      if(response.status===503)throw Error('语音识别服务尚未配置或暂不可用，请联系站长；你可以继续输入文字');
      if(response.status===429)throw Error((typeof result.error==='string'?result.error.slice(0,160):'本小时语音识别次数已用完')+'；请稍后再试，你可以继续输入文字');
      throw Error(typeof result.error==='string'?result.error.slice(0,200):'语音识别暂时不可用，可以重新录音或直接输入文字');
    }
    const text=typeof result.text==='string'?result.text.trim():'';
    if(!text)throw Error('没听清，请靠近麦克风再试一次');
    const current=session.input.value,addition=(current&&!/\s$/.test(current)?' ':'')+text;
    const limit=session.input.maxLength>0?session.input.maxLength:600;
    sttSession=null;
    if(current.length+addition.length>limit){
      const wrap=sttNode('stt-result-wrap'),field=sttNode('stt-result');if(wrap)wrap.hidden=false;if(field)field.value=text;
      sttSetUI('idle','识别完成，但超过输入框 '+limit+' 字上限；已保留原文，请在下方复制识别文字后编辑');return;
    }
    session.input.value=current+addition;session.input.dispatchEvent(new Event('input',{bubbles:true}));
    sttSetUI('idle','识别文字已填入，可编辑后点击「让 AI 规划」');
  }catch(error){
    if(sttSession!==session||session.cancelled)return;
    sttSession=null;sttSetUI('error',session.timedOut?'语音识别超时，可以重新录音或直接输入文字':error?.name==='AbortError'?'已取消语音识别，原输入保持不变':error?.message||'语音识别暂时不可用，可以重新录音或直接输入文字');
  }finally{sttReleaseUpload(session)}
}
function bindSTTHero(){
  const button=sttNode('stt-mic');if(!button)return;refreshSTTHero();
  button.onclick=()=>{
    if(sttSession?.phase==='requesting'){cancelSTTHero('已取消等待，原输入保持不变');return}
    if(sttSession?.phase==='recording')return stopSTTHero();
    if(!sttSession)return startSTTHero();
  };
  const cancel=sttNode('stt-cancel');if(cancel)cancel.onclick=()=>cancelSTTHero('已取消语音输入，原输入保持不变');
}
document.addEventListener?.('visibilitychange',()=>{if(document.hidden)cancelSTTHero()});
globalThis.addEventListener?.('pagehide',()=>cancelSTTHero());
if(typeof MutationObserver==='function'&&document.body){
  const sttLifecycleObserver=new MutationObserver(()=>{if(sttSession)refreshSTTHero()});
  sttLifecycleObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-view','open']});
}
