let decisionState=validateDecisionState(),activeStudy=null,lastPlanningSource='manual';
let lastRenderedDraft=null;let currentPresetId='classic',saveBooting=true,saveRevision=0,lastSaved='',saveTimer,saveInFlight=false,saveBlocked=false,restoreFailed=false;
const undoStack=[],trafficCache=new Map();let trafficExpiryTimer=null;
function ensureDayCount(days){const fixed=trip.filter(s=>s.lockedDay>days);if(fixed.length)throw Error('无法缩短为 '+days+' 天：'+fixed.map(s=>s.place.name+' 已固定在第 '+s.lockedDay+' 天').join('、')+'。请先取消固定日期或手动调整。')}
function scheduleTrafficExpiry(){if(trafficExpiryTimer!=null)clearTimeout(trafficExpiryTimer);const next=[...trafficCache.values()].map(t=>t.queriedAt+1800000-Date.now()).filter(v=>v>0);if(next.length)trafficExpiryTimer=setTimeout(()=>{renderTrip();renderMap();scheduleTrafficExpiry()},Math.min(...next)+30)}let draftOperation=0,matchOperation=0,trafficOperation=0,trafficBusy=false;let matchCandidates=[],matchingId=null,focusSeq=0;
const modeNames={walking:'步行',driving:'驾车 / 打车',transit:'公交 / 地铁'};
function compactDraft(){return {version:2,city:$('#city').value,days:Number($('#days').value),start:$('#start').value,mode:$('#travelmode').value||'driving',maxHours:Number($('#maxhours').value)||8,restMinutes:Number($('#restmins').value)||0,presetId:currentPresetId,decision:JSON.parse(JSON.stringify(decisionState)),stops:trip.map(s=>({place:{id:s.place.id,name:s.place.name,category:s.place.category,source:s.place.source,location:s.place.location,address:s.place.address,city:s.place.city,...(s.place.routing?{routing:s.place.routing}:{})},day:s.day,duration:s.duration,...(s.lockedDay?{lockedDay:s.lockedDay}:{})}))}}
function checkpoint(useRendered=false){if(saveBooting)return;draftOperation++;if(activeStudy)activeStudy.edits++;undoStack.push(useRendered&&lastRenderedDraft?lastRenderedDraft:compactDraft());if(undoStack.length>20)undoStack.shift();$('#undo').disabled=false}
function saveStatus(message,error=false){$('#savestatus').textContent=message;$('#savestatus').dataset.state=error?'error':'saved';$('#saveretry').hidden=!error}
function scheduleSave(){
  if(saveBooting)return;
  $('#undo').disabled=!undoStack.length;
  if(!cfg.persistenceConfigured){saveStatus('访客行程仅保留在本页，请导出留存。');return}
  if(JSON.stringify(compactDraft())===lastSaved)return;
  if(saveBlocked)return;
  saveStatus('修改尚未保存…');clearTimeout(saveTimer);saveTimer=setTimeout(flushSave,700);
}
async function flushSave(){
  if(saveInFlight||saveBooting||saveBlocked||!cfg.persistenceConfigured)return;
  const draft=compactDraft(),fingerprint=JSON.stringify(draft);if(fingerprint===lastSaved)return;
  saveInFlight=true;saveStatus('正在保存行程…');
  try{const result=await api('/api/draft',{draft,revision:saveRevision});saveRevision=result.revision;lastSaved=fingerprint;saveStatus('已自动保存到当前账号');}
  catch(e){saveStatus(e.message,true);saveBlocked=true;}
  finally{saveInFlight=false;if(!saveBlocked&&JSON.stringify(compactDraft())!==lastSaved)scheduleSave()}
}
function presetState(){document.querySelectorAll('[data-preset]').forEach(b=>{b.classList.toggle('active',b.dataset.preset===currentPresetId);b.setAttribute?.('aria-pressed',String(b.dataset.preset===currentPresetId))});const preset=PRESETS.find(r=>r.id===currentPresetId);$('#presetnote').textContent=preset?.title||'自选行程';$('#routehinttext').textContent=preset?(preset.story+' '+preset.note):'确认每一站的位置，并为交通、预约和休息留出时间。'}
async function applyDraft(raw,validated=null){const op=++draftOperation,d=validated||await api('/api/validate',raw);if(op!==draftOperation)return false;const nextDecision=validateDecisionState(raw.decision||{},d.stops);trip=d.stops;decisionState=nextDecision;$('#days').value=String(d.days);$('#start').value=d.start;$('#city').value=['河南','郑州','洛阳','开封','焦作','安阳','三门峡'].includes(raw.city)?raw.city:'河南';$('#travelmode').value=['walking','driving','transit'].includes(raw.mode)?raw.mode:'driving';$('#maxhours').value=String([6,8,10].includes(raw.maxHours)?raw.maxHours:8);$('#restmins').value=String([0,30,60].includes(raw.restMinutes)?raw.restMinutes:30);currentPresetId=PRESETS.some(r=>r.id===raw.presetId)?raw.presetId:null;day=1;$('#query').value='';setFilter('all');lastAdvice=null;presetState();renderAll();await search();return true}
function exactLocation(p){return p.routing?.location||(p.source==='amap'?p.location:null)}
function mapLocation(p){return exactLocation(p)||p.location}
function dayStops(){return trip.filter(s=>s.day===day)}
function trafficKey(stops=dayStops()){return JSON.stringify({mode:$('#travelmode').value||'driving',points:stops.map(s=>({id:s.place.id,location:exactLocation(s.place),city:s.place.city}))})}
function cachedTraffic(stops=dayStops()){const t=trafficCache.get(trafficKey(stops));return t&&(!t.queriedAt||Date.now()-t.queriedAt<1800000)?t:null}
function trafficReview(){
  const stops=dayStops(),travel=cachedTraffic(),visit=stops.reduce((n,s)=>n+s.duration,0),rest=stops.length?Number($('#restmins').value)||0:0;
  const travelMinutes=travel?travel.legs.reduce((n,l)=>n+Math.ceil(l.duration/60),0):0,total=visit+rest+travelMinutes,limit=(Number($('#maxhours').value)||8)*60;
  const cities=[...new Set(stops.map(s=>s.place.city).filter(Boolean))];
  if(!stops.length){$('#trafficreview').innerHTML='';return {travel:null,rest:0,warnings:[]}}
  const known=stops.length<2||!!travel;
  $('#trafficreview').innerHTML='<div class="traffic-title"><strong>'+stops.length+' 站 · '+(known?(total<=limit?'预计时长在上限内':'当天安排偏满'):'交通耗时待核算')+'</strong><span>'+esc(modeNames[$('#travelmode').value]||modeNames.driving)+'</span></div><details class="traffic-details"><summary>交通与时长明细</summary><div class="traffic-stats"><span>游览 <b>'+esc(durationLabel(visit))+'</b></span><span>交通 <b>'+(stops.length<2?'无需站间交通':travel?esc(durationLabel(travelMinutes)):'待确认')+'</b></span><span>休息 <b>'+esc(durationLabel(rest))+'</b></span></div><p>'+(known?'预计合计 '+esc(durationLabel(total))+' · 上限 '+esc(durationLabel(limit)):'先确认高德地点，再核算当天交通。')+'</p><button class="quiet" data-check-traffic>'+(travel?'重新核算交通':'核算当天交通')+'</button></details>';
  const warnings=[];if(total>limit)warnings.push('已知安排超过每日上限 '+durationLabel(total-limit)+'，建议移到其他日期。');if(!known)warnings.push('交通时间尚未计入，当前时间仅为初步安排。');if(cities.length>1)warnings.push('当天跨越 '+cities.join('、')+'；公交换乘和城际车票需要另行确认。');if(travel)warnings.push('交通时间为查询时的高德估计；不含景区内部交通、排队与预约。');
  return {travel,rest,warnings};
}
async function jsTransport(locations,mode='walking',city='洛阳'){
  const plugin={walking:'AMap.Walking',driving:'AMap.Driving',transit:'AMap.Transfer'}[mode];if(!plugin)throw Error('请选择有效出行方式');await plugins(plugin);
  const legs=[];
  for(let i=1;i<locations.length;i++){
    const service=mode==='driving'?new AMap.Driving({policy:AMap.DrivingPolicy?.LEAST_TIME??0}):mode==='transit'?new AMap.Transfer({city,policy:AMap.TransferPolicy?.LEAST_TIME??0}):new AMap.Walking();
    const result=await sdkResult(callback=>service.search(new AMap.LngLat(...locations[i-1]),new AMap.LngLat(...locations[i]),callback));
    const route=mode==='transit'?result?.plans?.[0]:result?.routes?.[0];
    if(!route)throw Error('部分地点之间暂无可用的'+modeNames[mode]+'方案，请调整出行方式');
    const rawPath=mode==='transit'?(Array.isArray(route.path)&&route.path.length?route.path:(route.segments||[]).flatMap(s=>s.transit?.path||[])):(route.steps||[]).flatMap(s=>s.path||[]);
    const path=rawPath.map(lnglat).filter(Boolean),duration=Number(route.time),distance=Number(route.distance);
    if(route.time==null||route.time===''||route.distance==null||route.distance===''||!Number.isFinite(duration)||duration<0||!Number.isFinite(distance)||distance<0)throw Error('交通时间数据不完整');
    legs.push({duration,distance,path});
  }
  return {mode,source:'amap',legs};
}
async function openMatch(p){
  const operation=++matchOperation;matchingId=p.id;matchCandidates=[];$('#matchtitle').textContent='确认 '+p.name+' 的交通定位';$('#matchnote').textContent='从高德结果中选择你准备前往的景区或入口。请核对名称和地址，园区内建筑可能不是入口。';$('#matchbody').innerHTML='<div class="loading">正在查找高德地点…</div>';$('#continuecheck').disabled=true;if(!$('#match').open)$('#match').showModal();
  try{await plugins('AMap.PlaceSearch');const service=new AMap.PlaceSearch({city:p.city,citylimit:true,pageSize:10,extensions:'all'});const result=await sdkResult(cb=>service.search(p.name,cb));if(matchingId!==p.id||operation!==matchOperation||!$('#match').open)return;matchCandidates=(result?.poiList?.pois||[]).map(raw=>({...jsPoi(raw,p.category),city:p.city})).filter(x=>x.location);$('#matchbody').innerHTML=matchCandidates.length?matchCandidates.map((x,i)=>'<button class="match-choice" data-match="'+i+'"><strong>'+esc(x.name)+'</strong><span>'+esc(x.address||'地址暂无')+'</span><small>选择此地点作为交通定位</small></button>').join(''):'<div class="empty">没有找到可确认的地点。<br>可以关闭后在高德分类中搜索入口，当前不会计算未知耗时。</div>';}
  catch(e){if(operation!==matchOperation||!$('#match').open)return;$('#matchbody').innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
async function checkTraffic(){
  if(trafficBusy)return;
  const stops=dayStops();if(stops.length<2){toast('当天至少加入两个地点，才能核算站间交通');return}if(stops.length>9){toast('当天最多核算 9 个地点，请拆分到其他日期');return}
  if(!cfg.placesConfigured||typeof AMap==='undefined'){toast('高德尚未连接，交通耗时仍标记为待确认');return}
  const unresolved=stops.find(s=>!exactLocation(s.place));if(unresolved){await openMatch(unresolved.place);return}
  const mode=$('#travelmode').value||'driving',cities=[...new Set(stops.map(s=>s.place.city).filter(Boolean))];if(mode==='transit'&&cities.length>1){toast('公交核算暂限同一城市。跨城请切换驾车或拆分行程，并另行确认城际车次');return}
  const operation=++trafficOperation,key=trafficKey(stops),button=$('#route');trafficBusy=true;button.disabled=true;button.textContent='正在核算交通…';
  try{const result=await jsTransport(stops.map(s=>exactLocation(s.place)),mode,cities[0]||$('#city').value);if(operation!==trafficOperation||key!==trafficKey()){toast('行程已改变，请为最新安排重新核算');return}result.queriedAt=Date.now();trafficCache.set(key,result);scheduleTrafficExpiry();renderTrip();renderMap();drawTraffic(result);toast('交通时间已加入当天安排，可继续调整');}
  catch(e){toast(e.message)}finally{trafficBusy=false;button.disabled=false;button.textContent='核算当天交通'}
}
function drawTraffic(result){if(!map||!result)return;const selectedCity=$('#city').value;if(selectedCity!=='河南'&&dayStops().some(s=>s.place.city&&s.place.city!==selectedCity))return;const path=result.legs.flatMap(l=>l.path);if(path.length){if(line)map.remove(line);line=new AMap.Polyline({path,strokeColor:'#147784',strokeWeight:5});map.add(line);map.setFitView([line,...markers]);}$('#routestatus').textContent='高德'+modeNames[result.mode]+' · '+Math.round(result.legs.reduce((n,l)=>n+l.distance,0)/100)/10+' km · 约 '+Math.ceil(result.legs.reduce((n,l)=>n+l.duration,0)/60)+' 分钟';}
async function focusPlace(p){
  if(!p)return;p=trip.find(s=>s.place.id===p.id)?.place||p;const seq=++focusSeq;activePlace=p.id;
  if(p.city&&$('#city').value!==p.city){$('#city').value=p.city;$('#query').value='';await search();if(seq!==focusSeq)return}
  renderPlaces();renderMap();if(map&&mapLocation(p))map.setZoomAndCenter?.(14,mapLocation(p));await openDetail(p);
}
$('#route').onclick=checkTraffic;
$('#trafficreview').onclick=e=>{if(e.target.closest('[data-check-traffic]'))checkTraffic()};
$('#matchbody').onclick=e=>{const button=e.target.closest('[data-match]');if(!button)return;const candidate=matchCandidates[Number(button.dataset.match)],stop=trip.find(s=>s.place.id===matchingId);if(!candidate||!stop)return;checkpoint();stop.place={...stop.place,routing:{id:candidate.id,name:candidate.name,address:candidate.address,location:candidate.location,confirmed:true}};renderAll();$('#matchbody').innerHTML='<div class="confirmed-place"><strong>'+esc(candidate.name)+'</strong><p>'+esc(candidate.address||'')+'</p><span>已确认交通定位</span></div>';$('#continuecheck').disabled=false};
$('#continuecheck').onclick=()=>{$('#match').close();checkTraffic()};
$('#undo').onclick=async()=>{const previous=undoStack.pop();if(!previous)return;const records=decisionState.records;try{const applied=await applyDraft(previous);if(!applied){undoStack.push(previous);toast('行程已变化，本次撤销未应用');return}decisionState.records=records;renderTrip();toast('已撤销上一次修改')}catch(e){undoStack.push(previous);toast(e.message)}};
$('#saveretry').onclick=()=>{if(restoreFailed)return init();saveBlocked=false;return flushSave()};
$('#restorepreset').onclick=()=>loadPreset(currentPresetId||'classic');
for(const id of ['travelmode','maxhours','restmins'])$('#'+id).onchange=()=>{if(id==='travelmode'&&decisionState.intent.excludedModes.includes($('#travelmode').value)){$('#travelmode').value=lastRenderedDraft?.mode||decisionState.intent.mode||'driving';toast('该交通方式已被排除，请先修改旅行条件');return}checkpoint(true);decisionState.intent[{travelmode:'mode',maxhours:'maxHours',restmins:'restMinutes'}[id]]=id==='travelmode'?$('#'+id).value:Number($('#'+id).value);renderTrip();renderMap()};
$('#export').onclick=()=>{if(!trip.length){toast('请先加入地点');return}const blob=new Blob([JSON.stringify(compactDraft(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='豫见行迹-河南旅行行程.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出行程')};
$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>100000)throw Error('行程文件过大');const operation=++draftOperation,raw=JSON.parse(await file.text()),validated=await api('/api/validate',raw);if(operation!==draftOperation)throw Error('行程已修改，请重新导入');validateDecisionState(raw.decision||{},validated.stops);checkpoint();const applied=await applyDraft(raw,validated);if(!applied)throw Error('行程已修改，本次导入未应用');toast('已导入行程')}catch(e){toast(e.message||'无法导入此文件')}finally{$('#file').value=''}};
document.addEventListener?.('visibilitychange',()=>{if(document.visibilityState==='hidden')flushSave();else{renderTrip();renderMap();scheduleTrafficExpiry()}});
globalThis.addEventListener?.('pagehide',()=>{if(!saveBooting&&!saveBlocked&&cfg.persistenceConfigured&&JSON.stringify(compactDraft())!==lastSaved&&!saveInFlight)fetch('/api/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({draft:compactDraft(),revision:saveRevision}),keepalive:true}).catch(()=>{})});
function setHydrating(active){for(const selector of ['#decision','#presets','#cityform','.filters','#searchform','#places','#trip','#days','#start','#travelmode','#maxhours','#restmins','#clear','#undo','#plan','#restorepreset','#import','#export','#trafficreview','#route','#map']){const node=$(selector);if(node)node.inert=active;}}
async function init(){
  saveBooting=true;setHydrating(true);$('#saveretry').disabled=true;restoreFailed=false;saveBlocked=false;
  renderPhotoCredits();renderPresets();loadPreset('luoyang',true);
  try{cfg=await api('/api/config');await refreshAuth();renderGallery();$('#draftinfo').textContent=cfg.persistenceConfigured?'行程自动保存到当前账号；也可以导出文件留存。':'离线展示不连接账号保存，请导出行程留存。';connectMap();if(cfg.persistenceConfigured){const stored=await api('/api/draft');if(stored.draft){const validated=await api('/api/validate',stored.draft);await applyDraft(stored.draft,validated);saveRevision=stored.revision;lastSaved=JSON.stringify(compactDraft());saveStatus('已恢复上次保存的行程')}else{saveRevision=0;saveStatus('自动保存已开启')}
  try{const pending=sessionStorage.getItem('yujianxingji.pendingDraft');sessionStorage.removeItem('yujianxingji.pendingDraft');if(pending){const raw=JSON.parse(pending);if(raw&&Array.isArray(raw.stops)&&raw.stops.length){await applyDraft(raw);toast('已载入登录前编辑的行程，可继续调整或导出')}}}catch{/* 暂存草稿无效时保留已恢复的行程 */}
  }else saveStatus('离线展示，请导出行程留存。');saveBooting=false;setHydrating(false);scheduleSave();}
  catch(e){if(e.status===401){cfg.persistenceConfigured=false;saveBooting=false;setHydrating(false);const needLogin=cfg.authMode==='standalone';saveStatus(needLogin?'登录后可自动保存行程，访客行程仅保留在本页。':'访客行程仅保留在本页，请导出留存。');$('#draftinfo').textContent=needLogin?'登录后行程自动保存到你的账号；访客请导出文件留存。':'访客行程不连接账号保存，请导出文件留存。';return}if(!cfg.mapConfigured){mapConnection='failed';showMapStatus()}restoreFailed=true;saveBlocked=true;saveStatus('暂时无法读取已保存行程。请重试读取，以保留之前的修改。',true);$('#saveretry').textContent='重试读取行程';}
  finally{$('#saveretry').disabled=false;if(!restoreFailed)$('#saveretry').textContent='重试保存';renderDecision()}
}
