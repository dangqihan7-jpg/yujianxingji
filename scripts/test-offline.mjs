import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker,{CATALOG,validateDraft} from '../worker/index.js';

// Photo-backed offline drafts must stay small enough to import and recover
// canonical details rather than serializing embedded photo data into JSON.
const html=await readFile(new URL('../index-offline.html',import.meta.url),'utf8');
const nodes=new Map();let exportedBlob;
const get=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{value:selector==='#days'?'3':selector==='#start'?'09:00':'河南',style:{},dataset:{},classList:{toggle(){},add(){}},addEventListener(){},querySelectorAll:()=>[],showModal(){this.open=true},close(){this.open=false}});
  return nodes.get(selector);
};
class FixtureURL extends URL{
  static createObjectURL(blob){exportedBlob=blob;return 'blob:fixture'}
  static revokeObjectURL(){}
}
const context={document:{querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(){}}},navigator:{},location:{origin:'https://offline.test'},URL:FixtureURL,Map,Set,Blob,Response,setTimeout:()=>0,clearTimeout(){},console};
context.window=context;vm.createContext(context);
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))vm.runInContext(match[1].replace(/\ninit\(\);\s*$/,''),context);
const run=source=>vm.runInContext(source,context);
await run('init()');
assert.equal(run('trip.length'),5);
assert.equal(run('currentPresetId'),'luoyang');
assert.equal(run('mapConnection'),'unconfigured');
assert(run('trip.some(s=>s.place.image?.startsWith("data:image/jpeg;base64,"))'));
assert(get('#presets').innerHTML.includes('data:image/jpeg;base64,'));
assert.equal((get('#photocredits').innerHTML.match(/照片来源/g)||[]).length,11);
run("$('#export').onclick()");
assert(exportedBlob.size<100000,'Photo data must not exceed the import size limit');
const exportedText=await exportedBlob.text(),exported=JSON.parse(exportedText);
assert(!exportedText.includes('data:image'));
assert(!exported.stops.some(s=>'image' in s.place||'description' in s.place));
const ids=exported.stops.map(s=>s.place.id);
run("$('#clear').onclick();$('#city').value='开封'");
await get('#file').onchange({target:{files:[{size:exportedBlob.size,text:async()=>exportedText}]}});
assert.deepEqual(Array.from(run('trip.map(s=>s.place.id)')),ids);
assert.equal(get('#city').value,exported.city);
assert.equal(run('trip[0].place.description'),CATALOG.find(p=>p.id===ids[0]).description);
await run('generate()');
assert.equal(run('lastAdvice.source'),'rules');
assert.equal(run('lastAdvice.stops.length'),ids.length);
assert.equal(get('#advice').open,true);
get('#apply').onclick();
assert.equal(run('trip.length'),ids.length);
const liveDraft=validateDraft({days:1,start:'09:00',stops:[{place:{id:'live1',name:'地点',category:'scenic',source:'amap',location:[112.4,34.6],address:'洛阳',city:'洛阳'},day:1,duration:90}]});
assert.equal(liveDraft.stops[0].place.city,'洛阳');
for(const image of new Set(CATALOG.filter(p=>p.image).map(p=>p.image))){
  const response=await worker.fetch(new Request('https://fixture.test'+image),{});
  assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/jpeg');
  assert((await response.arrayBuffer()).byteLength>1000);
}
console.log('Passed: offline presets and photos, compact export/import round trip, restored details, rule advice and eleven image routes.');
