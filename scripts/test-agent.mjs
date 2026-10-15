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

// ---------- /api/agent 端点：4 智能体 ----------
const post=(path,body,env,auth=true)=>worker.fetch(new Request('https://agent.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{'oai-authenticated-user-id':'fixture'}:{})},body:JSON.stringify(body)}),env||{});
const fetchOriginal=globalThis.fetch;
const seed={operation:'select',city:'洛阳',days:2,start:'09:00',mode:'driving',maxHours:6,restMinutes:30,stops:[],decision:{intent:{city:'洛阳',days:2,interests:['culture'],requiredIds:['hn-longmen'],excludedIds:['hn-whitehorse'],budget:500},expenses:{tickets:999}}};
// 无模型：一句话入口走规则 4 智能体，匿名可用
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
 assert.deepEqual(b.agents.map(a=>a.name),['需求理解','地点推荐','日程编排','冲突校验']);
 assert(b.agents.every(a=>a.source==='rules'));
 assert(b.draft&&Array.isArray(b.draft.stops)&&b.draft.stops.length===b.stops.length,'draft must be frontend-compatible');
 assert(Array.isArray(b.agent.steps)&&b.agent.steps.length===4,'replay steps must mirror the 4 agents');
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
// 有模型：四个智能体协作；冲突时校验智能体做取舍
const modelEnv={LLM_API_KEY:'synthetic-agent-token',LLM_BASE_URL:'https://maas-api.cn-huabei-1.xf-yun.com/v1',LLM_MODEL:'spark-x2.5'};
const luoyang5=CATALOG.filter(p=>p.city==='洛阳').slice(0,5).map(p=>p.id);
const luoyangAllowed=luoyang5.filter(id=>id!=='hn-whitehorse');
const mockAgent=(overrides={})=>async(_,options)=>{
 const sys=JSON.parse(options.body).messages[0].content;
 if(sys.includes('冲突校验智能体'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(overrides.audit||{cuts:[{id:luoyangAllowed[3],reason:'与其他地点兴趣重叠且导致超时'}],note:'去掉一处以满足每天时长'})}}]}));
 if(sys.includes('日程编排智能体'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(overrides.schedule||{dayPlan:luoyangAllowed.map((id,i)=>({id,day:i<3?1:2}))})}}]}));
 if(sys.includes('行程规划智能体'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(overrides.recommend||{selections:luoyangAllowed.map(id=>({id,duration:180})),rationale:[{decision:'选择：龙门石窟',reason:'必去'}],unresolved:[]})}}]}));
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({fields:{city:'洛阳',days:2,mode:null,maxHours:null,restMinutes:null,budget:200,avoidCrossCity:null,interests:['culture'],requiredIds:['hn-longmen'],excludedIds:[],excludedModes:[]},unresolved:[]})}}]}));
};
try{
 // 全 AI：一句话入口
 globalThis.fetch=mockAgent();
 const r=await post('/api/agent',{text:'洛阳两天，人均预算200，必去龙门石窟'},modelEnv);
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.source,'agent-ai');assert.equal(b.intent.city,'洛阳');assert.equal(b.intent.budget,200);
 assert.deepEqual(b.agents.map(a=>a.name),['需求理解','地点推荐','日程编排','冲突校验']);
 assert(b.agents.every(a=>a.source==='ai'),'every agent should run on the model');
 assert(b.agents[0].provider.includes('讯飞星火'));
 assert(b.stops.some(s=>s.id==='hn-longmen'),'required place must survive cuts');
 assert(b.rationale.some(x=>x.decision.startsWith('取舍：去掉')),'cut must be recorded with reason');
 assert(b.defaulted.some(s=>s.includes('智能体决定')));
 assert.equal(b.agent.modelCalls,4,'perceive+decide+schedule+audit = 4 model calls');
 assert(b.draft&&b.draft.stops.length===b.stops.length);
 // operation 入口：已确认条件 + 模型做 2/3/4 号智能体
 globalThis.fetch=mockAgent({audit:{cuts:[],note:'无'}});
 const r2=await post('/api/agent',seed,modelEnv);
 assert.equal(r2.status,200);const b2=await r2.json();
 assert.equal(b2.source,'agent-mixed');
 assert.equal(b2.agents[0].source,'confirmed');
 assert.equal(b2.agents[1].source,'ai');
 assert(b2.stops.some(s=>s.id==='hn-longmen'));
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
 // 匿名用户：感知配额拒绝 → 规则智能体兜底，功能可用
 globalThis.fetch=async()=>{throw Error('Anonymous calls must not spend model credits')};
 const anon=await post('/api/agent',{text:'开封两天'},modelEnv,false);
 assert.equal(anon.status,200);const an=await anon.json();
 assert.equal(an.source,'agent-rules');assert(an.fallback&&an.fallback.reason);assert(an.stops.length>0);
}finally{globalThis.fetch=fetchOriginal}
// 空输入与超长输入
assert.equal((await post('/api/agent',{text:''})).status,400);
assert.equal((await post('/api/agent',{text:'x'.repeat(601)})).status,400);
// 非法 operation
assert.equal((await post('/api/agent',{...seed,operation:'execute'})).status,400);

// ---------- 前端：4 智能体流水线与决策依据渲染 ----------
const decisionSrc=await readFile(new URL('../decision.js',import.meta.url),'utf8');
for(const needle of ['function agentSourceChip','function agentPipelineHTML','function agentRationaleHTML',"api('/api/agent'",'agent-pipeline','agent-rationale'])assert(decisionSrc.includes(needle),'decision.js must contain '+needle);
const cssSrc=await readFile(new URL('../decision.css',import.meta.url),'utf8');
for(const needle of ['.agent-pipeline','.agent-rationale','.agent-rationale-title'])assert(cssSrc.includes(needle),'decision.css must contain '+needle);

console.log('Passed: 4-agent rules core (defaults/selection), /api/agent text+operation paths, AI orchestration with per-agent fallback, anonymous+quota paths, frontend pipeline/rationale rendering. Model responses in this test are mocked.');
