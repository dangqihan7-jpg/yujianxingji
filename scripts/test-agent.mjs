import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker,{CATALOG,agentContext,runTravelAgent} from '../worker/index.js';

const oldFetch=globalThis.fetch,env={LLM_API_KEY:'synthetic-agent-token',LLM_MODEL:'spark-x2.5-1.7b',LLM_BASE_URL:'https://maas-api.cn-huabei-1.xf-yun.com/v2'},model=[],maps=[];
const seed={operation:'select',city:'洛阳',days:2,start:'09:00',mode:'driving',maxHours:6,restMinutes:30,stops:[],decision:{intent:{city:'洛阳',days:2,interests:['culture'],requiredIds:['hn-luoyi'],excludedIds:['hn-longmen'],budget:500},expenses:{tickets:999}}};
const items=[{id:'hn-luoyi',day:1,duration:120},{id:'hn-yingtian',day:2,duration:120}];
const search={actions:[{tool:'search_places',args:{limit:95}}]},check=stops=>({actions:[{tool:'check_itinerary',args:{stops}}]}),finish=stops=>({plan:{stops,summary:'古城与应天门分日，留出休息时间',reasons:[{id:stops[0].id,reason:'必去地点'}],pending:['预约信息需确认']}});
function mock(sequence,amap=()=>({status:'1',pois:[{id:'B001',name:'洛邑古城入口',address:'洛阳',location:'112.4,34.6'}]})){
 model.length=maps.length=0;globalThis.fetch=async(url,options={})=>{
  if(new URL(url).hostname==='restapi.amap.com'){maps.push(String(url));return new Response(JSON.stringify(amap(new URL(url))))}
  const body=JSON.parse(options.body);model.push(body);const next=sequence[model.length-1];if(next instanceof Error)throw next;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(next)}}]}));
 };
}
async function call(body=seed,e=env,headers={'oai-authenticated-user-id':'agent-fixture'}){
 const response=await worker.fetch(new Request('https://fixture.test/api/agent',{method:'POST',headers,body:JSON.stringify(body)}),e);return {status:response.status,...await response.json()};
}
let passed=0;
async function test(label,fn){await fn();passed++;console.log('PASS '+label)}
try{
 await test('AI chooses catalog places, observes tools, checks and finishes in three rounds',async()=>{
  mock([search,check(items),finish(items)]);const before=JSON.stringify(seed),r=await call();assert.equal(r.source,'ai');assert.equal(r.agent.modelCalls,3);assert.equal(r.agent.toolCalls,2);assert.equal(r.agent.status,'completed');assert.deepEqual(r.draft.stops.map(s=>s.place.id),items.map(s=>s.id));assert(Object.values(r.draft.decision.expenses).every(v=>v===null));assert.equal(r.audit.budget.status,'pending');assert.equal(JSON.stringify(seed),before);
  const observations=JSON.parse(model[1].messages[3].content).toolObservations;assert(observations[0].result.places.some(p=>p.id==='hn-yingtian'));assert(!observations[0].result.places.some(p=>p.id==='hn-longmen'));assert.equal(model[0].thinking.type,'disabled');assert(!model[0].tools);assert(!JSON.stringify(model).includes('synthetic-agent-token'));
 });
 await test('AI can choose fewer places than a rule candidate and set stay duration',async()=>{mock([search,check(items.slice(0,1)),finish(items.slice(0,1))]);const r=await call();assert.equal(r.source,'ai');assert.equal(r.draft.stops.length,1);assert.equal(r.draft.stops[0].duration,120)});
 for(const [label,bad]of [
  ['excluded place',[...items,{id:'hn-longmen',day:1}]],
  ['unknown place',[{id:'invented',day:1}]],
  ['missing required',[items[1]]],
  ['duplicate place',[items[0],items[0]]],
  ['invalid day',[{...items[0],day:3}]],
  ['invalid duration',[{...items[0],duration:2}]],
  ['wrong destination',[...items,{id:'hn-wansui',day:1}]]
 ])await test('Reject '+label,async()=>{mock([search,check(bad)]);const r=await call();assert.equal(r.source,'rules');assert(r.fallback.reason);assert(!r.draft.stops.some(s=>s.place.id==='hn-longmen'||s.place.id==='invented'||s.place.id==='hn-wansui'))});
 await test('Unqueried place cannot be selected',async()=>{mock([{actions:[{tool:'search_places',args:{ids:['hn-luoyi']}}]},check(items)]);assert.equal((await call()).source,'rules')});
 await test('Final itinerary must match the checked version',async()=>{mock([search,check(items),finish([...items].reverse())]);const r=await call();assert.equal(r.source,'rules');assert(r.fallback.reason.includes('最终行程'))});
 await test('A one-shot response cannot masquerade as an agent',async()=>{mock([finish(items)]);const r=await call();assert.equal(r.source,'rules');assert.equal(r.agent.modelCalls,1)});
 await test('Unknown tools and URL parameters cause no arbitrary network calls',async()=>{
  for(const action of [{tool:'fetch_url',args:{url:'http://private.test/'}},{tool:'search_places',args:{url:'http://private.test/'}}]){mock([{actions:[action]}]);const r=await call();assert.equal(r.source,'rules');assert.equal(model.length,1);assert.equal(maps.length,0)}
 });
 await test('An actual map lookup returns candidates without confirming routing',async()=>{
  mock([search,{actions:[{tool:'lookup_map',args:{ids:['hn-luoyi']}},{tool:'check_itinerary',args:{stops:items}}]},finish(items)]);const r=await call(seed,{...env,AMAP_WEB_SERVICE_KEY:'synthetic-map-key'});assert.equal(r.source,'ai');assert.equal(maps.length,1);assert(maps[0].startsWith('https://restapi.amap.com/v3/place/text?'));assert(!r.draft.stops[0].place.routing);assert(r.agent.steps.some(s=>s.tool==='lookup_map'&&s.status==='pending'));assert(!JSON.stringify(r).includes('synthetic-map-key'));
 });
 const draft={...seed,operation:'reorder',decision:{intent:{city:'洛阳',days:2}},stops:items.map((s,i)=>({place:{...CATALOG.find(p=>p.id===s.id),routing:{id:'B00'+i,name:'已由用户确认的地点',location:[112.4+i*0.01,34.6],confirmed:true}},day:1,duration:120,...(!i?{lockedDay:1}:{})}))};
 const ordered=draft.stops.map(s=>({id:s.place.id,day:1}));
 await test('Confirmed coordinates query AMap and enter the authoritative audit',async()=>{mock([check(ordered),finish(ordered)],()=>({status:'1',route:{paths:[{duration:'601',distance:'2000'}]}}));const r=await call(draft,{...env,AMAP_WEB_SERVICE_KEY:'synthetic-map-key'});assert.equal(r.source,'ai');assert.equal(r.audit.daily[0].travel,11);assert.equal(r.transport[0].source,'amap');assert.equal(r.draft.stops[0].lockedDay,1);assert.equal(r.draft.stops[0].duration,120);assert.equal(maps.length,1)});
 await test('Display coordinates never produce a made-up driving time',async()=>{mock([check(ordered),finish(ordered)]);const raw={...draft,stops:draft.stops.map(s=>({...s,place:{...s.place,routing:undefined}}))};const r=await call(raw);assert.equal(r.source,'ai');assert.equal(r.audit.daily[0].travel,null);assert.equal(maps.length,0)});
 await test('Broken AMap response remains unknown, not zero minutes',async()=>{mock([check(ordered),finish(ordered)],()=>({status:'1',route:{paths:[{duration:''}]}}));const r=await call(draft,{...env,AMAP_WEB_SERVICE_KEY:'synthetic-map-key'});assert.equal(r.source,'ai');assert.equal(r.audit.daily[0].travel,null);assert.equal(r.transport[0].status,'pending')});
 await test('Locked date and completeness cannot be changed by AI',async()=>{for(const bad of [[{...ordered[0],day:2},ordered[1]],[ordered[0]]]){mock([check(bad)]);const r=await call(draft);assert.equal(r.source,'rules');assert.equal(r.draft.stops.length,2);assert.equal(r.draft.stops[0].lockedDay,1)}});
 await test('Anonymous access, forced rules and missing config make zero model calls',async()=>{for(const [body,e,h]of [[seed,env,{}],[{...seed,engine:'rules'},env,undefined],[seed,{},undefined]]){mock([]);const r=await call(body,e,h);assert.equal(r.source,'rules');assert.equal(model.length,0)}});
 await test('Bad operation and unavailable required destination are rejected before AI',async()=>{for(const body of [{...seed,operation:'execute'},{...seed,decision:{intent:{city:'洛阳',requiredIds:['hn-kaifeng-museum']}}}]){mock([]);assert.equal((await call(body)).status,400);assert.equal(model.length,0)}});
 await test('Cross-origin and spoofed standalone identity cannot spend credits',async()=>{for(const [e,h]of [[env,{'Origin':'https://other.test','oai-authenticated-user-id':'fixture'}],[{...env,STANDALONE_AUTH:'true'},{'oai-authenticated-user-id':'fixture'}]]){mock([]);const r=await call(seed,e,h);assert.equal(r.source,'rules');assert.equal(model.length,0)}});
 await test('Every round reserves quota; limit two prevents the third outbound call',async()=>{
  const sql=new DatabaseSync(':memory:');for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())sql.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const DB={prepare(q){const stmt=sql.prepare(q);return {bind(...args){return {async first(){return stmt.get(...args)||null},async run(){return {meta:{changes:Number(stmt.run(...args).changes)}}}}}}}};
  mock([search,check(items),finish(items)]);const r=await call(seed,{...env,DB,LLM_PUBLIC_DEMO:'true',LLM_CLIENT_DAILY_LIMIT:'2'});assert.equal(r.source,'rules');assert.equal(model.length,2);assert.equal(r.agent.modelCalls,2);assert(r.fallback.reason.includes('额度'));assert.equal(sql.prepare("SELECT calls FROM model_usage WHERE usage_key LIKE '%:global'").get().calls,2);assert(!JSON.stringify(sql.prepare('SELECT usage_key FROM model_usage').all()).includes('agent-fixture'));assert.equal(sql.prepare('SELECT count(*) AS n FROM travel_drafts').get().n,0);sql.close();
 });
 await test('Loop bound and tool bound stop unfinished agents',async()=>{mock([search,search,search,search]);const r=await call();assert.equal(r.source,'rules');assert.equal(model.length,4);assert(r.fallback.reason.includes('4 轮'));const actions={actions:[search.actions[0],search.actions[0],search.actions[0]]};mock([actions,actions,actions]);const t=await call();assert.equal(t.source,'rules');assert.equal(t.agent.toolCalls,8);assert.equal(model.length,3)});
 await test('Cancelled execution cannot continue to models or tools',async()=>{let calls=0;const c=new AbortController();c.abort();const r=await runTravelAgent(agentContext(seed),{signal:c.signal,decide:async()=>{calls++;throw Error('unexpected')}});assert.equal(r.source,'rules');assert.equal(calls,0)});
 await test('Failed model call is not retried and no secret appears in response',async()=>{mock([new Error('provider details must stay private')]);const r=await call();assert.equal(r.source,'rules');assert.equal(model.length,1);assert(!JSON.stringify(r).includes('provider details'));assert(!JSON.stringify(r).includes(env.LLM_API_KEY))});
}finally{globalThis.fetch=oldFetch}
console.log(`Passed ${passed} agent checks; all model/map responses mocked, zero real API usage.`);
