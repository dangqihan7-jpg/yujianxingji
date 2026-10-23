import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import worker from '../worker/index.js';

// No live microphone or upstream call. Real SQLite migrations + mocked WSS.
const migrations=await Promise.all((await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort().map(n=>readFile(new URL('../drizzle/'+n,import.meta.url),'utf8')));
const opened=[],config={XF_ASR_APPID:'test-app',XF_ASR_APIKEY:'stt-test-key',XF_ASR_APISECRET:'stt-test-secret'};
const pcm=new Uint8Array(1280).fill(1);
let calls=[],checks=0,onFrame,onOpen=true;
const original={WebSocket:globalThis.WebSocket,setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,performance:globalThis.performance,Date:globalThis.Date};
function database(){const sql=new DatabaseSync(':memory:');opened.push(sql);for(const m of migrations)sql.exec(m);return {sql,DB:{prepare(query){const statement=sql.prepare(query);let args=[];const p={bind(...values){args=values;return p},async first(){return statement.get(...args)||null},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}};return p}}}}
class Socket{
 constructor(url){this.url=String(url);this.listeners=new Map();this.frames=[];this.readyState=0;this.bufferedAmount=0;calls.push(this);queueMicrotask(()=>{if(onOpen){this.readyState=1;this.emit('open')}})}
 addEventListener(t,fn){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(fn)}
 removeEventListener(t,fn){this.listeners.get(t)?.delete(fn)}
 emit(t,e={}){for(const fn of [...(this.listeners.get(t)||[])])fn(e)}
 send(raw){const frame=JSON.parse(raw);this.frames.push(frame);onFrame(this,frame)}
 deliver(data){this.emit('message',{data:typeof data==='string'?data:JSON.stringify(data)})}
 close(){this.readyState=3;this.emit('close')}
}
globalThis.WebSocket=Socket;
const frame=(text,sn=0,status=2)=>({code:0,data:{status,result:{sn,ws:[{cw:[{w:text},{w:'不用的候选'}]}]}}});
const normal=(socket,payload)=>{if(payload.data.status===2)socket.deliver(frame('郑州周末两天'))};
const envOf=DB=>({...config,DB});
function post(env,audio=pcm,headers={},signal){return worker.fetch(new Request('https://stt.test/api/stt',{method:'POST',headers:{'Content-Type':'application/octet-stream','CF-Connecting-IP':'192.0.2.1',...headers},body:audio,...(signal?{signal}:{})}),env)}
const usage=sql=>sql.prepare('SELECT usage_key,calls FROM model_usage ORDER BY usage_key').all().map(r=>({...r}));
async function ok(response,text='郑州周末两天'){assert.equal(response.status,200,await response.clone().text());assert.deepEqual(await response.json(),{text})}
async function error(response,status,pattern){assert.equal(response.status,status,await response.clone().text());const body=await response.json();assert.match(body.error,pattern);assert(!JSON.stringify(body).includes(config.XF_ASR_APIKEY));assert(!JSON.stringify(body).includes(config.XF_ASR_APISECRET));return body}
async function check(name,fn){calls=[];onOpen=true;onFrame=normal;await fn();checks++;console.log('STT: '+name)}
async function settle(){for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve))}
async function clocked(fn){
 const timers=new Map();let now=0;
 Object.defineProperty(globalThis,'performance',{configurable:true,writable:true,value:{now:()=>now}});
 globalThis.setTimeout=(callback,delay=0,...args)=>{
  if(delay<6000)return original.setTimeout(()=>{now+=delay;callback(...args)},0);
  const id={};timers.set(id,{delay,callback:()=>callback(...args)});return id;
 };
 globalThis.clearTimeout=id=>{if(timers.has(id))timers.delete(id);else original.clearTimeout(id)};
 try{return await fn(timers)}finally{globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;Object.defineProperty(globalThis,'performance',{configurable:true,writable:true,value:original.performance})}
}
try{
await check('missing credentials return explicit 503 without quota or upstream',async()=>{
 for(const part of [{},{XF_ASR_APPID:'test-app'},{XF_ASR_APPID:'test-app',XF_ASR_APIKEY:'test-key'}]){const {sql,DB}=database();await error(await post({...part,DB}),503,/语音识别服务尚未配置/);assert.deepEqual(usage(sql),[])}assert.equal(calls.length,0);
});
await check('empty, odd-length, oversized and encoded-container audio reject before spending quota',async()=>{
 const {sql,DB}=database();await error(await post(envOf(DB),new Uint8Array()),400,/录音为空/);await error(await post(envOf(DB),new Uint8Array(3)),400,/16位/);
 await error(await post(envOf(DB),new Uint8Array(1920002)),413,/60秒/);
 await error(await post(envOf(DB),pcm,{'Content-Length':'1920002'}),413,/60秒/);
 for(const magic of ['RIFF','OggS','fLaC','ID3x'])await error(await post(envOf(DB),new TextEncoder().encode(magic)),400,/PCM/);
 await error(await post(envOf(DB),pcm,{'Content-Type':'audio/wav'}),415,/PCM/);assert.deepEqual(usage(sql),[]);assert.equal(calls.length,0);
});
await check('successful dictation uses the fixed signed host, raw audio and explicit end marker',async()=>{
 const {sql,DB}=database();await ok(await post(envOf(DB)));assert.equal(calls.length,1);const s=calls[0],u=new URL(s.url);assert.equal(u.origin,'wss://iat-api.xfyun.cn');assert.equal(u.pathname,'/v2/iat');assert.equal(u.searchParams.get('host'),'iat-api.xfyun.cn');
 const canonical='host: iat-api.xfyun.cn\ndate: '+u.searchParams.get('date')+'\nGET /v2/iat HTTP/1.1';
 const signature=createHmac('sha256',config.XF_ASR_APISECRET).update(canonical).digest('base64');assert(Buffer.from(u.searchParams.get('authorization'),'base64').toString().includes('signature="'+signature+'"'));
 assert.deepEqual(s.frames.map(f=>f.data.status),[0,2]);assert.deepEqual(s.frames[0].common,{app_id:config.XF_ASR_APPID});assert.equal(s.frames[0].business.eos,10000);assert.equal(s.frames[0].business.wpgs,undefined);assert.equal(s.frames[0].data.format,'audio/L16;rate=16000');assert.equal(s.frames[0].data.encoding,'raw');assert.deepEqual(Buffer.from(s.frames[0].data.audio,'base64'),Buffer.from(pcm));assert.equal(s.readyState,3);assert([...s.listeners.values()].every(v=>v.size===0));
 assert(usage(sql).every(row=>row.calls===1&&row.usage_key.includes(':stt:')));assert(!JSON.stringify(usage(sql)).includes('192.0.2.1'));
});
await check('ordered results use first candidates and deduplicate identical sn frames',async()=>{
 const {DB}=database();onFrame=(s,p)=>{if(p.data.status===2){s.deliver(frame('两天',1,1));s.deliver(frame('郑州',0,1));s.deliver(frame('郑州',0,1));s.deliver({code:0,data:{status:2}})}};await ok(await post(envOf(DB)),'郑州两天');
});
await check('a full 60-second clip sends 1500 bounded frames then EOS at the audio clock',async()=>{
 await clocked(async()=>{const {DB}=database(),audio=new Uint8Array(1920000).fill(1);await ok(await post(envOf(DB),audio));const frames=calls[0].frames;assert.equal(frames.length,1501);assert.equal(frames[0].data.status,0);assert(frames.slice(1,-1).every(p=>p.data.status===1));assert.equal(frames.at(-1).data.status,2);assert.equal(frames.slice(0,-1).reduce((n,p)=>n+Buffer.from(p.data.audio,'base64').length,0),1920000);assert.equal(performance.now(),59960)});
});
await check('upstream errors, malformed/incomplete results and premature VAD stay friendly 502',async()=>{
 const invalid=[s=>s.deliver({code:10105,message:'UPSTREAM_PRIVATE_DETAIL'}),s=>s.deliver('{'),s=>s.emit('error'),s=>s.close(),s=>s.deliver(frame('')),s=>{s.deliver(frame('甲',0,1));s.deliver(frame('乙',0,2))},s=>{s.deliver(frame('甲',0,1));s.deliver(frame('乙',2,2))},s=>s.deliver({code:0,data:{status:2,result:{sn:0,pgs:'rpl',rg:[0,1],ws:[]}}})];
 for(const deliver of invalid){const {sql,DB}=database();onFrame=(s,p)=>{if(p.data.status===2)deliver(s)};const body=await error(await post(envOf(DB)),502,/语音|没有听清/);assert(!JSON.stringify(body).includes('UPSTREAM_PRIVATE_DETAIL'));assert(usage(sql).every(row=>row.calls===1))}
 const {DB}=database();onFrame=(s,p)=>{if(p.data.status===0)s.deliver(frame('只识别了前面'))};await error(await post(envOf(DB),new Uint8Array(2560)),502,/提前结束|分段录音/);
});
await check('handshake and whole-session deadlines return 502 and release listeners',async()=>{
 for(const delay of [8000,85000])await clocked(async timers=>{const {DB}=database();onOpen=delay!==8000;onFrame=()=>{};const pending=post(envOf(DB));await settle();const timer=[...timers.values()].find(t=>t.delay===delay);assert(timer);timer.callback();await error(await pending,502,/超时/);assert.equal(calls[0].readyState,3);assert.equal(timers.size,0)});
});
await check('cancelled requests close the upstream and cannot return late transcripts',async()=>{
 const {sql,DB}=database(),controller=new AbortController();controller.abort();await error(await post(envOf(DB),pcm,{},controller.signal),408,/取消/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
 const next=database(),active=new AbortController();onFrame=()=>{};const pending=post(envOf(next.DB),pcm,{},active.signal);await settle();active.abort();await error(await pending,408,/取消/);assert.equal(calls[0].readyState,3);
});
await check('anonymous cap is 3 per UTC hour and the fourth never calls upstream',async()=>{
 const {sql,DB}=database();for(let i=0;i<3;i++)await ok(await post(envOf(DB)));const before=usage(sql);await error(await post(envOf(DB)),429,/本小时语音识别次数/);assert.equal(calls.length,3);assert.deepEqual(usage(sql),before);assert(before.every(row=>row.usage_key.startsWith(new Date().toISOString().slice(0,13)+':stt:')));
});
await check('the next hour has fresh counters without using daily quotas',async()=>{
 const {sql,DB}=database();let now=Date.parse('2026-10-23T01:59:00Z');class TestDate extends original.Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}globalThis.Date=TestDate;
 try{for(let i=0;i<3;i++)await ok(await post(envOf(DB)));await error(await post(envOf(DB)),429,/本小时/);now+=3600000;await ok(await post(envOf(DB)));assert.equal(usage(sql).filter(row=>row.usage_key.endsWith('stt:global')).length,2)}finally{globalThis.Date=original.Date}
});
await check('logged-in sessions get 10; spoofed account and IP headers cannot upgrade guests',async()=>{
 const {sql,DB}=database(),now=Date.now();sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run('stt-user','听写测试','test-only-hash',now);sql.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('stt-session','stt-user',now,now+60000);const env={...envOf(DB),STANDALONE_AUTH:'true'};
 for(let i=0;i<10;i++)await ok(await post(env,pcm,{Cookie:'travel_session=stt-session','X-Real-IP':'192.0.2.10'}));await error(await post(env,pcm,{Cookie:'travel_session=stt-session'}),429,/本小时/);
 for(let i=0;i<3;i++)await ok(await post(env,pcm,{'X-Real-IP':'192.0.2.11','CF-Connecting-IP':'spoof'+i,'oai-authenticated-user-id':'stt-user'}));await error(await post(env,pcm,{'X-Real-IP':'192.0.2.11','CF-Connecting-IP':'fresh-spoof','oai-authenticated-user-id':'stt-user'}),429,/本小时/);assert.equal(calls.length,13);assert(!JSON.stringify(usage(sql)).includes('stt-user'));
});
await check('global hourly cap 100 is independent and concurrent guest attempts cannot bypass limits',async()=>{
 const {sql,DB}=database(),hour=new Date().toISOString().slice(0,13),today=new Date().toISOString().slice(0,10);sql.prepare('INSERT INTO model_usage VALUES (?,?,?)').run(today+':poster:global',999,Date.now());
 for(let i=0;i<100;i++)await ok(await post(envOf(DB),pcm,{'CF-Connecting-IP':'198.51.100.'+i}));await error(await post(envOf(DB),pcm,{'CF-Connecting-IP':'203.0.113.5'}),429,/总额度/);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(hour+':stt:global').calls,100);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':poster:global').calls,999);
 const next=database(),responses=await Promise.all(Array.from({length:15},()=>post(envOf(next.DB))));assert.equal(responses.filter(r=>r.status===200).length,3);assert.equal(responses.filter(r=>r.status===429).length,12);
});
await check('unsupported methods, cross-origin requests, missing DB and malformed config fail closed',async()=>{
 const {sql,DB}=database();for(const method of ['GET','PUT','DELETE'])await error(await worker.fetch(new Request('https://stt.test/api/stt',{method}),envOf(DB)),405,/方法/);
 await error(await post(envOf(DB),pcm,{Origin:'https://other.test'}),403,/来源/);await error(await post({...config}),503,/额度控制/);await error(await post({...config,DB:{prepare(){throw Error('private db')}}}),503,/额度控制/);await error(await post({...envOf(DB),XF_ASR_APISECRET:'bad\nsecret'}),503,/配置/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
});
}finally{globalThis.WebSocket=original.WebSocket;globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;globalThis.Date=original.Date;Object.defineProperty(globalThis,'performance',{configurable:true,writable:true,value:original.performance});for(const sql of opened)sql.close()}
console.log('Passed: '+checks+' STT checks (mock WebSocket only, real SQLite, HMAC, PCM60s, errors, cancellation and hourly quotas).');
