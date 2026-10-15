const DECISION_CITIES=['河南',...CITY_GUIDES.map(c=>c.name)];
const EXPENSE_KEYS=['tickets','food','lodging','transport','other'];
export function validateIntent(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('旅行条件格式不正确');
 const nullable=(key,valid)=>raw[key]==null||raw[key]===''?null:valid(raw[key])?raw[key]:(()=>{throw Error('旅行条件 '+key+' 不正确')})();
 const ids=key=>Array.isArray(raw[key])?[...new Set(raw[key].filter(v=>typeof v==='string'&&v.length<=100))].slice(0,15):[];
 const excludedIds=ids('excludedIds'),requiredIds=ids('requiredIds');
 if(requiredIds.some(id=>excludedIds.includes(id)))throw Error('同一地点不能同时设为必去和排除');
 const excludedModes=Array.isArray(raw.excludedModes)?[...new Set(raw.excludedModes.filter(v=>['driving','walking','transit'].includes(v)))]:[];
 const mode=nullable('mode',v=>['driving','walking','transit'].includes(v));if(mode&&excludedModes.includes(mode))throw Error('出行方式与排除条件冲突');
 return {city:nullable('city',v=>DECISION_CITIES.includes(v)),days:nullable('days',v=>[1,2,3,4,5,7].includes(v)),mode,maxHours:nullable('maxHours',v=>[6,8,10].includes(v)),restMinutes:nullable('restMinutes',v=>[0,30,60].includes(v)),budget:nullable('budget',v=>Number.isFinite(v)&&v>=0&&v<=100000),avoidCrossCity:typeof raw.avoidCrossCity==='boolean'?raw.avoidCrossCity:null,interests:Array.isArray(raw.interests)?[...new Set(raw.interests.filter(v=>['culture','nature','food','immersive','family'].includes(v)))].slice(0,5):[],requiredIds,excludedIds,excludedModes};
}
export function parseIntentRules(input,catalog){
 const t=String(input).normalize('NFKC').trim();if(!t||t.length>600)throw Error('请用 1–600 字描述旅行需求');
 let cities=[],city=null;
 // Capture the full number token before validation. Never start at the tail of a decimal or unit amount.
 const token='[+-]?(?:[0-9]+(?:[,.][0-9]+)*(?:[百千万亿]+)?|[零〇一二两三四五六七八九十百千万亿]+)';
 const number=value=>{
  if(/^[+-]?(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?(?:万|千)?$/.test(value))return Number(value.replace(/[万千,]/g,''))*(value.endsWith('万')?10000:value.endsWith('千')?1000:1);
  if(!/^[零〇一二两三四五六七八九十百千万]+$/.test(value))return NaN;
  const digits={'零':0,'〇':0,'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9},units={'十':10,'百':100,'千':1000};let total=0,section=0,digit=0;
  if(/^[零〇一二两三四五六七八九]+$/.test(value))return Number([...value].map(c=>digits[c]).join(''));
  for(const char of value){if(char in digits)digit=digits[char];else if(char==='万'){total+=(section+digit)*10000;section=0;digit=0}else{section+=(digit||1)*units[char];digit=0}}
  return total+section+digit;
 };
 const d=t.match(new RegExp('('+token+')\\s*天')),h=t.match(new RegExp('(?:每天|每日)[^0-9零〇一二两三四五六七八九十百千万亿，。；]{0,8}?('+token+')\\s*(?:个)?小时'));
 const budget=t.match(new RegExp('(?:人均|每人)?\\s*预算\\s*(?:为|是|约|不超过|以内|≤)?\\s*[¥￥]?\\s*('+token+')'))||t.match(new RegExp('人均\\s*[¥￥]?\\s*('+token+')\\s*元'));
 const clauses=t.split(/[，,。；;\n]/),excludedModes=[],positiveModes=[];
 // Negation applies to a coordinated mention group, not a fixed character window.
 // Explicit verbs or a new sentence end that group, allowing positive mentions afterwards.
 const classify=(clause,mentions,beforePattern,afterPattern)=>{
  const groups=[];
  for(const mention of mentions.sort((a,b)=>a.index-b.index||b.word.length-a.word.length)){
   const group=groups.at(-1),previous=group?.at(-1),gap=previous?clause.slice(previous.index+previous.word.length,mention.index):'';
   if(previous&&/^(?:\s|、|和|及|与|或|以及|还有|也|都)*$/.test(gap))group.push(mention);else groups.push([mention]);
  }
  return groups.flatMap(group=>{const first=group[0],last=group.at(-1),negative=beforePattern.test(clause.slice(0,first.index))||afterPattern.test(clause.slice(last.index+last.word.length));return group.map(item=>({...item,negative}))});
 };
 for(const clause of clauses){
  const mentions=[];
  for(const guide of CITY_GUIDES){const matches=[];for(const word of [guide.name,...guide.aliases]){let from=0,index;while((index=clause.indexOf(word,from))>=0){matches.push({value:guide.name,word,index});from=index+word.length}}mentions.push(...matches.filter(m=>!matches.some(other=>other.word.length>m.word.length&&other.index<=m.index&&other.index+other.word.length>=m.index+m.word.length)))}
  for(const mention of classify(clause,mentions,/(?:不去|不想去|不要去|不安排|不要|避开|排除|不考虑)\s*$/, /^\s*(?:都|也)?(?:不去|不去了|不要|不安排|排除)/))if(!mention.negative)cities.push(mention.value);
 }
 cities=[...new Set(cities)];city=cities.length===1?cities[0]:t.includes('河南')?'河南':null;
 for(const clause of clauses){
  const mentions=[];
  for(const [value,pattern]of [['transit',/公交|地铁|公共交通/g],['walking',/步行|走路/g],['driving',/自驾|打车|驾车/g]])for(const match of clause.matchAll(pattern))mentions.push({value,word:match[0],index:match.index});
  for(const mention of classify(clause,mentions,/(?:(?:不要|不想|不)(?:乘坐|坐|乘|选|用|走)?|排除|避免)\s*$/, /^\s*(?:都|也)?(?:(?:不要|不想|不)(?:乘坐|坐|乘|选|用|走)?|排除|避免)/)) (mention.negative?excludedModes:positiveModes).push(mention.value);
 }
 const mode=positiveModes.filter(v=>!excludedModes.includes(v)).at(-1)||null;
 const interests=[...(/博物|古城|古都|文化|历史|石窟|寺/.test(t)?['culture']:[]),...(/山水|自然|峡谷|爬山|登山|云海|金顶|茶园|茶乡|森林|瀑布|湖景/.test(t)?['nature']:[]),...(/美食|小吃|吃/.test(t)?['food']:[]),...(/武侠|演艺|演出|戏剧|电影|沉浸|夜游|互动/.test(t)?['immersive']:[]),...(/亲子|带娃|孩子|儿童|动物|乐园/.test(t)?['family']:[])];
 const requiredIds=[],excludedIds=[];
 for(const clause of clauses){
  const mentions=[];
  for(const place of catalog){const matches=[];for(const word of new Set([place.name,...(place.aliases||[])].filter(v=>typeof v==='string'&&v))){let from=0,index;while((index=clause.indexOf(word,from))>=0){matches.push({value:place.id,word,index});from=index+word.length}}mentions.push(...matches.filter(m=>!matches.some(other=>other.word.length>m.word.length&&other.index<=m.index&&other.index+other.word.length>=m.index+m.word.length)))}
  for(const mention of classify(clause,mentions,/(?:不去|不想去|不要去|不安排|不要|避开|排除|不考虑|取消)\s*$/, /^\s*(?:都|也)?(?:不去|不去了|不要|不安排|排除|取消)/)) (mention.negative?excludedIds:requiredIds).push(mention.value);
 }
 const budgetValue=budget?number(budget[1]):null,budgetSupported=budgetValue!=null&&Number.isFinite(budgetValue)&&budgetValue>=0&&budgetValue<=100000&&Math.abs(budgetValue*100-Math.round(budgetValue*100))<1e-7;
 if(!city&&!cities.length){const inferred=[...new Set(catalog.filter(p=>requiredIds.includes(p.id)&&!excludedIds.includes(p.id)).map(p=>p.city))];if(inferred.length===1)city=inferred[0]}
 const value={city,days:d&&[1,2,3,4,5,7].includes(number(d[1]))?number(d[1]):!d&&/周末/.test(t)?2:null,mode,maxHours:h&&[6,8,10].includes(number(h[1]))?number(h[1]):!h&&/慢游|轻松|长辈/.test(t)?6:null,restMinutes:/休息.{0,4}(?:半小时|30分钟)/.test(t)?30:/休息.{0,4}(?:一小时|60分钟)/.test(t)?60:/不.{0,2}休息/.test(t)?0:null,budget:budgetSupported?budgetValue:null,avoidCrossCity:/不跨城|只.{0,2}一个城市/.test(t)||CITY_GUIDES.some(c=>[c.name,...c.aliases].some(name=>t.includes('只玩'+name)))?true:null,interests,requiredIds:requiredIds.filter(id=>!excludedIds.includes(id)),excludedIds,excludedModes};
 const fields=validateIntent(value),unresolved=[];if(cities.length>1){fields.city='河南';unresolved.push('识别到多个城市，请确认是否接受跨城。')}if(/带长辈|少走|腿|爬山|无障碍/.test(t))unresolved.push('体力与无障碍条件尚需核对景区道路，不能仅凭文字保证。');
 if(d&&!fields.days)unresolved.push('识别到 '+(Number.isFinite(number(d[1]))?number(d[1]):d[1])+' 天；当前可选 1–5 天或 7 天，请手动确认天数。');
 if(h&&!fields.maxHours)unresolved.push('识别到每天 '+(Number.isFinite(number(h[1]))?number(h[1]):h[1])+' 小时；当前支持 6、8、10 小时，请手动确认。');
 if(excludedModes.length&&!mode)unresolved.push('已排除部分交通方式，请选择允许的出行方式。');
 if(budget&&fields.budget==null)unresolved.push('识别到预算 '+budget[1]+' 元，超过当前支持范围或格式无法确认，请手动确认。');
 return {fields,unresolved};
}
export function validateDecisionState(raw={},stops=[]){
 const intent=validateIntent(raw.intent||{});if([...intent.requiredIds,...intent.excludedIds].some(id=>!CATALOG.some(p=>p.id===id)&&!stops.some(s=>s.place.id===id)))throw Error('条件地点不在可用目录中');
 const expenses={};for(const k of EXPENSE_KEYS){const v=raw.expenses?.[k];if(v==null||v==='')expenses[k]=null;else if(Number.isFinite(v)&&v>=0&&v<=100000)expenses[k]=Math.round(v*100)/100;else throw Error('预算项目不正确')}
 const records=Array.isArray(raw.records)?raw.records.slice(-20).map(v=>{
  if(!v||!Number.isSafeInteger(v.startedAt)||!Number.isSafeInteger(v.endedAt)||v.startedAt<0||v.endedAt<v.startedAt||v.endedAt-v.startedAt>86400000||!Number.isInteger(v.edits)||v.edits<0||v.edits>10000||![1,2,3,4,5].includes(v.rating))throw Error('体验记录格式不正确');
  const baselineSeconds=Number.isFinite(v.baselineSeconds)&&v.baselineSeconds>0&&v.baselineSeconds<=86400?v.baselineSeconds:null;
  return {id:String(v.id||'').slice(0,60),task:String(v.task||'').slice(0,200),startedAt:v.startedAt,endedAt:v.endedAt,elapsedSeconds:Math.round((v.endedAt-v.startedAt)/1000),edits:v.edits,rating:v.rating,baselineSeconds,feedback:String(v.feedback||'').slice(0,500),source:['ai','rules','manual'].includes(v.source)?v.source:'manual',stops:Number.isInteger(v.stops)&&v.stops>=0&&v.stops<=15?v.stops:0,days:[1,2,3,4,5,7].includes(v.days)?v.days:2,unresolved:Number.isInteger(v.unresolved)&&v.unresolved>=0&&v.unresolved<=100?v.unresolved:0};
 }):[];
 return {intent,expenses,records,source:['ai','rules','manual'].includes(raw.source)?raw.source:'manual'};
}
export function auditDecision(draft,traffic=[]){
 const state=validateDecisionState(draft.decision||{},draft.stops),intent=state.intent,cap=(draft.maxHours||8)*60,rest=draft.restMinutes??30;
 const daily=Array.from({length:draft.days},(_,i)=>{const stops=draft.stops.filter(s=>s.day===i+1),t=traffic.find(t=>t.day===i+1),hasTraffic=stops.length<2||!!t,cities=[...new Set(stops.map(s=>s.place.city).filter(Boolean))];const visit=stops.reduce((n,s)=>n+s.duration,0),travel=t?.minutes??null,knownMinutes=visit+(stops.length?rest:0)+(travel||0),conflicts=[],pending=[];
  if(knownMinutes>cap)conflicts.push('已知安排超过上限 '+Math.ceil(knownMinutes-cap)+' 分钟');
  if(intent.city&&intent.city!=='河南'&&cities.some(c=>c!==intent.city))conflicts.push('目的地条件为 '+intent.city+'，当天含其他城市');
  if(intent.avoidCrossCity&&cities.length>1)conflicts.push('不跨城条件与当天 '+cities.join('、')+' 冲突');
  if(draft.mode==='transit'&&cities.length>1)pending.push('城际公共交通尚未核算');
  if(!hasTraffic)pending.push('站间交通待核算');if(stops.some(s=>s.place.city==null))pending.push('部分地点所属城市待确认');
  for(const stop of stops)pending.push(...(CATALOG.find(p=>p.id===stop.place.id)?.planningNotes||[]));
  const previousDay=Array.from({length:i},(_,j)=>j+1).reverse().find(day=>draft.stops.some(s=>s.day===day)),previousStops=previousDay?draft.stops.filter(s=>s.day===previousDay):[],previous=previousStops.at(-1),first=stops[0];
  if(first&&previous){if(!previous.place.city||!first.place.city)pending.push('与上一个游览日之间的交通与城市待确认');else if(previous.place.city!==first.place.city)pending.push('第 '+previousDay+' 天至第 '+(i+1)+' 天的 '+previous.place.city+' → '+first.place.city+' 城际交通尚未核算');}
  return {day:i+1,stops:stops.length,cities,visit,travel,knownMinutes,hasTraffic,conflicts,pending,status:conflicts.length?'conflict':pending.length?'pending':stops.length?'checked':'empty'};
 });
 const missing=EXPENSE_KEYS.filter(k=>state.expenses[k]==null),subtotal=EXPENSE_KEYS.reduce((n,k)=>n+Math.round((state.expenses[k]||0)*100),0)/100,budget={target:intent.budget,subtotal,missing,status:intent.budget!=null&&subtotal>intent.budget?'conflict':intent.budget==null||missing.length?'pending':'checked'};
 const missingRequired=intent.requiredIds.filter(id=>!draft.stops.some(s=>s.place.id===id)).map(id=>({id,name:CATALOG.find(p=>p.id===id)?.name||id}));
 const excludedPresent=draft.stops.filter(s=>intent.excludedIds.includes(s.place.id)).map(s=>({id:s.place.id,name:s.place.name})),modeConflict=intent.excludedModes.includes(draft.mode);
 const conflicts=missingRequired.length+excludedPresent.length+(modeConflict?1:0)+daily.reduce((n,d)=>n+d.conflicts.length,0)+(budget.status==='conflict'?1:0),pending=daily.reduce((n,d)=>n+d.pending.length,0)+(budget.status==='pending'?1:0);
 return {daily,budget,conflicts,pending,missingRequired,excludedPresent,modeConflict,locked:draft.stops.filter(s=>s.lockedDay).length,status:conflicts?'conflict':pending?'pending':'checked'};
}
// ---------- 智能体直接规划：感知→决策→校验→交付 ----------
// 与“条件提取→人工确认→候选→人工确认”不同：智能体替用户做出全部行程决策
// （城市、天数、每天时长、休息、出行方式、选点、分日、取舍），用户只做最终拍板。
// 每个默认和选择都记录依据 rationale；无法确定的写入 unresolved，不编造。
const AGENT_MODE_LABELS={driving:'驾车/打车',walking:'步行',transit:'公共交通'};
const AGENT_INTEREST_LABELS={culture:'文化',nature:'自然山水',food:'美食'};
function agentInterestHit(interest,place){
 const hay=(place.theme||'')+' '+place.name;
 if(interest==='culture')return /文化|历史|博物|石窟|古城|寺|古都/.test(hay);
 if(interest==='nature')return /山|峡|自然|水|湖/.test(hay);
 if(interest==='food')return place.category==='food';
 return false;
}
// 决策：把未指定的条件补上默认值，每一条都记为智能体的决定。
export function applyAgentDefaults(rawIntent,catalog){
 const fields=validateIntent(rawIntent||{}),defaulted=[];
 const places=Array.isArray(catalog)?catalog:(typeof CATALOG!=='undefined'?CATALOG:[]);
 if(fields.days==null){fields.days=2;defaulted.push('天数未指定，智能体决定：2 天（按周末默认）')}
 if(fields.maxHours==null){fields.maxHours=8;defaulted.push('每天时长未指定，智能体决定：8 小时')}
 if(fields.restMinutes==null){fields.restMinutes=30;defaulted.push('休息预留未指定，智能体决定：每天 30 分钟')}
 if(fields.mode==null){fields.mode='driving';defaulted.push('出行方式未指定，智能体决定：驾车/打车（时间最灵活）')}
 if(!fields.city){
  const cities=[...new Set(fields.requiredIds.map(id=>places.find(p=>p.id===id)?.city).filter(Boolean))];
  if(cities.length===1){fields.city=cities[0];defaulted.push('城市未指定，智能体决定：'+cities[0]+'（根据必去地点推断）')}
  else{fields.city='河南';defaulted.push('城市未指定，智能体决定：河南多城（请确认是否接受跨城）')}
 }
 return {fields,defaulted};
}
// 决策：智能体自主选点。必去优先，其余按兴趣打分补足；取舍同样是决策并记录依据。
export function agentSelectRules(rawIntent,catalog){
 const places=Array.isArray(catalog)?catalog:(typeof CATALOG!=='undefined'?CATALOG:[]);
 const {fields,defaulted}=applyAgentDefaults(rawIntent,places);
 const city=fields.city,pool=places.filter(p=>!fields.excludedIds.includes(p.id)&&(city==='河南'||p.city===city));
 const required=fields.requiredIds.map(id=>places.find(p=>p.id===id)).filter(p=>p&&!fields.excludedIds.includes(p.id));
 const scoreOf=p=>fields.interests.reduce((n,t)=>n+(agentInterestHit(t,p)?3:0),0);
 const ranked=pool.filter(p=>!required.some(r=>r.id===p.id)).sort((a,b)=>scoreOf(b)-scoreOf(a));
 const target=Math.min(15,Math.max(required.length,fields.days*2,2)),picks=[...required];
 for(const p of ranked){if(picks.length>=target)break;picks.push(p)}
 if(!picks.length)throw Error('该条件下暂无可选地点，请放宽城市或排除条件');
 const rationale=defaulted.map(reason=>({decision:'补默认条件',reason}));
 for(const p of required)rationale.push({decision:'必去：'+p.name,reason:'你在需求中明确要求，智能体优先安排'});
 for(const p of picks.slice(required.length)){
  const hits=fields.interests.filter(t=>agentInterestHit(t,p));
  rationale.push({decision:'选择：'+p.name,reason:hits.length?'匹配你的兴趣（'+hits.map(t=>AGENT_INTEREST_LABELS[t]).join('、')+'）':'同城顺路，用于补足 '+fields.days+' 天行程'});
 }
 if(pool.length>picks.length)rationale.push({decision:'取舍：其余 '+(pool.length-picks.length)+' 个地点未入选',reason:'控制每天游览负荷在 '+fields.maxHours+' 小时内，优先保留兴趣匹配度高的地点'});
 const durationOf=p=>Number.isInteger(p.duration)&&p.duration>=15&&p.duration<=720?p.duration:90;
 return {fields,defaulted,selections:picks.map(p=>({id:p.id,duration:durationOf(p)})),rationale};
}
// 规则智能体：完整的一次 感知→决策（分日复用 rulePlan 由调用方完成）→交付。
export function agentPlanRules(text,catalog){
 const input=String(text==null?'':text).normalize('NFKC').trim();
 if(!input||input.length>600)throw Error('请用 1–600 字描述旅行需求');
 const places=Array.isArray(catalog)?catalog:(typeof CATALOG!=='undefined'?CATALOG:[]);
 const perceived=parseIntentRules(input,places),decided=agentSelectRules(perceived.fields,places);
 return {source:'agent-rules',intent:decided.fields,defaulted:decided.defaulted,selections:decided.selections,rationale:decided.rationale,unresolved:perceived.unresolved,note:'智能体已根据你的需求做出全部行程决策（城市、天数、选点），分日由程序按城市与游览负荷排列；确认后才会应用，交通与费用仍需核算'};
}
