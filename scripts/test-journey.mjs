import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker,{HTML,CATALOG,validateDraft} from '../worker/index.js';

const sql=new DatabaseSync(':memory:');sql.exec(await readFile(new URL('../drizzle/0000_smiling_sphinx.sql',import.meta.url),'utf8'));
const DB={prepare(query){const statement=sql.prepare(query);return {bind(...args){return {async first(){return statement.get(...args)||null},async run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}}}}}}};
const draft={version:2,city:'洛阳',days:2,start:'09:00',mode:'transit',maxHours:6,restMinutes:30,presetId:'luoyang',decision:{intent:{city:'洛阳',days:2,budget:300,requiredIds:['hn-longmen']},expenses:{tickets:100},records:[{id:'experience-fixture',task:'洛阳两日',startedAt:1000000,endedAt:1000300,edits:2,rating:4,source:'rules',stops:1,days:2,unresolved:1,feedback:'测试反馈'}]},stops:[{place:{...CATALOG.find(p=>p.id==='hn-longmen'),routing:{id:'B1',name:'龙门石窟入口',location:[112.47,34.56],address:'洛阳',confirmed:true}},day:1,duration:180,lockedDay:1}]};
const call=(user,body,options={})=>worker.fetch(new Request('https://fixture.test/api/draft',{method:body?'POST':'GET',headers:{...(user?{'oai-authenticated-user-id':user}:{}),...options.headers},...(body?{body:JSON.stringify(body)}:{})}),{DB});
assert.equal((await call(null)).status,401);
const empty=await (await call('alice')).json();assert.equal(empty.draft,null);
const firstResponse=await call('alice',{draft,revision:0});assert.equal(firstResponse.status,200);const first=await firstResponse.json();
const restored=await (await call('alice')).json();assert.equal(restored.draft.mode,'transit');assert.equal(restored.draft.stops[0].place.routing.id,'B1');
assert.equal(restored.draft.stops[0].lockedDay,1);assert.equal(restored.draft.decision.intent.budget,300);assert.equal(restored.draft.decision.expenses.food,null);assert.equal(restored.draft.decision.records[0].feedback,'测试反馈');
assert.equal((await (await call('bob')).json()).draft,null,'User drafts must be isolated');
assert.equal((await call('alice',{draft:{...draft,start:'10:00'},revision:0})).status,409,'Stale writers must not overwrite current data');
assert.equal((await call('alice',{draft,revision:first.revision},{headers:{Origin:'https://other.test'}})).status,403);
assert.equal((await call('alice',{draft:{...draft,start:'25:00'},revision:first.revision})).status,400);
const changed=await (await call('alice',{draft:{...draft,start:'10:00'},revision:first.revision})).json();assert(changed.revision>first.revision);
assert.equal((await (await call('alice')).json()).draft.start,'10:00');
assert.equal(validateDraft(draft).stops[0].place.routing.name,'龙门石窟入口');

const script=HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');
function fixture(customFetch){
  const nodes=new Map(),scripts=[];
  const initial={'#days':'2','#start':'09:00','#city':'洛阳','#travelmode':'driving','#maxhours':'6','#restmins':'30','#query':''};
  const get=s=>{if(!nodes.has(s))nodes.set(s,{value:initial[s]||'',dataset:{},style:{},classList:{toggle(){},add(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(s)};
  class LngLat{constructor(lng,lat){this.lng=lng;this.lat=lat}getLng(){return this.lng}getLat(){return this.lat}}
  let failRoute=false,delayRoute=null,routeCalls=0;
  class Driving{search(a,b,cb){routeCalls++;if(delayRoute){delayRoute(()=>cb('complete',{routes:[{distance:1000,time:600,steps:[{path:[a,b]}]}]}));return}cb('complete',{routes:[{distance:1000,time:failRoute?null:600,steps:[{path:[a,b]}]}]})}}
  class Transfer{search(a,b,cb){cb('complete',{plans:[{distance:1200,time:900,segments:[{transit:{path:[a,b]}}]}]})}}
  class PlaceSearch{search(q,cb){cb('complete',{poiList:{pois:[{id:'B101',name:q+'入口',address:'洛阳市',location:new LngLat(112.47,34.56)}]}})}}
  const fetch=customFetch||((path,options={})=>worker.fetch(new Request('https://fixture.test'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'ui-user'}}),{DB}));
  const context={document:{querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(s){scripts.push(s)}}},navigator:{},location:{origin:'https://fixture.test'},URL,Map,Set,Blob,Response,console,fetch,setTimeout:()=>0,clearTimeout(){},AMap:{plugin:(p,cb)=>cb(),Driving,Walking:Driving,Transfer,PlaceSearch,LngLat}};context.window=context;vm.createContext(context);vm.runInContext(script,context);
  return {get,context,run:source=>vm.runInContext(source,context),setFailRoute:v=>failRoute=v,setDelayRoute:v=>delayRoute=v,routeCalls:()=>routeCalls};
}
const f=fixture();f.context.saved=draft;
await f.run('applyDraft(saved)');f.run('saveBooting=false;cfg={persistenceConfigured:true,placesConfigured:true};');
await f.run('flushSave()');assert(f.get('#savestatus').textContent.includes('已自动保存'));
assert.equal((await (await call('ui-user')).json()).draft.mode,'transit');
f.run("checkpoint();trip[0].duration=240;renderTrip()");await f.get('#undo').onclick();assert.equal(f.run('trip[0].duration'),180);
const transit=await f.run("jsTransport([[112.4,34.5],[112.5,34.6]],'transit','洛阳')");assert.equal(transit.legs[0].duration,900);assert.equal(transit.legs[0].path.length,2);
f.setFailRoute(true);await assert.rejects(f.run("jsTransport([[112.4,34.5],[112.5,34.6]],'driving','洛阳')"));f.setFailRoute(false);
f.run("trip=[{place:{id:'p1',name:'甲',category:'scenic',source:'amap',city:'洛阳',location:[112.4,34.5]},day:1,duration:180},{place:{id:'p2',name:'乙',category:'scenic',source:'amap',city:'洛阳',location:[112.5,34.6]},day:1,duration:180}];$('#travelmode').value='driving';renderTrip()");
assert(f.get('#trafficreview').innerHTML.includes('交通耗时待核算'));
await f.run('checkTraffic()');assert(f.get('#trafficreview').innerHTML.includes('当天安排偏满'));assert(f.get('#trip').innerHTML.includes('约 10 分钟'));
assert(f.get('#trip').innerHTML.includes('预计 12:40 起'));
let release;f.setDelayRoute(cb=>release=cb);const pending=f.run('checkTraffic()');await new Promise(resolve=>setImmediate(resolve));const count=f.routeCalls();await f.run('checkTraffic()');assert.equal(f.routeCalls(),count);f.run("trip.reverse();renderTrip()");release();await pending;assert.equal(f.run('trafficCache.has(trafficKey())'),false,'Changed route must discard older response');
f.run("loadPreset('luoyang',true);cfg.placesConfigured=true");await f.run('checkTraffic()');assert.equal(f.get('#match').open,true);assert(f.get('#matchbody').innerHTML.includes('data-match="0"'));f.get('#matchbody').onclick({target:{closest:()=>({dataset:{match:'0'}})}});assert.equal(f.run('trip[0].place.routing.id'),'B101');

// A failed restore must not allow Retry Save to overwrite an existing draft.
let writes=0;const broken=fixture(async(path,options)=>{
  if(path==='/api/config')return new Response(JSON.stringify({mapConfigured:false,persistenceConfigured:true}));
  if(path==='/api/draft'&&options?.method!=='POST')return new Response(JSON.stringify({draft,revision:changed.revision}));
  if(path==='/api/validate')return new Response(JSON.stringify({error:'temporary failure'}),{status:503});
  if(path==='/api/draft'&&options?.method==='POST'){writes++;return new Response('{}')}
  throw Error('unexpected request');
});
await broken.run('init()');assert.equal(broken.run('restoreFailed'),true);assert.equal(broken.run('saveBooting'),true);assert.equal(broken.get('#trip').inert,true);await broken.run('flushSave()');assert.equal(writes,0);await broken.get('#saveretry').onclick();assert.equal(writes,0);
sql.close();
console.log('Passed: D1 save/restore and user isolation, conflict protection, routing persistence, undo, multimodal timing, missing/stale route guards, candidate confirmation and failed restore protection.');
