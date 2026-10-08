import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import worker,{HTML} from '../worker/index.js';
const html=HTML;const script=html.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');
const nodes=new Map();const get=s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#days'?'2':s==='#start'?'09:00':s==='#city'?'郑州':'',style:{},dataset:{},classList:{toggle(){},add(){},remove(){}},addEventListener(){},insertAdjacentHTML(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(s)};
const options=[];let restCalls=0;
class LngLat{constructor(lng,lat){this.lng=lng;this.lat=lat}getLng(){return this.lng}getLat(){return this.lat}}
const raw=(id,type)=>({id,name:'测试地点',address:'测试地址',type,location:new LngLat(113.7,34.76),photos:[{url:'https://photos.example.test/real.jpg',title:'实景'},{url:'javascript:invalid'}]});
class PlaceSearch{constructor(opts){this.opts=opts;options.push(opts)}setCityLimit(v){assert.equal(v,true)}search(q,cb){if(q==='error')return cb('error','KEY_ERROR');if(q==='empty')return cb('no_data',0);cb('complete',{poiList:{pois:[raw('poi-'+this.opts.type,this.opts.type)]}})}getDetails(id,cb){cb('complete',{poiList:{pois:[raw(id,'110000')]}})}}
class Walking{search(a,b,cb){if(a.getLng()===0)return cb('no_data',0);cb('complete',{routes:[{distance:300,time:180,steps:[{path:[a,b]}]}]})}}
const context={document:{querySelector:get,querySelectorAll:()=>[]},navigator:{},AMap:{plugin:(names,callback)=>callback(),PlaceSearch,Walking,LngLat},URL,Blob,Map,Set,setTimeout:()=>0,clearTimeout(){},fetch:async()=>{restCalls++;throw Error('REST endpoint should not be used')}};
vm.createContext(context);vm.runInContext(script,context);
vm.runInContext("cfg={mapConfigured:true,placesConfigured:true,webServiceConfigured:false};",context);
await vm.runInContext('search(true)',context);assert.equal(restCalls,0);assert.equal(vm.runInContext('places.length',context),3);assert.equal(vm.runInContext("places.map(p=>p.category).join(',')",context),'scenic,food,stay');assert(options.every(x=>x.extensions==='all'&&x.city==='郑州'));
assert.equal(vm.runInContext('places[0].location[0]',context),113.7);assert.equal(vm.runInContext('places[0].photos.length',context),1);
await vm.runInContext('openDetail(places[0])',context);assert.equal(restCalls,0);assert(get('#detailbody').innerHTML.includes('https://photos.example.test/real.jpg'));
const route=await vm.runInContext('jsRoutes([[113.7,34.76],[113.71,34.77],[113.72,34.78]])',context);assert.equal(route.legs.length,2);assert.equal(route.legs[0].duration,180);assert.equal(route.legs[0].path.length,2);
await assert.rejects(vm.runInContext('jsRoutes([[0,0],[1,1]])',context));await assert.rejects(vm.runInContext("jsPlaces('郑州','error','scenic')",context));const empty=await vm.runInContext("jsPlaces('郑州','empty','scenic')",context);assert.equal(empty.places.length,0);
const response=await worker.fetch(new Request('https://travel.test/api/config'),{AMAP_JS_KEY:'test-js-key',AMAP_SECURITY_JS_CODE:'test-code'});const config=await response.json();assert.equal(config.mapConfigured,true);assert.equal(config.placesConfigured,true);assert.equal(config.webServiceConfigured,false);assert(!JSON.stringify(config).includes('test-code'));
console.log('Passed: JS API search, details, photos, routes, no-data/error handling and configuration with only two credentials; no Web-service endpoint used.');
