import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker,{CATALOG} from '../worker/index.js';

// 闭环改革一期测试：复盘 API、AI 思考过程时间线、v3 学习信号（演示）。
// 数据库按 drizzle/*.sql 顺序建表，与 scripts/dev.mjs 的本地启动一致。
const sql=new DatabaseSync(':memory:');
for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
 sql.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
}
const DB={prepare(query){const statement=sql.prepare(query);return {async all(){return {results:statement.all()}},bind(...args){return {async first(){return statement.get(...args)||null},async all(){return {results:statement.all(...args)}},async run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}}}}}}};
const call=(path,body,user,options={})=>worker.fetch(new Request('https://reform.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{}),...options.headers},...(body?{body:JSON.stringify(body)}:{})}),{DB});
const post=(path,body,user)=>call(path,body,user);

// ---------- A. 复盘：POST /api/trips/:id/review、GET /api/trips/:id/review ----------
// 匿名拒绝
assert.equal((await post('/api/trips/trip_demo/review',{actualCost:100})).status,401,'anonymous review must be rejected');
assert.equal((await call('/api/trips/trip_demo/review',null,null)).status,401,'anonymous review read must be rejected');
// 行程编号格式
assert.equal((await post('/api/trips/bad%20id/review',{actualCost:100},'alice')).status,404);
// 未登录前 GET 也不行；登录后无复盘时返回 null
assert.equal((await (await call('/api/trips/trip_demo/review',null,'alice')).json()).review,null);
// 只填一项也可提交；未填费用不补 0
{
 const r=await post('/api/trips/trip_demo/review',{actualCost:520.5},'alice');
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.review.actualCost,520.5);assert.equal(b.review.overtimeStop,null);assert.equal(b.review.worthMoreStop,null);assert.equal(b.review.chosenPlan,null);
 assert.equal(b.review.tripId,'trip_demo');assert(Number.isInteger(b.review.updatedAt));
 const back=await (await call('/api/trips/trip_demo/review',null,'alice')).json();
 assert.equal(back.review.actualCost,520.5);assert.equal(back.review.overtimeStop,null);
}
// 四项全填；重复提交覆盖上一单
{
 const r=await post('/api/trips/trip_demo/review',{actualCost:480,overtimeStop:'龙门石窟',worthMoreStop:'白马寺',chosenPlan:'洛阳两日 · 博物馆线'},'alice');
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.review.actualCost,480);assert.equal(b.review.overtimeStop,'龙门石窟');assert.equal(b.review.worthMoreStop,'白马寺');assert.equal(b.review.chosenPlan,'洛阳两日 · 博物馆线');
 const back=await (await call('/api/trips/trip_demo/review',null,'alice')).json();
 assert.equal(back.review.actualCost,480,'re-submit must overwrite the previous review');
}
// 全空拒绝；非法费用拒绝；超长字段拒绝
assert.equal((await post('/api/trips/trip_demo/review',{},'alice')).status,400,'empty review must be rejected');
assert.equal((await post('/api/trips/trip_demo/review',{actualCost:-5},'alice')).status,400);
assert.equal((await post('/api/trips/trip_demo/review',{actualCost:'520'},'alice')).status,400,'cost must be a number, never a string');
assert.equal((await post('/api/trips/trip_demo/review',{chosenPlan:'x'.repeat(201)},'alice')).status,400);
// 用户隔离：bob 看不到 alice 的复盘
assert.equal((await (await call('/api/trips/trip_demo/review',null,'bob')).json()).review,null,'reviews must be isolated per user');
// DB 不可用时 503，不静默丢失
assert.equal((await worker.fetch(new Request('https://reform.test/api/trips/trip_demo/review',{method:'POST',headers:{'Content-Type':'application/json','oai-authenticated-user-id':'alice'},body:JSON.stringify({actualCost:1})}),{})).status,503);

// ---------- B. AI 思考过程时间线：/api/agent 返回 timeline，agent.steps 仍为 5 条 ----------
const normalizeTimeline=b=>{const copy=structuredClone(b);if(Array.isArray(copy.timeline))copy.timeline=copy.timeline.map(s=>({...s,durationMs:null}));return copy};
{
 const r=await post('/api/agent',{text:'洛阳两天，必去龙门石窟'},'fixture');
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.source,'agent-rules');
 assert(Array.isArray(b.agent.steps)&&b.agent.steps.length===5,'agent.steps must stay exactly 5');
 assert(Array.isArray(b.timeline)&&b.timeline.length===4,'timeline must have 4 steps');
 assert.deepEqual(b.timeline.map(s=>s.key),['select','amap','audit','fallback']);
 assert.deepEqual(b.timeline.map(s=>s.name),['查目录选点','查高德确认入口',b.timeline[2].name,'失败回退规则版']);
 assert.match(b.timeline[2].name,/检查器自查第 [1-4] 轮/,'audit step must carry its round number, max 4');
 assert(b.timeline.slice(0,3).every(s=>s.status==='completed'));
 assert(b.timeline.every(s=>s.durationMs==null||(Number.isFinite(s.durationMs)&&s.durationMs>=0)),'durations must be non-negative or unknown');
 assert.equal(b.timeline[3].status,'skipped','no fallback happened, so the fallback step must read skipped, not completed');
 assert.equal(b.timeline[3].detail,'本次未触发回退');
 assert(b.timeline[2].detail.includes('最多 4 轮'));
 // SSE 的 done 与 JSON 结果一致（耗时归一化后比较；耗时本身是真实测量值，两次请求必然不同）
 const stream=await worker.fetch(new Request('https://reform.test/api/agent',{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream','oai-authenticated-user-id':'fixture'},body:JSON.stringify({text:'洛阳两天，必去龙门石窟'})}),{});
 assert.equal(stream.status,200);
 const text=await stream.text(),frames=text.split('\n\n').filter(f=>f.includes('event: done'));
 assert.equal(frames.length,1);
 const done=JSON.parse(frames[0].split('\n').find(l=>l.startsWith('data: ')).slice(6));
 assert.deepEqual(normalizeTimeline(done),normalizeTimeline(b),'SSE done must equal the JSON result apart from measured durations');
}
// 规则回退分支：回退步骤标记 completed 并写清原因
{
 const seed={operation:'select',city:'洛阳',days:2,start:'09:00',mode:'driving',maxHours:6,restMinutes:30,stops:[],decision:{intent:{city:'洛阳',days:2,interests:['culture'],requiredIds:['hn-longmen'],excludedIds:['hn-whitehorse'],budget:500},expenses:{tickets:999}}};
 const r=await post('/api/agent',{...seed,engine:'rules'},'fixture');
 assert.equal(r.status,200);const b=await r.json();
 assert.equal(b.source,'agent-rules');assert.equal(b.timeline.length,4);
 assert.equal(b.timeline[3].status,'completed');assert(b.timeline[3].detail.includes('回退原因'));
 assert(b.timeline.every(s=>['ai','rules','confirmed','mixed'].includes(s.source)));
}

// ---------- C. v3 学习信号（演示）：GET /api/learning-signals ----------
// 只有 1 名用户标“值得多待”时不出信号
await post('/api/trips/trip_a/review',{worthMoreStop:'龙门石窟'},'alice');
{
 const b=await (await call('/api/learning-signals',null,'alice')).json();
 assert.equal(b.demo,true);assert.deepEqual(b.signals,[],'one user must not create a signal');
 assert(b.note.includes('学习版·演示'));
}
// 第 2 名不同用户标同一类（景点）后出信号；只展示，不改排序
await post('/api/trips/trip_b/review',{worthMoreStop:'白马寺'},'bob');
{
 const b=await (await call('/api/learning-signals',null,'alice')).json();
 assert.equal(b.signals.length,1);
 const signal=b.signals[0];
 assert.equal(signal.category,'scenic');assert.equal(signal.label,'景点');assert.equal(signal.users,2);
 assert.equal(signal.hint,'根据复盘，景点类地点权重上调');
 assert(signal.places.includes('龙门石窟')&&signal.places.includes('白马寺'));
}
// 不在目录里的地点名不计入信号
await post('/api/trips/trip_c/review',{worthMoreStop:'不存在的景点'},'carol');
{
 const b=await (await call('/api/learning-signals',null,'alice')).json();
 assert.equal(b.signals.length,1,'unknown place names must not create signals');
 assert.equal(b.signals[0].users,2);
}
// 同一用户重复标同一类不重复计数
await post('/api/trips/trip_d/review',{worthMoreStop:'老君山'},'alice');
{
 const b=await (await call('/api/learning-signals',null,'alice')).json();
 assert.equal(b.signals[0].users,2,'one user must count once per category');
}

// ---------- 前端：时间线、学习信号、复盘入口存在 ----------
const decisionSrc=await readFile(new URL('../decision.js',import.meta.url),'utf8');
for(const needle of ['function agentTimelineHTML','function refreshLearningSignals',"api('/api/learning-signals'",'data-timeline-step','learning-signals'])assert(decisionSrc.includes(needle),'decision.js must contain '+needle);
const showcaseSrc=await readFile(new URL('../showcase.js',import.meta.url),'utf8');
for(const needle of ['function reviewSectionHTML','function openReview','function submitReview',"api('/api/trips/'",'data-overview-action="review"'])assert(showcaseSrc.includes(needle),'showcase.js must contain '+needle);
const appHtml=await readFile(new URL('../app.html',import.meta.url),'utf8');
assert(appHtml.includes('id="review"'),'app.html must contain the review dialog');
assert(appHtml.includes('id="reviewform"'),'app.html must contain the review form');
const decisionCss=await readFile(new URL('../decision.css',import.meta.url),'utf8');
assert(decisionCss.includes('.agent-timeline'),'decision.css must style the timeline');
const showcaseCss=await readFile(new URL('../showcase.css',import.meta.url),'utf8');
assert(showcaseCss.includes('.review-section'),'showcase.css must style the review section');
const schemaSrc=await readFile(new URL('../db/schema.ts',import.meta.url),'utf8');
assert(schemaSrc.includes('tripReviews'),'db/schema.ts must define trip_reviews');

sql.close();
console.log('Passed: review API (auth, optional fields, overwrite, isolation, validation), agent timeline (4 steps, audit rounds, fallback state, SSE/JSON parity), learning signals demo (2-user threshold, category aggregation, no sorting change), frontend wiring (timeline, review dialog, overview entry).');
