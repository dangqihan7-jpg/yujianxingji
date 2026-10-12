import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import worker,{HTML,CATALOG,PRESETS,CITY_GUIDES,parseIntentRules,validateIntent,validateDraft,rulePlan,validatePlan,auditDecision} from '../worker/index.js';

const expected=['郑州','洛阳','开封','平顶山','安阳','鹤壁','新乡','焦作','濮阳','许昌','漯河','三门峡','南阳','商丘','信阳','周口','驻马店','济源'];
assert.deepEqual(CITY_GUIDES.map(c=>c.name),expected);
assert.equal(new Set(CATALOG.map(p=>p.id)).size,CATALOG.length);
assert.equal(new Set(PRESETS.map(r=>r.id)).size,PRESETS.length);
assert.equal(CATALOG.length,95);assert.equal(PRESETS.length,20);
for(const c of CITY_GUIDES){
 const places=CATALOG.filter(p=>p.city===c.name);assert(places.length>=4,c.name+' needs usable coverage');
 const route=PRESETS.find(r=>r.id===c.routeId);assert.equal(route?.city,c.name);
 assert(c.highlights.every(id=>places.some(p=>p.id===id&&p.planningEligible!==false)));
 assert.equal(validateIntent({city:c.name}).city,c.name);
 assert.equal(parseIntentRules(c.name+'周末两天',CATALOG).fields.city,c.name);
 assert.equal(parseIntentRules('只玩'+c.name+'周末两天',CATALOG).fields.avoidCrossCity,true);
 for(const alias of c.aliases)assert.equal(parseIntentRules(alias+'周末两天',CATALOG).fields.city,c.name,alias);
 assert(HTML.includes('<option value="'+c.name+'">'+c.name+'</option>'));
 const response=await worker.fetch(new Request('https://fixture.test/api/places?city='+encodeURIComponent(c.name)),{});
 assert.equal(response.status,200);const listed=await response.json();assert.equal(listed.places.length,places.length);assert(listed.places.every(p=>p.city===c.name));
 const livePlace={id:'B-'+c.id,name:'测试地点',category:'scenic',source:'amap',city:c.name,location:places[0].location};assert.equal(validateDraft({days:1,start:'09:00',stops:[{place:livePlace,day:1,duration:90}]}).stops[0].place.city,c.name);
}
for(const p of CATALOG){assert(CITY_GUIDES.some(c=>c.name===p.city));assert(p.location[0]>110&&p.location[0]<117&&p.location[1]>31&&p.location[1]<37,p.id);assert(/^https:\/\//.test(p.reference));assert(Number.isInteger(p.duration)&&p.duration>=15);if(p.contentCheckedAt){assert(/^https:\/\/www.amap.com\/place\//.test(p.locationReference));assert(p.district&&p.visitTip&&p.locationNote)}}
for(const r of PRESETS){const draft={days:r.days,start:'09:00',stops:r.stops.map(([id,day,duration])=>({place:CATALOG.find(p=>p.id===id),day,duration}))};validateDraft(draft);validatePlan(rulePlan(draft),draft);assert(r.stops.every(([id])=>CATALOG.find(p=>p.id===id)?.planningEligible!==false));if(r.image)assert(r.stops.some(([id])=>CATALOG.find(p=>p.id===id)?.image===r.image),'Cover must belong to this route')}
assert.equal(parseIntentRules('洛阳和开封不去，想去信阳看南湾湖',CATALOG).fields.city,'信阳');
assert.equal(parseIntentRules('洛阳和禹州两天',CATALOG).fields.city,'河南');
assert.equal(parseIntentRules('周末去永城芒砀山',CATALOG).fields.city,'商丘');
assert.deepEqual(parseIntentRules('宝泉和八里沟不去，想去万仙山',CATALOG).fields.excludedIds,['hn-baoquan','hn-baligou']);
assert.deepEqual(parseIntentRules('想去淮阳龙湖',CATALOG).fields.requiredIds,['hn-huaiyang-longhu']);
assert.deepEqual(parseIntentRules('想去濮阳龙湖',CATALOG).fields.requiredIds,['hn-puyang-longhu']);
assert(parseIntentRules('信阳茶园和湖景',CATALOG).fields.interests.includes('nature'));
assert.deepEqual(parseIntentRules('想去少林寺',CATALOG).fields.requiredIds,['hn-shaolin']);
assert(!parseIntentRules('老界岭不去，想去老君山',CATALOG).fields.requiredIds.includes('hn-laojieling'));

const nodes=new Map();const get=s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#days'?'2':s==='#start'?'09:00':s==='#city'?'河南':s==='#maxhours'?'8':s==='#restmins'?'30':s==='#travelmode'?'driving':'',style:{},dataset:{},classList:{add(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(s)};
const context={document:{body:{dataset:{view:'gallery'}},querySelector:get,querySelectorAll:()=>[],head:{append(){}}},navigator:{},URL,Blob,Map,Set,console,setTimeout:()=>0,clearTimeout(){},fetch:(path,options)=>worker.fetch(new Request('https://fixture.test'+path,options),{})};context.window=context;vm.createContext(context);
vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,''),context);const run=s=>vm.runInContext(s,context);
const before=run('JSON.stringify(compactDraft())');get('#brieftext').value='保留我的旅行需求';
run("atlasQuery='宝泉';renderCityAtlas()");assert(get('#city-atlas-list').innerHTML.includes('新乡'));assert(!get('#city-atlas-list').innerHTML.includes('data-atlas-city="洛阳"'));assert(get('#atlas-city-detail').innerHTML.includes('河南宝泉旅游区'));
run("atlasQuery='';atlasRegion='豫东人文';renderCityAtlas()");assert(get('#city-atlas-list').innerHTML.includes('周口'));assert(get('#city-atlas-list').innerHTML.includes('商丘'));assert.equal((get('#city-atlas-list').innerHTML.match(/data-atlas-city=/g)||[]).length,2);
run("atlasQuery='不存在的目的地';renderCityAtlas()");assert(get('#atlasresults').textContent.includes('暂无匹配'));
run("atlasQuery='';atlasRegion='全部';renderCityAtlas();chooseAtlasCity('信阳')");assert(get('#atlas-city-detail').innerHTML.includes('南湾湖'));
for(const c of CITY_GUIDES){context.city=c.name;const stops=run("candidateStops(validateIntent({city,days:2}))");assert(stops.length>=2);assert(stops.every(s=>s.place.city===c.name&&s.place.planningEligible!==false))}
assert(CATALOG.filter(p=>p.planningEligible===false).length===2);
for(const p of CATALOG.filter(p=>p.planningEligible===false)){const report=auditDecision({days:1,maxHours:8,stops:[{place:p,day:1,duration:p.duration}]});assert.equal(report.status,'pending');assert(report.daily[0].pending.some(t=>t.includes('开放')))}
for(const r of PRESETS){context.id=r.id;run('previewFeaturedRoute(id)');const markup=get('#theme-routes').innerHTML;assert(!markup.includes('src="undefined"'));assert.equal((markup.match(/class="side-route"/g)||[]).length,2);if(!r.image){assert(markup.includes('路线示意 · 未使用实景照片'));assert(markup.includes('route-type-cover'))}}
assert.equal(run('JSON.stringify(compactDraft())'),before);assert.equal(get('#brieftext').value,'保留我的旅行需求');
const catalog=await (await worker.fetch(new Request('https://fixture.test/api/catalog'),{})).json();assert.equal(catalog.cityGuides.length,18);assert.equal(catalog.cities.length,18);
const photos=JSON.parse(await readFile(new URL('../docs/photo-catalog.json',import.meta.url),'utf8'));
for(const record of photos){
 const p=CATALOG.find(p=>p.id===record.placeId);assert(p&&p.image&&p.photoCaption,record.placeId);
 assert.equal(p.city,record.city);assert.equal(p.photoAuthor,record.author);assert.equal(p.photoTakenAt,record.takenAt);assert.equal(p.photoReference,record.source);assert.equal(p.licenseUrl,record.licenseUrl);
 assert(/^https:\/\/commons.wikimedia.org\/wiki\/File:/.test(record.source));assert(/^https:\/\/creativecommons.org\//.test(record.licenseUrl));assert(/^202[4-6]-\d{2}(?:-\d{2})?$/.test(record.takenAt));
 const source=await readFile(new URL('../'+record.file,import.meta.url));assert.equal(createHash('sha256').update(source).digest('hex'),record.sha256);assert(p.image.endsWith('?v='+record.sha256.slice(0,12)));
 const asset=await worker.fetch(new Request('https://fixture.test'+p.image),{});assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),'image/jpeg');assert.equal(createHash('sha256').update(Buffer.from(await asset.arrayBuffer())).digest('hex'),record.sha256);
}
run("atlasQuery='';atlasRegion='全部';chooseAtlasCity('安阳')");assert(get('#atlas-city-detail').innerHTML.includes(CATALOG.find(p=>p.id==='hn-yinxu').image));assert.equal(run('JSON.stringify(compactDraft())'),before);
console.log('Passed: 18 destinations, 95 places, 20 valid routes, county aliases and exclusions, unavailable-place guard, region/search discovery, honest covers, photo provenance and asset hashes, preserved draft.');
