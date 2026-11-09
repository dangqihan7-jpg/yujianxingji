import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker,{CATALOG,agentSelectRules} from '../worker/index.js';

// 闭环改革二期测试（第一件：v3 学习真正生效）。
// 数据库按 drizzle/*.sql 顺序建表，与 scripts/dev.mjs 的本地启动一致。
function makeDb(){
 const sql=new DatabaseSync(':memory:');
 const files=[];
 return {sql,files,async init(){
  for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
   sql.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  }
 }};
}
function adapter(sql){
 return {prepare(query){const statement=sql.prepare(query);return {async all(){return {results:statement.all()}},bind(...args){return {async first(){return statement.get(...args)||null},async all(){return {results:statement.all(...args)}},async run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}}}}}}};
}
const db1=await makeDb();await db1.init();
const DB=adapter(db1.sql);
const call=(path,body,user,options={})=>worker.fetch(new Request('https://reform2.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{}),...options.headers},...(body?{body:JSON.stringify(body)}:{})}),{DB});
const post=(path,body,user)=>call(path,body,user);
const agent=(body,user='fixture')=>post('/api/agent',body,user).then(async r=>({status:r.status,body:await r.json()}));

// ---------- 单元：agentSelectRules 加权只影响同分候选顺序 ----------
// 合成小目录：甲景点（scenic）、丙景点（scenic）、乙小吃（food），均无兴趣命中。
const tinyCatalog=[
 {id:'t-a',name:'甲景点',city:'郑州',category:'scenic',theme:'',duration:90},
 {id:'t-c',name:'丙景点',city:'郑州',category:'scenic',theme:'',duration:90},
 {id:'t-b',name:'乙小吃',city:'郑州',category:'food',theme:'',duration:60},
];
const foodWeights=new Map([['food',{bonus:1,users:2,label:'美食'}]]);
{
 // 无加权：天数 1 → 目标 2 个，按目录顺序取前两个
 const plain=agentSelectRules({city:'郑州',days:1,interests:[]},tinyCatalog);
 assert.deepEqual(plain.selections.map(s=>s.id),['t-a','t-c'],'no weights: catalog order decides ties');
 assert.deepEqual(plain.learningApplied,[],'no weights: no learning applied');
 // 美食加权 +1：乙小吃排到第一，甲景点第二；丙景点落选
 const boosted=agentSelectRules({city:'郑州',days:1,interests:[]},tinyCatalog,foodWeights);
 assert.deepEqual(boosted.selections.map(s=>s.id),['t-b','t-a'],'food bonus must lift the tied food place to first');
 assert.equal(boosted.learningApplied.length,1);
 assert.equal(boosted.learningApplied[0].category,'food');
 assert.equal(boosted.learningApplied[0].users,2);
 assert(boosted.rationale.some(r=>r.reason.includes('复盘学习')&&r.reason.includes('加权 +1')),'rationale must record the learning bonus');
 // 必去永远优先：必去丙景点即使无加权也排第一
 const required=agentSelectRules({city:'郑州',days:1,interests:[],requiredIds:['t-c']},tinyCatalog,foodWeights);
 assert.equal(required.selections[0].id,'t-c','required places must stay first even when another category is boosted');
 // 兴趣命中（3 分）压过加权（1 分）：甲景点主题命中文化兴趣
 const cultured=[{...tinyCatalog[0],theme:'文化古迹'},tinyCatalog[1],tinyCatalog[2]];
 const picked=agentSelectRules({city:'郑州',days:1,interests:['culture']},cultured,foodWeights);
 assert.equal(picked.selections[0].id,'t-a','one interest hit (3) must beat the learning bonus (1)');
}

// ---------- API：两名用户标“值得多待”后，候选排序真的变了 ----------
// 洛阳一天、无兴趣：目标 2 个。无加权时取目录前两个（龙门石窟、白马寺，均为景点）。
await post('/api/trips/trip_food_a/review',{worthMoreStop:'西工小街'},'alice');
await post('/api/trips/trip_food_b/review',{worthMoreStop:'西工小街'},'bob');
{
 const signals=await (await call('/api/learning-signals',null,'alice')).json();
 assert.equal(signals.signals.length,1);
 assert.equal(signals.signals[0].category,'food');
 assert.equal(signals.signals[0].users,2);
 assert.equal(signals.weighting.bonus,1);
 assert.equal(signals.weighting.threshold,2);
}
const baseline=await agent({text:'洛阳一天',learning:false});
assert.equal(baseline.status,200);
assert.deepEqual(baseline.body.stops.map(s=>s.id),['hn-longmen','hn-whitehorse'],'learning off: baseline order is catalog order');
assert.equal(baseline.body.learningApplied.enabled,false);
assert.deepEqual(baseline.body.learningApplied.applied,[]);
const boosted=await agent({text:'洛阳一天'});
assert.equal(boosted.status,200);
assert.equal(boosted.body.learningApplied.enabled,true);
assert.equal(boosted.body.learningApplied.applied.length,1);
assert.equal(boosted.body.learningApplied.applied[0].category,'food');
assert.equal(boosted.body.learningApplied.applied[0].users,2);
assert.equal(boosted.body.learningApplied.applied[0].bonus,1);
assert.deepEqual(boosted.body.stops.map(s=>s.id),['hn-xigong','hn-longmen'],'food bonus must lift the tied food place into the two picks');
assert(boosted.body.learningApplied.note.includes('加权 +1'),'learning note must state the bonus');
// 规则回退分支（operation:'select' + engine:'rules'）同样加权并返回 learningApplied
{
 const seed={operation:'select',city:'洛阳',days:1,start:'09:00',mode:'driving',maxHours:8,restMinutes:30,stops:[],decision:{intent:{city:'洛阳',days:1,interests:[],requiredIds:[],excludedIds:[],budget:null},expenses:{}}};
 const r=await agent({...seed,engine:'rules'});
 assert.equal(r.status,200);
 assert.equal(r.body.learningApplied.applied[0].category,'food');
 assert(r.body.stops.some(s=>s.id==='hn-xigong'),'rules branch must also apply the weight');
}

// ---------- API：1 名用户不生效；无信号时开关开/关排序一致 ----------
const db2=await makeDb();await db2.init();
const DB2=adapter(db2.sql);
const call2=(path,body,user)=>worker.fetch(new Request('https://reform2.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:DB2});
const agent2=body=>call2('/api/agent',body,'fixture').then(async r=>({status:r.status,body:await r.json()}));
await call2('/api/trips/trip_one/review',{worthMoreStop:'龙门石窟'},'alice');
{
 const signals=await (await call2('/api/learning-signals',null,'alice')).json();
 assert.deepEqual(signals.signals,[],'one user must not create a signal');
 const on=await agent2({text:'洛阳一天'});
 const off=await agent2({text:'洛阳一天',learning:false});
 assert.deepEqual(on.body.learningApplied.applied,[],'one user: no learning applied');
 assert.deepEqual(on.body.stops,off.body.stops,'no signal: learning on must sort exactly like learning off');
 assert.deepEqual(on.body.stops.map(s=>s.id),['hn-longmen','hn-whitehorse']);
}
db2.sql.close();

// ---------- 前端：学习开关、加权原因行存在 ----------
const decisionSrc=await readFile(new URL('../decision.js',import.meta.url),'utf8');
for(const needle of ['id="brieflearning"','应用复盘学习','function learningAppliedHTML','data-learning-applied',"learning:intent.learning!==false",'因为复盘里 '])assert(decisionSrc.includes(needle),'decision.js must contain '+needle);
const decisionCss=await readFile(new URL('../decision.css',import.meta.url),'utf8');
assert(decisionCss.includes('.learning-applied'),'decision.css must style the learning line');
assert(decisionCss.includes('.brief-learning'),'decision.css must style the learning toggle');

// ---------- 演示模式：演示数据与真实数据隔离 ----------
// 新鲜库 db3：先造真实复盘（alice/bob 各标西工小街“值得多待”，美食信号 2 人），再走演示流程。
const db3=await makeDb();await db3.init();
const DB3=adapter(db3.sql);
const call3=(path,body,user)=>worker.fetch(new Request('https://reform2.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:DB3});
const post3=(path,body,user)=>call3(path,body,user);
const agent3=body=>call3('/api/agent',body,'fixture').then(async r=>({status:r.status,body:await r.json()}));
await post3('/api/trips/trip_food_a/review',{worthMoreStop:'西工小街'},'alice');
await post3('/api/trips/trip_food_b/review',{worthMoreStop:'西工小街'},'bob');
// seed：幂等、4 行、不超过 6 行；信号里景点类演示 2 人出信号，美食类演示 1 人不出信号
const seed1=await (await post3('/api/demo/reviews/seed',{sessionId:'demo_test1'})).json();
assert.equal(seed1.seeded,true,'first seed must create rows');
assert.equal(seed1.count,4,'seed must create exactly 4 demo rows');
assert(seed1.signals.some(s=>s.category==='scenic'&&s.users===2&&s.demo===true),'seeded scenic demo signal must exist');
assert(!seed1.signals.some(s=>s.category==='food'&&s.demo===true),'one demo food user must not create a demo food signal');
const seed2=await (await post3('/api/demo/reviews/seed',{sessionId:'demo_test1'})).json();
assert.equal(seed2.seeded,false,'reseed must be idempotent');
assert.equal(seed2.count,4,'reseed must not duplicate rows');
assert(seed2.count<=6,'a session must hold at most 6 demo rows');
assert.deepEqual(await (await call3('/api/demo/status?session=demo_test1')).json(),{active:true,count:4,addsCount:8});
assert.equal((await post3('/api/demo/reviews/seed',{sessionId:'bad id!'})).status,400,'invalid session id must be rejected');
assert.equal((await post3('/api/demo/reviews/clear',{sessionId:''})).status,400,'empty session id must be rejected');
// 不带 demo 参数：信号里只有真实美食信号（2 人，demo:false），没有演示行
{
 const signals=await (await call3('/api/learning-signals',null,'alice')).json();
 assert.equal(signals.signals.length,1);
 assert.equal(signals.signals[0].category,'food');
 assert.equal(signals.signals[0].users,2);
 assert.equal(signals.signals[0].demo,false);
}
// 带 demo 参数：景点信号 demo:true、2 人、含龙门石窟与白马寺；美食信号仍是真实 2 人、demo:false
{
 const signals=await (await call3('/api/learning-signals?demo=demo_test1',null,'alice')).json();
 assert.equal(signals.signals.length,2);
 const scenic=signals.signals.find(s=>s.category==='scenic');
 assert.equal(scenic.users,2);assert.equal(scenic.demo,true);
 assert.deepEqual([...scenic.places].sort(),['白马寺','龙门石窟']);
 const food=signals.signals.find(s=>s.category==='food');
 assert.equal(food.users,2);assert.equal(food.demo,false);
 assert.equal((await call3('/api/learning-signals?demo=bad%20id',null,'alice')).status,400,'invalid demo param must be rejected');
}
// /api/agent 传 demoSession：景点加权生效，learningApplied 标 demo:true；真实美食加权保留且不标 demo
{
 const r=await agent3({text:'洛阳一天',demoSession:'demo_test1'});
 assert.equal(r.status,200);
 const applied=r.body.learningApplied.applied;
 assert(applied.some(a=>a.category==='scenic'&&a.demo===true&&a.users===2&&a.bonus===1),'demo scenic weight must be applied and flagged demo:true');
 assert(r.body.learningApplied.note.includes('美食'),'note must still mention the real food signal');
 assert(r.body.rationale.some(x=>x.reason.includes('复盘学习')),'rationale must record the learning bonus');
 // 演示景点加权 +1 后，景点与美食同分，按目录顺序景点排前（与不传 demoSession 时美食排前形成对照）。
 assert.deepEqual(r.body.stops.map(s=>s.id),['hn-longmen','hn-whitehorse'],'demo scenic bonus must put scenic picks first');
 // force-rules 分支（context + engine:'rules'）同样接 demoSession 并标 demo:true
 const seed={operation:'select',city:'洛阳',days:1,start:'09:00',mode:'driving',maxHours:8,restMinutes:30,stops:[],decision:{intent:{city:'洛阳',days:1,interests:[],requiredIds:[],excludedIds:[],budget:null},expenses:{}}};
 const rr=await agent3({...seed,engine:'rules',demoSession:'demo_test1'});
 assert.equal(rr.status,200);
 assert(rr.body.learningApplied.applied.some(a=>a.category==='scenic'&&a.demo===true),'rules branch must flag the demo weight');
}
// 不传 demoSession：演示行不影响排序与信号（与真实美食加权一致）
{
 const off=await agent3({text:'洛阳一天'});
 assert.deepEqual(off.body.learningApplied.applied.map(a=>a.category),['food']);
 assert.deepEqual(off.body.stops.map(s=>s.id),['hn-xigong','hn-longmen']);
 assert.equal((await agent3({text:'洛阳一天',demoSession:'bad id!'})).status,400,'invalid demoSession must be rejected');
}
// clear 只清演示数据：真实复盘与真实信号原样保留；重复清返回 0
{
 const cleared=await (await post3('/api/demo/reviews/clear',{sessionId:'demo_test1'})).json();
 assert.equal(cleared.cleared,4);
 assert.deepEqual(await (await call3('/api/demo/status?session=demo_test1')).json(),{active:false,count:0,addsCount:0});
 const signals=await (await call3('/api/learning-signals?demo=demo_test1',null,'alice')).json();
 assert.equal(signals.signals.length,1);
 assert.equal(signals.signals[0].category,'food');
 assert.equal(signals.signals[0].users,2);
 const back=await (await call3('/api/trips/trip_food_a/review',null,'alice')).json();
 assert.equal(back.review.worthMoreStop,'西工小街','real review must survive demo clear');
 const again=await (await post3('/api/demo/reviews/clear',{sessionId:'demo_test1'})).json();
 assert.equal(again.cleared,0,'clearing twice must clear nothing the second time');
}
db3.sql.close();

// ---------- 前端：演示开关、清空、标注文案存在 ----------
for(const needle of ['data-demo-mode','data-demo-toggle','一键清空演示数据','yujianxingji.demoSession','yujianxingji.demoOn','demoSession','演示模式 · 以下含演示数据','data-demo-banner','?demo=','/api/demo/reviews/seed','/api/demo/reviews/clear'])assert(decisionSrc.includes(needle),'decision.js must contain '+needle);
// data-demo-clear 随演示盒子搬进首页表单层（showcase.js planExtrasHTML），见下行断言。
assert(decisionCss.includes('.demo-mode'),'decision.css must style the demo control');
assert(decisionCss.includes('.demo-banner'),'decision.css must style the demo banner');
const showcaseSrc=await readFile(new URL('../showcase.js',import.meta.url),'utf8');
assert(showcaseSrc.includes('data-demo-toggle'),'showcase.js must wire the demo toggle');
assert(showcaseSrc.includes('data-demo-clear'),'showcase.js must wire the demo clear button');

// ---------- 宿舍拼团最小版：建团、合并偏好、发起人定冲突、拼团行程 ----------
// 新鲜库 db4：与一、二件的库隔离；先造 2 人美食复盘信号，供拼团行程的学习加权断言用。
const db4=await makeDb();await db4.init();
const DB4=adapter(db4.sql);
const call4=(path,body,user)=>worker.fetch(new Request('https://reform2.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:DB4});
const post4=(path,body,user)=>call4(path,body,user);
const get4=(path,user)=>call4(path,null,user);
const postEmpty4=(path,user)=>worker.fetch(new Request('https://reform2.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})}}),{DB:DB4});
await post4('/api/trips/trip_grp_food_a/review',{worthMoreStop:'西工小街'},'alice');
await post4('/api/trips/trip_grp_food_b/review',{worthMoreStop:'西工小街'},'bob');
// 鉴权：匿名一律 401
assert.equal((await post4('/api/groups',{name:'匿名建团'},null)).status,401,'anonymous group create must be rejected');
assert.equal((await get4('/api/groups',null)).status,401,'anonymous group list must be rejected');
assert.equal((await get4('/api/groups/grp_0123456789abcdef',null)).status,401,'anonymous group detail must be rejected');
assert.equal((await post4('/api/groups/grp_0123456789abcdef/join',{},null)).status,401,'anonymous group join must be rejected');
assert.equal((await post4('/api/groups/grp_0123456789abcdef/plan',{city:'洛阳',days:2},null)).status,401,'anonymous group plan must be rejected');
// DB 不可用时 503
assert.equal((await worker.fetch(new Request('https://reform2.test/api/groups',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'alice'},body:JSON.stringify({name:'无库建团'})}),{})).status,503,'group create without DB must be 503');
// 建团校验：团名 1–40 字、人数 2–8
assert.equal((await post4('/api/groups',{name:''},'alice')).status,400,'empty group name must be rejected');
assert.equal((await post4('/api/groups',{name:'x'.repeat(41)},'alice')).status,400,'overlong group name must be rejected');
assert.equal((await post4('/api/groups',{name:'校验团',maxMembers:1},'alice')).status,400,'maxMembers below 2 must be rejected');
assert.equal((await post4('/api/groups',{name:'校验团',maxMembers:9},'alice')).status,400,'maxMembers above 8 must be rejected');
assert.equal((await post4('/api/groups',{name:'校验团',maxMembers:'6'},'alice')).status,400,'maxMembers must be an integer');
const created=await (await post4('/api/groups',{name:'302 宿舍洛阳游',maxMembers:2},'alice')).json();
assert.match(created.group.id,/^grp_[0-9a-f]{16}$/,'group id must be grp_ + 16 hex chars');
assert.equal(created.group.name,'302 宿舍洛阳游');
assert.equal(created.group.maxMembers,2);
assert.equal(created.group.creatorId,'alice');
assert.equal(created.group.memberCount,1);
assert(Number.isInteger(created.group.createdAt));
const groupId=created.group.id;
// 列表：能看到刚建的团；详情：发起人自动成为成员
{
 const list=await (await get4('/api/groups','alice')).json();
 const found=list.groups.find(g=>g.id===groupId);
 assert(found&&found.memberCount===1&&found.maxMembers===2,'created group must appear in the list');
 const detail=await (await get4('/api/groups/'+groupId,'alice')).json();
 assert.equal(detail.members.length,1,'creator must be auto-joined');
 assert.equal(detail.members[0].userId,'alice');
 assert.deepEqual(detail.merged.requiredIds,[]);
 assert.equal(detail.merged.budget,null);
 assert.deepEqual(detail.conflicts,[]);
 assert.equal(detail.me.userId,'alice');
}
// 加入校验：地点须在目录内且 ≤15 个，必去与排除不能是同一点，budget 为数字 0–100000 或 null
assert.equal((await post4('/api/groups/'+groupId+'/join',{requiredIds:['hn-nope']},'bob')).status,400,'unknown place id must be rejected');
assert.equal((await post4('/api/groups/'+groupId+'/join',{requiredIds:Array.from({length:16},(_,i)=>'hn-longmen')},'bob')).status,400,'more than 15 required ids must be rejected');
assert.equal((await post4('/api/groups/'+groupId+'/join',{requiredIds:'hn-longmen'},'bob')).status,400,'non-array requiredIds must be rejected');
assert.equal((await post4('/api/groups/'+groupId+'/join',{requiredIds:['hn-longmen'],excludedIds:['hn-longmen']},'bob')).status,400,'same place required and excluded must be rejected');
assert.equal((await post4('/api/groups/'+groupId+'/join',{budget:-1},'bob')).status,400,'negative budget must be rejected');
assert.equal((await post4('/api/groups/'+groupId+'/join',{budget:'300'},'bob')).status,400,'string budget must be rejected');
assert.equal((await post4('/api/groups/'+groupId+'/join',{budget:100001},'bob')).status,400,'budget above 100000 must be rejected');
assert.equal((await post4('/api/groups/grp_0123456789abcdef/join',{requiredIds:['hn-longmen']},'bob')).status,404,'joining a missing group must be 404');
assert.equal((await get4('/api/groups/grp_0123456789abcdef','alice')).status,404,'missing group detail must be 404');
// 加入：bob 加入（偏好：必去白马寺，预算 300）；团满后 carol 加入 409
const bobJoin1=await (await post4('/api/groups/'+groupId+'/join',{requiredIds:['hn-whitehorse'],budget:300},'bob')).json();
assert.equal(bobJoin1.group.memberCount,2);
assert.equal(bobJoin1.member.userId,'bob');
assert.deepEqual(bobJoin1.member.requiredIds,['hn-whitehorse']);
assert.equal(bobJoin1.member.budget,300);
const bobJoinedAt=bobJoin1.member.joinedAt;
assert.equal((await post4('/api/groups/'+groupId+'/join',{requiredIds:['hn-longmen']},'carol')).status,409,'joining a full group must be 409');
// 重复加入视为更新偏好，不重复计数
const bobJoin2=await (await post4('/api/groups/'+groupId+'/join',{requiredIds:['hn-whitehorse','hn-longmen'],budget:200},'bob')).json();
assert.equal(bobJoin2.group.memberCount,2,'re-joining must not double-count the member');
assert.equal(bobJoin2.member.joinedAt,bobJoinedAt,'re-joining must keep the original join time');
assert.deepEqual([...bobJoin2.member.requiredIds].sort(),['hn-longmen','hn-whitehorse']);
// 发起人更新自己的偏好：必去龙门石窟、排除西工小街、预算 500
await post4('/api/groups/'+groupId+'/join',{requiredIds:['hn-longmen'],excludedIds:['hn-xigong'],budget:500},'alice');
// 偏好合并：必去/排除取并集、预算取最小值并标明 spread
{
 const detail=await (await get4('/api/groups/'+groupId,'alice')).json();
 assert.deepEqual([...detail.merged.requiredIds].sort(),['hn-longmen','hn-whitehorse'],'merged required must be the union');
 assert.deepEqual(detail.merged.excludedIds,['hn-xigong'],'merged excluded must be the union');
 assert.equal(detail.merged.budget,200,'merged budget must be the minimum (conservative)');
 assert.deepEqual(detail.merged.spread,{min:200,max:500},'merged budget spread must be shown');
 assert.equal(detail.members.find(m=>m.userId==='bob').budget,200,'updated member preference must be visible');
}
// 冲突明示：bob 改为排除龙门石窟 → 跨成员必去×排除进清单
await post4('/api/groups/'+groupId+'/join',{requiredIds:['hn-whitehorse'],excludedIds:['hn-longmen'],budget:200},'bob');
{
 const detail=await (await get4('/api/groups/'+groupId,'alice')).json();
 assert.equal(detail.conflicts.length,1,'cross-member required x excluded must be listed');
 assert.equal(detail.conflicts[0].placeId,'hn-longmen');
 assert.equal(detail.conflicts[0].name,'龙门石窟');
 assert.deepEqual(detail.conflicts[0].requiredBy,['alice']);
 assert.deepEqual(detail.conflicts[0].excludedBy,['bob']);
}
// plan 未解决冲突时 409 且带 requiredBy/excludedBy；非发起人 plan 403；参数校验 400
{
 const r=await post4('/api/groups/'+groupId+'/plan',{city:'洛阳',days:2},'alice');
 assert.equal(r.status,409,'plan with unresolved conflicts must be 409');
 const body=await r.json();
 assert.equal(body.conflicts.length,1);
 assert.equal(body.conflicts[0].placeId,'hn-longmen');
 assert.deepEqual(body.conflicts[0].requiredBy,['alice']);
 assert.deepEqual(body.conflicts[0].excludedBy,['bob']);
 assert.equal((await post4('/api/groups/'+groupId+'/plan',{city:'洛阳',days:2,resolutions:{'hn-longmen':'required'}},'bob')).status,403,'non-creator plan must be 403');
 assert.equal((await post4('/api/groups/'+groupId+'/plan',{city:'上海',days:2,resolutions:{'hn-longmen':'required'}},'alice')).status,400,'plan city must be in the catalog');
 assert.equal((await post4('/api/groups/'+groupId+'/plan',{city:'洛阳',days:6,resolutions:{'hn-longmen':'required'}},'alice')).status,400,'plan days must be 1/2/3/4/5/7');
 assert.equal((await post4('/api/groups/'+groupId+'/plan',{days:2,resolutions:{'hn-longmen':'required'}},'alice')).status,400,'plan city is required');
 assert.equal((await post4('/api/groups/'+groupId+'/plan',{city:'洛阳',days:2,resolutions:{'hn-longmen':'maybe'}},'alice')).status,400,'invalid resolution value must be rejected');
}
// 发起人 resolutions 定夺后生成成功：定为必去 → draft 含全部合并必去地点
{
 const r=await post4('/api/groups/'+groupId+'/plan',{city:'洛阳',days:2,resolutions:{'hn-longmen':'required'}},'alice');
 assert.equal(r.status,200);
 const body=await r.json();
 assert.equal(body.label,'拼团行程');
 assert.equal(body.group.id,groupId);
 assert.equal(body.group.name,'302 宿舍洛阳游');
 assert.deepEqual([...body.group.members].sort(),['alice','bob'],'plan must list all member names');
 const stopIds=body.draft.stops.map(s=>s.place.id);
 assert(stopIds.includes('hn-longmen')&&stopIds.includes('hn-whitehorse'),'group draft must include every merged required place');
 assert.equal(body.timeline.length,4,'group plan must carry the agent timeline');
 assert.deepEqual(body.timeline.map(s=>s.key),['select','amap','audit','fallback']);
 assert.equal(typeof body.learningApplied.enabled,'boolean','group plan must carry learningApplied');
 assert.equal(body.learningApplied.enabled,true);
 assert.equal(body.source,'agent-rules');
}
// 定夺为排除 → draft 不含该地点
{
 const body=await (await post4('/api/groups/'+groupId+'/plan',{city:'洛阳',days:2,resolutions:{'hn-longmen':'excluded'}},'alice')).json();
 assert(!body.draft.stops.some(s=>s.place.id==='hn-longmen'),'excluded-by-resolution place must not be in the draft');
 assert(body.draft.stops.some(s=>s.place.id==='hn-whitehorse'),'other required places must stay in the draft');
}
// 隐私：非成员只能看到团名、成员数与发起人，看不到成员偏好
{
 const detail=await (await get4('/api/groups/'+groupId,'carol')).json();
 assert.equal(detail.group.name,'302 宿舍洛阳游');
 assert.equal(detail.group.memberCount,2);
 assert.equal(detail.group.creatorId,'alice');
 assert(!('members' in detail)&&!('merged' in detail)&&!('conflicts' in detail),'non-members must not see member preferences');
 assert.equal(detail.me,null);
}
// 学习加权在拼团行程里同样生效：洛阳 1 天、必去龙门石窟 → 美食加权把西工小街抬进候选
const created3=await (await post4('/api/groups',{name:'学习加权团'},'alice')).json();
const group3=created3.group.id;
await post4('/api/groups/'+group3+'/join',{requiredIds:['hn-longmen']},'alice');
assert.equal((await postEmpty4('/api/groups/'+group3+'/join','bob')).status,200,'joining with an empty body must mean empty preferences');
{
 const body=await (await post4('/api/groups/'+group3+'/plan',{city:'洛阳',days:1},'alice')).json();
 assert.equal(body.label,'拼团行程');
 assert.deepEqual(body.draft.stops.map(s=>s.place.id),['hn-longmen','hn-xigong'],'food bonus must lift 西工小街 into the one-day picks');
 assert(body.learningApplied.applied.some(a=>a.category==='food'&&a.users===2&&a.bonus===1),'group plan must apply the food learning weight');
 assert(body.learningApplied.note.includes('加权 +1'));
}
// 不在目录里的必去 id 进冲突清单：直接写库模拟旧偏好（join 接口本身会拦未知 id）
const created2=await (await post4('/api/groups',{name:'旧偏好团',maxMembers:6},'alice')).json();
const group2=created2.group.id;
db4.sql.prepare('INSERT INTO group_members (group_id, user_id, payload, joined_at) VALUES (?, ?, ?, ?)').run(group2,'bob',JSON.stringify({requiredIds:['hn-ghost'],excludedIds:[],budget:null}),Date.now());
{
 const detail=await (await get4('/api/groups/'+group2,'alice')).json();
 assert.equal(detail.conflicts.length,1,'unknown required ids must be listed as conflicts');
 assert.equal(detail.conflicts[0].placeId,'hn-ghost');
 assert.deepEqual(detail.conflicts[0].requiredBy,['bob']);
 assert.deepEqual(detail.conflicts[0].excludedBy,[]);
 assert.equal((await post4('/api/groups/'+group2+'/plan',{city:'洛阳',days:2},'alice')).status,409,'unknown-id conflict must block plan until resolved');
 assert.equal((await post4('/api/groups/'+group2+'/plan',{city:'洛阳',days:2,resolutions:{'hn-ghost':'required'}},'alice')).status,400,'unknown place cannot be kept as required');
 const ok=await (await post4('/api/groups/'+group2+'/plan',{city:'洛阳',days:2,resolutions:{'hn-ghost':'excluded'}},'alice')).json();
 assert.equal(ok.label,'拼团行程');
 assert(!ok.draft.stops.some(s=>s.place.id==='hn-ghost'));
}
// ---------- 前端：拼团入口、对话框、建团/加入/生成接线存在 ----------
for(const needle of ['宿舍拼团','function openGroup','function renderGroupList','function renderGroupDetail','function submitGroupJoin','function submitGroupPlan','function renderGroupPlan','function applyGroupPlan','应用拼团行程','只有发起人能生成拼团行程',"'/api/groups'","group-resolution-",'data-group-join','data-group-plan','data-group-create','发起人定夺冲突','合并偏好'])assert(decisionSrc.includes(needle),'decision.js must contain '+needle);
// data-open-group 随拼团入口搬进首页表单层（showcase.js planExtrasHTML），见下行断言。
const appHtml=await readFile(new URL('../app.html',import.meta.url),'utf8');
assert(appHtml.includes('id="group"'),'app.html must contain the group dialog');
assert(appHtml.includes('id="groupbody"'),'app.html must contain the group dialog body');
assert(showcaseSrc.includes('data-open-group'),'showcase.js must wire the group entry button');
assert(decisionCss.includes('.group-entry'),'decision.css must style the group entry');
assert(decisionCss.includes('.group-item'),'decision.css must style the group list');
const schemaSrc=await readFile(new URL('../db/schema.ts',import.meta.url),'utf8');
assert(schemaSrc.includes('groupMembers'),'db/schema.ts must define group_members');
assert(schemaSrc.includes('groups'),'db/schema.ts must define groups');
db4.sql.close();

db1.sql.close();
console.log('Passed: learning weighting (unit ties, API flip, threshold, off-parity, rules branch), frontend wiring (toggle, reason line), demo mode (seed idempotence, isolation, clear, agent demoSession, frontend wiring), group trips (auth, validation, full-group 409, re-join update, preference merge, conflict list, plan 409/403/resolutions, privacy, learning weight, frontend wiring).');
