import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the actual browser source with deterministic timers and mocked API
// responses. No model or map services are contacted by this test.
const root=new URL('../',import.meta.url);
const data=JSON.parse(readFileSync(new URL('henan.json',root),'utf8'));
const core=readFileSync(new URL('decision-core.mjs',root),'utf8').replace(/^export /gm,'');
const source=readFileSync(new URL('decision.js',root),'utf8').replace(/^renderDecision\(\);\s*$/m,'');
const showcase=readFileSync(new URL('showcase.js',root),'utf8');
const reorderSource=showcase.match(/async function generate\(scopeDay=null\)\{[\s\S]*?\n\}/)?.[0];
const reorderStopsSource=showcase.split('\n').find(line=>line.startsWith('function adviceStops('));
assert(reorderSource&&reorderStopsSource,'Reorder tests must execute the existing generate/adviceStops implementation');
const clone=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function clock(){
 let now=0,next=1;const timers=new Map();
 return {timers,setTimeout(fn,delay=0){const id=next++;timers.set(id,{fn,at:now+Number(delay)});return id},clearTimeout(id){timers.delete(id)},
  callback(){return [...timers.values()].sort((a,b)=>a.at-b.at)[0]?.fn},
  tick(){const entry=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!entry)return false;timers.delete(entry[0]);now=entry[1].at;entry[1].fn();return true},
  drain(){let iterations=0;while(this.tick())assert(++iterations<100,'Replay timers must terminate')},get now(){return now}};
}

function fixture({reducedMotion=false,emptyBrief=false}={}){
 const timers=clock(),nodes=new Map(),events=new Map(),messages=[],requests=[];
 class Node{
  constructor(selector){this.selector=selector;this.inner='';this.hidden=false;this.disabled=false;this.open=false;this.inert=false;this.isConnected=true;this.dataset={};this.style={};this.value='';this.textContent='';this.childNodes=[];this.listeners=new Map();const names=new Set();this.classList={add:name=>names.add(name),remove:name=>names.delete(name),toggle(name,on){if(on??!names.has(name))names.add(name);else names.delete(name)},contains:name=>names.has(name)}}
  set innerHTML(html){for(const child of this.childNodes)child.isConnected=false;this.inner=String(html);this.childNodes=[];for(const match of this.inner.matchAll(/<[a-z]+\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const child=new Node('#'+match[2]);child.disabled=/\bdisabled\b/.test(match[1]);nodes.set(child.selector,child);this.childNodes.push(child)}
   this.steps=[...this.inner.matchAll(/<p\b([^>]*\bdata-agent-step\b[^>]*)>([\s\S]*?)<\/p>/g)].map(match=>{const row=new Node('[data-agent-step]');row.hidden=/\bhidden\b/.test(match[1]);row.inner=match[2];row.textContent=match[2].replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');row.dataset.agentStep='';return row});
   for(const attr of ['data-agent-replay-status','data-agent-replay-skip','data-agent-final'])for(const match of this.inner.matchAll(new RegExp('<[a-z]+\\b([^>]*\\b'+attr+'\\b[^>]*)>','g'))){const child=new Node('['+attr+']');child.hidden=/\bhidden\b/.test(match[1]);this.childNodes.push(child)}
  }
  get innerHTML(){return this.inner}
  querySelector(selector){return this.childNodes.find(node=>node.selector===selector)||nodes.get(selector)||null}
  querySelectorAll(selector){return selector==='[data-agent-step]'?(this.steps||[]):this.childNodes.filter(node=>node.selector===selector)}
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,[]);this.listeners.get(type).push(fn)}
  removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(handler=>handler!==fn))}
  dispatch(type,target=this){const event={target,preventDefault(){}};this['on'+type]?.(event);for(const fn of this.listeners.get(type)||[])fn(event)}
  close(){this.open=false;this.dispatch('close')}
  showModal(){this.open=true}
  contains(node){return node===this||this.childNodes.includes(node)||(this.steps||[]).includes(node)}
  scrollIntoView(){}
 }
 const get=selector=>{if(emptyBrief&&['#candidatepreview','#buildcandidate'].includes(selector)&&!nodes.has(selector))return null;if(!nodes.has(selector))nodes.set(selector,new Node(selector));return nodes.get(selector)};
 ['#brief','#briefbody','#decision','#buildcandidate','#candidatepreview','#days','#city','#travelmode','#maxhours','#restmins'].forEach(get);
 get('#brief').open=true;if(get('#buildcandidate'))get('#buildcandidate').textContent='让智能体生成行程';
 const intent={city:'洛阳',days:2,mode:'transit',maxHours:6,restMinutes:30,budget:300,avoidCrossCity:true,interests:['culture'],requiredIds:[],excludedIds:[],excludedModes:[]};
 const oldPlace=data.places.find(place=>place.id==='hn-longmen'),newPlace=data.places.find(place=>place.id==='hn-luoyi');
 const draft={city:'洛阳',days:2,start:'09:00',mode:'transit',maxHours:6,restMinutes:30,presetId:'luoyang',stops:[{place:oldPlace,day:1,duration:90}],decision:{intent,expenses:{tickets:null,food:null,lodging:null,transport:null,other:null},records:[],source:'manual'}};
 const context={document:{body:{contains:()=>true},querySelector:get,querySelectorAll:()=>[],addEventListener(type,fn){events.set(type,fn)}},console,Map,Set,Array,Date,JSON,URL,Blob,
  CATALOG:data.places,CITY_GUIDES:data.cities,modeNames:{driving:'自驾',transit:'公共交通',walking:'步行'},saveBooting:false,cfg:{},authUser:null,trip:clone(draft.stops),trafficCache:new Map(),activeStudy:null,
  fixtureDraft:clone(draft),fixtureIntent:clone(intent),decisionState:clone(draft.decision),lastPlanningSource:'manual',day:1,
  esc:escape,$:get,toast:message=>messages.push(message),durationLabel:minutes=>minutes+' 分钟',compactDraft:()=>clone(context.fixtureDraft),
  setTimeout:timers.setTimeout.bind(timers),clearTimeout:timers.clearTimeout.bind(timers),matchMedia:()=>({matches:reducedMotion,addEventListener(){},removeEventListener(){}}),
  checkpoint(){context.checkpoints++},checkpoints:0,renderAll(){},renderTrip(){},search(){},setView(){},ensureDayCount(){},stopStudyTimer(){},
  api:async(path,body)=>{requests.push({path,body:clone(body)});if(path==='/api/validate')return {days:body.days,start:body.start,stops:clone(body.stops)};if(path==='/api/agent')return clone(context.result);throw Error('Unexpected fixture API '+path)},
  applyDraft:async(candidate)=>{context.applyCalls++;context.fixtureDraft=clone(candidate);context.trip=clone(candidate.stops);context.decisionState=clone(candidate.decision);return true},applyCalls:0};
 context.window=context;vm.createContext(context);vm.runInContext(core,context);vm.runInContext(source,context);
 const run=expression=>vm.runInContext(expression,context);
 run('readBrief=()=>validateIntent(fixtureIntent);briefSnapshot=JSON.stringify(compactDraft());');
 const steps=[{tool:'search_places',label:'已查询 12 个地点 <原文> & "引号"',status:'completed'},{tool:'lookup_map',label:'第 1 天交通资料待确认',status:'pending'},{tool:'check_itinerary',label:'第 2 天超过时长上限',status:'conflict'}];
 context.result={source:'ai',provider:'Fixture model',summary:'根据返回资料安排',reasons:[],pending:[],transport:[],agent:{steps:clone(steps),modelCalls:2,toolCalls:3},draft:{...clone(draft),presetId:null,stops:[{place:newPlace,day:1,duration:90}]}};
 return {context,run,get,timers,messages,requests,steps,initialDraft:JSON.stringify(context.fixtureDraft),Node};
}

function replayRoot(f,steps=f.steps){const node=new f.Node('replay-root');node.innerHTML=f.run('agentResultHTML(result,{replay:true})')+'<div data-agent-final hidden>候选内容</div>';if(steps.length!==f.steps.length)node.steps=steps.map(()=>{const row=new f.Node('[data-agent-step]');row.hidden=true;return row});return node}
const visible=root=>(root.querySelectorAll('[data-agent-step]')).filter(row=>!row.hidden).length;

{
 const f=fixture({emptyBrief:true});assert.equal(f.get('#candidatepreview'),null);assert.equal(f.get('#buildcandidate'),null);
 assert.doesNotThrow(()=>f.run('cancelBriefCandidate()'),'Initial dialog has no candidate nodes to cancel');await f.run('openBrief()');
 assert.equal(f.messages.length,0,'First opening must not fail on missing candidate nodes');assert(f.get('#brief').open);assert(f.get('#candidatepreview'));assert(f.get('#buildcandidate'));assert.match(f.get('#briefbody').innerHTML,/确认|条件/);
}

{
 const f=fixture();f.context.step=f.steps[0];const html=f.run('agentStepHTML(step,true)');assert.match(html,/data-agent-step/);assert.match(html,/\bhidden\b/);assert.match(html,/✓ 已完成/);assert(html.includes(escape(f.steps[0].label)));assert(!html.includes('<原文>'),'Tool label must be escaped, preserving its text rather than interpreting markup');
 f.context.step=f.steps[1];assert.match(f.run('agentStepHTML(step)'),/待确认/);assert(!f.run('agentStepHTML(step)').includes('✓'),'Pending is not completed');
 f.context.step=f.steps[2];assert.match(f.run('agentStepHTML(step)'),/有冲突/);assert(!f.run('agentStepHTML(step)').includes('✓'),'Conflict is not completed');
 const resultHTML=f.run('agentResultHTML(result,{replay:true})');assert(resultHTML.indexOf(escape(f.steps[0].label))<resultHTML.indexOf(escape(f.steps[1].label)));assert(resultHTML.indexOf(escape(f.steps[1].label))<resultHTML.indexOf(escape(f.steps[2].label)));
}

{
 const f=fixture(),node=replayRoot(f);f.context.node=node;let completed=0;f.context.done=()=>completed++;f.run('startAgentReplay(node,{onComplete:done})');
 assert.equal(visible(node),1,'First real step is visible when replay starts');assert(node.querySelector('[data-agent-final]').hidden,'Candidate stays hidden until replay completes');
 f.timers.tick();assert.equal(visible(node),2,'One timer reveals exactly the next returned step');assert(node.querySelectorAll('[data-agent-step]')[2].hidden);
 f.timers.drain();assert.equal(visible(node),3);assert(!node.querySelector('[data-agent-final]').hidden);assert.equal(completed,1);assert.equal(f.timers.timers.size,0);
}

{
 const f=fixture(),node=replayRoot(f);f.context.node=node;let completed=0;f.context.done=()=>completed++;const controller=f.run('startAgentReplay(node,{onComplete:done})'),stale=f.timers.callback();
 const skip=node.querySelector('[data-agent-replay-skip]');assert.equal(typeof skip.onclick,'function');skip.onclick();assert.equal(visible(node),3);assert(!node.querySelector('[data-agent-final]').hidden);assert.equal(completed,1);assert.equal(f.timers.timers.size,0);assert(skip.hidden);assert.equal(skip.onclick,null);stale?.();assert.equal(completed,1,'Already queued callbacks cannot finish replay twice');
}

{
 const f=fixture(),node=replayRoot(f);f.context.node=node;let completed=0,cancelled=0;f.context.done=()=>completed++;f.context.cancelled=()=>cancelled++;const controller=f.run('startAgentReplay(node,{onComplete:done,onCancel:cancelled})'),stale=f.timers.callback();
 controller.cancel();assert.equal(f.timers.timers.size,0);stale?.();controller.skip();controller.cancel();assert.equal(visible(node),1,'Cancelled replay and retained controls must not reveal another step');assert(node.querySelector('[data-agent-final]').hidden);assert.equal(completed,0);assert.equal(cancelled,1);
}

{
 const f=fixture(),node=replayRoot(f);f.context.node=node;f.context.current=true;let completed=0,cancelled=0;f.context.done=()=>completed++;f.context.cancelled=()=>cancelled++;
 f.run('startAgentReplay(node,{isCurrent:()=>current,onComplete:done,onCancel:cancelled})');f.context.current=false;f.timers.tick();assert.equal(visible(node),1);assert.equal(completed,0);assert.equal(cancelled,1);assert.equal(f.timers.timers.size,0);
}

for(const options of [{reducedMotion:true},{empty:true}]){
 const f=fixture(options);if(options.empty)f.context.result.agent.steps=[];const node=replayRoot(f,options.empty?[]:f.steps);f.context.node=node;let completed=0;f.context.done=()=>completed++;
 f.run('startAgentReplay(node,{onComplete:done})');assert.equal(visible(node),options.empty?0:3);assert(!node.querySelector('[data-agent-final]').hidden);assert.equal(completed,1);assert.equal(f.timers.timers.size,0,'Empty or reduced-motion replay must not delay the result');
}

{
 const f=fixture();let answer;f.context.api=async(path,body)=>{f.requests.push({path,body:clone(body)});if(path==='/api/agent')return new Promise(resolve=>answer=resolve);if(path==='/api/validate')return {days:body.days,start:body.start,stops:clone(body.stops)};throw Error(path)};
 const pending=f.run('buildCandidate()');assert.equal(f.requests[0].path,'/api/agent');assert.equal(visible(f.get('#candidatepreview')),0,'No tool step may appear while the request is pending');assert.equal(JSON.stringify(f.context.fixtureDraft),f.initialDraft);
 answer(clone(f.context.result));await pending;const preview=f.get('#candidatepreview');assert.equal(visible(preview),1);assert.equal(f.context.applyCalls,0);assert.equal(JSON.stringify(f.context.fixtureDraft),f.initialDraft,'Receiving and replaying a candidate must not alter the saved draft');
 const apply=f.get('#applycandidate');assert(apply.disabled||preview.querySelector('[data-agent-final]').hidden,'Apply must not be available while final candidate content is hidden');f.timers.drain();assert(!preview.querySelector('[data-agent-final]').hidden);assert.equal(f.context.applyCalls,0);await apply.onclick();assert.equal(f.context.applyCalls,1);assert.equal(f.context.checkpoints,1);assert.equal(f.context.fixtureDraft.stops[0].place.id,'hn-luoyi');assert.equal(f.get('#brief').open,false);
}

for(const event of ['close','cancel','input','change']){
 const f=fixture();await f.run('buildCandidate()');const oldApply=f.get('#applycandidate').onclick,stale=f.timers.callback();
 if(event==='input'||event==='change'){f.context.fixtureIntent.budget=350;f.get('#briefbody').dispatch(event,{id:'briefbudget',dataset:{},matches:selector=>selector==='input,select,textarea',closest:()=>null})}else f.get('#brief').dispatch(event);
 assert.equal(f.timers.timers.size,0,event+' must cancel replay');assert.equal(f.get('#candidatepreview').innerHTML,'',event+' must clear the old candidate');stale?.();await oldApply();assert.equal(f.context.applyCalls,0,event+' must invalidate the old apply handler');assert.equal(JSON.stringify(f.context.fixtureDraft),f.initialDraft);
}

{
 const f=fixture();let answer;f.context.api=async()=>new Promise(resolve=>answer=resolve);const pending=f.run('buildCandidate()');f.get('#brief').close();answer(clone(f.context.result));await pending;
 assert.equal(f.get('#candidatepreview').innerHTML,'','A response after dialog close cannot reintroduce old candidate content');assert.equal(f.context.applyCalls,0);assert.equal(f.get('#buildcandidate').disabled,false);
}

{
 const f=fixture();let answer;f.context.api=async()=>new Promise(resolve=>answer=resolve);const pending=f.run('buildCandidate()');f.context.fixtureIntent.budget=350;f.get('#briefbody').dispatch('input',{id:'briefbudget',dataset:{},matches:selector=>selector==='input,select,textarea',closest:()=>null});answer(clone(f.context.result));await pending;
 assert.equal(f.get('#candidatepreview').innerHTML,'','Changing conditions in flight must discard the old response');assert.equal(f.context.applyCalls,0);
}

{
 const f=fixture(),answers=[];f.context.api=async()=>new Promise(resolve=>answers.push(resolve));const oldRequest=f.run('buildCandidate()');
 f.context.fixtureIntent.budget=350;f.get('#briefbody').dispatch('input',{id:'briefbudget',dataset:{},matches:selector=>selector==='input,select,textarea',closest:()=>null});const newRequest=f.run('buildCandidate()');
 const newer=clone(f.context.result);newer.summary='第二次请求的真实返回';answers[1](newer);await newRequest;const currentHTML=f.get('#candidatepreview').innerHTML;
 answers[0](clone(f.context.result));await oldRequest;assert.equal(f.get('#candidatepreview').innerHTML,currentHTML,'A late first response must not replace a newer candidate');assert(currentHTML.includes(newer.summary));assert.equal(f.context.applyCalls,0);
}

{
 const f=fixture();await f.run('buildCandidate()');f.timers.drain();let validated;f.context.api=async(path,body)=>{assert.equal(path,'/api/validate');return new Promise(resolve=>validated=()=>resolve({days:body.days,start:body.start,stops:clone(body.stops)}))};
 const applying=f.get('#applycandidate').onclick();assert(f.get('#briefbody').inert);f.get('#brief').close();validated();await applying;
 assert.equal(f.context.applyCalls,0,'Closing while candidate validation is pending must invalidate application');assert.equal(JSON.stringify(f.context.fixtureDraft),f.initialDraft);assert.equal(f.get('#briefbody').inert,false);
}

{
 const f=fixture();await f.run('buildCandidate()');const preview=f.get('#candidatepreview');f.context.fixtureDraft.stops[0].duration=120;f.timers.tick();
 assert.equal(visible(preview),1,'A changed current draft must stop remaining replay');assert.equal(f.timers.timers.size,0);assert(f.get('#applycandidate').disabled);await f.get('#applycandidate').onclick();assert.equal(f.context.applyCalls,0);
}

for(const steps of [[],[{tool:'rules',label:'模型不可用，使用规则候选',status:'completed'}]]){
 const f=fixture();f.context.result.source='rules';f.context.result.agent.steps=clone(steps);f.context.result.fallback={reason:'测试模型不可用'};await f.run('buildCandidate()');f.timers.drain();
 const preview=f.get('#candidatepreview');assert.equal(visible(preview),steps.length);assert(preview.innerHTML.includes('规则候选'));assert(preview.innerHTML.includes('测试模型不可用'));assert.equal(f.context.applyCalls,0);assert.equal(JSON.stringify(f.context.fixtureDraft),f.initialDraft);
}

function reorderFixture(){
 const f=fixture();vm.runInContext('let planningBusy=false,comparisonRecord=null;'+reorderStopsSource+'\n'+reorderSource,f.context);
 f.get('#days').value='2';f.get('#maxhours').value='6';f.get('#restmins').value='30';
 f.context.compactDraft=()=>({...clone(f.context.fixtureDraft),stops:clone(f.context.trip)});f.context.comparisonHTML=()=>'<p>Fixture comparison</p>';f.context.renderOverview=()=>{};
 f.context.result.stops=[{id:f.context.trip[0].place.id,day:2}];f.context.result.note='返回的安排说明';
 return f;
}

{
 const f=reorderFixture(),before=JSON.stringify(f.context.trip);await f.run('generate()');const advice=f.get('#advicebody');
 assert.equal(f.requests[0].path,'/api/agent');assert.equal(f.requests[0].body.operation,'reorder');assert.equal(visible(advice),1);assert(f.get('#apply').disabled);assert.equal(JSON.stringify(f.context.trip),before,'Reorder must remain a candidate during playback');
 advice.querySelector('[data-agent-replay-skip]').onclick();assert.equal(visible(advice),3);assert(!f.get('#apply').disabled);assert.equal(JSON.stringify(f.context.trip),before,'Skipping playback must not apply the reorder');
 f.get('#apply').onclick();assert.equal(f.context.trip[0].day,2);assert.equal(f.context.checkpoints,1);assert.equal(f.get('#advice').open,false);
}

{
 const f=reorderFixture(),before=JSON.stringify(f.context.trip);await f.run('generate()');const advice=f.get('#advicebody'),apply=f.get('#apply').onclick,stale=f.timers.callback();f.get('#advice').close();
 assert.equal(f.timers.timers.size,0);stale?.();assert.equal(visible(advice),1);assert(f.get('#apply').disabled);apply();assert.equal(JSON.stringify(f.context.trip),before,'Closing a reorder dialog during playback must retain the current itinerary');assert.equal(f.context.checkpoints,0);
}

console.log('Passed: agent step order and escaping, honest statuses, fake-clock replay, skip, cancel and stale callbacks, reduced motion, empty/rule fallback, initial empty dialog, in-flight invalidation, and confirmation-only selection/reorder changes. API responses are mocked.');

// Streaming transport tests run the same browser source as the legacy replay
// cases above. Each event is supplied by a controllable, real ReadableStream.
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve()};
const encoder=new TextEncoder();
function sseFixture(options={}){
 const f=fixture(options),calls=[];f.context.AbortController=AbortController;f.context.TextDecoder=TextDecoder;
 const names=['需求理解','地点推荐','日程编排','交通核算','冲突校验'],sources=['confirmed','ai','rules','ai','rules'];
 f.context.result.source='agent-mixed';f.context.result.agents=names.map((name,index)=>({name,source:sources[index],provider:sources[index]==='ai'?'Mock model':null}));
 f.context.result.agent.steps=names.map((name,index)=>({tool:name+'智能体',label:name+'实际执行记录 <标签> '+index,status:'completed',source:sources[index]}));f.context.result.agent.modelCalls=4;
 let streamController,cancelled=0;
 const stream=new ReadableStream({start(controller){streamController=controller},cancel(){cancelled++}});
 const response={ok:true,status:200,headers:{get:()=> 'text/event-stream; charset=utf-8'},body:stream};
 f.context.fetch=async(path,options)=>{calls.push({path,...options});return response};
 function send(type,data){streamController.enqueue(encoder.encode('event: '+type+'\r\ndata: '+JSON.stringify(data)+'\r\n\r\n'))}
 function start(index){send('start',{tool:names[index-1]+'智能体',index,total:5,modelCalls:Math.max(0,index-2)})}
 function progress(index){send('progress',{index,total:5,modelCalls:index-1})}
 function step(index){send('step',{...clone(f.context.result.agent.steps[index-1]),index,total:5,modelCalls:index-1})}
 function completeStep(index){start(index);progress(index);step(index)}
 return {...f,calls,response,send,start,progress,step,completeStep,streamController,get cancelled(){return cancelled}};
}
const jsonResponse=result=>({ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>clone(result)});

{
 const f=sseFixture(),before=JSON.stringify(f.context.fixtureDraft),pending=f.run('buildCandidate()');await settle();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].headers.Accept,'text/event-stream');assert.equal(JSON.parse(f.calls[0].body).operation,'select');
 assert.equal(visible(f.get('#candidatepreview')),0);assert.match(f.get('#candidatepreview').innerHTML,/正在连接智能体服务/);assert(!f.get('#candidatepreview').innerHTML.includes('第 1/5'),'No agent index is invented before start');
 f.start(1);await settle();assert.match(f.get('#candidatepreview').innerHTML,/需求理解智能体运行中…/);assert.match(f.get('#candidatepreview').innerHTML,/第 1\/5 个智能体 · 模型调用 0 次/);assert.equal(visible(f.get('#candidatepreview')),0,'Start is not a completed step');
 f.progress(1);f.step(1);await settle();assert.equal(visible(f.get('#candidatepreview')),1);assert.match(f.get('#candidatepreview').innerHTML,/已确认条件/);assert(!f.get('#candidatepreview').innerHTML.includes('id="applycandidate"'));
 for(let index=2;index<=5;index++){f.completeStep(index);await settle();assert.equal(visible(f.get('#candidatepreview')),index,'Only actual received steps are visible')}
 assert(!f.get('#candidatepreview').innerHTML.includes('id="applycandidate"'),'Even five steps cannot unlock application before done');assert.equal(f.context.applyCalls,0);assert.equal(JSON.stringify(f.context.fixtureDraft),before);
 f.send('done',clone(f.context.result));await pending;
 const preview=f.get('#candidatepreview');assert.equal(visible(preview),5);assert.equal(f.timers.timers.size,0,'A complete live stream must not start post-response replay');assert(!f.get('#applycandidate').disabled);assert.match(preview.innerHTML,/AI 生成/);assert.match(preview.innerHTML,/规则回退/);assert.match(preview.innerHTML,/已确认条件/);assert(!preview.innerHTML.includes('<标签>'));assert(!preview.innerHTML.includes('四智能体'));assert(!preview.innerHTML.includes('本次规则候选的执行记录'),'Mixed AI results must not be labelled all rules');assert.equal(f.context.applyCalls,0);
 await f.get('#applycandidate').onclick();assert.equal(f.context.applyCalls,1,'A live result still requires explicit confirmation');
}

{
 const f=sseFixture(),pending=f.run('buildCandidate()');await settle();
 // Unknown events/comments and multiline data are legal SSE; every byte can
 // arrive separately, including the bytes inside a Chinese character.
 let text=': keep-alive\r\nevent: diagnostic\r\ndata: not-json\r\n\r\n';
 for(let index=1;index<=5;index++){
  text+='event: start\r\ndata: '+JSON.stringify({tool:f.context.result.agent.steps[index-1].tool,index,total:5,modelCalls:Math.max(0,index-2)})+'\r\n\r\n';
  const value=JSON.stringify({...f.context.result.agent.steps[index-1],index,total:5,modelCalls:index-1});
  const split=value.indexOf(',');text+='event: step\r\ndata: '+value.slice(0,split+1)+'\r\ndata: '+value.slice(split+1)+'\r\n\r\n';
 }
 text+='event: done\r\ndata: '+JSON.stringify(f.context.result)+'\r\n\r\n';
 for(const byte of encoder.encode(text))f.streamController.enqueue(Uint8Array.of(byte));
 await pending;assert.equal(f.calls.length,1,'Split UTF-8, split CRLF and multiline data must not trigger fallback');assert.equal(visible(f.get('#candidatepreview')),5);assert(!f.get('#applycandidate').disabled);
}

{
 const f=sseFixture();f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return jsonResponse(f.context.result)};await f.run('buildCandidate()');
 assert.equal(f.calls.length,1,'A complete JSON response to Accept SSE is reused without another model request');assert.equal(visible(f.get('#candidatepreview')),1);assert(f.get('#applycandidate').disabled);f.timers.drain();assert(!f.get('#applycandidate').disabled);
}

for(const failure of ['eof','malformed','server-error','inconsistent-done','unsupported-reader']){
 const f=sseFixture();let count=0;f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return ++count===1?(failure==='unsupported-reader'?{...f.response,body:null}:f.response):jsonResponse(f.context.result)};
 const pending=f.run('buildCandidate()');await settle();
 if(failure==='eof'){f.completeStep(1);await settle();f.streamController.close()}
 if(failure==='malformed')f.streamController.enqueue(encoder.encode('event: step\ndata: {\n\n'));
 if(failure==='server-error')f.send('error',{error:'测试上游中断',code:'UPSTREAM_ERROR'});
 if(failure==='inconsistent-done'){for(let index=1;index<=5;index++)f.completeStep(index);const result=clone(f.context.result);result.agent.steps[1].label='不同记录';f.send('done',result)}
 await pending;assert.equal(f.calls.length,2,failure+' triggers exactly one full-result fallback');assert.deepEqual(f.calls.map(call=>call.headers.Accept),['text/event-stream','application/json']);assert(f.calls[0].signal.aborted,'The first request is cancelled before a retry');
 const preview=f.get('#candidatepreview');assert.match(preview.innerHTML,/已重新获取完整结果/);assert.equal(visible(preview),1,'Partial prior steps are cleared; only the new result is replayed');assert(f.get('#applycandidate').disabled);assert.equal(f.context.applyCalls,0);f.timers.drain();assert(!f.get('#applycandidate').disabled);
}

{
 const f=sseFixture();let count=0;f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return ++count===1?f.response:{ok:false,status:503,json:async()=>({error:'完整结果也未生成'})}};
 const pending=f.run('buildCandidate()');await settle();f.completeStep(1);f.streamController.close();await pending;
 assert.equal(f.calls.length,2,'A failed fallback must not loop');assert.equal(f.get('#candidatepreview').innerHTML,'');assert(!f.get('#candidatepreview').innerHTML.includes('id="applycandidate"'));assert.equal(f.context.applyCalls,0);assert(f.messages.includes('完整结果也未生成'));
}

for(const status of [400,401,403,429]){
 const f=sseFixture();f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return {ok:false,status,json:async()=>({error:'认证或额度错误 '+status})}};await f.run('buildCandidate()');
 assert.equal(f.calls.length,1,'Authentication/quota errors must not be automatically retried');assert.equal(f.get('#candidatepreview').innerHTML,'');assert.equal(f.context.applyCalls,0);
}

for(const event of ['close','cancel','input','change']){
 const f=sseFixture(),pending=f.run('buildCandidate()');await settle();f.completeStep(1);await settle();assert.equal(visible(f.get('#candidatepreview')),1);
 if(event==='input'||event==='change'){f.context.fixtureIntent.budget=350;f.get('#briefbody').dispatch(event,{id:'briefbudget',dataset:{},matches:()=>true,closest:()=>null})}else f.get('#brief').dispatch(event);
 await pending;assert(f.calls[0].signal.aborted);assert.equal(f.calls.length,1,event+' cancellation must not restart generation');assert.equal(f.get('#candidatepreview').innerHTML,'');assert.equal(f.context.applyCalls,0);assert.equal(f.messages.length,0,'Intentional cancellation is silent');assert(f.cancelled>0);
}

{
 const f=sseFixture({reducedMotion:true}),pending=f.run('buildCandidate()');await settle();f.completeStep(1);await settle();assert.equal(visible(f.get('#candidatepreview')),1,'Reduced motion still must not invent future steps');assert(!f.get('#candidatepreview').innerHTML.includes('agent-step-reveal'));
 for(let index=2;index<=5;index++)f.completeStep(index);f.send('done',clone(f.context.result));await pending;assert.equal(visible(f.get('#candidatepreview')),5);assert.equal(f.timers.timers.size,0);assert(!f.get('#applycandidate').disabled);
}

{
 const f=sseFixture(),pending=f.run('buildCandidate()');await settle();f.completeStep(1);await settle();f.context.fixtureDraft.stops[0].duration=120;f.completeStep(2);await pending;
 assert.equal(f.calls.length,1,'Stale draft is not retried');assert.equal(f.context.applyCalls,0);assert.equal(f.get('#candidatepreview').innerHTML,'');
}

console.log('Passed: incremental POST SSE before done, real start/call counters and mixed sources, UTF-8/CRLF/multiline/unknown frames, confirmation gate, JSON reuse, one fallback on EOF/error/malformed/unsupported stream, no auth/quota retry, failed fallback, cancellation/stale drafts, and reduced-motion live updates. No upstream services called.');

for(const status of [406,415,501,502,503,504]){
 const f=sseFixture();let count=0;f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return ++count===1?{ok:false,status,json:async()=>({error:'实时服务不可用'})}:jsonResponse(f.context.result)};await f.run('buildCandidate()');assert.equal(f.calls.length,2,'Unsupported SSE or temporary proxy failure falls back once');f.timers.drain();assert(!f.get('#applycandidate').disabled);
}

{
 const f=sseFixture(),answers=[];f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return new Promise(resolve=>answers.push(resolve))};
 const oldRequest=f.run('buildCandidate()');await settle();f.context.fixtureIntent.budget=350;f.get('#briefbody').dispatch('input',{id:'briefbudget',dataset:{},matches:()=>true,closest:()=>null});const newRequest=f.run('buildCandidate()');await settle();
 const newer=clone(f.context.result);newer.summary='新一轮真实返回';answers[1](jsonResponse(newer));await newRequest;f.timers.drain();const html=f.get('#candidatepreview').innerHTML;assert(html.includes(newer.summary));
 answers[0](jsonResponse(f.context.result));await oldRequest;assert.equal(f.calls.length,2,'A stale aborted fetch must not cause a third fallback request');assert(f.calls[0].signal.aborted);assert.equal(f.get('#candidatepreview').innerHTML,html,'A late cancelled transport cannot replace a newer candidate');assert.equal(f.context.applyCalls,0);
}

{
 const f=sseFixture({reducedMotion:true});f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return jsonResponse(f.context.result)};await f.run('buildCandidate()');assert.equal(f.calls.length,1);assert.equal(visible(f.get('#candidatepreview')),5);assert.equal(f.timers.timers.size,0,'Reduced-motion JSON fallback keeps immediate full replay');assert(!f.get('#applycandidate').disabled);
}

{
 const f=sseFixture();let count=0;f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return ++count===1?f.response:jsonResponse(f.context.result)};
 const pending=f.run('buildCandidate()');await settle();f.completeStep(1);await settle();assert.equal(visible(f.get('#candidatepreview')),1);assert.equal(f.timers.timers.size,1);
 f.timers.tick();assert.equal(f.timers.now,125000,'A stalled SSE transport is bounded at 120 seconds plus delivery margin');await pending;
 assert.equal(f.calls.length,2,'Stall causes exactly one JSON fallback');assert(f.calls[0].signal.aborted);assert(f.cancelled>0,'Deadline cancels the original stream reader');assert.equal(visible(f.get('#candidatepreview')),1,'Fallback replays its own complete result');assert(f.get('#applycandidate').disabled);f.timers.drain();assert(!f.get('#applycandidate').disabled);assert.equal(f.timers.timers.size,0,'All transport/replay timers are cleaned');
}

{
 const f=sseFixture();let count=0;f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return ++count===1?f.response:{...jsonResponse(f.context.result),json:()=>new Promise(()=>{})}};
 const pending=f.run('buildCandidate()');await settle();f.timers.tick();await settle();assert.equal(f.calls.length,2);assert.equal(f.timers.timers.size,1,'The JSON fallback gets its own bounded delivery timer');
 f.timers.tick();await pending;assert.equal(f.timers.now,250000);assert.equal(f.calls.length,2,'A stalled JSON body does not trigger another retry');assert(f.calls[1].signal.aborted);assert.equal(f.timers.timers.size,0);assert.equal(f.get('#candidatepreview').innerHTML,'');assert(f.messages.some(message=>/超时/.test(message)));assert.equal(f.context.applyCalls,0);
}

{
 const f=sseFixture();f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return new Promise(()=>{})};const pending=f.run('buildCandidate()');await settle();assert.equal(f.calls.length,1);assert.equal(f.timers.timers.size,1);f.get('#brief').close();await pending;
 assert.equal(f.calls.length,1,'User cancellation while awaiting headers never starts fallback');assert(f.calls[0].signal.aborted);assert.equal(f.timers.timers.size,0);assert.equal(f.messages.length,0);assert.equal(f.get('#candidatepreview').innerHTML,'');
}

for(const mismatch of ['source','name','length']){
 const f=sseFixture();let count=0;f.context.fetch=async(path,options)=>{f.calls.push({path,...options});return ++count===1?f.response:jsonResponse(f.context.result)};const pending=f.run('buildCandidate()');await settle();for(let index=1;index<=5;index++)f.completeStep(index);
 const bad=clone(f.context.result);bad.summary='不得展示的矛盾结果';if(mismatch==='source')bad.agents[1].source='rules';if(mismatch==='name')bad.agents[1].name='错误智能体';if(mismatch==='length')bad.agents.pop();f.send('done',bad);await pending;
 assert.equal(f.calls.length,2,'Conflicting final agent '+mismatch+' must trigger the one safe fallback');assert(!f.get('#candidatepreview').innerHTML.includes(bad.summary));assert(f.get('#applycandidate').disabled);assert.equal(f.context.applyCalls,0);f.timers.drain();assert(!f.get('#applycandidate').disabled);
}

{
 const f=sseFixture(),pending=f.run('buildCandidate()');await settle();for(let index=1;index<=5;index++)f.completeStep(index);const compatible=clone(f.context.result);compatible.agent.steps.forEach(step=>delete step.source);f.send('done',compatible);await pending;
 assert.equal(f.calls.length,1,'Older final steps may obtain their matching source from the returned agents');assert.match(f.get('#candidatepreview').innerHTML,/AI 生成/);assert.match(f.get('#candidatepreview').innerHTML,/规则回退/);assert(!f.get('#applycandidate').disabled);assert.equal(f.timers.timers.size,0);
}
console.log('Passed: bounded stalled-SSE and stalled-JSON transport attempts, timeout versus user abort, timer cleanup, final pipeline/source/name consistency, and legacy final-step source compatibility.');
