import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker,{HTML,CATALOG,PRESETS,validateDraft,validatePlan} from '../worker/index.js';
const call=(path,body,env={})=>worker.fetch(new Request('https://travel.test'+path,body?{method:'POST',headers:{'oai-authenticated-user-id':'fixture'},body:JSON.stringify(body)}:{}),env);
const data=async r=>({status:r.status,body:await r.json()});
const list=await data(await call('/api/places?city=郑州&category=all'));
assert.equal(list.body.source,'curated');assert.equal(list.body.places.length,5);
assert.equal((await data(await call('/api/places?city=上海'))).status,400);
assert.equal((await data(await call('/api/places?category=invalid'))).status,400);
const draft={days:2,start:'09:00',stops:list.body.places.slice(0,4).map(p=>({place:p,day:1,duration:90}))};
const fallback=await data(await call('/api/plan',draft));assert.equal(fallback.body.source,'rules');assert.deepEqual(new Set(fallback.body.stops.map(s=>s.id)),new Set(draft.stops.map(s=>s.place.id)));assert.equal(fallback.body.stops.length,4);
assert.equal((await data(await call('/api/validate',{...draft,stops:[draft.stops[0],draft.stops[0]]}))).status,400);
assert.equal((await data(await call('/api/validate',{...draft,start:'27:00'}))).status,400);
assert.throws(()=>validatePlan([{id:'invented',day:1}],draft));
const env={AMAP_JS_KEY:'public-key',AMAP_SECURITY_JS_CODE:'secret-code',AMAP_WEB_SERVICE_KEY:'private-key',LLM_API_KEY:'private-model',LLM_BASE_URL:'https://model.test/v1',LLM_MODEL:'demo-model'};
const cfg=await data(await call('/api/config',null,env));const publicConfig=JSON.stringify(cfg);assert(!publicConfig.includes('secret-code'));assert(!publicConfig.includes('private-key'));assert(!publicConfig.includes('private-model'));
assert.equal((await call('/_AMapService/v3/other?key=public-key',null,env)).status,404);assert.equal((await call('/_AMapService/v3/place/text?key=wrong',null,env)).status,403);
assert.equal((await call('/api/route',{locations:[[200,50],[114,35]]},env)).status,400);
const originalFetch=globalThis.fetch;let calls=[];
try{
globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});return new Response(JSON.stringify({status:'1',pois:[{id:'B0001',name:'测试地点',location:'113.5,34.6',typecode:'050000',address:'地址',biz_ext:{rating:'4.5'},photos:[{url:'https://images.example.test/real.jpg',title:'实景'},{url:'javascript:alert(1)'},{url:'https://name:password@images.example.test/leak.jpg'}]}]}),{headers:{'Content-Type':'application/json'}})};
const live=await data(await call('/api/places?city=郑州&category=food',null,env));assert.equal(live.body.source,'amap');assert.equal(live.body.places[0].category,'food');assert.equal(live.body.places[0].image,'https://images.example.test/real.jpg');assert.equal(live.body.places[0].photos.length,1);assert.equal(live.body.places[0].photos[0].title,'实景');const u=new URL(calls[0].url);assert.equal(u.hostname,'restapi.amap.com');assert.equal(u.searchParams.get('types'),'050000');assert.equal(u.searchParams.get('key'),'private-key');
await call('/_AMapService/v3/place/text?key=public-key',null,env);assert.equal(new URL(calls.at(-1).url).searchParams.get('jscode'),'secret-code');
globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({stops:[{id:'unknown',day:1}]})}}]}));const rejected=await data(await call('/api/plan',draft,env));assert.equal(rejected.status,200);assert.equal(rejected.body.source,'rules');assert(rejected.body.fallback.reason);validatePlan(rejected.body.stops,draft);
globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({stops:draft.stops.map(s=>({id:s.place.id,day:1}))})}}]}));const ai=await data(await call('/api/plan',draft,env));assert.equal(ai.body.source,'ai');assert.equal(ai.body.stops.length,4);
globalThis.fetch=async()=>new Response(JSON.stringify({status:'1',route:{paths:[{distance:'400',duration:'300',steps:[{polyline:'113.5,34.6;113.6,34.7'}]}]}}));const route=await data(await call('/api/route',{locations:[[113.5,34.6],[113.6,34.7]]},env));assert.equal(route.body.legs[0].duration,300);assert.equal(route.body.legs[0].path.length,2);
}finally{globalThis.fetch=originalFetch}
// Test the browser's shared state/actions without claiming visual browser QA.
const html=HTML;const script=html.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');
const nodes=new Map();const get=s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#days'?'2':s==='#start'?'09:00':'',dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},insertAdjacentHTML(){},click(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(s)};
const registered=[];const context={document:{querySelector:get,querySelectorAll:()=>[],head:{append(){}},createElement:()=>({})},navigator:{modelContext:{registerTool:t=>registered.push(t)}},setTimeout:()=>0,clearTimeout(){},Map,Set,Blob,URL,console};vm.createContext(context);vm.runInContext(script,context);assert.equal(registered.length,3);
context.fixture=list.body.places;vm.runInContext('places=fixture;renderAll();add(places[0]);add(places[0]);',context);assert.equal(vm.runInContext('trip.length',context),1);
const bad=await registered.find(t=>t.name==='add_travel_stop').execute({id:'made-up'});assert.equal(bad.content[0].text,'地点不存在');await registered.find(t=>t.name==='remove_travel_stop').execute({id:list.body.places[0].id});assert.equal(vm.runInContext('trip.length',context),0);
const image=await call('/assets/ruyi.jpg');assert.equal(image.headers.get('Content-Type'),'image/jpeg');assert((await image.arrayBuffer()).byteLength>1000);
const catalog=await data(await call('/api/catalog'));assert.equal(catalog.body.cities.length,6);assert.equal(catalog.body.places.length,22);assert.equal(catalog.body.routes.length,3);
for(const city of catalog.body.cities){const r=await data(await call('/api/places?city='+encodeURIComponent(city)));assert.equal(r.status,200);assert(r.body.places.length>=2);assert(r.body.places.every(p=>p.city===city&&p.source==='curated'))}
for(const preset of PRESETS){const stops=preset.stops.map(([id,day,duration])=>({place:CATALOG.find(p=>p.id===id),day,duration}));const validated=validateDraft({days:preset.days,start:'09:00',stops});assert.equal(validated.stops.length,preset.stops.length);assert(validated.stops.every(s=>s.place.description));context.presetId=preset.id;vm.runInContext('loadPreset(presetId,true)',context);assert.equal(vm.runInContext('trip.length',context),preset.stops.length);assert.equal(Number(get('#days').value),preset.days)}
assert.throws(()=>validateDraft({...draft,stops:[{...draft.stops[0],place:{...draft.stops[0].place,id:'hn-does-not-exist'}}]}));
await vm.runInContext("filter='scenic';$('#city').value='洛阳';$('#query').value='龙门';search()",context);assert.equal(vm.runInContext('places.length',context),1);assert.equal(vm.runInContext('places[0].id',context),'hn-longmen');
for(const name of ['longmen','kaifeng']){const r=await call('/assets/'+name+'.jpg');assert.equal(r.headers.get('Content-Type'),'image/jpeg');assert((await r.arrayBuffer()).byteLength>1000)}
console.log('Passed: demo/live API handling, itinerary validation, secret isolation, proxy allowlist, AI result validation, route parsing, shared UI actions and WebMCP.');
