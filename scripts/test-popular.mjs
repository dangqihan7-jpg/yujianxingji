import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker from '../worker/index.js';

// 热门轮播（演示范围）测试：热门分 ＝ 复盘“值得多待” ×3 ＋ 加入行程 ×1。
// 真实复盘与演示数据分开汇总再合并，演示行绝不混进真实计数；
// 只返回目录里的地点，没数据的地点不出现、不编数。
function makeDb(){
 const sql=new DatabaseSync(':memory:');
 return {sql,async init(){
  for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
   sql.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  }
 }};
}
function adapter(sql){
 return {prepare(query){
  const statement=sql.prepare(query);
  return {
   async all(){return {results:statement.all()}},
   bind(...args){return {
    async first(){return statement.get(...args)||null},
    async all(){return {results:statement.all(...args)}},
    async run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}}
   }}
  };
 }};
}
const db=await makeDb();await db.init();
const DB=adapter(db.sql);
const call=(path,body,user)=>worker.fetch(new Request('https://popular.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});
const post=(path,body,user)=>call(path,body,user);
const get=path=>call(path,null,'alice');
const popular=async demo=>await (await get('/api/popular'+(demo?'?demo='+encodeURIComponent(demo):''))).json();

// 空库：不编数，返回空榜
{
 const empty=await popular();
 assert.deepEqual(empty.items,[],'empty database must not invent popular places');
 assert.equal(empty.weights.worth,3);
 assert.equal(empty.weights.added,1);
 assert.equal((await call('/api/popular',{},'alice')).status,405,'popular must be GET only');
 assert.equal((await get('/api/popular?demo=bad%20id')).status,400,'invalid demo param must be rejected');
}

// 真实复盘：alice、bob 标龙门石窟“值得多待”（2 人），carol 标云台山（1 人）；
// 另 1 条只有花费、1 条地点不在目录里，都不应进榜。
await post('/api/trips/trip_r1/review',{worthMoreStop:'龙门石窟'},'alice');
await post('/api/trips/trip_r2/review',{worthMoreStop:'龙门石窟'},'bob');
await post('/api/trips/trip_r3/review',{worthMoreStop:'云台山'},'carol');
await post('/api/trips/trip_r4/review',{actualCost:300},'alice');
await post('/api/trips/trip_r5/review',{worthMoreStop:'不存在的地点'},'bob');

// 不传 demo：只有真实复盘，added 为 0，demo 全为 false
{
 const real=await popular();
 assert.equal(real.demo,false);
 assert.deepEqual(real.items.map(i=>i.name),['龙门石窟','云台山']);
 const longmen=real.items[0];
 assert.deepEqual({id:longmen.id,city:longmen.city,worth:longmen.worth,added:longmen.added,score:longmen.score,demo:longmen.demo,worthReal:longmen.worthReal,worthDemo:longmen.worthDemo},
  {id:'hn-longmen',city:'洛阳',worth:2,added:0,score:6,demo:false,worthReal:2,worthDemo:0});
 assert.equal(real.items[1].score,3);
}

// seed：幂等，复盘 4 行、加入数 8 组；重复种不翻倍
{
 const seed1=await (await post('/api/demo/reviews/seed',{sessionId:'demo_pop1'})).json();
 assert.equal(seed1.seeded,true);
 assert.equal(seed1.count,4,'seed must create exactly 4 demo review rows');
 assert.equal(seed1.addsCount,8,'seed must create exactly 8 demo add rows');
 const seed2=await (await post('/api/demo/reviews/seed',{sessionId:'demo_pop1'})).json();
 assert.equal(seed2.seeded,false,'reseed must be idempotent');
 assert.equal(seed2.count,4);
 assert.equal(seed2.addsCount,8,'reseed must not duplicate demo adds');
 assert.deepEqual(await (await get('/api/demo/status?session=demo_pop1')).json(),{active:true,count:4,addsCount:8});
}

// 带 demo：真实＋演示正确汇总，分开计、再合并；演示行不抬高真实人数
{
 const mixed=await popular('demo_pop1');
 assert.equal(mixed.demo,true);
 assert.equal(mixed.items.length,8,'all 8 seeded demo places must be on the board');
 // 龙门石窟：真实 2 人＋演示 1 人＝3 人，加入 86 → 3×3＋86＝95
 const longmen=mixed.items[0];
 assert.deepEqual({name:longmen.name,worth:longmen.worth,added:longmen.added,score:longmen.score,demo:longmen.demo,worthReal:longmen.worthReal,worthDemo:longmen.worthDemo},
  {name:'龙门石窟',worth:3,added:86,score:95,demo:true,worthReal:2,worthDemo:1});
 // 其余按热门分降序：老君山 74、云台山 3＋68＝71、清明上河园 61、河南博物院 52、白马寺 3＋47＝50、西工小街 3＋44＝47、只有河南 39
 assert.deepEqual(mixed.items.map(i=>[i.name,i.score]),
  [['龙门石窟',95],['老君山',74],['云台山',71],['清明上河园',61],['河南博物院',52],['白马寺',50],['西工小街',47],['只有河南·戏剧幻城',39]]);
 const yuntai=mixed.items.find(i=>i.name==='云台山');
 assert.equal(yuntai.worthReal,1,'real worth must stay 1 even with demo adds');
 assert.equal(yuntai.worthDemo,0);
 assert.equal(yuntai.demo,true,'demo adds alone must flag the row as demo');
 const xigong=mixed.items.find(i=>i.name==='西工小街');
 assert.equal(xigong.worthDemo,1,'demo review must count toward demo worth only');
 assert.equal(xigong.worthReal,0);
 // 只含目录里的地点
 for(const item of mixed.items)assert(item.id&&item.city,'every board item must resolve to a catalogue place');
 assert(!mixed.items.some(i=>i.name==='不存在的地点'),'unknown place names must never appear');
 assert(mixed.note.includes('演示模式'),'demo board must label its note as demo data');
}

// clear：演示复盘与演示加入数一起清，真实复盘原样保留；重复清返回 0
{
 const cleared=await (await post('/api/demo/reviews/clear',{sessionId:'demo_pop1'})).json();
 assert.equal(cleared.cleared,4);
 assert.equal(cleared.addsCleared,8);
 assert.deepEqual(await (await get('/api/demo/status?session=demo_pop1')).json(),{active:false,count:0,addsCount:0});
 const after=await popular('demo_pop1');
 assert.deepEqual(after.items.map(i=>i.name),['龙门石窟','云台山'],'clearing demo data must leave only real reviews');
 assert(after.items.every(i=>i.demo===false));
 const again=await (await post('/api/demo/reviews/clear',{sessionId:'demo_pop1'})).json();
 assert.equal(again.cleared,0);
 assert.equal(again.addsCleared,0);
 const back=await (await get('/api/trips/trip_r1/review',null,'alice')).json();
 assert.equal(back.review.worthMoreStop,'龙门石窟','real review must survive demo clear');
}
db.sql.close();

// ---------- 前端：演示热门轮播接线存在 ----------
const showcaseSrc=await readFile(new URL('../showcase.js',import.meta.url),'utf8');
for(const needle of ['/api/popular','refreshPopularHero','heroPopular','heroPopularHasDemo','热门轮播 · 演示模式 · 演示数据','hero-popular-info','heroPhotoHasPublicMetadata','restoreDailyHero'])assert(showcaseSrc.includes(needle),'showcase.js must contain '+needle);
const decisionSrc=await readFile(new URL('../decision.js',import.meta.url),'utf8');
assert(decisionSrc.includes('refreshPopularHero'),'decision.js must refresh the popular hero on demo toggle/clear');
assert(showcaseSrc.includes('模拟加入数'),'demo copy must mention the demo adds');
const uiCss=await readFile(new URL('../ui.css',import.meta.url),'utf8');
assert(uiCss.includes('#hero-popular-info'),'ui.css must style the popular info line');

console.log('Passed: popular board (real+demo aggregation, demo isolation, no invented places), demo adds seed/clear idempotence, demo hero wiring (popular fetch, rank line, demo label).');
