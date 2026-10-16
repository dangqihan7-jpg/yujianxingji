import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import worker,{CATALOG,applyAgentDefaults,agentSelectRules,agentPlanRules,parseIntentRules,agentContext} from '../worker/index.js';

// ---------- 规则智能体核心 ----------
// 默认补全：未指定的条件全部由智能体决定，并逐条记录
const vague=applyAgentDefaults(parseIntentRules('想出去玩',CATALOG).fields,CATALOG);
assert.equal(vague.fields.days,2);assert.equal(vague.fields.maxHours,8);assert.equal(vague.fields.restMinutes,30);
assert.equal(vague.fields.mode,'driving');assert.equal(vague.fields.city,'河南');
assert.equal(vague.defaulted.length,5);assert(vague.defaulted.every(s=>s.includes('智能体决定')));
// 必去优先、排除生效、数量受控、依据非空
const decided=agentSelectRules(parseIntentRules('洛阳两天，必去龙门石窟，不去白马寺',CATALOG).fields,CATALOG);
assert(decided.selections.some(s=>s.id==='hn-longmen'),'required place must be selected');
assert(!decided.selections.some(s=>s.id==='hn-whitehorse'),'excluded place must not be selected');
assert(decided.selections.length<=15&&decided.selections.length>=2);
assert(decided.rationale.some(r=>r.decision.includes('必去：龙门石窟')));
assert(decided.rationale.some(r=>r.decision.startsWith('补默认条件')));
assert(decided.fields.city==='洛阳'&&decided.fields.days===2);
// 城市可由必去地点推断（直接给无城市的条件）
const inferred=agentSelectRules({city:null,days:2,mode:'driving',maxHours:8,restMinutes:30,budget:null,avoidCrossCity:null,interests:[],requiredIds:['hn-longmen'],excludedIds:[],excludedModes:[]},CATALOG);
assert.equal(inferred.fields.city,'洛阳');assert(inferred.defaulted.some(s=>s.includes('根据必去地点推断')));
// 无可选地点时诚实报错，不编造
assert.throws(()=>agentSelectRules({city:'洛阳',days:2,mode:'driving',maxHours:8,restMinutes:30,budget:null,avoidCrossCity:null,interests:[],requiredIds:[],excludedIds:CATALOG.filter(p=>p.city==='洛阳').map(p=>p.id),excludedModes:[]},CATALOG));
// 完整规则智能体：感知→决策→交付
const plan=agentPlanRules('洛阳两天，人均预算200，必去龙门石窟',CATALOG);
assert.equal(plan.source,'agent-rules');assert.equal(plan.intent.city,'洛阳');assert.equal(plan.intent.budget,200);
assert(plan.selections.some(s=>s.id==='hn-longmen'));
assert(plan.rationale.length>=plan.selections.length);
assert(Array.isArray(plan.unresolved));
assert.throws(()=>agentPlanRules('',''),'empty input must fail');
assert.throws(()=>agentPlanRules('x'.repeat(601),CATALOG),'oversize input must fail');

// ---------- /api/agent 端点：5 智能体 ----------
const post=(path,body,env,auth=true)=>worker.fetch(new Request('https://agent.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'oai-authenticated-user-id':'fixture'}:{})},body:JSON.stringify(body)}),env||{});
const fetchOriginal=globalThis.fetch;
const seed={operation:'select',city:'洛阳',days:2,start:'09:00',mode:'driving',maxHours:6,restMinutes:30,stops:[],decision:{intent:{city:'洛阳',days:2,interests:['culture'],requiredIds:['hn-longmen'],excludedIds:['hn-whitehorse'],budget:500},expenses:{tickets:999}}};
// 无模型：一句话入口走规则 5 智能体，匿名可用
{
 const r=await post('/api/agent',{text:'洛阳两天，必去龙门石窟'});
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.source,'agent-rules');assert.equal(b.intent.city,'洛阳');
 assert(b.stops.length>=2&&b.stops.length<=15);
 assert(b.stops.every(s=>s.day>=1&&s.day<=b.intent.days&&s.duration>=15&&s.duration<=720));
 assert.deepEqual(new Set(b.stops.map(s=>s.id)).size,b.stops.length,'no duplicated stops');
 assert(b.stops.some(s=>s.id==='hn-longmen'));
 assert(b.rationale.length>0&&b.defaulted.length>0);
 assert(b.audit&&Number.isInteger(b.audit.conflicts)&&Number.isInteger(b.audit.pending));
 assert(b.note.includes('确认后才会应用'));
 assert.deepEqual(b.agents.map(a=>a.name),['需求理解','地点推荐','日程编排','交通核算','冲突校验']);
 assert(b.agents.every(a=>a.source==='rules'));
 assert(b.draft&&Array.isArray(b.draft.stops)&&b.draft.stops.length===b.stops.length,'draft must be frontend-compatible');
 assert(Array.isArray(b.agent.steps)&&b.agent.steps.length===5,'replay steps must mirror the 5 agents');
}
// 无模型：operation 入口用已确认条件，需求理解标记为 confirmed
{
 const r=await post('/api/agent',seed);
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.source,'agent-rules');
 assert.equal(b.agents[0].source,'confirmed');
 assert(b.stops.some(s=>s.id==='hn-longmen'),'required place honored');
 assert(!b.stops.some(s=>s.id==='hn-whitehorse'),'excluded place honored');
 assert(b.draft.stops.every(s=>s.place&&s.place.id),'draft stops carry place objects');
}
// 有模型：五个智能体协作；冲突时校验智能体做取舍
const modelEnv={LLM_API_KEY:'synthetic-agent-token',LLM_BASE_URL:'https://maas-api.cn-huabei-1.xf-yun.com/v1',LLM_MODEL:'spark-x2.5',AMAP_WEB_SERVICE_KEY:'synthetic-map-key'};
const luoyang5=CATALOG.filter(p=>p.city==='洛阳').slice(0,5).map(p=>p.id);
const luoyangAllowed=luoyang5.filter(id=>id!=='hn-whitehorse');
const mockAgent=(overrides={})=>async(url,options={})=>{
 const urlStr=String(url);
 if(urlStr.includes('restapi.amap.com')){
  const u=new URL(urlStr);
  if(u.pathname.includes('/direction/')){
   if(overrides.amapFail)return new Response(JSON.stringify({status:'0',info:'MOCK_FAIL'}));
   return new Response(JSON.stringify({status:'1',route:{paths:[{duration:String(overrides.trafficMinutes!=null?overrides.trafficMinutes*60:1800),distance:'5000'}]}}));
  }
  return new Response(JSON.stringify({status:'1',pois:[]}));
 }
 const sys=JSON.parse(options.body).messages[0].content;
 if(sys.includes('交通核算智能体'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(overrides.traffic||{moves:[],cuts:[],note:'交通耗时在可接受范围'})}}]}));
 if(sys.includes('冲突校验智能体'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(overrides.audit||{cuts:[{id:luoyangAllowed[3],reason:'与其他地点兴趣重叠且导致超时'}],note:'去掉一处以满足每天时长'})}}]}));
 if(sys.includes('日程编排智能体'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(overrides.schedule||{dayPlan:luoyangAllowed.map((id,i)=>({id,day:i<3?1:2}))})}}]}));
 if(sys.includes('行程规划智能体'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(overrides.recommend||{selections:luoyangAllowed.map(id=>({id,duration:180})),rationale:[{decision:'选择：龙门石窟',reason:'必去'}],unresolved:[]})}}]}));
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({fields:{city:'洛阳',days:2,mode:null,maxHours:null,restMinutes:null,budget:200,avoidCrossCity:null,interests:['culture'],requiredIds:['hn-longmen'],excludedIds:[],excludedModes:[]},unresolved:[]})}}]}));
};
try{
 // 全 AI：一句话入口（含交通核算）
 for(const id of luoyangAllowed){const p=CATALOG.find(x=>x.id===id);p.routing={location:[112.45,34.62],address:'洛阳',confirmed:true}}
 globalThis.fetch=mockAgent();
 const r=await post('/api/agent',{text:'洛阳两天，人均预算200，必去龙门石窟'},modelEnv);
 for(const id of luoyangAllowed){const p=CATALOG.find(x=>x.id===id);delete p.routing}
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.source,'agent-ai');assert.equal(b.intent.city,'洛阳');assert.equal(b.intent.budget,200);
 assert.deepEqual(b.agents.map(a=>a.name),['需求理解','地点推荐','日程编排','交通核算','冲突校验']);
 assert(b.agents.every(a=>a.source==='ai'),'every agent should run on the model');
 assert(b.agents[0].provider.includes('讯飞星火'));
 assert(b.stops.some(s=>s.id==='hn-longmen'),'required place must survive cuts');
 assert(b.rationale.some(x=>x.decision.startsWith('取舍：去掉')),'cut must be recorded with reason');
 assert(b.defaulted.some(s=>s.includes('智能体决定')));
 assert.equal(b.agent.modelCalls,5,'perceive+decide+schedule+traffic+audit = 5 model calls');
 assert(b.draft&&b.draft.stops.length===b.stops.length);
 // operation 入口：已确认条件 + 模型做 2/3/4 号智能体
 globalThis.fetch=mockAgent({audit:{cuts:[],note:'无'}});
 const r2=await post('/api/agent',seed,modelEnv);
 assert.equal(r2.status,200);const b2=await r2.json();
 assert.equal(b2.source,'agent-mixed');
 assert.equal(b2.agents[0].source,'confirmed');
 assert.equal(b2.agents[1].source,'ai');
 assert(b2.stops.some(s=>s.id==='hn-longmen'));
 // 已确认条件不是规则回退；其余四步全 AI 时整体来源仍为 AI。
 for(const id of luoyangAllowed)CATALOG.find(p=>p.id===id).routing={location:[112.45,34.62],address:'洛阳',confirmed:true};
 try{
  globalThis.fetch=mockAgent({audit:{cuts:[],note:'无'}});
  const confirmedAI=await (await post('/api/agent',seed,modelEnv)).json();
  assert.equal(confirmedAI.agents[0].source,'confirmed');assert(confirmedAI.agents.slice(1).every(a=>a.source==='ai'));
  assert.equal(confirmedAI.source,'agent-ai','confirmed conditions must not turn an otherwise fully AI execution into mixed');assert.equal(confirmedAI.agent.modelCalls,4);
 }finally{for(const id of luoyangAllowed)delete CATALOG.find(p=>p.id===id).routing}
 // 编排智能体返回非法分日 → 该步骤回退规则，整体为混合，其余智能体不受影响
 globalThis.fetch=mockAgent({schedule:{dayPlan:[{id:luoyang5[0],day:1}]},audit:{cuts:[],note:'无'}});
 const mixed=await post('/api/agent',{text:'洛阳两天，必去龙门石窟'},modelEnv);
 assert.equal(mixed.status,200);const mb=await mixed.json();
 assert.equal(mb.source,'agent-mixed');
 assert.equal(mb.agents.find(a=>a.name==='日程编排').source,'rules');
 assert.equal(mb.agents.find(a=>a.name==='地点推荐').source,'ai');
 assert.equal(mb.stops.length,4,'rules scheduler must cover all selections');
 assert(mb.fallback&&mb.fallback.reason,'fallback reason must be reported');
 // 推荐智能体返回非法地点（编造 ID）→ 回退规则推荐并说明原因，必去仍保留
 globalThis.fetch=mockAgent({recommend:{selections:[{id:'invented-place',duration:60}],rationale:[],unresolved:[]},audit:{cuts:[],note:'无'}});
 const bad=await post('/api/agent',{text:'洛阳两天，必去龙门石窟'},modelEnv);
 assert.equal(bad.status,200);const bb=await bad.json();
 assert.equal(bb.agents.find(a=>a.name==='地点推荐').source,'rules');
 assert(bb.fallback&&bb.fallback.reason);
 assert(bb.stops.some(s=>s.id==='hn-longmen'),'fallback must still honor required places');
 // 交通核算智能体：高德返回耗时 → 模型判断并建议调日，理由记入决策依据
 for(const id of luoyangAllowed){const p=CATALOG.find(x=>x.id===id);p.routing={location:[112.45,34.62],address:'洛阳',confirmed:true}}
 globalThis.fetch=mockAgent({trafficMinutes:45,traffic:{moves:[{id:luoyangAllowed[1],day:2,reason:'第1天交通耗时过高，调到第2天更顺'}],cuts:[],note:'调日优化'},audit:{cuts:[],note:'无'}});
 const tr=await post('/api/agent',{text:'洛阳两天，必去龙门石窟'},modelEnv);
 assert.equal(tr.status,200);const tb=await tr.json();
 assert.equal(tb.agents.find(a=>a.name==='交通核算').source,'ai');
 assert(tb.traffic&&tb.traffic.days.some(d=>d.status==='ok'),'traffic data must be returned');
 assert(tb.traffic.days.find(d=>d.day===1).totalMinutes>0);
 assert(tb.rationale.some(x=>x.decision.startsWith('调日：')),'traffic move must be recorded with reason');
 assert(tb.stops.find(s=>s.id===luoyangAllowed[1]).day===2,'traffic move must be applied');
 for(const id of luoyangAllowed){const p=CATALOG.find(x=>x.id===id);delete p.routing}
 // 交通核算智能体：高德查不到 → 标 pending，模型不介入，不阻断
 globalThis.fetch=mockAgent({amapFail:true,audit:{cuts:[],note:'无'}});
 const tr2=await post('/api/agent',{text:'洛阳两天，必去龙门石窟'},modelEnv);
 assert.equal(tr2.status,200);const tb2=await tr2.json();
 assert.equal(tb2.agents.find(a=>a.name==='交通核算').source,'rules');
 assert(tb2.stops.length>0);
 // 匿名用户：感知配额拒绝 → 规则智能体兜底，功能可用
 globalThis.fetch=async()=>{throw Error('Anonymous calls must not spend model credits')};
 const anon=await post('/api/agent',{text:'开封两天'},modelEnv,false);
 assert.equal(anon.status,200);const an=await anon.json();
 assert.equal(an.source,'agent-rules');assert(an.fallback&&an.fallback.reason);assert(an.stops.length>0);
 const confirmedRules=await (await post('/api/agent',seed,modelEnv,false)).json();
 assert.equal(confirmedRules.agents[0].source,'confirmed');assert(confirmedRules.agents.slice(1).every(a=>a.source==='rules'));
 assert.equal(confirmedRules.source,'agent-rules','confirmed conditions plus rule fallback must not claim any model participation');assert.equal(confirmedRules.agent.modelCalls,0);
}finally{globalThis.fetch=fetchOriginal}
// 空输入与超长输入
assert.equal((await post('/api/agent',{text:''})).status,400);
assert.equal((await post('/api/agent',{text:'x'.repeat(601)})).status,400);
// 非法 operation
assert.equal((await post('/api/agent',{...seed,operation:'execute'})).status,400);

// ---------- SSE：增量交付、JSON 兼容、来源与尝试计数 ----------
const agentNames=['需求理解','地点推荐','日程编排','交通核算','冲突校验'];
const streamPost=(body,env={},options={})=>worker.fetch(new Request('https://agent.test/api/agent',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream',...(options.auth===false?{}:{'oai-authenticated-user-id':'fixture'})},body:JSON.stringify(body),...(options.signal?{signal:options.signal}:{})}),env);
const eventReader=response=>{
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 return {reader,async next(){
  for(;;){
   const end=buffer.indexOf('\n\n');
   if(end>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);const lines=frame.split('\n'),event=lines.find(v=>v.startsWith('event: '))?.slice(7),data=lines.filter(v=>v.startsWith('data: ')).map(v=>v.slice(6)).join('\n');if(event)return {event,data:JSON.parse(data)};continue}
   const chunk=await reader.read();if(chunk.done){assert.equal(buffer,'','no truncated SSE frame');return null}buffer+=decoder.decode(chunk.value,{stream:true});
  }
 }};
};
const allEvents=async response=>{const input=eventReader(response),events=[];for(let next;next=await input.next();)events.push(next);return events};
const waitUntil=async(input,predicate)=>{const seen=[];for(let item;item=await input.next();){seen.push(item);if(predicate(item))return seen}assert.fail('stream ended before expected event')};
const stages=events=>events.filter(v=>v.event==='step').map(v=>v.data);
const assertStages=(events,result)=>{
 const completed=stages(events);
 assert.equal(completed.length,5);assert.deepEqual(completed.map(v=>v.tool),agentNames.map(v=>v+'智能体'));
 assert.deepEqual(completed.map(v=>v.index),[1,2,3,4,5]);assert(completed.every(v=>v.total===5&&v.status==='completed'));
 assert.deepEqual(completed.map(v=>v.source),result.agents.map(v=>v.source));
 assert.deepEqual(completed.map(({tool,label,status,source})=>({tool,label,status,source})),result.agent.steps);
 assert.deepEqual(events.filter(v=>v.event==='start').map(v=>v.data.index),[1,2,3,4,5]);
 for(const step of completed){const at=events.findIndex(v=>v.event==='step'&&v.data.index===step.index);assert(events.slice(0,at).some(v=>v.event==='start'&&v.data.index===step.index),'start must precede completion')}
 const progress=events.filter(v=>v.event==='progress').map(v=>v.data.modelCalls);
 assert.deepEqual(progress,Array.from({length:result.agent.modelCalls},(_,i)=>i+1),'model counter increments at each actual attempt');
 assert(result.agent.modelCalls<=6);assert.equal(result.agent.limits.timeoutMs,120000);
};
try{
 // Rules text / confirmed-context streams have exactly the same full result as JSON.
 for(const body of [{text:'洛阳两天，必去龙门石窟'},seed]){
  const response=await streamPost(body);assert.equal(response.status,200);
  assert.match(response.headers.get('Content-Type'),/^text\/event-stream/);
  assert.match(response.headers.get('Cache-Control'),/no-transform/);assert.equal(response.headers.get('X-Accel-Buffering'),'no');
  const events=await allEvents(response),done=events.filter(v=>v.event==='done');assert.equal(done.length,1);assert.equal(events.at(-1).event,'done');
  const jsonBody=await (await post('/api/agent',body)).json();assert.deepEqual(done[0].data,jsonBody);assertStages(events,done[0].data);
 }
 // Mixed fallback remains truthful, and failed HTTP attempts count as calls.
 let attempts=0;
 globalThis.fetch=async(url,options)=>{if(String(url).includes('/chat/completions'))attempts++;return mockAgent({schedule:{dayPlan:[]},audit:{cuts:[],note:'无'}})(url,options)};
 const mixedEvents=await allEvents(await streamPost({text:'洛阳两天，必去龙门石窟'},modelEnv));
 const mixedDone=mixedEvents.at(-1).data;assertStages(mixedEvents,mixedDone);assert.equal(mixedDone.agent.modelCalls,attempts);
 assert.equal(stages(mixedEvents).find(v=>v.tool==='日程编排智能体').source,'rules');
 attempts=0;
 globalThis.fetch=async()=>{attempts++;throw Error('simulated private transport failure')};
 const failedEvents=await allEvents(await streamPost({text:'洛阳两天，必去龙门石窟'},modelEnv));
 const failedDone=failedEvents.at(-1).data;assertStages(failedEvents,failedDone);assert.equal(failedDone.agent.modelCalls,attempts);assert(attempts>=3);assert(failedDone.agents.every(v=>v.source==='rules'));
 // Denied quota/auth never starts an upstream HTTP attempt or inflates modelCalls.
 attempts=0;globalThis.fetch=async()=>{attempts++;throw Error('must not fetch')};
 const deniedEvents=await allEvents(await streamPost({text:'开封两天'},modelEnv,{auth:false}));
 assert.equal(attempts,0);assert.equal(deniedEvents.at(-1).data.agent.modelCalls,0);assertStages(deniedEvents,deniedEvents.at(-1).data);
 // A completed first stage is readable before the later model resolves: no response buffering.
 let releaseSecond,secondStarted;const reachedSecond=new Promise(resolve=>{secondStarted=resolve});let calls=0;
 const gate=new Promise(resolve=>{releaseSecond=resolve});
 globalThis.fetch=async(url,options={})=>{calls++;if(calls===2){secondStarted();await gate}return mockAgent({audit:{cuts:[],note:'无'}})(url,options)};
 const response=await streamPost({text:'洛阳两天，必去龙门石窟'},modelEnv),input=eventReader(response);
 const early=await waitUntil(input,v=>v.event==='start'&&v.data.index===2);await reachedSecond;
 assert.equal(stages(early).length,1);assert.equal(stages(early)[0].source,'ai');assert.equal(calls,2);
 releaseSecond();const rest=[];for(let item;item=await input.next();)rest.push(item);const completed=[...early,...rest];assert.equal(completed.at(-1).event,'done');assertStages(completed,completed.at(-1).data);
 // Consumer cancellation aborts the pending real request; no later agents/model/map calls begin.
 let cancellationSignal,cancelCalls=0,transportAborted=false;
 globalThis.fetch=async(_url,options={})=>{cancelCalls++;cancellationSignal=options.signal;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{transportAborted=true;reject(options.signal.reason)},{once:true}))};
 const cancelled=eventReader(await streamPost({text:'洛阳两天'},modelEnv));
 await waitUntil(cancelled,v=>v.event==='progress');await cancelled.reader.cancel();await new Promise(resolve=>setTimeout(resolve,0));
 assert(cancellationSignal.aborted);assert(transportAborted);assert.equal(cancelCalls,1);
 // An idle proxy receives only a transport comment; it creates no completed step or model attempt.
 const intervalOriginal=globalThis.setInterval,clearIntervalOriginal=globalThis.clearInterval,heartbeatCallbacks=new Map();
 globalThis.setInterval=(callback,milliseconds)=>{assert.equal(milliseconds,15000);const id={};heartbeatCallbacks.set(id,callback);return id};globalThis.clearInterval=id=>heartbeatCallbacks.delete(id);
 try{
  let heartbeatCalls=0;
  globalThis.fetch=async(_url,options={})=>{heartbeatCalls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))};
  const idle=eventReader(await streamPost({text:'洛阳两天'},modelEnv));await waitUntil(idle,v=>v.event==='progress');assert.equal(heartbeatCallbacks.size,1);
  heartbeatCallbacks.values().next().value();const comment=await idle.reader.read();assert.equal(new TextDecoder().decode(comment.value),': keep-alive\n\n');assert.equal(heartbeatCalls,1);
  await idle.reader.cancel();assert.equal(heartbeatCallbacks.size,0,'cancel must clear the transport interval');
  const normal=await allEvents(await streamPost({text:'洛阳两天',engine:'rules'}));assert.equal(normal.at(-1).event,'done');assert.equal(heartbeatCallbacks.size,0,'done must clear the transport interval');
  const disconnect=new AbortController(),disconnectInput=eventReader(await streamPost({text:'洛阳两天'},modelEnv,{signal:disconnect.signal}));await waitUntil(disconnectInput,v=>v.event==='progress');disconnect.abort();while(await disconnectInput.next()){}assert.equal(heartbeatCallbacks.size,0,'request abort/error must clear the transport interval');
 }finally{globalThis.setInterval=intervalOriginal;globalThis.clearInterval=clearIntervalOriginal}
 // Request abort (socket disconnect) closes with a terminal error, never a fake done/candidate.
 let requestCalls=0;
 globalThis.fetch=async(_url,options={})=>{requestCalls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))};
 const requestAbort=new AbortController(),aborted=eventReader(await streamPost({text:'洛阳两天'},modelEnv,{signal:requestAbort.signal}));
 const beforeAbort=await waitUntil(aborted,v=>v.event==='progress');requestAbort.abort();const afterAbort=[];for(let item;item=await aborted.next();)afterAbort.push(item);
 assert.equal(afterAbort.at(-1).event,'error');assert.deepEqual(afterAbort.at(-1).data,{error:'智能体请求已取消',code:'AGENT_CANCELLED'});assert(![...beforeAbort,...afterAbort].some(v=>v.event==='done'));assert.equal(requestCalls,1);
 // Cancellation during a map lookup aborts that lookup and never starts traffic/audit models afterward.
 let mapStarted,mapSignal,mapAttempts=0,modelAttempts=0;const mapReached=new Promise(resolve=>{mapStarted=resolve});
 for(const id of luoyangAllowed)CATALOG.find(p=>p.id===id).routing={location:[112.45,34.62],address:'洛阳',confirmed:true};
 try{
  globalThis.fetch=async(url,options={})=>{
   if(String(url).includes('restapi.amap.com')){mapAttempts++;mapSignal=options.signal;mapStarted();return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))}
   modelAttempts++;return mockAgent({audit:{cuts:[],note:'无'}})(url,options);
  };
  const mapAbort=new AbortController(),mapInput=eventReader(await streamPost({text:'洛阳两天，必去龙门石窟'},modelEnv,{signal:mapAbort.signal}));
  const beforeMap=await waitUntil(mapInput,v=>v.event==='start'&&v.data.index===4);await mapReached;mapAbort.abort();const afterMap=[];for(let item;item=await mapInput.next();)afterMap.push(item);
  assert(mapSignal.aborted);assert.equal(mapAttempts,1);assert.equal(modelAttempts,3);assert.equal(stages([...beforeMap,...afterMap]).length,3);assert.equal(afterMap.at(-1).event,'error');assert(!afterMap.some(v=>v.event==='done'||v.event==='start'&&v.data.index===5));
 }finally{for(const id of luoyangAllowed)delete CATALOG.find(p=>p.id===id).routing}
 // Trigger only the request's 120s timer without waiting 120 real seconds. Upstream stays mocked.
 const timerOriginal=globalThis.setTimeout;let triggerDeadline;
 globalThis.setTimeout=(callback,milliseconds,...args)=>milliseconds===120000?(triggerDeadline=callback,timerOriginal(()=>{},10000)):timerOriginal(callback,milliseconds,...args);
 try{
  let timeoutCalls=0,timeoutSignal;
  globalThis.fetch=async(_url,options={})=>{timeoutCalls++;timeoutSignal=options.signal;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}))};
  const timed=eventReader(await streamPost({text:'洛阳两天'},modelEnv));const beforeDeadline=await waitUntil(timed,v=>v.event==='progress');assert.equal(typeof triggerDeadline,'function');triggerDeadline();
  const afterDeadline=[];for(let item;item=await timed.next();)afterDeadline.push(item);
  assert.equal(afterDeadline.at(-1).event,'error');assert.deepEqual(afterDeadline.at(-1).data,{error:'智能体超过 120 秒总等待时间，请重试',code:'AGENT_TIMEOUT'});
  assert(![...beforeDeadline,...afterDeadline].some(v=>v.event==='done'));assert(timeoutSignal.aborted);assert.equal(timeoutCalls,1);
 }finally{globalThis.setTimeout=timerOriginal}
 const alreadyAborted=new AbortController();alreadyAborted.abort();
 const preAborted=await allEvents(await streamPost({text:'洛阳两天'},modelEnv,{signal:alreadyAborted.signal}));assert.deepEqual(preAborted.map(v=>v.event),['error']);assert.equal(preAborted[0].data.code,'AGENT_CANCELLED');
 // Invalid user input remains an ordinary 4xx JSON error, before any stream opens.
 for(const body of [{text:''},{text:'x'.repeat(601)},{...seed,operation:'execute'}]){
  const invalid=await streamPost(body);assert.equal(invalid.status,400);assert.match(invalid.headers.get('Content-Type'),/^application\/json/);assert((await invalid.json()).error);
 }
}finally{globalThis.fetch=fetchOriginal}

// ---------- 前端：5 智能体流水线与决策依据渲染 ----------
const decisionSrc=await readFile(new URL('../decision.js',import.meta.url),'utf8');
for(const needle of ['function agentSourceChip','function agentPipelineHTML','function agentRationaleHTML',"api('/api/agent'",'agent-pipeline','agent-rationale'])assert(decisionSrc.includes(needle),'decision.js must contain '+needle);
const cssSrc=await readFile(new URL('../decision.css',import.meta.url),'utf8');
for(const needle of ['.agent-pipeline','.agent-rationale','.agent-rationale-title'])assert(cssSrc.includes(needle),'decision.css must contain '+needle);

console.log('Passed: 5-agent rules core (defaults/selection), /api/agent text+operation paths, AI orchestration with per-agent fallback, traffic agent (AMap+model/pending paths), anonymous+quota paths, SSE incremental delivery and JSON parity, actual attempted calls, cancellation/deadline/error contracts, frontend pipeline/rationale rendering. Model responses in this test are mocked.');
