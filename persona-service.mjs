// 后台人物画像（服务端画像）：画像只在服务端算、只在后台看。
// 用户端响应一律不带画像名、分数与理由；画像接口要求登录 + 管理员。
// 画像来源三处：① 需求（兴趣/城市/预算，取自用户已保存行程的 decision）
// ② 行为（加进行程的地点、调过的时长、复盘的“值得多待/超时站”）
// ③ 群体基线：问卷 231 份终稿（宿舍组 45.45%、对象或一位朋友 43.29%、“感兴趣”86.58%）。
// 无信号的用户先按群体基线推，画像记为“周末随性派”并标 baseline，不编演示用户。
// 推流分 = 画像匹配 +3（兴趣命中）+ 复盘信号 ≥2 人 +1 + 热度分；
// 热度分与 /api/popular 同口径（复盘“值得多待”×3 + 加入行程×1），
// 但后台只用真实复盘：真实“加入行程”计数还没有，added 恒为 0，
// 演示种子加入数不计入后台热度（见 heatNote）。
// 维度正则与景点页 SPOT_DIMS 同款（实算：文化 43、山水 38、美食 2、沉浸 9、
// 亲子 6；8 个地点不命中任何维度）。
export const PERSONA_DIMS=[
 {key:'culture',name:'文化',test:p=>/文化|历史|博物|石窟|古城|寺|古都/.test((p.theme||'')+' '+(p.name||''))},
 {key:'nature',name:'山水',test:p=>/山|峡|自然|水|湖/.test((p.theme||'')+' '+(p.name||''))},
 {key:'food',name:'美食',test:p=>p.category==='food'||/美食|小吃|吃/.test((p.theme||'')+' '+(p.name||''))},
 {key:'immersive',name:'沉浸',test:p=>/演艺|戏剧|夜游|武侠|电影|沉浸/.test((p.theme||'')+' '+(p.name||''))},
 {key:'family',name:'亲子',test:p=>/亲子|乐园|动物|儿童/.test((p.theme||'')+' '+(p.name||''))}
];
export const PERSONAS=[
 {key:'culture',name:'文化探索者',dim:'culture',blurb:'偏爱文博、古城与古寺'},
 {key:'nature',name:'山水玩家',dim:'nature',blurb:'偏爱山水、峡谷与湖泊'},
 {key:'food',name:'美食猎人',dim:'food',blurb:'偏爱美食街区与地方小吃'},
 {key:'immersive',name:'沉浸夜游',dim:'immersive',blurb:'偏爱演艺、戏剧与夜游'},
 {key:'family',name:'亲子家庭',dim:'family',blurb:'偏爱乐园、动物与亲子玩法'},
 {key:'casual',name:'周末随性派',dim:null,blurb:'没填兴趣或信号不足，先按群体基线与热度推'}
];
export const QUESTIONNAIRE_BASELINE={n:231,dorm:45.45,partner:43.29,interested:86.58};
// 无信号用户的基线权重（与 v1 预览的“周末随性派”一致），标 baseline。
const BASELINE_WEIGHTS={culture:0.5,nature:0.5,food:0.5,immersive:0.5,family:0.3};
const DIM_KEYS=PERSONA_DIMS.map(d=>d.key);
const DIM_NAMES=Object.fromEntries(PERSONA_DIMS.map(d=>[d.key,d.name]));
export function personaDimsOf(place){
 if(!place||typeof place!=='object')return [];
 return PERSONA_DIMS.filter(d=>{try{return d.test(place)}catch{return false}}).map(d=>d.key);
}
function personaPlaceByName(name){
 const trimmed=String(name||'').trim();
 if(!trimmed)return null;
 return CATALOG.find(p=>p.name===trimmed)||CATALOG.find(p=>trimmed.includes(p.name)||p.name.includes(trimmed))||null;
}
// signals：{interests:[dimKey], city, budget, stops:[{place, durationAdjusted}], worthStops:[place], overtimeStops:[place], reviewCount}
// 计分：需求兴趣每项 +1；行程里每站按其维度 +0.5，调过时长再 +0.5；
// 复盘“值得多待”每站按其维度 +1；“超时站”每站 +0.5；权重 = min(1, 分数/3)。
// 置信度：无信号 0.5，每多一个信号事件 +0.05，上限 0.95。
export function computePersonaFromSignals(signals){
 const points={culture:0,nature:0,food:0,immersive:0,family:0};
 let events=0;
 for(const key of signals.interests||[]){if(key in points){points[key]+=1;events++}}
 for(const s of signals.stops||[]){
  const dims=personaDimsOf(s.place);if(!dims.length)continue;
  events++;
  for(const key of dims)points[key]+=0.5;
  if(s.durationAdjusted)for(const key of dims)points[key]+=0.5;
 }
 for(const place of signals.worthStops||[]){for(const key of personaDimsOf(place))points[key]+=1;events++}
 for(const place of signals.overtimeStops||[]){for(const key of personaDimsOf(place))points[key]+=0.5;events++}
 const weights={};for(const key of DIM_KEYS)weights[key]=Math.round(Math.min(1,points[key]/3)*100)/100;
 const baseline=events===0;
 if(baseline){for(const key of DIM_KEYS)weights[key]=BASELINE_WEIGHTS[key]}
 let primaryKey='casual';
 if(!baseline){
  let best=-1;
  for(const p of PERSONAS){if(!p.dim)continue;if(weights[p.dim]>best){best=weights[p.dim];primaryKey=p.key}}
 }
 const persona=PERSONAS.find(p=>p.key===primaryKey);
 const confidence=baseline?0.5:Math.min(0.95,Math.round((0.5+0.05*events)*100)/100);
 return {key:persona.key,name:persona.name,blurb:persona.blurb,confidence,baseline,weights,events};
}
function lastSignalText(signals){
 const worth=(signals.worthStops||[])[0];
 if(worth)return '复盘标「'+worth.name+'」值得多待';
 const overtime=(signals.overtimeStops||[])[0];
 if(overtime)return '复盘标「'+overtime.name+'」超时';
 const stop=(signals.stops||[])[0];
 if(stop)return '加「'+stop.place.name+'」进行程';
 const interest=(signals.interests||[])[0];
 if(interest)return '需求填了「'+(DIM_NAMES[interest]||interest)+'」';
 return '尚未留下需求或行为信号';
}
// 热度：只用真实复盘（与 /api/popular 不传 demo 时同口径）。
// added 恒为 0——真实“加入行程”计数还没有，演示种子加入数不计入后台热度。
async function personaHeatByPlace(env){
 const worth=new Map();
 if(env.DB){
  const rows=await env.DB.prepare('SELECT user_id, payload FROM trip_reviews').all();
  for(const row of rows.results||[]){
   let saved;try{saved=JSON.parse(row.payload)}catch{continue}
   const place=personaPlaceByName(saved.worthMoreStop);if(!place)continue;
   if(!worth.has(place.id))worth.set(place.id,new Set());
   worth.get(place.id).add(row.user_id);
  }
 }
 const out=new Map();
 for(const [id,users] of worth)out.set(id,{worth:users.size,added:0,addedSource:'none',score:users.size*3});
 return out;
}
export function personaTop3(personaKey,learningWeights,heatByPlace){
 const persona=PERSONAS.find(p=>p.key===personaKey)||PERSONAS[5];
 const dim=persona.dim?PERSONA_DIMS.find(d=>d.key===persona.dim):null;
 const ranked=CATALOG.map(place=>{
  const match=dim&&dim.test(place)?3:0;
  const signal=learningWeights?.get?.(place.category)?1:0;
  const heat=heatByPlace.get(place.id)||{worth:0,added:0,addedSource:'none',score:0};
  return {id:place.id,name:place.name,city:place.city,theme:place.theme||'',match,signal,heat:heat.score,heatWorth:heat.worth,heatAdded:heat.added,addedSource:heat.addedSource,total:match+signal+heat.score};
 }).sort((a,b)=>b.total-a.total||b.heat-a.heat||a.name.localeCompare(b.name,'zh-CN'));
 return ranked.slice(0,3);
}
// 管理员判定：env 指定 ADMIN_USERNAME 时只认该用户名；未指定时认
// 注册最早的账号（created_at 最早，相同取 id 最小）。平台模式下
// users 表没有独立账号，判定一律不通过（后台画像只在独立账号部署可用）。
export async function resolveAdmin(env){
 if(!env.DB)return null;
 if(env.ADMIN_USERNAME){
  const row=await env.DB.prepare('SELECT id, username, created_at FROM users WHERE username = ?').bind(env.ADMIN_USERNAME).first();
  return row?{id:row.id,username:row.username,via:'env:ADMIN_USERNAME'}:null;
 }
 const row=await env.DB.prepare('SELECT id, username, created_at FROM users ORDER BY created_at ASC, id ASC LIMIT 1').bind().first();
 return row?{id:row.id,username:row.username,via:'first-user'}:null;
}
export async function isAdminUser(user,env){
 if(!user||!env.DB)return false;
 const admin=await resolveAdmin(env);
 return !!admin&&admin.id===user.id;
}
async function requireAdmin(request,env){
 if(!standaloneAuth(env))fail('后台画像仅在独立账号部署可用',403);
 const user=await currentUser(request,env);
 if(!user)fail('请登录后查看后台画像',401);
 if(!(await isAdminUser(user,env)))fail('仅管理员可查看后台画像',403);
 return user;
}
function personaSignalsFromRows(draftRow,reviewRows){
 const signals={interests:[],city:null,budget:null,stops:[],worthStops:[],overtimeStops:[],reviewCount:reviewRows.length};
 let draft=null;
 if(draftRow?.payload){try{draft=JSON.parse(draftRow.payload)}catch{draft=null}}
 if(draft){
  const intent=draft.decision?.intent||{};
  signals.interests=Array.isArray(intent.interests)?intent.interests.filter(k=>DIM_KEYS.includes(k)):[];
  signals.city=typeof intent.city==='string'?intent.city:(typeof draft.city==='string'?draft.city:null);
  signals.budget=Number.isFinite(intent.budget)?intent.budget:null;
  for(const stop of Array.isArray(draft.stops)?draft.stops:[]){
   const place=stop?.place;if(!place?.id)continue;
   const saved=CATALOG.find(p=>p.id===place.id);
   if(!saved)continue;
   signals.stops.push({place:saved,durationAdjusted:Number.isInteger(stop.duration)&&Number.isInteger(saved.duration)&&stop.duration!==saved.duration});
  }
 }
 for(const row of reviewRows){
  let saved;try{saved=JSON.parse(row.payload)}catch{continue}
  const worth=personaPlaceByName(saved.worthMoreStop);if(worth)signals.worthStops.push(worth);
  const overtime=personaPlaceByName(saved.overtimeStop);if(overtime)signals.overtimeStops.push(overtime);
 }
 return signals;
}
export async function adminPersonasEndpoint(request,env){
 if(request.method!=='GET')fail('方法不支持',405);
 const admin=await requireAdmin(request,env);
 const adminInfo=await resolveAdmin(env);
 const userRows=await env.DB.prepare('SELECT id, username, created_at FROM users ORDER BY created_at ASC, id ASC').all();
 const learning=await computeLearningWeights(env);
 const heatByPlace=await personaHeatByPlace(env);
 const users=[];
 for(const u of userRows.results||[]){
  const draftRow=await env.DB.prepare('SELECT payload FROM travel_drafts WHERE user_id = ?').bind(u.id).first();
  const reviewRows=await env.DB.prepare('SELECT payload FROM trip_reviews WHERE user_id = ?').bind(u.id).all();
  const signals=personaSignalsFromRows(draftRow,reviewRows.results||[]);
  const persona=computePersonaFromSignals(signals);
  const top3=personaTop3(persona.key,learning.weights,heatByPlace);
  users.push({
   id:u.id,username:u.username,createdAt:u.created_at,
   persona:{key:persona.key,name:persona.name,blurb:persona.blurb,confidence:persona.confidence,baseline:persona.baseline},
   weights:persona.weights,
   signals:{
    demand:{interests:signals.interests.map(k=>({key:k,name:DIM_NAMES[k]})),city:signals.city,budget:signals.budget},
    behavior:{stops:signals.stops.length,durationAdjusts:signals.stops.filter(s=>s.durationAdjusted).length,worthStops:signals.worthStops.map(p=>p.name),overtimeStops:signals.overtimeStops.map(p=>p.name),reviewCount:signals.reviewCount},
    events:persona.events
   },
   lastSignal:lastSignalText(signals),
   top3
  });
 }
 const distribution=PERSONAS.map(p=>{
  const count=users.filter(u=>u.persona.key===p.key).length;
  return {key:p.key,name:p.name,count,pct:users.length?Math.round(count/users.length*100):0};
 });
 const dimCounts={};for(const d of PERSONA_DIMS)dimCounts[d.key]=0;
 let dimNone=0;
 for(const place of CATALOG){const dims=personaDimsOf(place);if(!dims.length)dimNone++;for(const key of dims)dimCounts[key]++}
 dimCounts.none=dimNone;
 return json({
  admin:{username:admin.username,via:adminInfo?adminInfo.via:null},
  totalUsers:users.length,
  distribution,
  dimCounts,
  baseline:{questionnaire:QUESTIONNAIRE_BASELINE,note:'群体基线来自问卷终稿 231 份（宿舍组 45.45%、对象或一位朋友 43.29%、“感兴趣”86.58%）；无信号的新用户先按基线推，画像记为“周末随性派”并标 baseline。'},
  heatNote:'热度分当前只含复盘“值得多待”×3；真实“加入行程”计数尚未建立，added 为 0（演示种子加入数不计入后台热度），正式上线后补真实计数再计入。',
  users
 });
}
