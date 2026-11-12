import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import worker,{CATALOG} from '../worker/index.js';
import {retrieveKnowledge} from '../retrieval-service.mjs';

const sql=new DatabaseSync(':memory:');
const migrationDir=new URL('../drizzle/',import.meta.url);
for(const name of (await readdir(migrationDir)).filter(name=>name.endsWith('.sql')).sort()){
 sql.exec(await readFile(new URL(name,migrationDir),'utf8'));
}

const queries=[];
const DB={
 prepare(query){
  queries.push(query);
  const statement=sql.prepare(query);
  let args=[];
  const prepared={
   bind(...values){args=values;return prepared},
   async first(){return statement.get(...args)||null},
   async all(){return {results:statement.all(...args)}},
   async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}
  };
  return prepared;
 }
};
const post=(path,body,user)=>worker.fetch(new Request('https://retrieval.test'+path,{
 method:'POST',
 headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})},
 body:JSON.stringify(body)
}),{DB});
const retrieve=(text,intent)=>retrieveKnowledge({text,intent,catalog:CATALOG,db:DB});

try{
 const exact=await retrieve('龙门石窟');
 const named=exact.find(result=>result.kind==='place'&&result.name==='龙门石窟');
 assert(named,'exact catalogue names must be retrievable');
 assert.equal(named.city,'洛阳');
 assert.equal(named.source,'地点资料');
 const longmen=CATALOG.find(place=>place.name===named.name);
 for(const value of [longmen.description,longmen.visitTip,longmen.reference]){
  assert(named.text.includes(value),'place evidence must include the catalogue description, visit tip and reference');
 }
 assert((await retrieve('行程外的龙门石窟值得去吗？')).some(result=>result.kind==='place'&&result.name===named.name));
 assert((await retrieve('龙门石')).some(result=>result.kind==='place'&&result.name===named.name));
 assert((await retrieve('想看看河南博物馆')).some(result=>result.kind==='place'&&result.name==='河南博物院'));
 assert.deepEqual(await retrieve('火星基地怎么走？'),[]);

 const cityOnly=await retrieve('想去济源');
 assert(cityOnly.some(result=>result.kind==='place'&&result.city==='济源'));
 for(const places of [await retrieve('想看焦作山水'),await retrieve('',{city:'焦作',interests:['nature']})]){
  assert(places.some(result=>result.kind==='place'&&result.city==='焦作'&&result.name==='云台山'));
 }
 const broad=await retrieve('想看看文化、山水、美食、夜游和亲子活动');
 assert.equal(broad.length,8,'cap broad keyword searches at eight results');
 assert(broad.every(result=>result.kind==='place'),'survey figures require a trigger word');

 const demo=await post('/api/demo/reviews/seed',{sessionId:'demo_retrieval'});
 assert.equal(demo.status,200,await demo.clone().text());
 assert.equal((await demo.json()).count,4);
 assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM trip_reviews').get().count,0);
 queries.length=0;
 assert.deepEqual(await retrieve('龙门石窟'),exact,'demo-only rows must not change retrieval');
 assert.equal(queries.length,1);
 assert.match(queries[0],/^SELECT\b.*\bFROM\s+trip_reviews\b/is);
 assert.doesNotMatch(queries[0],/demo_reviews|demo_adds/i);

 const fixtures=[
  ['reviewer-alice',{worthMoreStop:'龙门石窟',actualCost:999}],
  ['reviewer-bob',{worthMoreStop:'龙门石窟',overtimeStop:'在龙门石窟走得太久',actualCost:32}],
  ['reviewer-carol',{worthMoreStop:'龙门石',overtimeStop:'白马寺',actualCost:66.25}],
  ['reviewer-dave',{worthMoreStop:'龙门石窟',actualCost:180.5}],
  ['reviewer-alice',{worthMoreStop:'龙门石窟',overtimeStop:'龙门石窟',actualCost:180.5}],
  ['reviewer-eve',{overtimeStop:'龙门石窟',actualCost:0}],
  ['reviewer-alice',{actualCost:1234,chosenPlan:'PRIVATE_SENTINEL 龙门石窟'}]
 ];
 for(const [index,[user,payload]] of fixtures.entries()){
  const tripId='review_'+index;
  const response=await post('/api/trips/'+tripId+'/review',payload,user);
  assert.equal(response.status,200,await response.clone().text());
  sql.prepare('UPDATE trip_reviews SET updated_at = ? WHERE trip_id = ?').run(index,tripId);
 }
 const unauthenticated=await post('/api/trips/review_anon/review',{worthMoreStop:'龙门石窟',actualCost:3456});
 assert.equal(unauthenticated.status,401);
 queries.length=0;
 const results=await retrieve('龙门石窟');
 assert.deepEqual(results.filter(result=>result.kind==='review'),[{
  kind:'review',name:'龙门石窟',city:'洛阳',
  text:'值得多待 4 人；超时提及 3 人；实际行程总花费原始值（元）：[0,180.5,180.5,66.25,32]',
  source:'用户复盘 5 人'
 }]);
 assert(!/reviewer-|PRIVATE_SENTINEL|review_\d/.test(JSON.stringify(results)));
 assert.equal(queries.length,1);
 assert.match(queries[0],/^SELECT\b.*\bFROM\s+trip_reviews\b/is);
 assert.doesNotMatch(queries[0],/demo_reviews|demo_adds/i);
 const whitehorse=(await retrieve('白马寺')).find(result=>result.kind==='review');
 assert.equal(whitehorse.source,'用户复盘 1 人');
 assert.equal(whitehorse.text,'值得多待 0 人；超时提及 1 人；实际行程总花费原始值（元）：[66.25]');

 const survey=(await retrieve('大家一般在意哪些花费？')).find(result=>result.kind==='survey');
 assert.equal(survey.source,'问卷 231 份');
 assert.deepEqual(survey.text.match(/\d+\.\d+%/g).sort(),[
  '48.05%','48.48%','47.62%','42.42%','73.59%','86.58%','3.46%',
  '57.14%','54.11%','36.80%','40.26%','45.45%','43.29%','42.42%','36.36%'
 ].sort());
 assert.match(survey.text,/Q1[–-]Q9[^。]*\b231\b/);
 assert.match(survey.text,/Q11[^。]*\b99\b/,'Q11 must carry its own sample size');
 assert.match(survey.text,/8\s*人/,'retain the count of uninterested respondents');
 for(const keyword of ['花费','费用','在意','一般','多数','大家','攻略']){
  assert((await retrieve(keyword)).some(result=>result.kind==='survey'),keyword+' must trigger survey retrieval');
 }
 const broadWithSurvey=await retrieve('大家一般在意文化、山水、美食、夜游还是亲子活动？');
 assert.equal(broadWithSurvey.length,8);
 assert(broadWithSurvey.some(result=>result.kind==='survey'),'survey must survive the result cap when triggered');
 console.log('Retrieval: catalogue keywords, real review counts and costs, demo isolation, and survey facts passed');
}finally{
 sql.close();
}
