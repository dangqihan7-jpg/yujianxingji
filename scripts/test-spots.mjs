import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import worker,{HTML,CATALOG} from '../worker/index.js';

// 三合一景点页（分层点击）测试：总览（3D + 维度）→ 卡片 → 沉浸式细看，
// 一次只看一层；维度定义与计数沿用三合一预览；热门分接 /api/popular；
// 演示模式走演示数据并标注；加入行程复用站内草稿；值得多待复用复盘语义。
function makeDb(){
 const sql=new DatabaseSync(':memory:');
 return {sql,async init(){
  for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
   sql.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  }
 }};
}
function adapter(sql){
 return {prepare(query){
  const statement=sql.prepare(query);
  return {
   async all(){return {results:statement.all()}},
   bind(...args){return {
    async first(){return statement.get(...args)||null},
    async all(){return {results:statement.all(...args)}},
    async run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}}
   }}
  };
 }};
}
const db=await makeDb();await db.init();
const DB=adapter(db.sql);
const call=(path,body,user)=>worker.fetch(new Request('https://spots.test'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(user?{'oai-authenticated-user-id':user}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});

// 构建产物里必须有景点入口与本地 three 打包（无 CDN、无占位残留）
assert(HTML.includes('data-view="spots"'),'Built HTML must expose the spots view');
assert(HTML.includes('globalThis.__loadTHREE'),'Built HTML must bundle three.js locally and lazily');
assert(!HTML.includes('/*SPOTS_CODE*/')&&!HTML.includes('/*THREE_CODE*/'),'Spots placeholders must be replaced by the build');
assert(!HTML.includes('esm.sh'),'Spots page must not load 3D from a CDN');

const fixtureInstant=Date.parse('2026-10-16T04:00:00Z');
function clockDate(clock){return class extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}}}
const nodes=new Map(),body={dataset:{view:'gallery'}},get=s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#days'?'3':s==='#start'?'09:00':s==='#city'?'河南':s==='#maxhours'?'6':s==='#restmins'?'30':s==='#travelmode'?'driving':'',style:{},dataset:{},classList:{add(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(s)};
const storage=new Map();
const sessionStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
const context={document:{body,querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(){}}},navigator:{},Date:clockDate({now:fixtureInstant}),URL,Blob,Map,Set,console,setTimeout:()=>0,clearTimeout(){},sessionStorage,AbortController,performance,requestAnimationFrame:()=>0,cancelAnimationFrame(){},fetch:(path,options)=>{const headers={...(options&&options.headers?options.headers:{}),'oai-authenticated-user-id':'alice'};return worker.fetch(new Request('https://fixture.test'+path,{...(options||{}),headers}),{DB})}};
context.window=context;vm.createContext(context);
vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,''),context);
const run=s=>vm.runInContext(s,context);

// 维度计数与预览一致（文化 43、山水 38、美食 2、沉浸 9、亲子 6），8 个地点不命中任何维度
assert.equal(run('JSON.stringify(spotsDimCounts())'),'{"culture":43,"nature":38,"food":2,"immersive":9,"family":6,"none":8}','Dimension counts must match the unified preview');
assert.equal(CATALOG.length,95);
// 3D 坐标：经纬度数组 [lng, lat] → x/z 在画布范围内，半径随维度数长
const positions=run('CATALOG.map(p=>spotPosition(p))');
assert(positions.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z)&&p.x>=-17&&p.x<=17&&p.z>=-13&&p.z<=13&&p.r>=0.42&&p.r<=1.52),'Every place must map to a finite 3D position inside the scene');
const bare=run("spotPosition({location:[113.7,34.7]})");
assert(bare&&Number.isFinite(bare.x)&&Number.isFinite(bare.z)&&bare.n===0,'A place with a location but no dimensions still maps');
const multi=run("spotPosition(CATALOG.find(p=>spotDimsOf(p).length>1))"),single=run("spotPosition(CATALOG.find(p=>spotDimsOf(p).length===1))");
assert(multi.r>single.r,'A place hitting more dimensions gets a bigger sphere');
assert.equal(run("spotPosition({})"),null,'Missing location must not produce NaN coordinates');
// 3D 懒加载：页面加载时不执行 three，进景点页才加载；vm 里没有 WebGL，
// 初始化失败必须退回列表而不是抛错
assert.equal(run('typeof THREE'),'undefined','three.js must not execute at page load');
assert.equal(run('typeof globalThis.__loadTHREE'),'function','Lazy three.js loader must be defined');
run("setView('spots')");
await run('refreshSpotsPopular()');await run('loadSpotsReview()');
assert.equal(run('typeof THREE'),'object','Entering the spots view loads the local three.js bundle');
assert.equal(run('spots3DFailed'),true,'Without WebGL the 3D view must fail closed');
assert.equal(get('#spots-3d-fallback').hidden,false,'Without WebGL the list fallback must be shown');
assert(get('#spots').innerHTML.includes('景点总览'),'Layer 1 must be the overview');
assert(get('#spots').innerHTML.includes('文化 43'),'Layer 1 must show the dimension summary');
assert(get('#spots').innerHTML.includes('95 个地点'),'Layer 1 must state the catalogue size');
assert(!get('#spots').innerHTML.includes('沉浸式细看'),'Layer 1 must not show layer 3 content inline');
// 第 1 层 → 第 2 层 → 第 3 层 → 逐层返回
run("openSpotsCard('hn-longmen')");
assert.equal(run('spotsLayer'),'card');
assert(get('#spots').innerHTML.includes('龙门石窟'),'Layer 2 must show the single place');
assert(get('#spots').innerHTML.includes('沉浸式细看'),'Layer 2 must offer the immersive step');
assert(get('#spots').innerHTML.includes('值得多待'),'Layer 2 must offer the worth-more action');
assert(get('#spots').innerHTML.includes('暂未进入热门榜前 8 名'),'Empty popular list must not invent a score');
run("openSpotsImmersive('hn-longmen')");
assert.equal(run('spotsLayer'),'immersive');
assert(get('#spots').innerHTML.includes('留多久'),'Layer 3 must show the duration slider');
assert(get('#spots').innerHTML.includes('下一站'),'Layer 3 must offer the next stop');
assert(get('#spots').innerHTML.includes('在高德地图打开'),'Layer 3 must offer the map link');
run('spotsBack()');assert.equal(run('spotsLayer'),'card','Back from immersive returns to the card');
run('spotsBack()');assert.equal(run('spotsLayer'),'overview','Back from the card returns to the overview');
run('spotsBack()');assert.equal(body.dataset.view,'gallery','Back from the overview returns to the planner');
// 维度过滤：美食只有 2 个地点
run("setView('spots');setSpotsFilter('food')");
assert.equal(run('spotsVisiblePlaces().length'),2,'Food dimension must contain exactly two places');
assert(get('#spots-list').innerHTML.includes('鼓楼夜市')&&get('#spots-list').innerHTML.includes('西工小街'),'Food filter must list the two food places');
assert(!get('#spots-list').innerHTML.includes('龙门石窟'),'Food filter must hide other places');
run("setSpotsFilter('culture')");assert.equal(run('spotsVisiblePlaces().length'),43,'Culture filter must contain 43 places');
run("setSpotsFilter('all')");assert.equal(run('spotsVisiblePlaces().length'),95,'Clearing the filter restores all places');
// 城市筛选：18 城 + 全部，每颗 chip 标地点数；城市与维度联合过滤（AND）
assert.equal(run('spotsCityCounts().length'),18,'City filter must cover all 18 cities');
assert.equal(run('spotsCityCounts().reduce((s,c)=>s+c.count,0)'),95,'City counts must sum to the catalogue');
assert.equal(run("JSON.stringify(spotsCityCounts().slice(0,3))"),'[{"name":"洛阳","count":10},{"name":"郑州","count":8},{"name":"开封","count":8}]','Cities must be ordered by place count');
assert(get('#spots').innerHTML.includes('洛阳 <b>10</b>'),'Overview must show the city chip with its count');
run("setSpotsCity('洛阳')");
assert.equal(run('spotsVisiblePlaces().length'),10,'Luoyang filter must contain exactly ten places');
assert(get('#spots-list').innerHTML.includes('龙门石窟')&&get('#spots-list').innerHTML.includes('白马寺'),'Luoyang filter must list Luoyang places');
assert(!get('#spots-list').innerHTML.includes('河南博物院'),'Luoyang filter must hide other cities');
run("setSpotsFilter('culture')");
assert.equal(run('spotsVisiblePlaces().length'),6,'Luoyang + culture must be the AND of both filters');
run("setSpotsCity('济源');setSpotsFilter('food')");
assert.equal(run('spotsVisiblePlaces().length'),0,'A city-dimension combination with no places must be empty');
assert(get('#spots-list').innerHTML.includes('暂无地点'),'An empty combination must say so');
// 3D 与列表同步：无 WebGL 时用假 mesh 验过滤谓词
run("spots3D={meshes:new Map([['hn-longmen',{visible:true}],['hn-henan-museum',{visible:true}]])}");
run("setSpotsCity('洛阳');setSpotsFilter('all');spots3DApplyFilter()");
assert.equal(run("spots3D.meshes.get('hn-longmen').visible"),true,'3D must keep the filtered city visible');
assert.equal(run("spots3D.meshes.get('hn-henan-museum').visible"),false,'3D must hide other cities');
run("setSpotsCity('all');spots3DApplyFilter()");
assert.equal(run("spots3D.meshes.get('hn-henan-museum').visible"),true,'Clearing the city filter must show all cities in 3D');
// 进卡片再返回，城市筛选保持；“全部”清空；未知城市不改动
run("setSpotsCity('洛阳')");
run("openSpotsCard('hn-longmen')");
run('spotsBack()');
assert.equal(run('spotsLayer'),'overview','Back from the card returns to the overview');
assert.equal(run('spotsCity'),'洛阳','Returning to the overview must keep the city filter');
assert.equal(run('spotsVisiblePlaces().length'),10,'Returning must keep the filtered list');
assert(get('#spots').innerHTML.includes('spots-city-chip active" data-spots-city="洛阳"'),'Returning must keep the city chip active');
run("setSpotsCity('不存在')");
assert.equal(run('spotsCity'),'洛阳','An unknown city must not change the filter');
run("setSpotsCity('all');setSpotsFilter('all')");
assert.equal(run('spotsVisiblePlaces().length'),95,'All must clear the city filter');
run('spots3D=null');
// 点击委托：点球/列表项进卡片，加入行程按钮复用站内草稿（可加入、可移除）
const freeId=run("CATALOG.find(p=>!same(p)).id");
get('#spots').onclick({target:{closest:s=>s==='[data-spots-open]'?{dataset:{spotsOpen:'hn-longmen'}}:null}});
assert.equal(run('spotsLayer'),'card','Clicking a list item must open its card');
run("setSpotsLayer('overview')");
const before=run('trip.length');
get('#spots').onclick({target:{closest:s=>s==='[data-spots-add]'?{dataset:{spotsAdd:freeId}}:null}});
assert.equal(run('trip.length'),before+1,'Add must reuse the trip draft');
assert.equal(run('same(CATALOG.find(p=>p.id==="'+freeId+'"))'),true);
get('#spots').onclick({target:{closest:s=>s==='[data-spots-add]'?{dataset:{spotsAdd:freeId}}:null}});
assert.equal(run('trip.length'),before,'Add toggles back to remove');
// 时长滑杆：未入行程时先记页内计划时长，加入行程时带上
run("globalThis.__fakeLabel={textContent:''};globalThis.__fakeInput={dataset:{spotsDuration:'"+freeId+"'},value:'180',closest:()=>({querySelector:()=>globalThis.__fakeLabel})};spotsDurationInput({target:{closest:()=>globalThis.__fakeInput}})");
assert.equal(run('globalThis.__fakeLabel.textContent'),'3 小时','Slider must show the chosen duration');
assert.equal(run('spotsPlannedDuration["'+freeId+'"]'),180,'Slider must remember the planned duration before adding');
get('#spots').onclick({target:{closest:s=>s==='[data-spots-add]'?{dataset:{spotsAdd:freeId}}:null}});
assert.equal(run("trip.find(s=>s.place.id==='"+freeId+"').duration"),180,'Adding must carry the planned duration');
get('#spots').onclick({target:{closest:s=>s==='[data-spots-add]'?{dataset:{spotsAdd:freeId}}:null}});
// 值得多待：复用 trip_reviews 语义；唯一字段时取消受服务端保护
await run("toggleSpotsWorth('hn-longmen')");
assert.equal(run('spotsReview.worthMoreStop'),'龙门石窟','Worth-more must land in the review');
run("openSpotsCard('hn-longmen')");
assert(get('#spots').innerHTML.includes('已标值得多待'),'Card must reflect the marked state');
const tripId=run('getTripId()');
const realBefore=await (await call('/api/popular',null,'alice')).json();
assert(realBefore.items.some(x=>x.id==='hn-longmen'&&x.score===3&&!x.demo),'Real popular must count the real review (1 worth × 3) and never mix demo rows');
// 演示模式：演示开时热门分走演示数据并全程标注
await call('/api/demo/reviews/seed',{sessionId:'spots-demo'});
sessionStorage.setItem('yujianxingji.demoOn','1');sessionStorage.setItem('yujianxingji.demoSession','spots-demo');
await run("refreshSpotsPopular()");
assert.equal(run('spotsPopularDemo'),true,'Demo on must load demo popular data');
assert(run('spotsPopular.items.some(x=>x.demo)'),'Demo popular items must be flagged demo');
run("openSpotsCard('hn-longmen')");
assert(get('#spots').innerHTML.includes('演示数据'),'Card must label demo scores in demo mode');
assert(get('#spots').innerHTML.includes('演示模式'),'Card must carry the demo-mode note');
run("setSpotsLayer('overview')");
assert(get('#spots').innerHTML.includes('热门第 1 名'),'Overview list must show the demo rank badge');
// 演示关时回到真实数据：龙门石窟只剩真实复盘 3 分，不带演示标注
sessionStorage.setItem('yujianxingji.demoOn','0');
await run("refreshSpotsPopular()");
assert.equal(run('spotsPopularDemo'),false,'Demo off must load real popular data');
assert(!run('spotsPopular.items.some(x=>x.demo)'),'Real popular must not contain demo rows');
run("openSpotsCard('hn-longmen')");
assert(get('#spots').innerHTML.includes('热门分 3'),'Card must show the real score when demo is off');
assert(!get('#spots').innerHTML.includes('演示数据'),'Card must not label real scores as demo');
// 取消值得多待：补一个其他字段后才能全量替换成功
await call('/api/trips/'+encodeURIComponent(tripId)+'/review',{actualCost:500,worthMoreStop:'龙门石窟'},'alice');
await run("toggleSpotsWorth('hn-longmen')");
assert.equal(run('spotsReview.worthMoreStop'),null,'Unmarking must clear the worth-more stop');
console.log('test-spots: layers, filter, city filter, draft, worth-more, popular and demo labels OK');
