import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import worker from '../worker/index.js';
import {matchVisionPlace} from '../vision-service.mjs';

// Isolated, fully migrated SQLite. All upstream calls are mocked; no credentials,
// uploaded photos, production accounts or real model services are ever used.
const migrationNames=(await readdir(new URL('../drizzle/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort();
const migrations=await Promise.all(migrationNames.map(name=>readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')));
const opened=[];let checks=0,calls=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64');
const image='data:image/png;base64,'+png.toString('base64');
const config={XF_VISION_APPID:'test-app',XF_VISION_APIKEY:'vision-key-test-only',XF_VISION_APISECRET:'vision-secret-test-only'};
const recognized={isScenic:true,name:'龙门石窟',city:'洛阳',confidence:0.96,description:'龙门石窟位于洛阳，是以石窟造像闻名的历史文化景点。'};
function database(){
 const sql=new DatabaseSync(':memory:');opened.push(sql);for(const migration of migrations)sql.exec(migration);
 const DB={prepare(query){const statement=sql.prepare(query);let args=[];const prepared={bind(...values){args=values;return prepared},async first(){return statement.get(...args)||null},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}};return prepared}};
 return {sql,DB};
}
const usage=sql=>sql.prepare('SELECT usage_key,calls FROM model_usage ORDER BY usage_key').all().map(row=>({...row}));
const envOf=DB=>({...config,DB});
const request=(env,options={})=>worker.fetch(new Request('https://vision.test/api/vision',options),env);
const post=(env,body={image},headers={},signal)=>request(env,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(body),...(signal?{signal}:{})});
const frame=(content,status,code=0)=>JSON.stringify({header:{code,message:code?'UPSTREAM_PRIVATE_DETAIL':'Success',sid:'test-sid',status},payload:{choices:{status,seq:0,text:content==null?[]:[{content,content_type:'text',index:0,role:'assistant'}]}}});
const deliverResult=(data=recognized)=>socket=>socket.deliver(JSON.stringify(data));
let upstream=deliverResult();
class FakeWebSocket{
 constructor(url){this.url=String(url);this.listeners={};calls.push({url:this.url,socket:this});queueMicrotask(()=>this.emit('open'))}
 addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}
 emit(type,event={}){for(const fn of[...(this.listeners[type]||[])])fn(event)}
 send(data){this.sent=JSON.parse(data);upstream(this)}
 deliver(text){const half=Math.ceil(text.length/2);this.emit('message',{data:frame(text.slice(0,half),1)});this.emit('message',{data:frame(text.slice(half),2)})}
 close(){this.emit('close')}
}
const originalWebSocket=globalThis.WebSocket;globalThis.WebSocket=FakeWebSocket;
async function check(name,fn){calls=[];upstream=deliverResult();await fn();checks++;console.log('Vision: '+name)}
async function jsonError(response,status,pattern,code){assert.equal(response.status,status,await response.clone().text());assert.match(response.headers.get('Content-Type'),/application\/json/);const data=await response.json();assert.match(data.error,pattern);if(code)assert.equal(data.code,code);assert(!JSON.stringify(data).includes(config.XF_VISION_APIKEY));assert(!JSON.stringify(data).includes(config.XF_VISION_APISECRET));return data}
try{
await check('recognizes Longmen, attaches real catalogue id, uses signed WebSocket image API and stores only quota counters',async()=>{
 const {sql,DB}=database(),response=await post(envOf(DB));assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.json(),{name:recognized.name,city:'洛阳',confidence:0.96,description:recognized.description,id:'hn-longmen'});
 assert.equal(calls.length,1);const {url,socket}=calls[0],signed=new URL(url);assert.equal(signed.protocol,'wss:');assert.equal(signed.hostname,'spark-api.cn-huabei-1.xf-yun.com');assert.equal(signed.pathname,'/v2.1/image');assert.equal(signed.searchParams.get('host'),'spark-api.cn-huabei-1.xf-yun.com');assert(signed.searchParams.get('date'));const authorization=Buffer.from(signed.searchParams.get('authorization'),'base64').toString();assert(authorization.includes('api_key="'+config.XF_VISION_APIKEY+'"'));assert(authorization.includes('algorithm="hmac-sha256"'));assert(!url.includes(config.XF_VISION_APISECRET));
 const sent=socket.sent;assert.equal(sent.header.app_id,config.XF_VISION_APPID);assert.equal(sent.parameter.chat.domain,'imagev3');assert.equal(sent.payload.message.text[0].role,'user');assert.equal(sent.payload.message.text[0].content_type,'image');assert.equal(sent.payload.message.text[0].content,png.toString('base64'));assert.equal(sent.payload.message.text[1].content_type,'text');assert.match(sent.payload.message.text[1].content,/不要识别人脸|不要识别.*身份/);
 const rows=usage(sql);assert.equal(rows.length,2);assert(rows.every(row=>row.calls===1&&row.usage_key.includes(':vision:')));assert(!JSON.stringify(rows).includes('192.0.2.1'));assert(!JSON.stringify(rows).includes(image));assert(!JSON.stringify(rows).includes('龙门石窟'));
 assert.deepEqual(sql.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%vision%'").all(),[]);
});
await check('uses catalogue aliases and conservative one-typo matching, never cross-city or ambiguous-name matches',async()=>{
 const {DB}=database(),catalog=JSON.parse(await readFile(new URL('../henan.json',import.meta.url),'utf8')).places;
 const aliased=catalog.find(place=>place.category==='scenic'&&place.aliases?.some(alias=>alias!==place.name));assert(aliased,'Expected a real scenic catalogue alias');
 upstream=deliverResult({...recognized,name:aliased.aliases.find(alias=>alias!==aliased.name),city:aliased.city});const aliasedResponse=await post(envOf(DB));assert.equal((await aliasedResponse.json()).id,aliased.id);
 const sample=[{id:'target',category:'scenic',name:'龙门石窟',city:'洛阳',aliases:['龙门景区']},{id:'second',category:'scenic',name:'龙门石洞',city:'洛阳'},{id:'food',category:'food',name:'龙门石窟',city:'洛阳'}];
 assert.equal(matchVisionPlace('龙门景区','河南省洛阳市',sample)?.id,'target');assert.equal(matchVisionPlace('龙门石窟景区','洛阳市',sample)?.id,'target');assert.equal(matchVisionPlace('龙门石库','洛阳',sample),null);assert.equal(matchVisionPlace('龙门石窟','杭州',sample),null);assert.equal(matchVisionPlace('龙门','洛阳',sample),null);assert.equal(matchVisionPlace('龙门石窟','',sample),null);
 assert.equal(matchVisionPlace('龙门石库','洛阳',[sample[0]])?.id,'target');
});
await check('every scenic catalogue entry matches itself, including city-prefixed short names such as Kaifeng Fu and Luoyang Bridge',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../henan.json',import.meta.url),'utf8')).places,scenic=catalog.filter(place=>place.category==='scenic');assert.equal(scenic.length,93);
 for(const place of scenic)assert.equal(matchVisionPlace(place.name,place.city,catalog)?.id,place.id,place.name+' / '+place.city+' must remain an exact self-match');
 const kaifeng=scenic.find(place=>place.id==='hn-kaifeng-fu');assert(kaifeng);assert.equal(matchVisionPlace(kaifeng.name,kaifeng.city,catalog)?.id,kaifeng.id);
 const bridge={id:'test-luoyang-bridge',name:'洛阳桥',city:'洛阳',category:'scenic'};assert.equal(matchVisionPlace(bridge.name,bridge.city,[bridge])?.id,bridge.id);
});
await check('unknown scenic sites remain successful without inventing an id; names from other cities do not become local matches',async()=>{
 for(const data of [{...recognized,name:'新发现山水公园',city:'郑州'},{...recognized,name:'龙门石窟',city:'杭州'}]){
  const {DB}=database();upstream=deliverResult(data);const response=await post(envOf(DB));assert.equal(response.status,200);const body=await response.json();assert(!Object.hasOwn(body,'id'));assert.equal(body.name,data.name);assert.equal(body.city,data.city);
 }
});
await check('selfies, low confidence, generic names, malformed model JSON and unsafe result shapes are friendly unrecognized responses',async()=>{
 const bad=[{...recognized,isScenic:false},{...recognized,confidence:0.64},{...recognized,confidence:1.01},{...recognized,confidence:'0.9'},{...recognized,name:'景区'},{...recognized,name:''},{...recognized,description:''},{...recognized,isScenic:undefined}];
 for(const data of bad){const {DB}=database();upstream=deliverResult(data);await jsonError(await post(envOf(DB)),422,/没认出来，换张更清晰的试试/,'VISION_UNRECOGNIZED')}
 for(const content of ['not json','null','[]','{"isScenic":true']){const {DB}=database();upstream=socket=>socket.deliver(content);await jsonError(await post(envOf(DB)),422,/没认出来/,'VISION_UNRECOGNIZED')}
});
await check('fenced valid JSON is supported, but audit refusal and truncation cannot masquerade as success',async()=>{
 const {DB}=database();upstream=socket=>socket.deliver('```json\n'+JSON.stringify(recognized)+'\n```');assert.equal((await post(envOf(DB))).status,200);
 {const {DB}=database();upstream=socket=>socket.emit('message',{data:frame(null,0,10013)});await jsonError(await post(envOf(DB)),422,/没认出来/,'VISION_UNRECOGNIZED')}
 {const {DB}=database();upstream=socket=>socket.deliver('{"isScenic":true');await jsonError(await post(envOf(DB)),422,/没认出来/,'VISION_UNRECOGNIZED')}
 {const {DB}=database();upstream=socket=>socket.emit('message',{data:frame(null,0,10907)});await jsonError(await post(envOf(DB)),502,/图片识别服务暂时不可用/,'VISION_UPSTREAM')}
});
await check('missing credentials return explicit configuration error before quota or network',async()=>{
 for(const configPart of [{},{XF_VISION_APPID:config.XF_VISION_APPID},{XF_VISION_APPID:config.XF_VISION_APPID,XF_VISION_APIKEY:config.XF_VISION_APIKEY},{XF_VISION_APIKEY:config.XF_VISION_APIKEY,XF_VISION_APISECRET:config.XF_VISION_APISECRET}]){const {sql,DB}=database();await jsonError(await post({...configPart,DB}),503,/图片识别服务尚未配置/);assert.deepEqual(usage(sql),[])}assert.equal(calls.length,0);
});
await check('domain is restricted to the two published image models; general is accepted when configured',async()=>{
 for(const XF_VISION_DOMAIN of ['imagev2','IMAGEV3','image v3','chat']){const {sql,DB}=database();await jsonError(await post({...envOf(DB),XF_VISION_DOMAIN}),503,/配置不正确/);assert.deepEqual(usage(sql),[])}assert.equal(calls.length,0);
 const {DB}=database();assert.equal((await post({...envOf(DB),XF_VISION_DOMAIN:'general'})).status,200);assert.equal(calls.at(-1).socket.sent.parameter.chat.domain,'general');
});
await check('handshake failure, error frames, malformed frames, oversized answers and early close become friendly errors with no credential or raw-response leakage',async()=>{
 const privateText='UPSTREAM_PRIVATE_DETAIL';
 for(const mode of ['handshake','code','bad-frame','too-large','close-early']){const {DB}=database();upstream=socket=>{if(mode==='handshake'){socket.emit('error',{});socket.emit('close')}else if(mode==='code')socket.emit('message',{data:frame(null,0,10907)});else if(mode==='bad-frame')socket.emit('message',{data:privateText+' '+config.XF_VISION_APISECRET});else if(mode==='too-large')socket.deliver('x'.repeat(10001));else socket.emit('close')};const body=await jsonError(await post(envOf(DB)),502,/图片识别服务暂时不可用/,'VISION_UPSTREAM');assert(!JSON.stringify(body).includes(privateText));assert(!JSON.stringify(body).includes(config.XF_VISION_APISECRET))}
});
await check('upstream timeout and mid-flight cancellation cannot return a recognized result',async()=>{
 const originalTimeout=AbortSignal.timeout;AbortSignal.timeout=()=>AbortSignal.abort(new DOMException('private timeout','TimeoutError'));
 try{const {DB}=database();upstream=()=>{};await jsonError(await post(envOf(DB)),502,/图片识别服务暂时不可用/,'VISION_UPSTREAM')}finally{AbortSignal.timeout=originalTimeout}
 const {DB}=database(),controller=new AbortController();upstream=()=>{controller.abort()};await jsonError(await post(envOf(DB),{image},{},controller.signal),408,/已取消/,'VISION_CANCELLED');
});
await check('already-cancelled input avoids quota and upstream entirely',async()=>{
 const {sql,DB}=database(),controller=new AbortController();controller.abort();await jsonError(await post(envOf(DB),{image},{},controller.signal),408,/已取消/,'VISION_CANCELLED');assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
});
await check('invalid JSON, unsupported image types, corrupt bytes and dimensions are rejected without charging quota',async()=>{
 const {sql,DB}=database(),env=envOf(DB),oversizeDimensions=Buffer.from(png);oversizeDimensions.writeUInt32BE(1025,16);
 const bad=[null,{},[],{image:123},{image:'https://example.test/photo.jpg'},{image:'data:image/svg+xml;base64,PHN2Zz4='},{image:'data:image/jpeg;base64,'+png.toString('base64')},{image:'data:image/png;base64,AAAA'},{image:'data:image/png;base64,%%%%'},{image:'data:image/png;base64,AA=='},{image:'data:image/png;base64,'+oversizeDimensions.toString('base64')}];
 for(const body of bad)await jsonError(await post(env,body),400,/图片|请选择/);
 await jsonError(await request(env,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),400,/图片请求格式不正确/);
 await jsonError(await post(env,{image},{'Content-Type':'text/plain'}),415,/图片/);await jsonError(await post(env,{image},{Origin:'https://other.test'}),403,/来源/);assert.deepEqual(usage(sql),[]);assert.equal(calls.length,0);
});
await check('streamed body and decoded image size limits reject huge input before usage reservation',async()=>{
 const {sql,DB}=database(),env=envOf(DB),huge=Buffer.alloc(1400001);png.copy(huge);
 await jsonError(await post(env,{image:'data:image/png;base64,'+huge.toString('base64')}),413,/图片内容过大/);
 await jsonError(await post(env,{image,padding:'x'.repeat(2000000)}),413,/图片内容过大/);
 await jsonError(await post(env,{image},{'Content-Length':'2000001'}),413,/图片内容过大/);assert.deepEqual(usage(sql),[]);assert.equal(calls.length,0);
});
await check('anonymous quota is three per day; fourth request neither calls model nor increments global quota',async()=>{
 const {sql,DB}=database(),env=envOf(DB);for(let i=0;i<3;i++)assert.equal((await post(env)).status,200);const before=usage(sql);await jsonError(await post(env),429,/今日图片识别次数已用完/);assert.equal(calls.length,3);assert.deepEqual(usage(sql),before);
});
await check('standalone session grants ten; spoofed account/forwarding headers cannot raise anonymous allowance',async()=>{
 const {sql,DB}=database(),now=Date.now();sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run('vision-user','测试旅客','test-only-hash',now);sql.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('vision-session','vision-user',now,now+60000);const env={...envOf(DB),STANDALONE_AUTH:'true'};
 for(let i=0;i<10;i++)assert.equal((await post(env,{image},{Cookie:'travel_session=vision-session','X-Real-IP':'192.0.2.10'})).status,200);await jsonError(await post(env,{image},{Cookie:'travel_session=vision-session'}),429,/今日图片识别次数已用完/);
 for(let i=0;i<3;i++)assert.equal((await post(env,{image},{'X-Real-IP':'192.0.2.2','CF-Connecting-IP':'spoof-'+i,'X-Forwarded-For':'spoof-'+i,'oai-authenticated-user-id':'spoof-'+i})).status,200);await jsonError(await post(env,{image},{'X-Real-IP':'192.0.2.2','CF-Connecting-IP':'new-spoof','X-Forwarded-For':'new-spoof','oai-authenticated-user-id':'new-spoof'}),429,/今日图片识别次数已用完/);assert.equal(calls.length,13);assert(!JSON.stringify(usage(sql)).includes('vision-user'));
});
await check('global quota is 100 and vision scope remains independent of poster, share and planning',async()=>{
 const {sql,DB}=database(),env=envOf(DB),today=new Date().toISOString().slice(0,10),now=Date.now();for(const scope of ['global','poster:global','share:global'])sql.prepare('INSERT INTO model_usage VALUES (?,?,?)').run(today+':'+scope,999,now);
 for(let i=0;i<100;i++)assert.equal((await post(env,{image},{'CF-Connecting-IP':'192.0.2.'+(i+1)})).status,200);
 await jsonError(await post(env,{image},{'CF-Connecting-IP':'198.51.100.1'}),429,/图片识别总额度已用完/);assert.equal(calls.length,100);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':vision:global').calls,100);for(const scope of ['global','poster:global','share:global'])assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':'+scope).calls,999);
});
await check('concurrent requests cannot exceed anonymous cap',async()=>{
 const {DB}=database(),responses=await Promise.all(Array.from({length:20},()=>post(envOf(DB))));assert.equal(responses.filter(response=>response.status===200).length,3);assert.equal(responses.filter(response=>response.status===429).length,17);assert.equal(calls.length,3);
});
await check('failed recognition still counts a real model attempt; missing or broken storage fails closed',async()=>{
 const {sql,DB}=database();upstream=deliverResult({...recognized,isScenic:false});await jsonError(await post(envOf(DB)),422,/没认出来/,'VISION_UNRECOGNIZED');assert(usage(sql).every(row=>row.calls===1));const previous=calls.length;
 for(const env of [{...config},{...config,DB:{prepare(){throw Error('private DB failure')}}}])await jsonError(await post(env),503,/额度控制暂不可用/);assert.equal(calls.length,previous);
});
await check('unsupported endpoint methods cannot consume quota',async()=>{
 const {sql,DB}=database();for(const method of ['GET','PUT','DELETE'])await jsonError(await request(envOf(DB),{method}),405,/方法不支持/);assert.deepEqual(usage(sql),[]);assert.equal(calls.length,0);
});
}finally{globalThis.WebSocket=originalWebSocket;for(const sql of opened)sql.close()}
console.log('Passed: '+checks+' vision checks (mocked WebSocket image upstream, real SQLite, recognition/matching, friendly failure, cancellation, validation, auth and isolated quotas).');
