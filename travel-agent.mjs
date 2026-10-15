// Bundled after decision-core.mjs. Four-agent pipeline: 需求理解→地点推荐→日程编排→冲突校验.
// The model makes the key decisions; programs validate and audit. Tools never execute model code.
const AGENT_LIMITS=Object.freeze({modelCalls:6,toolCalls:0,mapCalls:0,timeoutMs:120000});
const agentError=message=>{throw Error(message)};
const agentNote='AI 智能体选择地点和安排，程序核对条件；交通只采用已确认定位的高德查询，票价、预约和营业仍需出发前确认。';
export function agentContext(raw){
 if(!raw||!['select','reorder'].includes(raw.operation))agentError('请选择生成新行程或重排已有行程');
 const draft={...validateDraft(raw),city:DECISION_CITIES.includes(raw.city)?raw.city:'河南',mode:['walking','driving','transit'].includes(raw.mode)?raw.mode:'driving',maxHours:[6,8,10].includes(raw.maxHours)?raw.maxHours:8,restMinutes:[0,30,60].includes(raw.restMinutes)?raw.restMinutes:30,presetId:null,decision:validateDecisionState(raw.decision||{},raw.stops)};
 const intent=validateIntent({...draft.decision.intent,city:draft.decision.intent.city||draft.city,days:draft.days,mode:draft.mode,maxHours:draft.maxHours,restMinutes:draft.restMinutes});
 draft.decision={...draft.decision,intent,...(raw.operation==='select'?{expenses:validateDecisionState().expenses}:{})};
 if(raw.operation==='reorder'&&!draft.stops.length)agentError('请先加入地点');
 const allowed=raw.operation==='reorder'?draft.stops.map(s=>s.place):CATALOG.filter(p=>p.planningEligible!==false&&!intent.excludedIds.includes(p.id)&&(intent.city==='河南'||p.city===intent.city));
 if(raw.operation==='select'){
  if(!allowed.length)agentError('该城市暂无可规划的目录地点，请在地图中选点');
  for(const id of intent.requiredIds)if(!allowed.some(p=>p.id===id))agentError('必去地点不在当前城市可规划目录内，请核对开放状态、排除条件或选择河南多城');
 }
 return {operation:raw.operation,draft,intent,allowed};
}
export function agentPlanDraft(context,items,seen=null){
 if(!Array.isArray(items)||!items.length||items.length>15)agentError('行程必须包含 1–15 个地点');
 const {draft,intent,allowed,operation}=context;
 if(operation==='reorder')return {...draft,stops:validatePlan(items,draft).map(s=>({...draft.stops.find(x=>x.place.id===s.id),day:s.day}))};
 const ids=new Set(),stops=items.map(s=>{
  if(!s||typeof s.id!=='string'||ids.has(s.id)||!Number.isInteger(s.day)||s.day<1||s.day>draft.days)agentError('智能体返回了重复地点或无效日期');
  const place=allowed.find(p=>p.id===s.id);if(!place||(seen&&!seen.has(s.id)))agentError('智能体选了未查询、已排除或不在目的地内的地点');
  const duration=s.duration??place.duration??90;if(!Number.isInteger(duration)||duration<15||duration>720)agentError('智能体停留时长必须为 15–720 分钟');
  ids.add(s.id);return {place,day:s.day,duration};
 });
 if(intent.requiredIds.some(id=>!ids.has(id)))agentError('智能体遗漏了必去地点');
 return {...draft,stops};
}
export function agentRuleResult(context,reason='未连接模型，本次使用规则候选',steps=[]){
 const {draft,intent,allowed,operation}=context;
 let seed=draft;
 if(operation==='select'){
  const score=p=>intent.interests.reduce((n,t)=>n+(p.interests?.includes(t)||t==='culture'&&/文化|历史|博物|石窟|古城|寺|古都/.test(p.theme+' '+p.name)||t==='nature'&&/山|峡|自然|水|湖/.test(p.theme)||t==='food'&&p.category==='food'||t==='immersive'&&/演艺|戏剧|夜游|武侠|电影|宋韵/.test(p.theme)?3:0),0);
  const required=allowed.filter(p=>intent.requiredIds.includes(p.id)),ranked=[...allowed].sort((a,b)=>score(b)-score(a)||Number(Boolean(b.weekendPick))-Number(Boolean(a.weekendPick)));
  const places=[...new Map([...required,...ranked].map(p=>[p.id,p])).values()].slice(0,Math.min(15,Math.max(required.length,draft.days*2)));
  seed={...draft,stops:places.map(place=>({place,day:1,duration:place.duration||90}))};
 }
 const result=agentPlanDraft({...context,draft:seed,operation:'reorder'},rulePlan(seed));result.decision.source='rules';
 return {source:'rules',draft:result,stops:result.stops.map(s=>({id:s.place.id,day:s.day})),audit:auditDecision(result),note:'规则候选按主题、城市与停留负荷生成，交通和费用仍需确认。',tips:['预约、营业与实际费用尚未核实。'],fallback:{reason},agent:{status:'fallback',version:1,steps:[...steps,{tool:'fallback',status:'pending',label:reason}],modelCalls:0,toolCalls:steps.length,limits:AGENT_LIMITS}};
}
