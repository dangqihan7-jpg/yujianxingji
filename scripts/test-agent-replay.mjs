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
