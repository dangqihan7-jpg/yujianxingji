import assert from 'node:assert/strict';
import vm from 'node:vm';
import {HTML} from '../worker/index.js';

const nodes=new Map(),scripts=[],maps=[],timers=new Map();let nextTimer=0,throwOnCreate=false;
const get=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{value:selector==='#days'?'3':selector==='#start'?'09:00':'河南',style:{},dataset:{},classList:{toggle(){},add(){}},addEventListener(){},querySelectorAll:()=>[],showModal(){},close(){}});
  return nodes.get(selector);
};
class MapFixture{
  constructor(){if(throwOnCreate)throw Error('fixture initialization failure');this.handlers={};maps.push(this)}
  on(name,callback){this.handlers[name]=callback}
  add(){} remove(){} setFitView(){} destroy(){this.destroyed=true}
}
const context={document:{querySelector:get,querySelectorAll:()=>[],createElement:()=>({remove(){this.removed=true}}),head:{append(script){scripts.push(script)}}},location:{origin:'https://fixture.test'},navigator:{},AMap:{Map:MapFixture},Map,Set,URL,Blob,console,setTimeout:(callback,ms)=>{const id=++nextTimer;timers.set(id,{callback,ms});return id},clearTimeout:id=>timers.delete(id)};
context.window=context;vm.createContext(context);
vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,''),context);
const run=source=>vm.runInContext(source,context);
run('connectMap()');assert.equal(run('mapConnection'),'unconfigured');assert.equal(scripts.length,0);
run("cfg={mapConfigured:true,mapKey:'fixture-public-key'};connectMap()");assert.equal(run('mapConnection'),'loading');assert(get('#connectstatus').innerHTML.includes('正在加载'));
assert.equal(scripts.length,1);assert.equal([...timers.values()][0].ms,12000);
[...timers.values()][0].callback();assert.equal(run('mapConnection'),'slow');assert.equal(get('#mapretry').hidden,false);
// A late SDK load must recover even after the slow-connection notice.
scripts[0].onload();assert.equal(maps.length,1);maps[0].handlers.complete();assert.equal(run('mapConnection'),'ready');assert.equal(get('#mapretry').hidden,true);
run("updateCity('洛阳')");assert(get('#mapstatus').textContent.includes('已加载'));
// Network failure keeps the usable schematic and exposes retry.
run('connectMap()');scripts.at(-1).onerror();assert.equal(run('mapConnection'),'failed');assert(get('#map').innerHTML.includes('id="schematic"'));
// Removed/stale attempts cannot replace the latest map or its status.
run('connectMap()');const stale=scripts.at(-1);run('connectMap()');const latest=scripts.at(-1),count=maps.length;stale.onload();stale.onerror();assert.equal(maps.length,count);assert.equal(run('mapConnection'),'loading');latest.onload();maps.at(-1).handlers.complete();assert.equal(run('mapConnection'),'ready');
// Constructor failure restores the schematic after its container was cleared.
throwOnCreate=true;run('connectMap()');scripts.at(-1).onload();assert.equal(run('mapConnection'),'failed');assert(get('#map').innerHTML.includes('id="schematic"'));
// Photo-gallery entry must not initialize a map inside a hidden container.
throwOnCreate=false;context.document.body={dataset:{view:'gallery'}};run('connectMap()');const beforeHidden=maps.length;scripts.at(-1).onload();assert.equal(run('mapConnection'),'standby');assert.equal(maps.length,beforeHidden);run("setView('planner')");assert.equal(context.document.body.dataset.view,'planner');assert.equal(maps.length,beforeHidden+1);maps.at(-1).handlers.complete();assert.equal(run('mapConnection'),'ready');
console.log('Passed: late SDK recovery, truthful connection status, retry, stale-attempt isolation and fallback after initialization failure.');
