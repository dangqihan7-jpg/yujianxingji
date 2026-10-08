let activeView='gallery',featuredRouteId='luoyang',comparisonRecord=null,planningBusy=false;
const routeEditorial={classic:{title:'郑汴洛 · 古都三日',theme:'中原古都 / CULTURAL JOURNEY',cities:['郑州','开封','洛阳']},luoyang:{title:'洛阳 · 两日慢游',theme:'河洛慢游 / SLOW TRAVEL',cities:['洛阳']},taihang:{title:'太行 · 山水两日',theme:'山水与人文 / MOUNTAIN JOURNEY',cities:['焦作','安阳']}};
function renderHeaderCount(){$('#headertripcount').textContent=String(trip.length)}
function initializeMap(attempt=mapAttempt){
  if(attempt!==mapAttempt||map)return;
  try{
    $('#map').innerHTML='';map=new AMap.Map('map',{zoom:8,center:[113.5,34.8],resizeEnable:true});mapConnection='loading';showMapStatus();
    map.on('complete',()=>{if(attempt!==mapAttempt)return;clearTimeout(mapTimer);mapConnection='ready';showMapStatus()});
    mapTimer=setTimeout(()=>{if(attempt!==mapAttempt||mapConnection==='ready')return;mapConnection='slow';showMapStatus()},12000);renderMap();fit();
  }catch{map?.destroy?.();map=null;markers=[];line=null;renderMap();mapConnection='failed';showMapStatus()}
}
function routeDays(preset){return Array.from({length:preset.days},(_,i)=>{const stops=preset.stops.filter(s=>s[1]===i+1).map(s=>CATALOG.find(p=>p.id===s[0]));return {day:i+1,city:[...new Set(stops.map(p=>p.city))].join(' / '),names:stops.map(p=>p.name).join('、')}})}
function renderGallery(){
  const pendingText=$('#brieftext')?.value||'';
  const r=PRESETS.find(p=>p.id===featuredRouteId)||PRESETS[0],editorial=routeEditorial[r.id],days=routeDays(r);
  const hero=CATALOG.find(p=>p.image==='/assets/yuntai-mountain.jpg');
  $('#gallery').innerHTML=`
    <section class="journey-hero" aria-labelledby="hero-title">
      <img class="hero-image" src="${esc(hero?.image||r.image)}" alt="${esc(hero?.photoCaption||hero?.name||'河南山水实景')}" fetchpriority="high" width="1200" height="800">
      <div class="hero-content">
        <p class="hero-eyebrow">HENAN · A WEEKEND AWAY</p>
        <h2 id="hero-title">豫见行迹<span>把周末，交给河南。</span></h2>
        <p class="hero-description">走进古都的日常，或去山水间慢下来。<br>从你的时间与预算出发，安排一段刚刚好的旅程。</p>
        <div class="hero-actions"><button class="primary" data-gallery-scroll="weekend-plan">开始规划 <span aria-hidden="true">↗</span></button><button class="hero-secondary" data-gallery-scroll="theme-routes">探索主题路线 <span aria-hidden="true">↓</span></button></div>
      </div>
      <div class="hero-bottom"><span>慢一点，遇见多一点。</span><button data-open-sources>${esc(hero?.name||'河南实景')} · 实景照片与来源 ↗</button></div>
    </section>
    <div class="gallery-inner">
      <section id="weekend-plan" class="weekend-plan" aria-label="开始规划周末旅行">
        <div class="editorial-heading"><div><p class="section-kicker">01 / YOUR WEEKEND</p><h2>你的周末，你来定义。</h2></div><p>几天时间，怎样出行，想去哪里。<br>把想法写下来，从一份可调整的安排开始。</p></div>
        ${briefEntryHTML()}
      </section>
      <section id="theme-routes" class="theme-routes" aria-labelledby="routes-title">
        <div class="editorial-heading"><div><p class="section-kicker">02 / CURATED JOURNEYS</p><h2 id="routes-title">三条路线，三种河南。</h2></div><p>古都、街巷与山水。<br>选一段喜欢的旅程，再按自己的节奏调整。</p></div>
        <div class="gallery-grid">
          <article class="feature-route">
            <div class="feature-media"><img src="${esc(r.image)}" alt="${esc(r.photoLabel)}" loading="lazy" width="1200" height="800"><span class="route-number">JOURNEY 0${PRESETS.indexOf(r)+1}</span></div>
            <div class="feature-content"><p class="section-kicker">${esc(editorial.theme)}</p><h3>${esc(editorial.title)}</h3><p class="feature-subtitle">${esc(r.story||r.subtitle)}</p><div class="feature-bottom"><div class="feature-days">${days.map(d=>'<div><b>DAY 0'+d.day+'</b><span>'+esc(d.city)+'</span></div>').join('')}</div><button class="feature-cta" data-start-route="${r.id}">规划这条路线 <span aria-hidden="true">↗</span></button></div></div>
          </article>
          <div class="route-sidebar">${PRESETS.filter(p=>p.id!==r.id).map(p=>'<button class="side-route" data-feature-route="'+p.id+'"><div class="side-media"><img src="'+esc(p.image)+'" alt="'+esc(p.photoLabel)+'" loading="lazy" width="1200" height="800"></div><div class="side-copy"><small>'+esc(routeEditorial[p.id].theme.split(' / ')[0])+' · '+p.days+' 天 / '+p.stops.length+' 站</small><strong>'+esc(p.title)+' <span aria-hidden="true">↗</span></strong><span>'+esc(p.subtitle)+'</span></div></button>').join('')}</div>
        </div>
      </section>
      <section class="gallery-footer" aria-labelledby="cities-title"><div><p class="section-kicker">03 / EXPLORE HENAN</p><h2 id="cities-title">从一座城，展开旅程。</h2><p>在地图上发现好去处，把每一站放进自己的行程。</p></div><div class="city-atlas">${['郑州','洛阳','开封','焦作','安阳','三门峡'].map((c,i)=>'<button data-atlas-city="'+c+'"><span class="city-index">0'+(i+1)+'</span><b>'+c+'</b><small>'+CATALOG.filter(p=>p.city===c).length+' 个精选去处</small><span class="city-arrow" aria-hidden="true">↗</span></button>').join('')}</div></section>
      <footer class="atlas-footer"><div class="atlas-signature">豫见行迹 <span>HENAN JOURNEY ATLAS</span></div><p>${new Set(CATALOG.map(p=>p.city)).size} 座城市 · ${CATALOG.length} 个精选去处 · 门票与预约请在出发前确认</p><div class="gallery-utility"><button class="try-plan" data-try-planning>体验规划对照 ↗</button><button class="gallery-sources" data-open-sources>资料与照片来源</button></div></footer>
    </div>`;
  if(pendingText)$('#brieftext').value=pendingText;
}

function setView(view){
  if(!['gallery','planner','overview','decision'].includes(view))return;activeView=view;document.body&&(document.body.dataset.view=view);
  document.querySelectorAll('.view-nav [data-view]').forEach(b=>{b.setAttribute?.('aria-current',b.dataset.view===view?'page':'false')});
  if(view==='gallery')renderGallery();if(view==='overview')renderOverview();if(view==='decision')renderDecision();
  if(view==='planner'){if(mapConnection==='standby')initializeMap();if(typeof Event==='function')globalThis.dispatchEvent?.(new Event('resize'));renderMap();fit();}
  globalThis.scrollTo?.({top:0,behavior:'instant'});
}
function draftMetrics(stops,days,limit,rest=0){
  const daily=Array.from({length:days},(_,i)=>stops.filter(s=>s.day===i+1));
  const times=daily.map(list=>list.reduce((n,s)=>n+s.duration,0)+(list.length?rest:0));
  const transitions=daily.reduce((sum,list)=>sum+list.slice(1).filter((s,i)=>s.place.city&&list[i].place.city&&s.place.city!==list[i].place.city).length,0);
  return {maxMinutes:Math.max(0,...times),overDays:times.filter(n=>n>limit).length,transitions,times};
}
function adviceStops(advice,before){const byId=new Map(before.map(s=>[s.place.id,s]));return advice.stops.map(s=>({...byId.get(s.id),day:s.day}))}
function comparisonHTML(before,after,days,options={}){
  const cap=(options.maxHours||Number($('#maxhours').value)||8)*60,rest=options.restMinutes??(Number($('#restmins').value)||0),a=draftMetrics(before,days,cap,rest),b=draftMetrics(after,days,cap,rest);
  const row=(label,x,y,suffix)=>'<div class="compare-card"><span>'+label+'</span><div class="compare-values"><del>'+x+'</del><b>'+y+'</b></div><small>调整前 / 调整后 · '+suffix+'</small></div>';
  return '<div class="comparison"><div class="comparison-title">看清每一天，如何重新安排</div><p class="comparison-note">以下直接计算自所选地点的停留时长和城市顺序。休息已计入；交通尚需按新顺序核算。</p><div class="compare-grid">'+row('单日最长已知安排',durationLabel(a.maxMinutes),durationLabel(b.maxMinutes),'游览＋休息')+row('超出每日上限的天数',a.overDays,b.overDays,'上限 '+(cap/60)+' 小时')+row('日内跨城切换',a.transitions,b.transitions,'次')+'</div><p class="comparison-result">'+(b.maxMinutes<a.maxMinutes?'最长一天的已知安排减少 '+durationLabel(a.maxMinutes-b.maxMinutes)+'。':'已知时长没有减少，可以保留原安排或继续手动调整。')+(b.transitions<a.transitions?'日内跨城切换减少 '+(a.transitions-b.transitions)+' 次。':'')+' 这些指标不代表交通更快或预约已确认。</p></div>';
}
function renderOverview(){
  const days=Number($('#days').value)||3,preset=PRESETS.find(r=>r.id===currentPresetId),total=trip.reduce((n,s)=>n+s.duration,0),cities=[...new Set(trip.map(s=>s.place.city).filter(Boolean))],confirmed=trip.filter(s=>exactLocation(s.place)).length;
  $('#overview').innerHTML='<div class="folio-heading"><div><div class="eyebrow">YOUR JOURNEY / HENAN</div><h2>'+esc(preset?.title||'我的河南旅程')+'</h2><p>地点、停留和交通分别呈现。确认自己的节奏，再出发。</p></div><div class="folio-actions"><button data-overview-action="edit">继续编辑</button><button data-overview-action="print">打印行程</button><button data-overview-action="check">检查条件</button><button class="primary" data-overview-action="plan" '+(!trip.length?'disabled':'')+'>生成规划对照</button></div></div><div class="folio-metrics"><div class="folio-metric"><small>旅行安排</small><b>'+days+'</b><span>天 / '+trip.length+' 站</span></div><div class="folio-metric"><small>到访城市</small><b>'+cities.length+'</b><span>'+esc(cities.join('、')||'尚未选择')+'</span></div><div class="folio-metric"><small>游览停留合计</small><b>'+Math.round(total/6)/10+'</b><span>小时，不含交通</span></div><div class="folio-metric"><small>已确认交通定位</small><b>'+confirmed+' / '+trip.length+'</b><span>地点</span></div></div>'+(comparisonRecord&&comparisonRecord.afterSnapshot===JSON.stringify(compactDraft())?comparisonHTML(comparisonRecord.before,trip,days):'')+'<div class="folio-days">'+Array.from({length:days},(_,i)=>{
    const items=trip.filter(s=>s.day===i+1),localCities=[...new Set(items.map(s=>s.place.city).filter(Boolean))],cover=items.find(s=>s.place.image)?.place;
    const duration=items.reduce((n,s)=>n+s.duration,0),cached=cachedTraffic(items);
    return '<article class="folio-day"><div class="folio-day-cover">'+(cover?'<img src="'+esc(cover.image)+'" alt="'+esc(cover.photoCaption||cover.name)+'" loading="lazy">':'')+'<small>DAY 0'+(i+1)+'</small><h3>'+esc(localCities.join(' / ')||'自由安排')+'</h3><span>'+items.length+' 个地点 · 游览 '+esc(durationLabel(duration))+'</span></div><div class="folio-day-content">'+(items.length?items.map((s,j)=>{
      const leg=cached?.legs[j-1];return (j?'<div class="folio-leg">'+(leg?esc(modeNames[cached.mode])+' · 约 '+Math.ceil(leg.duration/60)+' 分钟':'站间交通待核算')+'</div>':'')+'<div class="folio-stop"><span class="folio-stop-number">'+(j+1)+'</span><div><button data-folio-place="'+esc(s.place.id)+'">'+esc(s.place.name)+'</button><p>'+esc(s.place.theme||labels[s.place.category])+' · 停留 '+esc(durationLabel(s.duration))+'</p>'+(s.place.visitTip?'<p class="folio-tip">'+esc(s.place.visitTip)+'</p>':'')+'</div></div>';
    }).join(''):'<div class="folio-empty">留给下一段旅程。</div>')+'<div class="folio-day-footer">'+(localCities.length>1?'当天跨城，城际交通需另行确认。':cached?'站间耗时来自查询时的高德方案。':'停留时长已列出，交通尚未计入。')+'<button data-edit-day="'+(i+1)+'">在地图上编辑第 '+(i+1)+' 天</button></div></div></article>';
  }).join('')+'</div><div class="folio-proof"><div><b>规划依据</b><br>精选资料与实际所选地点；规则规划按城市、游览负荷和相对位置进行分日。</div><div><b>交通与资料</b><br>高德实时查询；实景照片、作者和许可可在地点详情与资料说明中查看。</div><div><b>出发前确认</b><br>营业时间、预约和景区内部交通尚未校验，请以官方当日信息为准。</div></div>';
}
async function generate(scopeDay=null){
  if(planningBusy){toast('正在计算建议，请稍后');return}
  const scoped=Number.isInteger(scopeDay)&&scopeDay>=1&&scopeDay<=Number($('#days').value)?scopeDay:null;
  if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}if(!trip.length)return;const button=$('#plan');planningBusy=true;button.disabled=true;button.textContent='正在计算安排…';
  try{
    const snapshot=JSON.stringify(compactDraft()),before=trip.map(s=>({...s,place:{...s.place}}));const selected=scoped?before.filter(s=>s.day===scoped):before;if(!selected.length)throw Error('当天没有可重排的地点');const payload=scoped?{...compactDraft(),days:1,stops:selected.map(s=>({...s,day:1,...(s.lockedDay?{lockedDay:1}:{})}))}:compactDraft();lastAdvice=await api('/api/plan',payload);
    if(snapshot!==JSON.stringify(compactDraft()))throw Error('行程已修改，请重新生成规划');lastAdvice.snapshot=snapshot;
    const sorted=adviceStops(lastAdvice,selected);let next=0;const after=scoped?before.map(s=>s.day===scoped?{...sorted[next++],day:scoped}:s):sorted,days=Number($('#days').value);
    $('#advicebody').innerHTML='<span class="source-chip">'+(lastAdvice.source==='ai'?esc(lastAdvice.provider||'模型')+'建议 · 完整性与固定日期已校验':'规则规划 · 可解释的分日安排')+'</span>'+(lastAdvice.fallback?'<p class="brief-unresolved">模型回退：'+esc(lastAdvice.fallback.reason)+'</p>':'')+(scoped?'<p class="instruction">只重排第 '+scoped+' 天；其他日期的地点、顺序与停留时长保持不变。</p>':'')+comparisonHTML(before,after,days)+'<p class="planning-reason">'+esc(lastAdvice.note)+'</p><div class="advice-days">'+Array.from({length:days},(_,i)=>{const items=after.filter(s=>s.day===i+1);return '<div class="advice-day"><strong>DAY 0'+(i+1)+' · '+esc([...new Set(items.map(s=>s.place.city).filter(Boolean))].join(' / ')||'自由安排')+'</strong><p>'+esc(items.map(s=>s.place.name).join('、')||'暂未安排地点')+'</p><small>游览停留 '+esc(durationLabel(items.reduce((n,s)=>n+s.duration,0)))+'</small></div>'}).join('')+'</div><button class="primary" id="apply">应用新安排，继续编辑</button><button class="secondary" id="keepcurrent">保留当前安排</button>';
    $('#advice').showModal();$('#keepcurrent').onclick=()=>$('#advice').close();
    $('#apply').onclick=()=>{if(lastAdvice.snapshot!==JSON.stringify(compactDraft())){toast('行程已修改，请重新生成规划');$('#advice').close();return}checkpoint();trip=after;lastPlanningSource=lastAdvice.source;decisionState.source=lastAdvice.source;day=scoped||1;renderAll();comparisonRecord={before,afterSnapshot:JSON.stringify(compactDraft())};renderOverview();$('#advice').close();setView('overview');toast('已应用新安排，可查看分日总览或撤销')};
  }catch(e){toast(e.message)}finally{planningBusy=false;button.disabled=!trip.length;button.textContent='生成规划对照'}
}
$('#plan').onclick=generate;
async function showPlanningExample(){
  if(saveBooting){toast('正在读取已保存行程，请稍后体验');return}
  const route=PRESETS.find(r=>r.id==='luoyang'),before=route.stops.map(([id,,duration])=>({place:CATALOG.find(p=>p.id===id),day:1,duration})),draft={days:2,start:'09:00',maxHours:6,restMinutes:30,stops:before},snapshot=JSON.stringify(compactDraft());
  try{
    const result=await api('/api/plan',{...draft,engine:'rules'}),after=adviceStops(result,before);
    if(snapshot!==JSON.stringify(compactDraft()))throw Error('当前行程已改变，请重新打开示例');
    $('#advicebody').innerHTML='<span class="source-chip">互动示例 · 洛阳两日规则规划</span><p class="instruction">将洛阳五处地点集中放在第一天，再按每天六小时上限进行分日。以下结果由这五个地点实际计算；体验示例不会修改你的行程。</p>'+comparisonHTML(before,after,2,draft)+'<div class="advice-days">'+[1,2].map(day=>'<div class="advice-day"><strong>DAY 0'+day+'</strong><p>'+esc(after.filter(s=>s.day===day).map(s=>s.place.name).join('、'))+'</p></div>').join('')+'</div><button class="primary" id="applyexample">载入这个安排，继续编辑</button><button class="secondary" id="closeexample">关闭示例，保留我的行程</button>';
    $('#advice').showModal();$('#closeexample').onclick=()=>$('#advice').close();
    $('#applyexample').onclick=()=>{if(snapshot!==JSON.stringify(compactDraft())){toast('当前行程已改变，请重新打开示例');$('#advice').close();return}checkpoint();decisionState={...validateDecisionState(),records:decisionState.records,intent:validateIntent({city:'洛阳',days:2,maxHours:6,restMinutes:30}),source:'rules'};trip=after;currentPresetId='luoyang';$('#days').value='2';$('#start').value='09:00';$('#maxhours').value='6';$('#restmins').value='30';$('#city').value='洛阳';day=1;setFilter('all');presetState();renderAll();comparisonRecord={before,afterSnapshot:JSON.stringify(compactDraft())};search();setView('overview');$('#advice').close();toast('已载入示例安排，原行程可以撤销恢复')};
  }catch(e){toast(e.message)}
}
$('#gallery').onclick=e=>{const jump=e.target.closest('[data-gallery-scroll]');if(jump){const target=document.getElementById(jump.dataset.galleryScroll);target?.scrollIntoView({behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});if(jump.dataset.galleryScroll==='weekend-plan')$('#brieftext').focus({preventScroll:true});return}const prompt=e.target.closest('[data-brief-example]');if(prompt){$('#brieftext').value=prompt.dataset.briefExample;return}if(e.target.closest('[data-parse-brief]')){openBrief($('#brieftext').value);return}if(e.target.closest('[data-manual-brief]')){openBrief();return}if(e.target.closest('[data-open-sources]')){$('#connect').showModal();return}const example=e.target.closest('[data-try-planning]');if(example){showPlanningExample();return}const start=e.target.closest('[data-start-route]'),feature=e.target.closest('[data-feature-route]'),city=e.target.closest('[data-atlas-city]');if(start){if(saveBooting){toast('正在读取已保存行程，请稍后开始规划');return}loadPreset(start.dataset.startRoute);setView('planner')}else if(feature){featuredRouteId=feature.dataset.featureRoute;renderGallery()}else if(city){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}setView('planner');selectCity(city.dataset.atlasCity)}};
$('#overview').onclick=e=>{const action=e.target.closest('[data-overview-action]'),edit=e.target.closest('[data-edit-day]'),place=e.target.closest('[data-folio-place]');if(action){if(saveBooting&&action.dataset.overviewAction==='plan'){toast('正在读取已保存行程，请稍后操作');return}if(action.dataset.overviewAction==='check')setView('decision');if(action.dataset.overviewAction==='edit')setView('planner');if(action.dataset.overviewAction==='plan')generate();if(action.dataset.overviewAction==='print')globalThis.print?.()}else if(edit){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}day=Number(edit.dataset.editDay);setView('planner');const cities=[...new Set(dayStops().map(s=>s.place.city).filter(Boolean))];selectCity(cities.length===1?cities[0]:'河南');renderTrip();renderMap()}else if(place){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}setView('planner');focusPlace(trip.find(s=>s.place.id===place.dataset.folioPlace)?.place)}};
document.querySelectorAll('.site-header [data-view]').forEach(button=>button.onclick=e=>{e.preventDefault?.();setView(button.dataset.view)});
renderGallery();renderOverview();renderHeaderCount();
