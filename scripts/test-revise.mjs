import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import worker,{CATALOG,reviseContext,reviseCandidate,reviseChanges} from '../worker/index.js';

// All upstream calls are intercepted. This suite never spends model quota on a
// real account and does not write competition-evidence or the local user DB.
const migrationNames=(await readdir(new URL('../drizzle/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort();
const migrations=await Promise.all(migrationNames.map(name=>readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')));
const config={LLM_API_KEY:'revise-unit-test-only',LLM_BASE_URL:'https://maas-api.cn-huabei-1.xf-yun.com/v2',LLM_MODEL:'spark-x2.5-1.7b',LLM_PUBLIC_DEMO:'true'};
const opened=[];let checks=0,calls=[];
function database(){
 const sql=new DatabaseSync(':memory:');opened.push(sql);for(const migration of migrations)sql.exec(migration);
 const DB={prepare(query){const statement=sql.prepare(query);let args=[];const prepared={bind(...values){args=values;return prepared},async first(){return statement.get(...args)||null},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}};return prepared}};return {sql,DB};
}
const copy=value=>JSON.parse(JSON.stringify(value));
const stop=(id,day,duration)=>({place:{...CATALOG.find(place=>place.id===id)},day,duration});
const record={id:'private-study-id',task:'PRIVATE_STUDY_SENTINEL',startedAt:1000,endedAt:2000,edits:1,rating:4,feedback:'PRIVATE_FEEDBACK_SENTINEL',source:'manual',stops:4,days:2,unresolved:1};
const body=()=>({instruction:'第二天轻松一点，保留龙门石窟',targetDay:2,keepIds:[],draft:{version:2,city:'洛阳',days:2,start:'09:00',mode:'transit',maxHours:6,restMinutes:30,presetId:'luoyang',decision:{intent:{city:'洛阳',days:2,budget:600,requiredIds:[],excludedIds:[]},records:[record],expenses:{tickets:200,food:80}},stops:[stop('hn-luoyang-museum',1,120),stop('hn-longmen',2,180),stop('hn-whitehorse',2,120),stop('hn-luoyi',2,90)]}});
const proposal=()=>({stops:[{id:'hn-longmen',duration:150},{id:'hn-luoyi',duration:60},{id:'hn-xigong',duration:60}]});
const resultResponse=value=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}),{headers:{'Content-Type':'application/json'}});
let upstream=()=>resultResponse(proposal());
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(String(url),config.LLM_BASE_URL+'/chat/completions');calls.push({url:String(url),options});return upstream(url,options)};
const request=(env,options={})=>worker.fetch(new Request('https://revise.test/api/revise',options),env);
const post=(env,input=body(),headers={},signal)=>request(env,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.3',...headers},body:JSON.stringify(input),...(signal?{signal}:{})});
const usage=sql=>sql.prepare('SELECT usage_key,calls FROM model_usage ORDER BY usage_key').all().map(row=>({...row}));
async function check(name,fn){calls=[];upstream=()=>resultResponse(proposal());await fn();checks++;console.log('Revise: '+name)}
async function success(response){assert.equal(response.status,200,await response.clone().text());const result=await response.json();assert.equal(result.source,'ai');assert.equal(result.provider,'讯飞星火 X2.5');assert(!JSON.stringify(result).includes(config.LLM_API_KEY));return result}
async function error(response,status,pattern){assert.equal(response.status,status,await response.clone().text());const result=await response.json();assert.match(result.error,pattern);assert(!JSON.stringify(result).includes(config.LLM_API_KEY));return result}
try{
await check('one-day proposal shares Spark and computes exact diff without applying the draft',async()=>{
 const {sql,DB}=database(),input=body(),before=copy(input),result=await success(await post({...config,DB},input));
 assert.deepEqual(input,before);assert.equal(result.targetDay,2);assert.equal(result.draft.stops.filter(s=>s.day===2).length,3);
 assert.deepEqual(result.draft.stops.filter(s=>s.day===1),input.draft.stops.filter(s=>s.day===1));
 assert.deepEqual(result.changes,{added:[{id:'hn-xigong',name:'西工小街'}],removed:[{id:'hn-whitehorse',name:'白马寺'}],durations:[{id:'hn-longmen',name:'龙门石窟',before:180,after:150},{id:'hn-luoyi',name:'洛邑古城',before:90,after:60}],reordered:false,beforeMinutes:390,afterMinutes:270,beforeCount:3,afterCount:3});
 for(const key of ['days','start','mode','maxHours','restMinutes','city'])assert.equal(result.draft[key],input.draft[key]);
 assert.equal(result.draft.decision.intent.budget,600);assert.equal(result.draft.presetId,null);assert(Object.values(result.draft.decision.expenses).every(value=>value===null));assert.equal(result.draft.decision.records[0].feedback,record.feedback);
 assert(result.audit.daily[1].pending.includes('站间交通待核算'));assert.match(result.note,/尚未应用/);assert.match(result.note,/交通.*费用.*待核实/);
 assert.equal(calls.length,1);const payload=JSON.parse(calls[0].options.body);assert.equal(payload.model,config.LLM_MODEL);assert.deepEqual(payload.thinking,{type:'disabled'});assert.equal(calls[0].options.headers.Authorization,'Bearer '+config.LLM_API_KEY);assert(calls[0].options.signal instanceof AbortSignal);
 const modelInput=JSON.parse(payload.messages[1].content);assert.equal(modelInput.schedule.length,2);assert.equal(modelInput.start,'09:00');assert.equal(modelInput.budget,600);assert.equal(modelInput.targetDay,2);assert(modelInput.protectedIds.includes('hn-longmen'));assert(!modelInput.allowedPlaces.some(p=>p.id==='hn-luoyang-museum'));
 assert(!/PRIVATE_|private-study|routing|photo|expenses|records/.test(payload.messages[1].content));assert.equal(usage(sql).length,2);assert(usage(sql).every(row=>row.calls===1));assert.equal(sql.prepare('SELECT count(*) AS n FROM travel_drafts').get().n,0);
});
await check('locked, required and explicitly kept stops cannot be removed',async()=>{
 for(const kind of ['locked','required','keep']){
  const input=body();input.instruction='这一天轻松一点';
  if(kind==='locked')input.draft.stops[2].lockedDay=2;
  if(kind==='required')input.draft.decision.intent.requiredIds=['hn-whitehorse'];
  if(kind==='keep')input.keepIds=['hn-whitehorse'];
  const {DB}=database();await error(await post({...config,DB},input),502,/未修改/);
 }
 const input=body();input.draft.stops[1].lockedDay=2;const {DB}=database();const result=await success(await post({...config,DB},input));assert.equal(result.draft.stops.find(s=>s.place.id==='hn-longmen').lockedDay,2);
});
await check('explicit preserve text protects a stop even without a checked keep box',async()=>{
 const {DB}=database();upstream=()=>resultResponse({stops:[{id:'hn-luoyi',duration:90}]});await error(await post({...config,DB}),502,/未修改/);
});
await check('explicit exclusion is enforced and incompatible keep instructions reject before quota',async()=>{
 const {sql,DB}=database(),input=body();input.instruction='不要白马寺，保留龙门石窟';input.keepIds=['hn-whitehorse'];await error(await post({...config,DB},input),400,/冲突/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
 input.keepIds=[];upstream=()=>resultResponse({stops:[{id:'hn-longmen',duration:180},{id:'hn-whitehorse',duration:120}]});await error(await post({...config,DB},input),502,/未修改/);
});
await check('replacement wording removes the old choice without incorrectly protecting every mentioned place',async()=>{
 const input=body();input.instruction='第二天把白马寺换成应天门遗址博物馆，保留龙门石窟';
 const {DB}=database();upstream=()=>resultResponse({stops:[{id:'hn-longmen',duration:180},{id:'hn-yingtian',duration:120},{id:'hn-luoyi',duration:90}]});
 const result=await success(await post({...config,DB},input));assert(result.changes.removed.some(p=>p.id==='hn-whitehorse'));assert(result.changes.added.some(p=>p.id==='hn-yingtian'));
 const context=reviseContext(input);assert(!context.protectedIds.includes('hn-whitehorse'));assert(!context.allowed.some(p=>p.id==='hn-whitehorse'));
 input.instruction='龙门石窟和白马寺都别删，第二天轻松一点';const keep=reviseContext(input);assert(keep.protectedIds.includes('hn-longmen'));assert(keep.protectedIds.includes('hn-whitehorse'));
});
await check('unknown IDs, other-day places, foreign cities, duplicate IDs and malformed stops fail closed',async()=>{
 const invalid=[{stops:[{id:'invented',duration:90}]},{stops:[{id:'hn-longmen',duration:180},{id:'hn-luoyang-museum',duration:120}]},{stops:[{id:'hn-longmen',duration:180},{id:CATALOG.find(p=>p.city==='开封').id,duration:90}]},{stops:[{id:'hn-longmen',duration:180},{id:'hn-longmen',duration:90}]},{stops:[{id:'hn-longmen',duration:0}]},{stops:[{id:'hn-longmen',duration:721}]},{stops:[{id:'hn-longmen',duration:90.5}]},{stops:[{id:'hn-longmen',duration:'90'}]},{stops:[{id:'hn-longmen',duration:90,day:1}]},{stops:[{id:'hn-longmen',duration:90,place:{name:'injected'}}]},{stops:null},{stops:[]},{}];
 for(const value of invalid){const {DB}=database();upstream=()=>resultResponse(value);await error(await post({...config,DB}),502,/未修改/)}
});
await check('pre-existing excluded IDs cannot enter a new candidate',async()=>{
 const input=body();input.draft.decision.intent.excludedIds=['hn-xigong'];const {DB}=database();await error(await post({...config,DB},input),502,/未修改/);
});
await check('paused catalogue places cannot be added',async()=>{
 const paused=CATALOG.find(p=>p.planningEligible===false),existing=CATALOG.find(p=>p.city===paused.city&&p.id!==paused.id&&p.planningEligible!==false);
 const input=body();input.instruction='补一个同城景点';input.targetDay=1;input.draft.city=paused.city;input.draft.stops=[stop(existing.id,1,90)];input.draft.decision.intent={city:paused.city};
 const {DB}=database();upstream=()=>resultResponse({stops:[{id:existing.id,duration:90},{id:paused.id,duration:90}]});await error(await post({...config,DB},input),502,/未修改/);
});
await check('external AMap stops may be retained and reordered but cannot be invented',async()=>{
 const input=body();input.instruction='先去餐厅，再去石窟';input.keepIds=['amap-local'];input.draft.stops[2]={day:2,duration:60,place:{id:'amap-local',name:'测试餐厅',city:'洛阳',category:'food',source:'amap',location:[112,34],address:'测试地址'}};
 const {DB}=database();upstream=()=>resultResponse({stops:[{id:'amap-local',duration:75},{id:'hn-longmen',duration:180},{id:'hn-luoyi',duration:90}]});const result=await success(await post({...config,DB},input));assert(result.changes.reordered);assert.equal(result.draft.stops.filter(s=>s.day===2)[0].place.id,'amap-local');
});
await check('empty selected day uses an explicit city and inserts without touching other days',async()=>{
 const input=body();input.instruction='安排轻松一点';input.draft.stops=[stop('hn-luoyang-museum',1,120)];
 const {DB}=database();const result=await success(await post({...config,DB},input));assert.equal(result.changes.beforeCount,0);assert.deepEqual(result.draft.stops[0],input.draft.stops[0]);
 input.draft.city='河南';await error(await post({...config,DB},input),400,/城市/);
});
await check('unchanged proposal does not erase expenses or the preset',async()=>{
 const input=body();upstream=()=>resultResponse({stops:input.draft.stops.filter(s=>s.day===2).map(s=>({id:s.place.id,duration:s.duration}))});const {DB}=database();const result=await success(await post({...config,DB},input));
 assert.equal(result.draft.presetId,'luoyang');assert.equal(result.draft.decision.expenses.tickets,200);assert.equal(result.changes.added.length+result.changes.removed.length+result.changes.durations.length,0);assert(!result.changes.reordered);
});
await check('day mismatch, broad multi-day and invalid keep selection reject without model calls',async()=>{
 const {sql,DB}=database();for(const patch of [{instruction:'第一天太赶了'},{instruction:'第一天和第二天都调整'},{instruction:'调整所有天'},{targetDay:0},{targetDay:3},{targetDay:1.5},{keepIds:['hn-luoyang-museum']},{keepIds:['hn-longmen','hn-longmen']},{keepIds:'hn-longmen'}])await error(await post({...config,DB},{...body(),...patch}),400,/日期|一天|保留/);
 assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
 const good=body();good.instruction='第一天不动，第二天轻松一点，保留龙门石窟';await success(await post({...config,DB},good));
});
await check('empty instruction and malformed body fail before model or usage',async()=>{
 const {sql,DB}=database();for(const input of [null,[],{}, {...body(),instruction:''},{...body(),instruction:'  '},{...body(),instruction:3},{...body(),instruction:'字'.repeat(601)},{...body(),draft:null}])await error(await post({...config,DB},input),400,/调整|行程|格式/);
 assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);await error(await request({...config,DB},{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),400,/JSON/);
});
await check('unconfigured and unsafe model configuration return 503 without spending',async()=>{
 for(const patch of [{LLM_API_KEY:''},{LLM_MODEL:''},{LLM_BASE_URL:''},{LLM_BASE_URL:'http://maas-api.cn-huabei-1.xf-yun.com/v2'},{LLM_BASE_URL:'https://untrusted.test/v2'},{LLM_MODEL:'another-model'},{LLM_API_KEY:'bad\r\nvalue'}]){const {sql,DB}=database();await error(await post({...config,DB,...patch}),503,/配置/);assert.deepEqual(usage(sql),[])}assert.equal(calls.length,0);
 const {DB}=database();await success(await post({...config,DB,LLM_BASE_URL:config.LLM_BASE_URL+'/chat/completions'}));assert.equal(calls.length,1);
});
await check('foreign origins, unsupported methods and non-JSON bodies never call model',async()=>{
 const {DB}=database();await error(await post({...config,DB},body(),{Origin:'https://other.test'}),403,/来源/);for(const method of ['GET','PUT','DELETE'])await error(await request({...config,DB},{method}),405,/方法/);
 await error(await request({...config,DB},{method:'POST',body:'raw'}),415,/JSON/);assert.equal(calls.length,0);
});
await check('anonymous access needs enabled demo; standalone identity cannot be spoofed',async()=>{
 const {sql,DB}=database();await error(await post({...config,DB,LLM_PUBLIC_DEMO:'false'}),403,/登录/);
 await error(await post({...config,DB,LLM_PUBLIC_DEMO:'false',STANDALONE_AUTH:'true'},body(),{'oai-authenticated-user-id':'spoofed'}),403,/登录/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
 await success(await post({...config,DB,LLM_PUBLIC_DEMO:'false'},body(),{'oai-authenticated-user-id':'platform-user'}));
});
await check('shared client quota rejects the next request with 429 and no upstream call',async()=>{
 const {sql,DB}=database(),env={...config,DB,LLM_CLIENT_DAILY_LIMIT:'1'};await success(await post(env));await error(await post(env),429,/额度/);assert.equal(calls.length,1);assert(usage(sql).every(row=>row.calls===1));
});
await check('shared global quota and broken quota storage fail closed',async()=>{
 const {DB}=database(),env={...config,DB,LLM_DAILY_LIMIT:'1'};await success(await post(env));await error(await post(env,body(),{'CF-Connecting-IP':'192.0.2.8'}),429,/额度/);assert.equal(calls.length,1);
 await error(await post(config),503,/额度/);await error(await post({...config,DB:{prepare(){throw Error('private storage error')}}}),503,/额度/);assert.equal(calls.length,1);
});
await check('upstream HTTP failure, timeout and invalid JSON produce friendly 502',async()=>{
 for(const handler of [()=>new Response('private error',{status:500}),()=>{throw new DOMException('timed out','TimeoutError')},()=>new Response('not json'),()=>new Response(JSON.stringify({error:{message:'private error'}})),()=>new Response(JSON.stringify({choices:[{message:{content:'not json'}}]}))]){const {DB}=database();upstream=handler;await error(await post({...config,DB}),502,/未修改/)}assert.equal(calls.length,5);
});
await check('cancelled and late upstream responses never produce an applyable proposal',async()=>{
 const {sql,DB}=database(),controller=new AbortController();controller.abort();await error(await post({...config,DB},body(),{},controller.signal),408,/取消/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
 const active=new AbortController();upstream=()=>{active.abort();return resultResponse(proposal())};await error(await post({...config,DB},body(),{},active.signal),408,/取消/);assert.equal(calls.length,1);
});
await check('helpers protect interleaved untouched order and enforce the global 15-stop limit',async()=>{
 const input=body();input.draft.stops=[input.draft.stops[1],input.draft.stops[0],input.draft.stops[2],stop('hn-kaifeng-fu',1,60),input.draft.stops[3]];
 const context=reviseContext(input),candidate=reviseCandidate(context,proposal());assert.deepEqual(candidate.draft.stops.filter(s=>s.day===1),context.other);assert.deepEqual(input.draft.stops.map(s=>s.place.id),['hn-longmen','hn-luoyang-museum','hn-whitehorse','hn-kaifeng-fu','hn-luoyi']);
 const large=body();large.draft.stops=[stop('hn-longmen',2,180),...CATALOG.filter(p=>p.id!=='hn-longmen'&&p.city!=='洛阳').slice(0,14).map(p=>stop(p.id,1,60))];
 assert.throws(()=>reviseCandidate(reviseContext(large),{stops:[{id:'hn-longmen',duration:180},{id:'hn-luoyi',duration:90}]}),/校验/);
 const change=reviseChanges([stop('hn-longmen',2,180),stop('hn-luoyi',2,90)],[stop('hn-luoyi',2,90),stop('hn-longmen',2,180)]);assert(change.reordered);assert.equal(change.beforeMinutes,change.afterMinutes);
});
console.log(`Trip revision tests passed (${checks} groups; mocked Spark, no real model calls).`);
}finally{globalThis.fetch=originalFetch;for(const sql of opened)sql.close()}
