// 景点页（三层）：总览（3D 空间 + 维度分布）→ 景点卡片 → 沉浸式细看。
// 一次只看一层，每层都有返回；第 1 层不直接出现第 3 层的内容。
// 数据接 henan.json 目录；维度定义与计数沿用三合一预览；热门分接
// GET /api/popular；演示模式沿用现有开关；加入行程复用站内 add()/remove()
//（行程草稿由 renderTrip 自动保存到 /api/draft）；值得多待复用
// trip_reviews 复盘语义（POST /api/trips/:id/review 全量替换）。
// 3D 走本地打包的原生 Three.js（scripts/bundle-three.mjs，懒加载，不走 CDN）。
// 维度定义与计数沿用三合一预览 spot-unified.html 的同一套正则（实算复核：
// 文化 43、山水 38、美食 2、沉浸 9、亲子 6；8 个地点不命中任何维度，
// 归为“综合”，3D 里用灰色球、列表里不贴维度标签）。
// 城市筛选（18 城 chips，取 henan.json 里地点 city 字段的实际集合，每颗
// chip 标该城地点数）与维度联合过滤（AND），3D 球与列表同步；返回第 1 层
// 时城市筛选保持；城市筛选只影响第 1 层展示，不改卡片/沉浸式与热门接线。
// 颜色按站内暖纸主题调整，未沿用预览的亮色。
const SPOT_DIMS=[
 {key:'culture',name:'文化',color:'#a33e2d',test:p=>/文化|历史|博物|石窟|古城|寺|古都/.test((p.theme||'')+' '+(p.name||''))},
 {key:'nature',name:'山水',color:'#2e6b4f',test:p=>/山|峡|自然|水|湖/.test((p.theme||'')+' '+(p.name||''))},
 {key:'food',name:'美食',color:'#8a6420',test:p=>p.category==='food'||/美食|小吃|吃/.test((p.theme||'')+' '+(p.name||''))},
 {key:'immersive',name:'沉浸',color:'#6d5aa7',test:p=>/演艺|戏剧|夜游|武侠|电影|沉浸/.test((p.theme||'')+' '+(p.name||''))},
 {key:'family',name:'亲子',color:'#a34a68',test:p=>/亲子|乐园|动物|儿童/.test((p.theme||'')+' '+(p.name||''))}
];
function spotDimsOf(p){return SPOT_DIMS.filter(d=>{try{return d.test(p)}catch(e){return false}})}
function spotPrimaryDim(p){const d=spotDimsOf(p);return d.length?d[0]:null}
function spotsDimCounts(){const out={};SPOT_DIMS.forEach(d=>out[d.key]=0);let none=0;CATALOG.forEach(p=>{const d=spotDimsOf(p);if(!d.length)none++;d.forEach(x=>out[x.key]++)});out.none=none;return out}
function spotLngLat(p){const l=p.location;return Array.isArray(l)&&Number.isFinite(l[0])&&Number.isFinite(l[1])?l:null}
function spotsBounds(){let minLng=Infinity,maxLng=-Infinity,minLat=Infinity,maxLat=-Infinity;CATALOG.forEach(p=>{const l=spotLngLat(p);if(!l)return;minLng=Math.min(minLng,l[0]);maxLng=Math.max(maxLng,l[0]);minLat=Math.min(minLat,l[1]);maxLat=Math.max(maxLat,l[1])});return{minLng,maxLng,minLat,maxLat}}
// 经纬度 → 3D 坐标：x=经度，z=纬度（北为 -z），y=高度；
// 半径与高度都随命中维度数长：维度越多球越大、站得越高。
// henan.json 的 location 是 [lng, lat] 数组（与站内地图一致）。
function spotPosition(p){
 const l=spotLngLat(p);if(!l)return null;
 const b=spotsBounds();
 const x=((l[0]-b.minLng)/Math.max(1e-9,b.maxLng-b.minLng)-0.5)*34;
 const z=((l[1]-b.minLat)/Math.max(1e-9,b.maxLat-b.minLat)-0.5)*-26;
 const n=spotDimsOf(p).length;
 return{x,y:0.4+n*0.55,z,r:0.42+n*0.22,n};
}
let spotsLayer='overview',spotsSpotId=null,spotsFilter='all',spotsCity='all',spotsLastLayer=null;
function spotsCityCounts(){
 const seen=new Map();
 CATALOG.forEach(p=>{if(!seen.has(p.city))seen.set(p.city,{name:p.city,count:0});seen.get(p.city).count++});
 return [...seen.values()].sort((a,b)=>b.count-a.count);
}
let spotsPopular=null,spotsPopularDemo=false,spotsPopularKey=null;
let spotsReview={loaded:false,worthMoreStop:null};
let spotsPlannedDuration={};
let spots3D=null,spots3DFailed=false,spots3DRunning=false,spots3DAuto=true;
function spotsVisiblePlaces(){return CATALOG.filter(p=>(spotsCity==='all'||p.city===spotsCity)&&(spotsFilter==='all'||spotDimsOf(p).some(d=>d.key===spotsFilter)))}
function spotsPlace(id){return CATALOG.find(p=>p.id===id)||null}
function spotsDurationFor(p){const stop=trip.find(s=>s.place.id===p.id);return spotsPlannedDuration[p.id]??(stop?stop.duration:undefined)??p.duration??90}
function spotsPopularRank(id){if(!spotsPopular||!Array.isArray(spotsPopular.items))return null;const i=spotsPopular.items.findIndex(x=>x.id===id);return i<0?null:i+1}
function spotsPopularFor(id){if(!spotsPopular||!Array.isArray(spotsPopular.items))return null;return spotsPopular.items.find(x=>x.id===id)||null}
async function refreshSpotsPopular(){
 const demo=typeof demoOn==='function'?demoOn():false;
 const key=demo?'demo:'+(typeof demoSessionId==='function'?demoSessionId():''):'real';
 if(spotsPopular&&spotsPopularKey===key)return spotsPopular;
 try{
  const url=demo?('/api/popular?demo='+encodeURIComponent(typeof demoSessionId==='function'?demoSessionId():'')):'/api/popular';
  const data=await api(url);
  spotsPopular=data;spotsPopularDemo=!!data.demo;spotsPopularKey=key;
 }catch(e){spotsPopular=null;spotsPopularDemo=false;spotsPopularKey=null}
 if(typeof activeView!=='undefined'&&activeView==='spots')renderSpots();
 return spotsPopular;
}
async function loadSpotsReview(){
 if(spotsReview.loaded)return spotsReview;
 try{const data=await api('/api/trips/'+encodeURIComponent(getTripId())+'/review');spotsReview={loaded:true,worthMoreStop:data.review?data.review.worthMoreStop||null:null}}catch(e){spotsReview={loaded:true,worthMoreStop:null}}
 if(typeof activeView!=='undefined'&&activeView==='spots')renderSpots();
 return spotsReview;
}
function spotsCreditHTML(p){
 const text=p.credit||p.photoSource||'照片出处待补充';
 const link=p.photoReference?(' <a href="'+esc(p.photoReference)+'" target="_blank" rel="noopener">来源 ↗</a>'):'';
 const license=p.licenseUrl?(' <a href="'+esc(p.licenseUrl)+'" target="_blank" rel="noopener">授权 ↗</a>'):'';
 return esc(text)+link+license+' · '+esc(typeof photoDateLabel==='function'?photoDateLabel(p):'');
}
function toggleSpotsTrip(id){
 const place=spotsPlace(id);if(!place)return;
 if(typeof same==='function'&&same(place)){
  if(remove(id))toast('已从行程移除：'+place.name);
 }else{
  if(!add(place))return;
  const planned=spotsPlannedDuration[id];
  if(planned!=null){const stop=trip.find(s=>s.place.id===id);if(stop){stop.duration=planned;if(typeof renderTrip==='function')renderTrip()}}
 }
 if(spotsLayer==='overview')renderSpotsList();else renderSpots();
}
async function toggleSpotsWorth(id){
 const place=spotsPlace(id);if(!place)return;
 if(typeof cfg!=='undefined'&&cfg.authMode==='standalone'&&typeof authUser!=='undefined'&&!authUser){toast('请先登录，复盘会保存到你的账号');if(typeof openAuth==='function')openAuth('login');return}
 try{
  const tripId=getTripId();
  let current=null;
  try{const data=await api('/api/trips/'+encodeURIComponent(tripId)+'/review');current=data.review||null}catch(e){if(e.status===401){toast('请先登录，复盘会保存到你的账号');if(typeof openAuth==='function')openAuth('login');return}throw e}
  const name=place.name,isMarked=current&&current.worthMoreStop===name;
  const merged={actualCost:current?current.actualCost??null:null,overtimeStop:current?current.overtimeStop??null:null,worthMoreStop:isMarked?null:name,chosenPlan:current?current.chosenPlan??null:null};
  if(Object.values(merged).every(v=>v==null)){toast('取消失败：这是本次复盘唯一内容，请去行程总览的复盘里修改');return}
  const saved=await api('/api/trips/'+encodeURIComponent(tripId)+'/review',merged);
  spotsReview={loaded:true,worthMoreStop:saved.review?saved.review.worthMoreStop||null:null};
  toast(isMarked?'已取消“值得多待”':('已标为值得多待：'+name+'（会进复盘信号）'));
  if(typeof refreshReviewSummary==='function')refreshReviewSummary();
  renderSpots();
 }catch(e){toast(e.message||'标记失败，请稍后重试')}
}
function setSpotsLayer(layer,spotId){spotsLayer=layer;if(spotId!==undefined)spotsSpotId=spotId;renderSpots()}
function openSpotsCard(id){setSpotsLayer('card',id)}
function openSpotsImmersive(id){setSpotsLayer('immersive',id||spotsSpotId)}
function spotsBack(){if(spotsLayer==='immersive')setSpotsLayer('card');else if(spotsLayer==='card')setSpotsLayer('overview');else if(typeof setView==='function')setView('gallery')}
function setSpotsFilter(key){if(!SPOT_DIMS.some(d=>d.key===key)&&key!=='all')return;spotsFilter=key;const chips=$('#spots')?$('#spots').querySelectorAll('[data-spots-filter]'):[];chips.forEach(c=>c.classList&&c.classList.toggle('active',c.dataset.spotsFilter===key));spots3DApplyFilter();renderSpotsList()}
function setSpotsCity(city){if(city!=='all'&&!spotsCityCounts().some(c=>c.name===city))return;spotsCity=city;const chips=$('#spots')?$('#spots').querySelectorAll('[data-spots-city]'):[];chips.forEach(c=>c.classList&&c.classList.toggle('active',c.dataset.spotsCity===city));spots3DApplyFilter();renderSpotsList()}
function spotsDimTagsHTML(p){return spotDimsOf(p).map(d=>'<span class="spots-dim-tag" style="--dim:'+d.color+'">'+d.name+'</span>').join('')}
function spotsListHTML(){
 const list=spotsVisiblePlaces();
 if(!list.length)return '<div class="empty">这个筛选下暂无地点。</div>';
 return list.map(p=>{
  const pop=spotsPopularFor(p.id),rank=spotsPopularRank(p.id);
  const inTrip=typeof same==='function'?same(p):false;
  return '<article class="spots-item" data-spots-open="'+p.id+'" tabindex="0" role="button" aria-label="'+esc(p.name)+'，'+esc(p.city)+'，点按查看卡片">'
  +'<div class="spots-item-photo">'+photoMediaHTML(p,{compact:true})+'</div>'
  +'<div class="spots-item-body"><h3>'+esc(p.name)+'</h3>'
  +'<p class="spots-item-meta">'+esc(p.city)+' · '+esc(p.theme||'')+' · '+durationLabel(spotsDurationFor(p))+'</p>'
  +'<p class="spots-item-dims">'+spotsDimTagsHTML(p)+(pop?'<span class="spots-pop">热门第 '+rank+' 名</span>':'')+'</p></div>'
  +'<button class="spots-item-add'+(inTrip?' on':'')+'" data-spots-add="'+p.id+'">'+(inTrip?'已加入 ✓':'加入行程')+'</button>'
  +'</article>';
 }).join('');
}
function renderSpotsList(){
 const list=$('#spots-list');if(!list)return;
 list.innerHTML=spotsListHTML();
 if(typeof bindPhotoMedia==='function')bindPhotoMedia(list);
}
function spotsOverviewHTML(){
 const counts=spotsDimCounts();
 const cities=spotsCityCounts();
 const chips=[{key:'all',name:'全部',count:CATALOG.length,color:null}].concat(SPOT_DIMS.map(d=>({key:d.key,name:d.name,count:counts[d.key],color:d.color})));
 return '<div class="spots-page spots-overview">'
 +'<div class="spots-crumb"><span>景点</span><span class="spots-crumb-sep">/</span><span>总览</span></div>'
 +'<div class="spots-head"><div><div class="eyebrow">SPOTS · HENAN</div><h2>景点总览</h2><p class="spots-sub">95 个地点，先看 3D 空间，再点进一个景点细看。</p></div>'
 +'<div class="spots-summary">文化 '+counts.culture+' · 山水 '+counts.nature+' · 沉浸 '+counts.immersive+' · 亲子 '+counts.family+' · 美食 '+counts.food+'</div></div>'
 +'<div class="spots-cities" role="group" aria-label="按城市筛选"><span class="spots-filter-label">城市</span><button class="spots-chip spots-city-chip'+(spotsCity==='all'?' active':'')+'" data-spots-city="all">全部 <b>'+CATALOG.length+'</b></button>'+cities.map(c=>'<button class="spots-chip spots-city-chip'+(spotsCity===c.name?' active':'')+'" data-spots-city="'+esc(c.name)+'">'+esc(c.name)+' <b>'+c.count+'</b></button>').join('')+'</div>'
 +'<div class="spots-dims" role="group" aria-label="按维度筛选"><span class="spots-filter-label">维度</span>'+chips.map(c=>'<button class="spots-chip'+(spotsFilter===c.key?' active':'')+'" data-spots-filter="'+c.key+'"'+(c.color?' style="--dim:'+c.color+'"':'')+'><span class="spots-dot"></span>'+esc(c.name)+' <b>'+c.count+'</b></button>').join('')+'</div>'
 +'<div class="spots-3d-wrap"><div id="spots-3d" class="spots-3d" aria-label="3D 景点空间"></div>'
 +'<div class="spots-3d-bar"><span>拖动旋转 · 滚轮缩放 · 点球进卡片</span><button class="small quiet" data-spots-rotate>'+(spots3DAuto?'暂停旋转':'自动旋转')+'</button></div>'
 +'<div id="spots-3d-tip" class="spots-3d-tip" hidden></div>'
 +'<div id="spots-3d-fallback" class="spots-3d-fallback" hidden>当前设备不支持 3D 浏览，以下列表同样可以找地点。</div></div>'
 +'<p class="spots-note">维度分布：文化 '+counts.culture+'、山水 '+counts.nature+'、沉浸 '+counts.immersive+'、亲子 '+counts.family+'、美食 '+counts.food+'。美食与亲子供给浅，是推流缺口。</p>'
 +'<div id="spots-list" class="spots-list">'+spotsListHTML()+'</div>'
 +'</div>';
}
function spotsCardHTML(p){
 if(!p)return '<div class="empty">找不到这个地点。</div>';
 const dims=spotDimsOf(p);
 const pop=spotsPopularFor(p.id),rank=spotsPopularRank(p.id);
 const inTrip=typeof same==='function'?same(p):false;
 const marked=spotsReview.worthMoreStop===p.name;
 const dur=spotsDurationFor(p);
 let popLine;
 if(!spotsPopular)popLine='<p class="spots-pop-line">正在读取热门分…</p>';
 else if(pop){
  const added=pop.addedDemo>0?'加入行程合计 '+pop.added:pop.added+' 人的当前行程草稿含此地点';
  popLine='<p class="spots-pop-line">热门第 '+rank+' 名 · 热门分 '+pop.score+'（'+pop.worth+' 人复盘值得多待 · '+added+'）'+(pop.demo?' · 演示数据':'')+'</p>';
 }
 else popLine='<p class="spots-pop-line">暂未进入热门榜前 8 名。</p>';
 return '<div class="spots-page spots-card">'
 +'<nav class="spots-crumb"><button data-spots-back>‹ 返回总览</button><span class="spots-crumb-sep">/</span><span>景点卡片</span></nav>'
 +'<div class="spots-card-grid"><div class="spots-card-photo">'+photoMediaHTML(p)+'</div>'
 +'<div class="spots-card-info"><div class="eyebrow">'+esc(p.city)+' · '+esc(p.theme||'')+'</div><h2>'+esc(p.name)+'</h2>'
 +'<p class="spots-card-meta">建议时长 '+durationLabel(dur)+' · '+(dims.map(d=>d.name).join(' / ')||'未分类')+'</p>'
 +popLine
 +(spotsPopularDemo?'<p class="spots-demo-note">演示模式 · 以下热门分含演示数据</p>':'')
 +'<p class="spots-desc">'+esc(p.description||'')+'</p>'
 +(p.visitTip?'<p class="spots-tip">游玩提示：'+esc(p.visitTip)+'</p>':'')
 +(p.address?'<p class="spots-addr">地址：'+esc(p.address)+'</p>':'')
 +'<p class="spots-credit">'+spotsCreditHTML(p)+'</p>'
 +'<div class="spots-actions"><button class="spots-add'+(inTrip?' on':'')+'" data-spots-add="'+p.id+'">'+(inTrip?'已加入 ✓':'加入行程')+'</button>'
 +'<button class="spots-worth'+(marked?' on':'')+'" data-spots-worth="'+p.id+'">'+(marked?'已标值得多待 ✓':'☆ 值得多待')+'</button>'
 +'<button class="spots-immersive-btn" data-spots-immersive="'+p.id+'">沉浸式细看 →</button></div>'
 +'</div></div></div>';
}

function spotsImmersiveHTML(p){
 if(!p)return '<div class="empty">找不到这个地点。</div>';
 const list=spotsVisiblePlaces();
 const idx=Math.max(0,list.findIndex(x=>x.id===p.id));
 const next=list[(idx+1)%list.length];
 const dur=spotsDurationFor(p);
 const inTrip=typeof same==='function'?same(p):false;
 const marked=spotsReview.worthMoreStop===p.name;
 const mapUrl=spotLngLat(p)?'https://uri.amap.com/marker?position='+spotLngLat(p)[0]+','+spotLngLat(p)[1]+'&name='+encodeURIComponent(p.name):null;
 return '<div class="spots-page spots-immersive">'
 +'<nav class="spots-crumb dark"><button data-spots-back-card>‹ 返回卡片</button><span class="spots-crumb-sep">/</span><span>沉浸式细看</span></nav>'
 +'<div class="spots-hero"><div class="spots-hero-media">'+photoMediaHTML(p)+'</div><div class="spots-hero-shade"></div>'
 +'<div class="spots-hero-text"><div class="spots-eyebrow">'+esc(p.city)+' · '+esc(p.theme||'')+'</div><h2>'+esc(p.name)+'</h2><p>'+esc(p.description||'')+'</p></div></div>'
 +'<div class="spots-imm-body">'
 +'<section class="spots-sec"><div class="spots-sec-no">01</div><h3>为什么值得来</h3><p>'+esc(p.description||'河南精选地点。')+'</p></section>'
 +(p.visitTip?'<section class="spots-sec"><div class="spots-sec-no">02</div><h3>游玩提示</h3><p>'+esc(p.visitTip)+'</p></section>':'')
 +'<section class="spots-sec"><div class="spots-sec-no">03</div><h3>留多久</h3><p>建议 '+durationLabel(dur)+'，拖动滑杆按你的节奏调；已在行程里就直接改该站时长。</p><div class="spots-slider-row"><input type="range" min="30" max="480" step="30" value="'+dur+'" data-spots-duration="'+p.id+'" aria-label="停留时长"><span class="spots-duration-label">'+durationLabel(dur)+'</span></div></section>'
 +'<section class="spots-sec"><h3>定位</h3><p>'+(p.address?esc(p.address):esc(p.city)+' · '+esc(p.name))+'</p>'+(mapUrl?'<a class="spots-map-link" href="'+mapUrl+'" target="_blank" rel="noopener">在高德地图打开 ↗</a>':'')+'</section>'
 +'<div class="spots-actions dark"><button class="spots-add'+(inTrip?' on':'')+'" data-spots-add="'+p.id+'">'+(inTrip?'已加入 ✓':'加入行程')+'</button><button class="spots-worth'+(marked?' on':'')+'" data-spots-worth="'+p.id+'">'+(marked?'已标值得多待 ✓':'☆ 值得多待')+'</button><button class="spots-next" data-spots-immersive="'+next.id+'">下一站：'+esc(next.name)+' →</button></div>'
 +'<p class="spots-trip-line">行程已有 '+trip.length+' 个地点。</p>'
 +'<p class="spots-credit light">'+spotsCreditHTML(p)+'</p>'
 +'</div></div>';
}
function renderSpots(){
 const el=$('#spots');if(!el)return;
 if(spotsLayer==='card'&&!spotsPlace(spotsSpotId)){spotsLayer='overview';spotsSpotId=null}
 if(spotsLayer==='immersive'&&!spotsPlace(spotsSpotId)){spotsLayer='card'}
 const layerChanged=spotsLayer!==spotsLastLayer;spotsLastLayer=spotsLayer;
 if(spotsLayer==='overview'){el.innerHTML=spotsOverviewHTML();spots3DInit()}
 else if(spotsLayer==='card'){spots3DStop();el.innerHTML=spotsCardHTML(spotsPlace(spotsSpotId))}
 else{spots3DStop();el.innerHTML=spotsImmersiveHTML(spotsPlace(spotsSpotId))}
 if(typeof bindPhotoMedia==='function')bindPhotoMedia(el);
 if(layerChanged&&typeof globalThis!=='undefined'&&typeof globalThis.scrollTo==='function')globalThis.scrollTo({top:0,behavior:'instant'});
 loadSpotsReview();refreshSpotsPopular();
}
function spotsDurationInput(e){
 const input=e.target&&e.target.closest?e.target.closest('[data-spots-duration]'):null;if(!input)return;
 const p=spotsPlace(input.dataset.spotsDuration);if(!p)return;
 const v=Number(input.value)||90;
 const label=input.closest('.spots-slider-row')?input.closest('.spots-slider-row').querySelector('.spots-duration-label'):null;if(label)label.textContent=durationLabel(v);
 const stop=trip.find(s=>s.place.id===p.id);
 if(stop)stop.duration=v;else spotsPlannedDuration[p.id]=v;
}
function spotsDurationChange(e){
 const input=e.target&&e.target.closest?e.target.closest('[data-spots-duration]'):null;if(!input)return;
 const p=spotsPlace(input.dataset.spotsDuration);if(!p)return;
 const v=Number(input.value)||90;
 const stop=trip.find(s=>s.place.id===p.id);
 if(stop){if(typeof checkpoint==='function')checkpoint();stop.duration=v;if(typeof renderTrip==='function')renderTrip()}
 const label=input.closest('.spots-slider-row')?input.closest('.spots-slider-row').querySelector('.spots-duration-label'):null;if(label)label.textContent=durationLabel(v);
}
const spotsRoot=$('#spots');
if(spotsRoot){
 spotsRoot.onclick=function(e){
  const t=e.target;if(!t||!t.closest)return;
  const addBtn=t.closest('[data-spots-add]');if(addBtn){toggleSpotsTrip(addBtn.dataset.spotsAdd);return}
  const worthBtn=t.closest('[data-spots-worth]');if(worthBtn){toggleSpotsWorth(worthBtn.dataset.spotsWorth);return}
  const immBtn=t.closest('[data-spots-immersive]');if(immBtn){openSpotsImmersive(immBtn.dataset.spotsImmersive);return}
  const backBtn=t.closest('[data-spots-back]');if(backBtn){spotsBack();return}
  const backCard=t.closest('[data-spots-back-card]');if(backCard){setSpotsLayer('card');return}
  const filterBtn=t.closest('[data-spots-filter]');if(filterBtn){setSpotsFilter(filterBtn.dataset.spotsFilter);return}
  const cityBtn=t.closest('[data-spots-city]');if(cityBtn){setSpotsCity(cityBtn.dataset.spotsCity);return}
  const rotateBtn=t.closest('[data-spots-rotate]');if(rotateBtn){spots3DAuto=!spots3DAuto;rotateBtn.textContent=spots3DAuto?'暂停旋转':'自动旋转';if(spots3D)spots3D.lastInteract=0;return}
  const openEl=t.closest('[data-spots-open]');if(openEl){openSpotsCard(openEl.dataset.spotsOpen);return}
 };
 if(typeof spotsRoot.addEventListener==='function'){
  spotsRoot.addEventListener('keydown',function(e){if(e.key!=='Enter')return;const el=e.target&&e.target.closest?e.target.closest('[data-spots-open]'):null;if(el){e.preventDefault();openSpotsCard(el.dataset.spotsOpen)}});
  spotsRoot.addEventListener('input',spotsDurationInput);
  spotsRoot.addEventListener('change',spotsDurationChange);
 }
}
// ---- 3D 空间（本地打包的原生 Three.js，懒加载；失败则退回列表）----
function spotsLoadTHREE(){
 if(typeof THREE!=='undefined')return THREE;
 if(typeof globalThis!=='undefined'&&typeof globalThis.__loadTHREE==='function'){try{return globalThis.__loadTHREE()}catch(e){return null}}
 return null;
}
function spotsReducedMotion(){return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)}
function spots3DShowFallback(msg){
 const fb=$('#spots-3d-fallback');if(fb){fb.hidden=false;if(msg)fb.textContent=msg}
 const btn=$('[data-spots-rotate]');if(btn)btn.hidden=true;
}
function spots3DDispose(){
 if(!spots3D)return;
 spots3DRunning=false;
 if(spots3D.rafId&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(spots3D.rafId);
 if(spots3D.resizeObserver&&typeof spots3D.resizeObserver.disconnect==='function')spots3D.resizeObserver.disconnect();
 if(spots3D.renderer&&typeof spots3D.renderer.dispose==='function')spots3D.renderer.dispose();
 if(spots3D.canvas&&spots3D.canvas.parentNode)spots3D.canvas.parentNode.removeChild(spots3D.canvas);
 spots3D=null;
}
function spots3DApplyFilter(){
 if(!spots3D)return;
 spots3D.meshes.forEach((mesh,id)=>{const p=spotsPlace(id);mesh.visible=!p||((spotsCity==='all'||p.city===spotsCity)&&(spotsFilter==='all'||spotDimsOf(p).some(d=>d.key===spotsFilter)))});
}
function spots3DHighlight(id){
 if(!spots3D)return;
 spots3D.meshes.forEach((mesh,mid)=>{mesh.scale.setScalar(mesh.userData.baseScale*(mid===id?1.35:mid===spots3D.hovered?1.25:1))});
}
function spots3DApplyCamera(s){
 s=s||spots3D;if(!s)return;
 const st=s.state,sp=Math.sin(st.phi);
 s.camera.position.set(st.target.x+st.radius*sp*Math.sin(st.theta),st.target.y+st.radius*Math.cos(st.phi),st.target.z+st.radius*sp*Math.cos(st.theta));
 s.camera.lookAt(st.target);
}
function spots3DPan(s,dx,dy){
 const right=new s.THREE.Vector3().setFromMatrixColumn(s.camera.matrix,0);
 const up=new s.THREE.Vector3().setFromMatrixColumn(s.camera.matrix,1);
 const k=0.02*(s.state.radius/26);
 s.state.target.addScaledVector(right,-dx*k);
 s.state.target.addScaledVector(up,dy*k);
 s.state.target.x=Math.max(-14,Math.min(14,s.state.target.x));
 s.state.target.z=Math.max(-11,Math.min(11,s.state.target.z));
 s.state.target.y=Math.max(0,Math.min(5,s.state.target.y));
}
function spots3DPick(s,e){
 const rect=s.canvas.getBoundingClientRect();
 const ndc=new s.THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-((e.clientY-rect.top)/rect.height)*2+1);
 const ray=new s.THREE.Raycaster();ray.setFromCamera(ndc,s.camera);
 const hits=ray.intersectObjects([...s.meshes.values()].filter(m=>m.visible));
 return hits.length?hits[0].object.userData.id:null;
}
function spots3DHover(s,e){
 const id=spots3DPick(s,e);
 const tip=$('#spots-3d-tip');
 if(s.hovered&&s.hovered!==id){const m=s.meshes.get(s.hovered);if(m)m.scale.setScalar(m.userData.baseScale*(s.hovered===spotsSpotId?1.35:1))}
 s.hovered=id;
 if(id){
  const m=s.meshes.get(id);if(m)m.scale.setScalar(m.userData.baseScale*1.25);
  const p=spotsPlace(id);
  if(tip&&p){const host=s.host.getBoundingClientRect();tip.hidden=false;tip.textContent=p.name+' · '+p.city;tip.style.left=Math.min(host.width-120,Math.max(8,e.clientX-host.left+14))+'px';tip.style.top=Math.max(8,e.clientY-host.top+10)+'px'}
  s.canvas.style.cursor='pointer';
 }else{
  if(tip)tip.hidden=true;
  s.canvas.style.cursor='';
 }
}
function spots3DResize(){
 if(!spots3D)return;
 const host=spots3D.host,w=host.clientWidth||800,h=host.clientHeight||520;
 spots3D.camera.aspect=w/h;spots3D.camera.updateProjectionMatrix();
 spots3D.renderer.setSize(w,h,false);
}
function spots3DRaf(cb){return typeof requestAnimationFrame==='function'?requestAnimationFrame(cb):setTimeout(()=>cb(Date.now()),16)}
function spots3DLoop(){
 if(!spots3D||!spots3DRunning)return;
 const now=Date.now();
 if(spots3DAuto&&!spotsReducedMotion()&&now-spots3D.lastInteract>3500){spots3D.state.theta+=0.0016;spots3DApplyCamera(spots3D)}
 spots3D.renderer.render(spots3D.scene,spots3D.camera);
 spots3D.rafId=spots3DRaf(spots3DLoop);
}
function spots3DStart(){if(!spots3D||spots3DRunning)return;spots3DRunning=true;spots3DApplyCamera(spots3D);spots3DLoop()}
function spots3DStop(){spots3DRunning=false;if(spots3D&&spots3D.rafId&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(spots3D.rafId)}
function spots3DInit(){
 if(spots3DFailed)return false;
 const host=$('#spots-3d');
 if(!host)return false;
 if(spots3D&&spots3D.canvas&&spots3D.canvas.isConnected&&spots3D.host===host){spots3DApplyFilter();spots3DHighlight(spotsSpotId);spots3DStart();return true}
 if(spots3D)spots3DDispose();
 const THREE=spotsLoadTHREE();
 if(!THREE){spots3DFailed=true;spots3DShowFallback('当前浏览器不支持 3D 浏览，列表同样可以找地点');return false}
 try{
  const renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(typeof globalThis.devicePixelRatio==='number'?Math.min(globalThis.devicePixelRatio,2):1);
  renderer.setClearColor(0x0b1220,1);
  const scene=new THREE.Scene();
  scene.fog=new THREE.Fog(0x0b1220,34,72);
  const camera=new THREE.PerspectiveCamera(50,1,0.1,220);
  scene.add(new THREE.AmbientLight(0xffffff,0.85));
  const dir=new THREE.DirectionalLight(0xffffff,1.15);dir.position.set(10,18,8);scene.add(dir);
  const point=new THREE.PointLight(0x7fb4d8,0.6,60);point.position.set(-14,9,-9);scene.add(point);
  const starGeo=new THREE.BufferGeometry();
  const starPos=new Float32Array(1200*3);
  for(let i=0;i<1200;i++){const t=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),r=62+Math.random()*26;starPos[i*3]=r*Math.sin(ph)*Math.cos(t);starPos[i*3+1]=Math.abs(r*Math.cos(ph))*0.6+2;starPos[i*3+2]=r*Math.sin(ph)*Math.sin(t)}
  starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
  scene.add(new THREE.Points(starGeo,new THREE.PointsMaterial({color:0x8fb8d8,size:0.4,transparent:true,opacity:0.75})));
  const grid=new THREE.GridHelper(40,20,0x2a3f5c,0x16233a);grid.position.y=-0.4;scene.add(grid);
  const geo=new THREE.SphereGeometry(1,24,18);
  const mats={};SPOT_DIMS.forEach(d=>{mats[d.key]=new THREE.MeshStandardMaterial({color:d.color,emissive:d.color,emissiveIntensity:0.35,roughness:0.35,metalness:0.1})});
  const fallbackMat=new THREE.MeshStandardMaterial({color:0x8a8f96,emissive:0x8a8f96,emissiveIntensity:0.3,roughness:0.4,metalness:0.1});
  const meshes=new Map();
  CATALOG.forEach(p=>{
   const pos=spotPosition(p);if(!pos)return;
   const dim=spotPrimaryDim(p);
   const mesh=new THREE.Mesh(geo,dim?mats[dim.key]:fallbackMat);
   mesh.position.set(pos.x,pos.y,pos.z);
   mesh.scale.setScalar(pos.r);
   mesh.userData={id:p.id,baseScale:pos.r};
   scene.add(mesh);meshes.set(p.id,mesh);
  });
  renderer.domElement.className='spots-3d-canvas';
  host.appendChild(renderer.domElement);
  const spots={THREE,renderer,scene,camera,meshes,host,canvas:renderer.domElement,state:{theta:0.65,phi:1.02,radius:26,target:new THREE.Vector3(0,1.4,0)},lastInteract:0,rafId:0,hovered:null,resizeObserver:null};
  const canvas=renderer.domElement;
  const pointers=new Map();let downPos=null,downTime=0,moved=false,prevPinch=0;
  canvas.addEventListener('pointerdown',e=>{
   try{canvas.setPointerCapture(e.pointerId)}catch(err){}
   pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
   downPos={x:e.clientX,y:e.clientY};downTime=Date.now();moved=false;spots.lastInteract=Date.now();
   if(pointers.size===2){const pts=[...pointers.values()];prevPinch=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)}
  });
  canvas.addEventListener('pointermove',e=>{
   if(pointers.has(e.pointerId)){
    const prev=pointers.get(e.pointerId),dx=e.clientX-prev.x,dy=e.clientY-prev.y;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size===1){
     if(downPos&&Math.abs(e.clientX-downPos.x)+Math.abs(e.clientY-downPos.y)>6)moved=true;
     if(e.buttons===2||e.shiftKey)spots3DPan(spots,dx,dy);else{spots.state.theta-=dx*0.005;spots.state.phi=Math.min(1.45,Math.max(0.25,spots.state.phi-dy*0.005))}
    }else if(pointers.size===2){
     const pts=[...pointers.values()],d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);
     if(prevPinch>0)spots.state.radius=Math.min(46,Math.max(9,spots.state.radius*prevPinch/Math.max(1,d)));
     prevPinch=d;moved=true;
    }
    spots.lastInteract=Date.now();spots3DApplyCamera(spots);
   }else spots3DHover(spots,e);
  });
  canvas.addEventListener('pointerup',e=>{
   pointers.delete(e.pointerId);
   if(downPos&&!moved&&Date.now()-downTime<500){const id=spots3DPick(spots,e);if(id)openSpotsCard(id)}
   if(!pointers.size)downPos=null;
  });
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);if(!pointers.size)downPos=null});
  canvas.addEventListener('wheel',e=>{e.preventDefault();spots.state.radius=Math.min(46,Math.max(9,spots.state.radius*Math.exp(e.deltaY*0.001)));spots.lastInteract=Date.now();spots3DApplyCamera(spots)},{passive:false});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  if(typeof ResizeObserver==='function'){spots.resizeObserver=new ResizeObserver(()=>spots3DResize());spots.resizeObserver.observe(host)}
  spots3D=spots;
  spots3DApplyFilter();spots3DHighlight(spotsSpotId);
  spots3DResize();spots3DStart();
  return true;
 }catch(e){spots3DFailed=true;spots3DShowFallback('当前设备不支持 3D 浏览，列表同样可以找地点');return false}
}
