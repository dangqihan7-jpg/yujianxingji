import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import worker,{CATALOG,computePersonaFromSignals,personaDimsOf,personaTop3} from '../worker/index.js';

// 后台人物画像进站测试：画像只在服务端算、只在后台看。
// 未登录 401、非管理员 403；管理员可见六类画像、分布与推流前 3；
// 用户端响应（热门/学习信号/目录）一律不含画像名、分数与理由；
// 管理员判定：env ADMIN_USERNAME 优先，未指定时认注册最早的账号。
const sql=new DatabaseSync(':memory:');
for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
  sql.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const DB={
 prepare(query){const statement=sql.prepare(query);return {
  async all(){return {results:statement.all()}},
  bind(...args){return {
   async first(){return statement.get(...args)||null},
   async all(){return {results:statement.all(...args)}},
   run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}}
  }}
 }},
 async batch(statements){
  sql.exec('BEGIN');
  try{
   const results=statements.map(statement=>statement.run());
   sql.exec('COMMIT');
   return results;
  }catch(error){
   sql.exec('ROLLBACK');
   throw error;
  }
 }
};
const standaloneEnv={DB,STANDALONE_AUTH:'true'};
const platformEnv={DB};
const call=(path,body,env,headers={})=>worker.fetch(new Request('https://persona.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})}),env);
const data=async r=>({status:r.status,body:await r.json()});
const cookieOf=r=>{const set=r.headers.get('set-cookie');assert(set&&set.includes('travel_session='),'Set-Cookie 缺失');return set.split(';')[0]};
const register=async username=>{
 const r=await call('/api/auth/register',{username,password:'password123'},standaloneEnv);
 assert.equal(r.status,200,'register '+username+' must succeed');
 return {user:(await r.json()).user,cookie:cookieOf(r)};
};
const place=id=>CATALOG.find(p=>p.id===id);
const postDraft=async (cookie,draft)=>{
 const r=await data(await call('/api/draft',{draft,revision:0},standaloneEnv,{Cookie:cookie}));
 assert.equal(r.status,200,'draft save must succeed');
 return r;
};
const postReview=async (cookie,tripId,body)=>{
 const r=await data(await call('/api/trips/'+tripId+'/review',body,standaloneEnv,{Cookie:cookie}));
 assert.equal(r.status,200,'review save must succeed');
 return r;
};

// ---------- 纯函数：维度与画像计分 ----------
assert.deepEqual(personaDimsOf(place('hn-longmen')),['culture']);
assert.deepEqual(personaDimsOf(place('hn-laojunshan')),['nature']);
assert.deepEqual(personaDimsOf(place('hn-xigong')),['food']);
assert.deepEqual(personaDimsOf(place('hn-only-henan')),['immersive']);
{
 const empty=computePersonaFromSignals({interests:[],stops:[],worthStops:[],overtimeStops:[]});
 assert.equal(empty.key,'casual');
 assert.equal(empty.baseline,true);
 assert.equal(empty.confidence,0.5);
 assert.deepEqual(empty.weights,{culture:0.5,nature:0.5,food:0.5,immersive:0.5,family:0.3});
 const one=computePersonaFromSignals({interests:['culture'],stops:[],worthStops:[],overtimeStops:[]});
 assert.equal(one.key,'culture');
 assert.equal(one.weights.culture,0.33);
 assert.equal(one.confidence,0.55);
}

// ---------- 造三个真实用户 ----------
const alice=await register('alice');
const bob=await register('bobuser');
const carol=await register('carol');
// alice：需求文化、洛阳、预算 500；行程含龙门石窟（时长未改）、白马寺（时长调过）；复盘标龙门石窟值得多待、白马寺超时。
await postDraft(alice.cookie,{days:2,start:'09:00',stops:[
 {place:{id:'hn-longmen',name:'龙门石窟',category:'scenic',source:'curated',location:null},day:1,duration:place('hn-longmen').duration},
 {place:{id:'hn-whitehorse',name:'白马寺',category:'scenic',source:'curated',location:null},day:1,duration:place('hn-whitehorse').duration+80}
],decision:{intent:{city:'洛阳',days:2,interests:['culture'],budget:500}}});
await postReview(alice.cookie,'trip_a1',{worthMoreStop:'龙门石窟',overtimeStop:'白马寺'});
// bob：需求山水；行程含云台山；复盘标云台山值得多待（与 alice 同为景点类，凑够 2 人出复盘信号）。
await postDraft(bob.cookie,{days:2,start:'09:00',stops:[
 {place:{id:'hn-yuntai',name:'云台山',category:'scenic',source:'curated',location:null},day:1,duration:place('hn-yuntai').duration}
],decision:{intent:{city:'焦作',days:2,interests:['nature'],budget:400}}});
await postReview(bob.cookie,'trip_b1',{worthMoreStop:'云台山'});
// carol：无行程、无复盘 → 群体基线“周末随性派”。

// 平台用户的当前草稿同样计入真实热度。演示种子仅用于带演示会话的热门榜。
const platformDraft=await data(await call('/api/draft',{revision:0,draft:{days:1,start:'09:00',stops:[
 {place:{id:'hn-longmen',name:'龙门石窟',category:'scenic',source:'curated',location:null},day:1,duration:place('hn-longmen').duration}
]}},platformEnv,{'oai-authenticated-user-id':'persona-platform-user'}));
assert.equal(platformDraft.status,200);
const sessionId='persona-demo';
assert.equal((await call('/api/demo/reviews/seed',{sessionId},platformEnv)).status,200);

const adminPath='/api/admin/personas';
const getAdmin=async (env,headers={})=>data(await call(adminPath,null,env,headers));

// 未登录 401；平台模式 403（后台画像只在独立账号部署可用）
assert.equal((await getAdmin(standaloneEnv)).status,401);
assert.equal((await getAdmin(platformEnv,{'oai-authenticated-user-id':'alice'})).status,403);
// 非管理员 403
assert.equal((await getAdmin(standaloneEnv,{Cookie:bob.cookie})).status,403);
assert.equal((await getAdmin(standaloneEnv,{Cookie:carol.cookie})).status,403);
// /api/auth/me 带 isAdmin：alice 真、bob 假
assert.equal((await data(await call('/api/auth/me',null,standaloneEnv,{Cookie:alice.cookie}))).body.user.isAdmin,true);
assert.equal((await data(await call('/api/auth/me',null,standaloneEnv,{Cookie:bob.cookie}))).body.user.isAdmin,false);

// 管理员（首个注册账号）可见全部
const admin=await getAdmin(standaloneEnv,{Cookie:alice.cookie});
assert.equal(admin.status,200);
assert.equal(admin.body.admin.username,'alice');
assert.equal(admin.body.admin.via,'first-user');
assert.equal(admin.body.totalUsers,3);
assert.equal(admin.body.distribution.length,6);
assert.equal(admin.body.distribution.reduce((n,d)=>n+d.count,0),3);
assert.deepEqual(admin.body.baseline.questionnaire,{n:231,dorm:45.45,partner:43.29,interested:86.58});
assert.deepEqual(admin.body.dimCounts,{culture:43,nature:38,food:2,immersive:9,family:6,none:8});
assert(admin.body.heatNote.includes('当前行程草稿含该地点的去重登录用户数'));

const aliceRow=admin.body.users.find(u=>u.username==='alice');
assert.equal(aliceRow.persona.key,'culture');
assert.equal(aliceRow.persona.name,'文化探索者');
assert.equal(aliceRow.persona.baseline,false);
assert(aliceRow.persona.confidence>0.5&&aliceRow.persona.confidence<=0.95);
assert(aliceRow.weights.culture>aliceRow.weights.nature);
assert.deepEqual(aliceRow.signals.demand.interests,[{key:'culture',name:'文化'}]);
assert.equal(aliceRow.signals.demand.city,'洛阳');
assert.equal(aliceRow.signals.demand.budget,500);
assert.equal(aliceRow.signals.behavior.stops,2);
assert.equal(aliceRow.signals.behavior.durationAdjusts,1);
assert.deepEqual(aliceRow.signals.behavior.worthStops,['龙门石窟']);
assert.deepEqual(aliceRow.signals.behavior.overtimeStops,['白马寺']);
assert.equal(aliceRow.lastSignal,'复盘标「龙门石窟」值得多待');
// 龙门石窟：文化匹配 +3、复盘信号 +1、热度 +5（1 人值得多待、2 人草稿含该地点）。
assert.equal(aliceRow.top3.length,3);
const longmen=aliceRow.top3[0];
assert.equal(longmen.name,'龙门石窟');
assert.deepEqual({match:longmen.match,signal:longmen.signal,heat:longmen.heat,total:longmen.total},{match:3,signal:1,heat:5,total:9});
assert.equal(longmen.heatWorth,1);
assert.equal(longmen.heatAdded,2);
assert.equal(longmen.addedSource,'real');
const whitehorse=aliceRow.top3.find(t=>t.name==='白马寺');
assert.deepEqual({worth:whitehorse?.heatWorth,added:whitehorse?.heatAdded,heat:whitehorse?.heat,addedSource:whitehorse?.addedSource},{worth:0,added:1,heat:1,addedSource:'real'});
const popular=(await data(await call('/api/popular',null,platformEnv))).body.items.find(t=>t.name===longmen.name);
assert.equal(popular.addedReal,longmen.heatAdded);
assert.equal(popular.score,longmen.heat);
const demoPopular=(await data(await call('/api/popular?demo='+sessionId,null,platformEnv))).body.items.find(t=>t.name===longmen.name);
assert(demoPopular.added>longmen.heatAdded);
assert(aliceRow.top3.every(t=>t.match===0||t.match===3));

const bobRow=admin.body.users.find(u=>u.username==='bobuser');
assert.equal(bobRow.persona.key,'nature');
assert.equal(bobRow.persona.baseline,false);
assert(bobRow.top3.some(t=>t.name==='云台山'));

const carolRow=admin.body.users.find(u=>u.username==='carol');
assert.equal(carolRow.persona.key,'casual');
assert.equal(carolRow.persona.baseline,true);
assert.equal(carolRow.persona.confidence,0.5);
assert.equal(carolRow.lastSignal,'尚未留下需求或行为信号');
// 无信号用户的推流前 3 只按热度与复盘信号排，不编画像匹配
assert(carolRow.top3.every(t=>t.match===0));

// ---------- ADMIN_USERNAME 覆盖 ----------
// env 指定 bobuser 为管理员：bob 可见，alice 被拒；指定不存在的账号：谁都进不去。
const adminEnvBob={DB,STANDALONE_AUTH:'true',ADMIN_USERNAME:'bobuser'};
assert.equal((await getAdmin(adminEnvBob,{Cookie:bob.cookie})).status,200);
assert.equal((await getAdmin(adminEnvBob,{Cookie:bob.cookie})).body.admin.via,'env:ADMIN_USERNAME');
assert.equal((await getAdmin(adminEnvBob,{Cookie:alice.cookie})).status,403);
const adminEnvNobody={DB,STANDALONE_AUTH:'true',ADMIN_USERNAME:'nobody'};
assert.equal((await getAdmin(adminEnvNobody,{Cookie:alice.cookie})).status,403);
assert.equal((await getAdmin(adminEnvNobody,{Cookie:bob.cookie})).status,403);

// ---------- 用户端响应一律不含画像信息 ----------
for(const path of ['/api/popular','/api/learning-signals','/api/catalog']){
 const r=await data(await call(path,null,standaloneEnv,{Cookie:alice.cookie}));
 assert.equal(r.status,200,path+' must stay available');
 const text=JSON.stringify(r.body);
 assert(!text.includes('persona'),'user-facing '+path+' must not leak persona data');
 assert(!text.includes('画像'),'user-facing '+path+' must not leak persona data');
 assert(!text.includes('置信度'),'user-facing '+path+' must not leak persona scores');
}
// 推流前 3 的纯函数与服务端一致（同一规则，不写死）
assert.equal(personaTop3('culture',new Map([['scenic',{bonus:1}]]),new Map([['hn-longmen',{worth:1,added:2,addedSource:'real',score:5}]]))[0].name,'龙门石窟');

// ---------- 前端接线存在 ----------
const html=await readFile(new URL('../app.html',import.meta.url),'utf8');
for(const needle of ['id="persona-nav"','data-view="persona"','class="persona-view"','/*PERSONA_CODE*/','authUser.isAdmin'])assert(html.includes(needle),'app.html must contain '+needle);
const showcaseSrc=await readFile(new URL('../showcase.js',import.meta.url),'utf8');
assert(showcaseSrc.includes("'persona'"),'setView must allow persona');
assert(showcaseSrc.includes('renderPersona'),'setView must render the persona page');
const personaSrc=await readFile(new URL('../persona.js',import.meta.url),'utf8');
for(const needle of ['/api/admin/personas','renderPersona','仅管理员可见','推流预览'])assert(personaSrc.includes(needle),'persona.js must contain '+needle);
const personaCss=await readFile(new URL('../persona.css',import.meta.url),'utf8');
assert(personaCss.includes('body[data-view="persona"]'),'persona.css must scope to the persona view');
assert(personaCss.includes('.persona-view'),'persona.css must style the persona view');
const assembleSrc=await readFile(new URL('../scripts/assemble.py',import.meta.url),'utf8');
for(const needle of ['persona-service.mjs','persona.css','PERSONA_CODE'])assert(assembleSrc.includes(needle),'assemble.py must wire persona files');
assert(!/U-00\d/.test(personaSrc),'persona.js must not ship demo user ids');
assert(!personaSrc.includes('演示分布'),'persona.js must not ship demo distribution');

sql.close();
console.log('Passed: persona admin (401/403 gating, first-user and ADMIN_USERNAME admin rules, real-signal scoring, rule-computed top 3, baseline for signal-less users, no persona leakage to user-facing APIs, frontend wiring).');
