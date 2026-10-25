import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {HTML} from '../worker/index.js';

const source=readFileSync(new URL('../stt.js',import.meta.url),'utf8');
const hero=readFileSync(new URL('../ai-hero.js',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no});return {promise,resolve,reject}}
async function settle(){for(let i=0;i<12;i++)await Promise.resolve()}
let checks=0;
async function test(name,fn){await fn();checks++;console.log('✓ STT UI '+name)}
function fixture({secure=true,supported=true,rate=48000,worklet=false,resumeMode='running'}={}){
  const nodes=new Map(),timers=new Map(),events=new Map(),requests=[],media=[],contexts=[],worklets=[],urls=[],revoked=[];let next=0,observer,clock=0;
  class Element{
    constructor(id){this.id=id;this.value='';this.maxLength=600;this.dataset={};this.attributes={};this.disabled=false;this.isConnected=true;this.hidden=false;this.textContent='';this.label={textContent:''};this.inputEvents=0}
    setAttribute(key,value){this.attributes[key]=value}
    querySelector(){return this.label}
    dispatchEvent(event){if(event.type==='input'){this.inputEvents++;this.oninput?.(event)}return true}
    focus(){}
  }
  for(const id of ['ai-hero-input','ai-hero-form','ai-hero-submit','ai-hero-status','stt-mic','stt-cancel','stt-timer','stt-elapsed','stt-status','stt-result-wrap','stt-result'])nodes.set(id,new Element(id));
  nodes.get('stt-result-wrap').hidden=true;
  function audioNode(){return {connections:[],disconnected:0,connect(to){this.connections.push(to)},disconnect(){this.disconnected++}}}
  class Context{
    constructor(){this.sampleRate=rate;this.state=resumeMode==='running'?'running':'suspended';this.destination={};this.closed=0;this.resumed=0;contexts.push(this);if(worklet)this.audioWorklet={addModule:async()=>{}}}
    resume(){this.resumed++;return resumeMode==='reject'?Promise.reject(Error('Audio autoplay blocked')):resumeMode==='pending'?new Promise(()=>{}):Promise.resolve()}
    close(){this.closed++;return Promise.resolve()}
    createScriptProcessor(size,inputs,outputs){assert.equal(inputs,1);assert.equal(outputs,1);const node=audioNode();this.processor=node;return node}
    createMediaStreamSource(stream){this.stream=stream;return this.source=audioNode()}
    createGain(){const node=audioNode();node.gain={value:1};return this.gain=node}
  }
  class Worklet{
    constructor(context,name,options){assert.equal(name,'travel-pcm');assert.equal(options.outputChannelCount[0],1);Object.assign(this,audioNode());this.port={onmessage:null};worklets.push(this)}
  }
  const document={hidden:false,body:{},getElementById:id=>nodes.get(id)||null,querySelector:selector=>selector==='dialog[open]'?null:nodes.get(selector.slice(1))||null,addEventListener(type,fn){events.set(type,fn)}};
  const context={console,Float32Array,Uint8Array,DataView,ArrayBuffer,Event:class{constructor(type,options){this.type=type;this.bubbles=options?.bubbles}},AbortController,Blob,document,navigator:{mediaDevices:{getUserMedia(options){assert.equal(options.video,false);assert.equal(options.audio.channelCount,1);const item=deferred();media.push(item);return item.promise}}},isSecureContext:secure,AudioContext:supported?Context:undefined,AudioWorkletNode:worklet?Worklet:undefined,
    URL:{createObjectURL(blob){urls.push(blob);return 'blob:test-'+urls.length},revokeObjectURL:url=>revoked.push(url)},activeView:'gallery',aiHeroBusy:false,briefBusy:false,
    performance:{now:()=>clock},setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),addEventListener(type,fn){events.set(type,fn)},MutationObserver:class{constructor(fn){observer=fn}observe(){}},
    fetch:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({text:'洛阳两天，预算八百元'})}}};
  vm.createContext(context);vm.runInContext(source,context);context.bindSTTHero();
  const stream=()=>{const track={stopped:0,stop(){this.stopped++}};return {track,getTracks:()=>[track]}};
  return {advance:ms=>{clock+=ms},fireTimer(delay){const item=[...timers.entries()].find(([,timer])=>timer.delay===delay);assert(item,'Expected timer '+delay);timers.delete(item[0]);item[1].fn()},context,nodes,timers,events,requests,media,contexts,worklets,urls,revoked,stream,run:code=>vm.runInContext(code,context),get:id=>nodes.get(id),observe:()=>observer?.(),async start(){const pending=context.startSTTHero();const value=stream();media.at(-1).resolve(value);await pending;return value},emit(samples=new Float32Array(rate/10).fill(.25)){const ctx=contexts.at(-1);if(worklet)worklets.at(-1).port.onmessage?.({data:samples});else ctx.processor.onaudioprocess?.({inputBuffer:{getChannelData:()=>samples}})},replaceInput(){nodes.get('ai-hero-input').isConnected=false;nodes.set('ai-hero-input',new Element('ai-hero-input'));this.observe()}};
}

await test('renders a non-submit microphone and never requests permission on load',()=>{
  const f=fixture(),html=f.context.sttHeroControlsHTML();assert(html.includes('type="button"'));assert(html.includes('role="status"'));assert(html.includes('readonly'));assert.equal(f.media.length,0);assert.equal(f.get('stt-mic').disabled,false);
});
await test('insecure context and missing AudioContext disable voice, leaving typing intact',async()=>{
  for(const options of [{secure:false},{supported:false}]){
    const f=fixture(options);assert(f.get('stt-mic').disabled);f.get('ai-hero-input').value='仍可手动输入';await f.context.startSTTHero();assert.equal(f.media.length,0);assert.equal(f.get('ai-hero-input').value,'仍可手动输入');assert.match(f.get('stt-status').textContent,/直接输入/);
  }
});
await test('permission denial is quiet, releases the context, and disables the microphone',async()=>{
  const f=fixture(),pending=f.context.startSTTHero();assert.equal(f.get('stt-mic').dataset.state,'requesting');assert.equal(f.contexts[0].resumed,1,'Resume must start within the original click');f.media[0].reject(Object.assign(Error('denied'),{name:'NotAllowedError'}));await pending;
  assert.equal(f.contexts[0].closed,1);assert(f.get('stt-mic').disabled);assert.match(f.get('stt-status').textContent,/未获授权/);assert.equal(f.requests.length,0);
});
await test('no microphone device does not affect manual input',async()=>{
  const f=fixture(),pending=f.context.startSTTHero();f.media[0].reject(Object.assign(Error('missing'),{name:'NotFoundError'}));await pending;assert(f.get('stt-mic').disabled);assert.match(f.get('stt-status').textContent,/不可用/);assert.equal(f.contexts[0].closed,1);
});
await test('rejected or still-suspended AudioContext does not falsely enter recording',async()=>{
  for(const resumeMode of ['reject','suspended']){
    const f=fixture({resumeMode}),stream=await f.start();assert.equal(stream.track.stopped,1);assert.equal(f.contexts[0].closed,1);assert.equal(f.contexts[0].processor,undefined);assert.equal(f.get('stt-mic').dataset.state,'error');assert.match(f.get('stt-status').textContent,/无法录音/);assert.equal(f.requests.length,0);
  }
});
await test('AudioContext resume has a 10-second startup deadline and can be cancelled',async()=>{
  for(const mode of ['timeout','cancel']){
    const f=fixture({resumeMode:'pending'}),pending=f.context.startSTTHero(),stream=f.stream();f.media[0].resolve(stream);await settle();
    if(mode==='cancel')f.context.cancelSTTHero();else [...f.timers.values()].find(timer=>timer.delay===10000).fn();await pending;
    assert.equal(stream.track.stopped,1);assert.equal(f.contexts[0].closed,1);assert.equal(f.contexts[0].processor,undefined);assert.equal(f.timers.size,0);
  }
});
await test('second click stops capture and posts exactly 16 kHz PCM16LE mono, then appends',async()=>{
  const f=fixture();const pending=f.get('stt-mic').onclick(),stream=f.stream();f.media[0].resolve(stream);await pending;
  assert.equal(f.get('stt-mic').dataset.state,'recording');assert.equal(f.get('stt-mic').attributes['aria-pressed'],'true');assert.equal(f.contexts[0].gain.gain.value,0,'The microphone must never play back through the speakers');
  f.emit();f.get('ai-hero-input').value='郑州出发';await f.get('stt-mic').onclick();
  assert.equal(stream.track.stopped,1);assert.equal(f.contexts[0].closed,1);assert.equal(f.requests.length,1);
  const request=f.requests[0];assert.equal(request.url,'/api/stt');assert.equal(request.options.headers['Content-Type'],'application/octet-stream');assert.equal(request.options.body.byteLength,3200);assert.equal(new DataView(request.options.body.buffer).getInt16(0,true),8192);
  assert.equal(f.get('ai-hero-input').value,'郑州出发 洛阳两天，预算八百元');assert.equal(f.get('ai-hero-input').inputEvents,1);assert.equal(f.get('stt-mic').dataset.state,'idle');assert.equal(f.timers.size,0);
});
await test('uses AudioWorklet when available and always revokes its Blob URL',async()=>{
  const f=fixture({worklet:true}),stream=await f.start();assert.equal(f.worklets.length,1);assert.equal(f.urls.length,1);assert.equal(f.revoked.length,1);f.emit();await f.context.stopSTTHero();assert.equal(f.requests[0].options.body.byteLength,3200);assert.equal(stream.track.stopped,1);assert.equal(f.worklets[0].port.onmessage,null);
});
await test('AudioWorklet setup failure falls back to native ScriptProcessor',async()=>{
  const f=fixture({worklet:true}),pending=f.context.startSTTHero();f.contexts[0].audioWorklet.addModule=async()=>{throw Error('unsupported worklet')};f.media[0].resolve(f.stream());await pending;
  assert(f.contexts[0].processor);assert.equal(f.revoked.length,1);f.context.cancelSTTHero();
});
await test('44100/48000 Hz resampling produces the exact target length and signed endian format',()=>{
  const f=fixture();for(const rate of [44100,48000]){
    const data=new Float32Array(rate).fill(-1),bytes=f.context.sttEncodePCM([data],rate);assert.equal(bytes.byteLength,32000);assert.equal(new DataView(bytes.buffer).getInt16(0,true),-32768);
  }
  const bytes=f.context.sttEncodePCM([Float32Array.from([1,-1,0,.5,-.5])],16000),view=new DataView(bytes.buffer);assert.deepEqual(Array.from({length:5},(_,index)=>view.getInt16(index*2,true)),[32767,-32768,0,16384,-16384]);
});
await test('automatic stop at 60 seconds releases the microphone and uploads once',async()=>{
  const f=fixture(),stream=await f.start();f.emit();const timer=[...f.timers.values()].find(timer=>timer.delay===60000);assert(timer);timer.fn();await settle();assert.equal(f.requests.length,1);assert.equal(stream.track.stopped,1);assert.equal(f.get('stt-mic').dataset.state,'idle');
});
await test('sample cap cannot exceed 60 seconds, even when a timer is delayed',async()=>{
  const f=fixture({rate:16000}),stream=await f.start();f.emit(new Float32Array(960001).fill(.2));await settle();assert.equal(f.requests.length,1);assert.equal(f.requests[0].options.body.byteLength,1920000);assert.equal(stream.track.stopped,1);
});
await test('empty capture gives a friendly status without posting audio',async()=>{
  const f=fixture(),stream=await f.start();await f.context.stopSTTHero();assert.equal(f.requests.length,0);assert.match(f.get('stt-status').textContent,/没录到/);assert.equal(stream.track.stopped,1);
});
await test('transcript is appended to the latest edited text, preserving the draft event and never submitting',async()=>{
  const f=fixture(),upstream=deferred();let submit=0;f.get('ai-hero-form').onsubmit=()=>submit++;f.context.fetch=async(url,options)=>{f.requests.push({url,options});return upstream.promise};await f.start();f.emit();f.get('ai-hero-input').value='最初草稿';const pending=f.context.stopSTTHero();assert.equal(f.get('stt-mic').dataset.state,'recognizing');assert(f.get('stt-mic').disabled);
  f.get('ai-hero-input').value='识别时仍在编辑\n';let draft='';f.get('ai-hero-input').oninput=()=>draft=f.get('ai-hero-input').value;upstream.resolve({ok:true,json:async()=>({text:'想去老君山'})});await pending;
  assert.equal(f.get('ai-hero-input').value,'识别时仍在编辑\n想去老君山');assert.equal(draft,'识别时仍在编辑\n想去老君山');assert.equal(submit,0);
});
await test('overflow preserves both existing text and the complete transcript with an explicit notice',async()=>{
  const f=fixture();f.get('ai-hero-input').value='原'.repeat(599);await f.start();f.emit();await f.context.stopSTTHero();assert.equal(f.get('ai-hero-input').value,'原'.repeat(599));assert.equal(f.get('stt-result-wrap').hidden,false);assert.equal(f.get('stt-result').value,'洛阳两天，预算八百元');assert.match(f.get('stt-status').textContent,/超过.*600/);assert.equal(f.get('ai-hero-input').inputEvents,0);
});
await test('pagehide, hidden tab, rerender, and view change all stop capture immediately',async()=>{
  for(const mode of ['pagehide','hidden','rerender','view','planning']){
    const f=fixture(),stream=await f.start();f.emit();
    if(mode==='pagehide')f.events.get('pagehide')(new Event('pagehide'));
    else if(mode==='hidden'){f.context.document.hidden=true;f.events.get('visibilitychange')()}
    else if(mode==='rerender')f.replaceInput();
    else if(mode==='view'){f.context.activeView='planner';f.observe()}
    else{f.context.aiHeroBusy=true;f.context.refreshSTTHero()}
    assert.equal(stream.track.stopped,1,mode);assert.equal(f.contexts[0].closed,1,mode);assert.equal(f.timers.size,0,mode);assert.equal(f.requests.length,0,mode);
  }
});
await test('late permission approval after cancel stops all tracks and never starts capture',async()=>{
  const f=fixture(),pending=f.context.startSTTHero();f.get('stt-mic').onclick();const stream=f.stream();f.media[0].resolve(stream);await pending;assert.equal(stream.track.stopped,1);assert.equal(f.contexts[0].closed,1);assert.equal(f.contexts[0].processor,undefined);assert.equal(f.requests.length,0);
});
await test('late AudioWorklet setup after navigation cannot leave the microphone open',async()=>{
  const f=fixture({worklet:true}),module=deferred(),pending=f.context.startSTTHero();f.contexts[0].audioWorklet.addModule=()=>module.promise;const stream=f.stream();f.media[0].resolve(stream);await settle();f.events.get('pagehide')();module.resolve();await pending;
  assert.equal(stream.track.stopped,1);assert.equal(f.contexts[0].closed,1);assert.equal(f.worklets.length,0);assert.equal(f.revoked.length,1);
});
await test('navigation aborts in-flight upload; a late response cannot alter any draft',async()=>{
  const f=fixture(),upstream=deferred();f.context.fetch=async(url,options)=>{f.requests.push({url,options});return upstream.promise};await f.start();f.emit();f.get('ai-hero-input').value='原文';const pending=f.context.stopSTTHero();const signal=f.requests[0].options.signal;f.context.activeView='planner';f.observe();assert(signal.aborted);upstream.resolve({ok:true,json:async()=>({text:'不该出现'})});await pending;assert.equal(f.get('ai-hero-input').value,'原文');assert.equal(f.get('ai-hero-input').inputEvents,0);
});
await test('network error, friendly backend errors, and empty recognition preserve the editable draft',async()=>{
  for(const kind of ['network','503','429','empty']){
    const f=fixture();f.get('ai-hero-input').value='保留我的文字';f.context.fetch=async()=>{if(kind==='network')throw Error('网络暂时不可用');return {ok:kind==='empty',status:kind==='empty'?200:Number(kind),json:async()=>kind==='empty'?{text:''}:{error:kind==='429'?'本小时语音识别次数已用完':'语音识别服务尚未配置'}}};await f.start();f.emit();await f.context.stopSTTHero();assert.equal(f.get('ai-hero-input').value,'保留我的文字');assert.equal(f.get('stt-mic').dataset.state,'error');assert.match(f.get('stt-status').textContent,kind==='network'?/网络/:kind==='empty'?/没听清/:kind==='429'?/本小时/:/尚未配置/);
  }
});
await test('100-second upload deadline aborts fetch and gives a Chinese retry message',async()=>{
  for(const native of [false,true]){
    const f=fixture();let deadline,timeoutMs;
    if(native)f.context.AbortSignal={timeout(ms){timeoutMs=ms;deadline=new EventTarget();return deadline}};
    f.context.fetch=async(url,options)=>{f.requests.push({url,options});return new Promise((resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{name:'AbortError'})),{once:true})})};
    f.get('ai-hero-input').value='保留原文';await f.start();f.emit();const pending=f.context.stopSTTHero();
    if(native){assert.equal(timeoutMs,100000);deadline.dispatchEvent(new Event('abort'))}else [...f.timers.values()].find(timer=>timer.delay===100000).fn();
    await pending;assert(f.requests[0].options.signal.aborted);assert.match(f.get('stt-status').textContent,/识别超时/);assert.equal(f.get('stt-mic').dataset.state,'error');assert.equal(f.get('ai-hero-input').value,'保留原文');assert.equal(f.timers.size,0);
  }
});
await test('existing Hero entry cancels speech before planning, keeps optional APIs safe, and remains editable',async()=>{
  const f=fixture();f.context.esc=value=>String(value??'');f.context.cfg={aiConfigured:false};f.context.authUser=null;f.context.saveBooting=false;f.context.matchMedia=()=>({matches:false,addEventListener(){}});f.context.openBrief=async text=>{f.planningText=text};
  vm.runInContext(hero,f.context);f.context.bindAIPlanningHero();assert(f.context.aiPlanningHeroHTML().includes('id="stt-mic"'));
  const stream=await f.start();f.emit();f.get('ai-hero-input').value='用户手写的计划';await f.context.submitAIHero({preventDefault(){}});assert.equal(stream.track.stopped,1);assert.equal(f.planningText,'用户手写的计划');assert.equal(f.requests.length,0,'Submitting a typed draft cancels recording instead of uploading or applying speech');
});

await test('recording clock uses real elapsed time without repeating live-region announcements',async()=>{
  const f=fixture();await f.start();const status=f.get('stt-status').textContent;assert.equal(f.get('stt-timer').hidden,false);assert.equal(f.get('stt-elapsed').textContent,'00:00 / 01:00');
  f.advance(3400);f.fireTimer(1000);assert.equal(f.get('stt-elapsed').textContent,'00:03 / 01:00');assert.equal(f.get('stt-status').textContent,status);
  f.context.cancelSTTHero();assert.equal(f.get('stt-timer').hidden,true);assert.equal(f.timers.size,0);
  const html=f.context.sttHeroControlsHTML();assert.match(html,/id="stt-timer"[^>]*aria-live="off"/);assert(!html.includes('预计'));
});
await test('captured sample duration also bounds the clock when UI scheduling lags',async()=>{
  const f=fixture({rate:16000});await f.start();f.emit(new Float32Array(32000));f.fireTimer(1000);assert.equal(f.get('stt-elapsed').textContent,'00:02 / 01:00');f.context.cancelSTTHero();assert.equal(f.timers.size,0);
});
await test('explicit cancel is available during permission request, recording, and recognition',async()=>{
  for(const phase of ['requesting','recording','recognizing']){
    const f=fixture(),upstream=deferred();f.context.fetch=async(url,options)=>{f.requests.push({url,options});return upstream.promise};f.get('ai-hero-input').value='保留手写需求';
    let pending,stream;
    if(phase==='requesting')pending=f.context.startSTTHero();
    else{stream=await f.start();f.emit();if(phase==='recognizing')pending=f.context.stopSTTHero()}
    assert.equal(f.get('stt-cancel').hidden,false);f.get('stt-cancel').onclick();assert.equal(f.get('stt-cancel').hidden,true);assert.equal(f.timers.size,0);assert.equal(f.get('stt-mic').dataset.state,'idle');
    if(phase==='requesting'){stream=f.stream();f.media[0].resolve(stream);await pending}
    if(phase==='recognizing'){assert(f.requests[0].options.signal.aborted);upstream.resolve({ok:true,json:async()=>({text:'取消后不能填入'})});await pending}
    assert.equal(stream.track.stopped,1);assert.equal(f.contexts[0].closed,1);assert.equal(f.get('ai-hero-input').value,'保留手写需求');assert.equal(f.get('ai-hero-input').inputEvents,0);
  }
});
await test('late cancelled recognition cannot replace a newer recording session or its clock',async()=>{
  const f=fixture(),upstream=deferred();f.context.fetch=async(url,options)=>{f.requests.push({url,options});return upstream.promise};f.get('ai-hero-input').value='郑州出发';await f.start();f.emit();const pending=f.context.stopSTTHero();f.get('stt-cancel').onclick();const stream=await f.start();f.emit();f.advance(2100);f.fireTimer(1000);
  const clock=f.get('stt-elapsed').textContent,status=f.get('stt-status').textContent;upstream.resolve({ok:true,json:async()=>({text:'旧会话的结果'})});await pending;
  assert.equal(f.get('ai-hero-input').value,'郑州出发');assert.equal(f.get('stt-mic').dataset.state,'recording');assert.equal(f.get('stt-timer').hidden,false);assert.equal(f.get('stt-cancel').hidden,false);assert.equal(f.get('stt-elapsed').textContent,clock);assert.equal(f.get('stt-status').textContent,status);assert.equal(stream.track.stopped,0);assert.equal(f.contexts[1].closed,0);
  f.get('stt-cancel').onclick();assert.equal(stream.track.stopped,1);assert.equal(f.timers.size,0);
});
await test('pagehide event cannot be stored as a status message',async()=>{
  const f=fixture();await f.start();f.events.get('pagehide')(new Event('pagehide'));f.context.refreshSTTHero();assert.equal(f.run('typeof sttDisplay.message'),'string');assert(!/object|Event/.test(f.get('stt-status').textContent));assert.equal(f.timers.size,0);
});
await test('retry records fresh audio and cannot silently resend the failed recording',async()=>{
  const f=fixture();f.context.fetch=async(url,options)=>{f.requests.push({url,options});return {ok:false,status:502,json:async()=>({error:'语音识别暂时不可用'})}};await f.start();f.emit();await f.context.stopSTTHero();assert.equal(f.requests.length,1);assert.equal(f.get('stt-mic').label.textContent,'重新录音');
  const pending=f.get('stt-mic').onclick();assert.equal(f.media.length,2);assert.equal(f.requests.length,1);f.media[1].resolve(f.stream());await pending;assert.equal(f.run('sttSession.samples'),0);assert.equal(f.requests.length,1);f.get('stt-cancel').onclick();assert.equal(f.timers.size,0);
});
await test('503 and 429 give distinct actionable notices and preserve typed input through refresh',async()=>{
  for(const status of [503,429]){
    const f=fixture();f.get('ai-hero-input').value='郑州出发两天';f.context.fetch=async()=>({ok:false,status,json:async()=>({error:status===503?'语音识别服务尚未配置':'本小时语音识别次数已用完'})});await f.start();f.emit();await f.context.stopSTTHero();
    const notice=f.get('stt-status').textContent;assert.match(notice,status===503?/联系站长/:/本小时.*稍后/);assert.match(notice,/继续输入文字/);f.context.refreshSTTHero();f.observe();assert.equal(f.get('stt-status').textContent,notice);assert.equal(f.get('ai-hero-input').value,'郑州出发两天');assert.equal(f.timers.size,0);
  }
});
await test('success notices survive Hero refresh and upload does not promise a fabricated ETA',async()=>{
  const f=fixture(),upstream=deferred();f.context.fetch=()=>upstream.promise;await f.start();f.emit();const pending=f.context.stopSTTHero();assert.match(f.get('stt-status').textContent,/录音已结束.*上传.*可取消/);assert.equal(f.get('stt-timer').hidden,true);assert(!/预计|百分|%/.test(f.get('stt-status').textContent));upstream.resolve({ok:true,json:async()=>({text:'郑州出发 2 天，预算八百，想看古都😀'})});await pending;
  const notice=f.get('stt-status').textContent;f.context.refreshSTTHero();assert.equal(f.get('stt-status').textContent,notice);assert.equal(f.get('ai-hero-input').value,'郑州出发 2 天，预算八百，想看古都😀');assert.equal(f.get('ai-hero-input').inputEvents,1);assert.equal(f.timers.size,0);assert(!source.includes('�'));
});

await test('actual assembled script initializes all shared state before first secure-browser microphone binding',async()=>{
  // A realistic secure browser is essential: without AudioContext, the unavailable
  // branch short-circuits the busy check and hides temporal-dead-zone failures.
  const nodes=new Map(),requests=[];let permissions=0;
  const get=selector=>{
    if(selector==='dialog[open]')return [...nodes.values()].find(node=>node.open)||null;
    if(!nodes.has(selector))nodes.set(selector,{value:selector==='#days'?'2':selector==='#city'?'河南':selector==='#start'?'09:00':selector==='#travelmode'?'driving':selector==='#maxhours'?'8':selector==='#restmins'?'30':'',maxLength:600,innerHTML:'',textContent:'',style:{},dataset:{},hidden:false,open:false,isConnected:true,label:{textContent:''},classList:{add(){},toggle(){}},querySelector(){return this.label},querySelectorAll:()=>[],addEventListener(){},setAttribute(){},focus(){},showModal(){this.open=true},close(){this.open=false}});
    return nodes.get(selector);
  };
  const context={console,Map,Set,URL,Blob,Date,AbortController,isSecureContext:true,AudioContext:class{},navigator:{mediaDevices:{getUserMedia(){permissions++;return new Promise(()=>{})}}},document:{body:{dataset:{view:'gallery'},contains:()=>true},getElementById:id=>get('#'+id),querySelector:get,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}}),head:{append(){}}},setTimeout:()=>0,clearTimeout(){},fetch:async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>({})}}};context.window=context;
  vm.createContext(context);
  const actualScript=HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');
  assert.doesNotThrow(()=>vm.runInContext(actualScript,context),'Safe HTTPS browsers must not hit briefBusy before initialization');
  assert(get('#gallery').innerHTML.includes('id="stt-mic"'));assert.equal(vm.runInContext('briefBusy',context),false);assert.equal(get('#stt-mic').disabled,false);assert.equal(typeof get('#stt-mic').onclick,'function');assert.equal(typeof get('#stt-cancel').onclick,'function');assert.equal(permissions,0,'Initial binding must never request microphone permission');
  get('#ai-hero-input').value='手动输入不受影响';get('#ai-hero-input').oninput();assert.equal(get('#ai-hero-input').value,'手动输入不受影响');assert.equal(requests.length,0);
  vm.runInContext('briefBusy=true;refreshSTTHero()',context);assert.equal(get('#stt-mic').disabled,true,'The genuine planning-busy gate remains in place');
  vm.runInContext('briefBusy=false;refreshSTTHero()',context);assert.equal(get('#stt-mic').disabled,false);
});

const css=readFileSync(new URL('../stt.css',import.meta.url),'utf8');
assert.match(css,/min-height:\s*46px/);assert.match(css,/min-width:\s*46px/);assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);assert.match(css,/#stt-result[^}]*font-size:\s*16px/s);
assert(!/SpeechRecognition|speechSynthesis|Math\.random/.test(source));
console.log(`STT UI: ${checks} 个录音、重采样、原文追加、权限与生命周期检查通过；全部使用模拟麦克风、Web Audio 和网络，未调用真实模型。`);
