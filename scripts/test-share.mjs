import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker from '../worker/index.js';

// Real SQLite, all migrations, no network, no model services or real credentials.
const migrationNames=(await readdir(new URL('../drizzle/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort();
const migrations=await Promise.all(migrationNames.map(name=>readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')));
const opened=[];let checks=0;
function database(){
 const sql=new DatabaseSync(':memory:');opened.push(sql);for(const migration of migrations)sql.exec(migration);
 const DB={prepare(query){const statement=sql.prepare(query);let args=[];const prepared={bind(...values){args=values;return prepared},async first(){return statement.get(...args)||null},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}};return prepared}};
 return {sql,DB};
}
const request=(path,env={},options={})=>worker.fetch(new Request('https://share.test'+path,options),env);
const post=(body,env={},headers={})=>request('/api/share',env,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(body)});
const trip=(days=2)=>({places:['龙门石窟','白马寺'],days,schedule:Array.from({length:days},(_,i)=>({day:i+1,stops:i===0?[{name:'龙门石窟',city:'洛阳',duration:180,travelMinutes:null},{name:'白马寺',city:'洛阳',duration:90,travelMinutes:45}]:[]}))});
const rows=sql=>Number(sql.prepare('SELECT count(*) AS n FROM shares').get().n);
const usage=sql=>sql.prepare('SELECT usage_key,calls FROM model_usage ORDER BY usage_key').all().map(row=>({...row}));
const tokenOf=async response=>{assert.equal(response.status,200,await response.clone().text());const body=await response.json();assert.deepEqual(Object.keys(body),['token']);assert.match(body.token,/^[A-Za-z0-9_-]{8}$/);return body.token};
async function check(name,fn){await fn();checks++;console.log('Share: '+name)}
const originalFetch=globalThis.fetch,originalRandom=Math.random;globalThis.fetch=async()=>{throw Error('Unexpected outbound network call')};Math.random=()=>{throw Error('Share tokens must not use Math.random')};
try{
await check('migration keeps existing tables and adds exactly the requested share columns',async()=>{
 const {sql}=database();assert.deepEqual(sql.prepare('PRAGMA table_info(shares)').all().map(row=>[row.name,row.type,row.notnull,row.pk]),[['token','TEXT',1,1],['data','TEXT',1,0],['created_at','INTEGER',1,0],['expires_at','INTEGER',1,0]]);
 for(const name of ['flow_stats','model_usage','travel_drafts','sessions','users'])assert(sql.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?').get(name));
 const snapshots=(await readdir(new URL('../drizzle/meta/',import.meta.url))).filter(name=>/^\d+_snapshot\.json$/.test(name)).sort();
 let prior;for(const name of snapshots){const snapshot=JSON.parse(await readFile(new URL('../drizzle/meta/'+name,import.meta.url),'utf8'));if(prior)assert.equal(snapshot.prevId,prior);prior=snapshot.id}
 assert.match(migrations.at(-1),/CREATE TABLE `shares`/);assert(!/DROP|ALTER|flow_stats/i.test(migrations.at(-1)));
});
await check('create anonymous snapshot, strip private fields at every level, use 30-day millisecond TTL',async()=>{
 const {sql,DB}=database();const body={...trip(),user:{id:'secret-account'},email:'private@example.test',revision:99,prompt:'secret prompt'};body.schedule[0].user={username:'private'};Object.assign(body.schedule[0].stops[0],{user:{id:'private'},place:{location:[112,34]},routing:{address:'private address'},password:'secret'});
 const before=Date.now(),token=await tokenOf(await post(body,{DB})),after=Date.now(),row=sql.prepare('SELECT * FROM shares WHERE token=?').get(token);
 assert.deepEqual(JSON.parse(row.data),trip());assert(row.created_at>=before&&row.created_at<=after);assert.equal(row.expires_at-row.created_at,30*86400000);assert.equal(rows(sql),1);
 assert(!row.data.includes('secret'));assert(!row.data.includes('private'));assert.equal(usage(sql).length,2);assert(usage(sql).every(row=>!row.usage_key.includes('192.0.2.1')));
});
await check('public JSON and server-rendered read-only HTML require no auth lookup or cookies',async()=>{
 const {DB}=database(),token=await tokenOf(await post(trip(),{DB}));
 const publicDB={prepare(query){assert(!/users|sessions/.test(query),'Share reads cannot resolve an account');return DB.prepare(query)}};
 const response=await request('/api/share/'+token,{DB:publicDB},{headers:{Cookie:'travel_session=unrelated','oai-authenticated-user-id':'someone'}});assert.equal(response.status,200);assert.deepEqual(await response.json(),trip());assert.equal(response.headers.get('Set-Cookie'),null);
 const page=await request('/s/'+token,{DB:publicDB});assert.equal(page.status,200);assert.match(page.headers.get('Content-Type'),/text\/html/);const html=await page.text();assert.match(html,/由豫见行迹生成/);assert.match(html,/DAY 1/);assert.match(html,/龙门石窟/);assert.match(html,/我也要规划/);assert(!/<script|<input|<form|contenteditable|\son\w+\s*=/i.test(html));assert.equal(page.headers.get('Cache-Control'),'no-store');assert.match(page.headers.get('Content-Security-Policy'),/default-src 'none'/);
 const head=await request('/s/'+token,{DB:publicDB},{method:'HEAD'});assert.equal(head.status,200);assert.equal(await head.text(),'');
});
await check('HTML escapes untrusted itinerary names and cities',async()=>{
 const {DB}=database(),name='<script>alert("xss")</script>',city='<img src=x onerror=alert(1)>';
 const body={places:[name],days:1,schedule:[{day:1,stops:[{name,city,duration:60,travelMinutes:null}]}]};const token=await tokenOf(await post(body,{DB}));
 const response=await request('/s/'+token,{DB}),html=await response.text();assert.equal(response.status,200);assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img'));assert(!html.includes('<script>'));assert(!html.includes('<img'));
});
await check('expired, exact-boundary, absent and malformed tokens return friendly HTML 404',async()=>{
 const {sql,DB}=database(),token=await tokenOf(await post(trip(),{DB}));
 const oldNow=Date.now,boundary=oldNow();Date.now=()=>boundary;
 try{
  for(const expiry of [boundary-1,boundary]){sql.prepare('UPDATE shares SET expires_at=? WHERE token=?').run(expiry,token);for(const path of ['/s/'+token,'/api/share/'+token]){const response=await request(path,{DB});assert.equal(response.status,404);assert.match(response.headers.get('Content-Type'),/text\/html/);assert.match(await response.text(),/该分享已过期或不存在/);assert.equal(response.headers.get('Cache-Control'),'no-store')}}
  sql.prepare('UPDATE shares SET expires_at=? WHERE token=?').run(boundary+1,token);assert.equal((await request('/s/'+token,{DB})).status,200);
 }finally{Date.now=oldNow}
 for(const path of ['/s','/s/','/s/bad','/s/12345678/extra','/s/notfound','/api/share/notfound','/api/share/1234567!']){const response=await request(path,{DB});assert.equal(response.status,404);const html=await response.text();assert.match(html,/该分享已过期或不存在/);assert.match(html,/回首页/);assert(!html.startsWith('{'))}
});
await check('anonymous daily limit is three; excess gets 429 and no new link or global charge',async()=>{
 const {sql,DB}=database();for(let i=0;i<3;i++)await tokenOf(await post(trip(),{DB}));const before=usage(sql),response=await post(trip(),{DB});assert.equal(response.status,429);assert.match((await response.json()).error,/今日分享次数已用完/);assert.equal(rows(sql),3);assert.deepEqual(usage(sql),before);
});
await check('standalone user gets ten shares; spoofed platform and forwarding headers do not raise anonymous quota',async()=>{
 const {sql,DB}=database(),now=Date.now();sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run('u_test','测试旅客','test-only-password-hash',now);sql.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('test-session','u_test',now,now+60000);const env={DB,STANDALONE_AUTH:'true'};
 for(let i=0;i<10;i++)await tokenOf(await post(trip(),env,{Cookie:'travel_session=test-session','X-Real-IP':'192.0.2.9'}));assert.equal((await post(trip(),env,{Cookie:'travel_session=test-session'})).status,429);assert.equal(rows(sql),10);assert(!JSON.stringify(usage(sql)).includes('u_test'));
 for(let i=0;i<3;i++)await tokenOf(await post(trip(),env,{'X-Real-IP':'192.0.2.2','CF-Connecting-IP':'spoof-'+i,'X-Forwarded-For':'spoof-'+i,'oai-authenticated-user-id':'spoof-user-'+i}));assert.equal((await post(trip(),env,{'X-Real-IP':'192.0.2.2','CF-Connecting-IP':'new-spoof','oai-authenticated-user-id':'spoof'})).status,429);assert.equal(rows(sql),13);
});
await check('global daily limit is 100 across visitors and has independent share scope',async()=>{
 const {sql,DB}=database(),today=new Date().toISOString().slice(0,10),now=Date.now();sql.prepare('INSERT INTO model_usage VALUES (?,?,?)').run(today+':global',999,now);sql.prepare('INSERT INTO model_usage VALUES (?,?,?)').run(today+':poster:global',100,now);
 for(let i=0;i<100;i++)await tokenOf(await post(trip(),{DB},{'CF-Connecting-IP':'192.0.2.'+(i+1)}));const response=await post(trip(),{DB},{'CF-Connecting-IP':'198.51.100.1'});assert.equal(response.status,429);assert.match((await response.json()).error,/分享总额度/);assert.equal(rows(sql),100);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':share:global').calls,100);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':poster:global').calls,100);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':global').calls,999);
});
await check('concurrent anonymous requests never create over three links',async()=>{
 const {sql,DB}=database(),responses=await Promise.all(Array.from({length:20},()=>post(trip(),{DB})));assert.equal(responses.filter(response=>response.status===200).length,3);assert.equal(responses.filter(response=>response.status===429).length,17);assert.equal(rows(sql),3);
});
await check('token uses six secure random bytes and retries collision without overwriting an existing share',async()=>{
 const {sql,DB}=database(),now=Date.now(),saved=JSON.stringify(trip());sql.prepare('INSERT INTO shares VALUES (?,?,?,?)').run('AAAAAAAA',saved,now,now+60000);
 const descriptor=Object.getOwnPropertyDescriptor(crypto,'getRandomValues');let attempts=0;
 Object.defineProperty(crypto,'getRandomValues',{configurable:true,value(array){assert.equal(array.byteLength,6);array.fill(attempts++===0?0:255);return array}});
 try{assert.equal(await tokenOf(await post(trip(),{DB})),'________');assert.equal(attempts,2);assert.equal(rows(sql),2);assert.equal(sql.prepare('SELECT data FROM shares WHERE token=?').get('AAAAAAAA').data,saved);assert(usage(sql).every(row=>row.calls===1))}finally{if(descriptor)Object.defineProperty(crypto,'getRandomValues',descriptor);else delete crypto.getRandomValues}
});
await check('collision exhaustion returns 503, never overwrites a snapshot',async()=>{
 const {sql,DB}=database(),now=Date.now();sql.prepare('INSERT INTO shares VALUES (?,?,?,?)').run('AAAAAAAA',JSON.stringify(trip()),now,now+60000);
 const descriptor=Object.getOwnPropertyDescriptor(crypto,'getRandomValues');let attempts=0;Object.defineProperty(crypto,'getRandomValues',{configurable:true,value(array){attempts++;return array.fill(0)}});
 try{const response=await post(trip(),{DB});assert.equal(response.status,503);assert.equal(attempts,8);assert.equal(rows(sql),1)}finally{if(descriptor)Object.defineProperty(crypto,'getRandomValues',descriptor);else delete crypto.getRandomValues}
});
await check('validation and cross-origin errors do not charge quota; requests above body limit rejected',async()=>{
 const {sql,DB}=database(),invalid=[null,{}, {...trip(),days:0},{...trip(),days:8},{...trip(),places:[]},{...trip(),schedule:[]},{...trip(),schedule:[trip().schedule[0],trip().schedule[0]]},{...trip(),schedule:[{day:1,stops:[{name:'不在清单中',city:'洛阳',duration:90}]},{day:2,stops:[]}]},{...trip(),schedule:[{day:1,stops:[{name:'龙门石窟',duration:1}]},{day:2,stops:[]}]},{...trip(),schedule:[{day:1,stops:[{name:'龙门石窟',duration:90,travelMinutes:-1}]},{day:2,stops:[]}]}];for(const body of invalid)assert.equal((await post(body,{DB})).status,400);
 assert.equal((await post(trip(),{DB},{Origin:'https://other.test'})).status,403);assert.equal((await post({...trip(),private:'x'.repeat(100001)},{DB})).status,413);assert.equal(rows(sql),0);assert.equal(usage(sql).length,0);
});
await check('six or seven days and fifteen stops are retained without poster truncation',async()=>{
 const {DB}=database();for(const days of [6,7]){const places=Array.from({length:15},(_,i)=>'地点'+i),body={places,days,schedule:Array.from({length:days},(_,i)=>({day:i+1,stops:i===0?places.map(name=>({name,city:'河南',duration:60,travelMinutes:null})):[]}))};const token=await tokenOf(await post(body,{DB}));assert.deepEqual(await (await request('/api/share/'+token,{DB})).json(),body)}
});
await check('distinct POIs sharing one display name retain their city and day, with a total-stop cap',async()=>{
 const {sql,DB}=database(),body={places:['连锁餐厅','龙门石窟'],days:2,schedule:[{day:1,stops:[{name:'连锁餐厅',city:'郑州',duration:60,travelMinutes:null}]},{day:2,stops:[{name:'龙门石窟',city:'洛阳',duration:120,travelMinutes:null},{name:'连锁餐厅',city:'洛阳',duration:60,travelMinutes:30}]}]};
 const token=await tokenOf(await post(body,{DB}));assert.deepEqual(await (await request('/api/share/'+token,{DB})).json(),body);
 const tooMany={places:['连锁餐厅'],days:2,schedule:[{day:1,stops:Array.from({length:8},()=>({name:'连锁餐厅',city:'郑州',duration:60,travelMinutes:null}))},{day:2,stops:Array.from({length:8},()=>({name:'连锁餐厅',city:'洛阳',duration:60,travelMinutes:null}))}]};assert.equal((await post(tooMany,{DB})).status,400);assert.equal(rows(sql),1);
});
await check('missing or failed storage is an honest 503, and cannot create a link',async()=>{
 const broken={prepare(){throw Error('simulated database unavailable')}};
 for(const env of [{},{DB:broken}]){assert.equal((await post(trip(),env)).status,503);for(const path of ['/s/abcdefgh','/api/share/abcdefgh']){const response=await request(path,env);assert.equal(response.status,503);const html=await response.text();assert.match(html,/分享服务暂时不可用/);assert(!html.includes('该分享已过期或不存在'))}}
 const sql=new DatabaseSync(':memory:');opened.push(sql);sql.exec(migrations.slice(0,4).join('\n'));const DB={prepare(query){return {first:async()=>sql.prepare(query).get()}}};assert.equal((await post(trip(),{DB})).status,503);assert.equal(sql.prepare('SELECT count(*) AS n FROM model_usage').get().n,0);
});
await check('unsupported methods are rejected and stored JSON cannot leak later private additions',async()=>{
 const {sql,DB}=database(),token=await tokenOf(await post(trip(),{DB}));for(const [path,method]of [['/api/share','GET'],['/api/share/'+token,'POST'],['/s/'+token,'DELETE']])assert.equal((await request(path,{DB},{method})).status,405);
 sql.prepare('UPDATE shares SET data=? WHERE token=?').run(JSON.stringify({...trip(),user:{id:'later-private'}}),token);assert.deepEqual(await (await request('/api/share/'+token,{DB})).json(),trip());
});
await check('posterEndpoint source remains byte-for-byte unchanged',async()=>{
 const source=await readFile(new URL('../server.mjs',import.meta.url),'utf8'),start=source.indexOf('async function posterEndpoint('),end=source.indexOf('\n// Shares are public snapshots.',start);const sha=createHash('sha256').update(source.slice(start,end)).digest('hex');assert.equal(sha,'2d580a4cc11e8ac7a6852b216a502b34612cad08addf16c9644603577a6e858f');
});
}finally{globalThis.fetch=originalFetch;Math.random=originalRandom;for(const sql of opened)sql.close()}
console.log('Passed: '+checks+' share checks (real SQLite migrations, anonymous/public reads, expiry, privacy, quotas, secure collision handling and poster unchanged).');
