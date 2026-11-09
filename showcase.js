let activeView='gallery',comparisonRecord=null,planningBusy=false;
/* 流程埋点：AI 规划 vs 预设路线的使用比例，用于验证"AI 主导"的产品定位。匿名、无个人信息，失败静默。 */
function trackFlow(event){try{fetch('/api/flow-stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event}),keepalive:true}).catch(()=>{})}catch{}}
const preferredHeroPhotos=['hn-qingming','hn-longmen','hn-luoyi','hn-henan-museum','hn-laojunshan'].map(id=>CATALOG.find(p=>p.id===id)).filter(heroPhotoHasPublicMetadata);
const heroEmptyPlace=()=>({...CATALOG[0],id:CATALOG[0]?.id||'henan-photo-placeholder',city:CATALOG[0]?.city||'河南',name:CATALOG[0]?.name||'河南周末游',category:CATALOG[0]?.category||'scenic',theme:'实景待补',image:null});
let heroSelectionDay=heroDayIndex(),heroPhotos=selectDailyHeroPhotos(CATALOG),heroPlaces=heroPhotos.length?heroPhotos:[heroEmptyPlace()],heroDailyTimer=0;
let heroPopular=null,heroPopularHasDemo=false;
const heroPhotoLabel=place=>place.city+' · '+place.name+(place.image?' · '+photoDateLabel(place)+' · 照片说明 ↗':' · 照片占位');
const albumPlaces=[...preferredHeroPhotos,...CATALOG.filter(p=>heroPhotoHasPublicMetadata(p)&&!preferredHeroPhotos.some(h=>h.id===p.id))];
let albumIndex=0,albumImageAttempt=0;
function updatePhotoAlbum(){
  const place=albumPlaces[albumIndex];if(!place)return;
  $('#album-title').textContent=place.name;$('#album-context').textContent=place.city+' · '+(place.theme||'河南实景');
  $('#album-caption').textContent=place.photoCaption||place.city+' · '+place.name+'实景照片';$('#album-date').textContent=photoDateLabel(place);
  $('#album-count').textContent=String(albumIndex+1).padStart(2,'0')+' / '+String(albumPlaces.length).padStart(2,'0');
  $('#album-credit').textContent=place.credit||place.photoSource||'照片出处待补充';$('#album-source').hidden=!place.photoReference;$('#album-source').href=place.photoReference||'';$('#album-license').hidden=!place.licenseUrl;$('#album-license').href=place.licenseUrl||'';
  const image=$('#album-image'),attempt=++albumImageAttempt;image.hidden=true;$('#album-error').innerHTML=photoPlaceholderHTML(place,{loading:true});$('#album-error').hidden=false;
  image.onload=()=>{if(attempt===albumImageAttempt){image.hidden=false;$('#album-error').hidden=true}};
  image.onerror=()=>{if(attempt===albumImageAttempt){image.hidden=true;$('#album-error').innerHTML=photoPlaceholderHTML(place,{failed:true});$('#album-error').hidden=false}};
  image.alt=place.photoCaption||place.name+'实景照片';image.src=photoImageURL(place.image);if(image.complete&&image.naturalWidth)image.onload();
  $('#album-thumbnails').querySelectorAll?.('[data-album-photo]').forEach((button,i)=>{button.classList.toggle('is-active',i===albumIndex);button.setAttribute('aria-pressed',String(i===albumIndex))});
}
function selectAlbumPhoto(index){if(!Number.isInteger(index)||index<0||index>=albumPlaces.length)return;albumIndex=index;updatePhotoAlbum()}
function stepAlbumPhoto(step){selectAlbumPhoto((albumIndex+step+albumPlaces.length)%albumPlaces.length)}
function openPhotoAlbum(id=heroPlaces[heroPhotoIndex]?.id){
  const index=albumPlaces.findIndex(p=>p.id===id);if(index<0){
    const place=CATALOG.find(p=>p.id===id);
    if(place?.image){if($('#photoalbum').open)$('#photoalbum').close();void openDetail(place)}
    return;
  }
  $('#album-thumbnails').innerHTML=albumPlaces.map((p,i)=>'<button data-album-photo="'+i+'" aria-label="查看'+esc(p.city+' · '+p.name)+'完整照片" aria-pressed="false">'+photoMediaHTML(p,{compact:true,alt:''})+'<span>'+esc(p.name)+'</span></button>').join('');
  bindPhotoMedia($('#album-thumbnails'));selectAlbumPhoto(index);if(!$('#photoalbum').open)$('#photoalbum').showModal();
}
$('#photoalbum').onclick=e=>{const photo=e.target.closest('[data-album-photo]'),step=e.target.closest('[data-album-step]');if(photo){selectAlbumPhoto(Number(photo.dataset.albumPhoto));return}if(step){stepAlbumPhoto(Number(step.dataset.albumStep));return}if(e.target.closest('[data-album-place]')){$('#photoalbum').close();openDetail(albumPlaces[albumIndex])}};
$('#photoalbum').onkeydown=e=>{if(!$('#photoalbum').open||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();stepAlbumPhoto(e.key==='ArrowRight'?1:-1)}};
$('#photoalbum').addEventListener?.('close',()=>scheduleHeroRotation());
const heroReducedMotion=()=>Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
let heroPhotoIndex=0,heroAutoplay=heroPhotos.length>1&&!heroReducedMotion(),heroTimer=0,heroHover=false,heroFocus=false,heroVisible=true,heroObserver;
function scheduleHeroRotation(){
  clearTimeout(heroTimer);heroTimer=0;
  if(!heroAutoplay||activeView!=='gallery'||document.hidden||heroHover||heroFocus||!heroVisible||heroPlaces.length<2)return;
  heroTimer=setTimeout(()=>{heroTimer=0;if(!document.querySelector('dialog[open]'))selectHeroPhoto((heroPhotoIndex+1)%heroPlaces.length);else scheduleHeroRotation()},6000);
}
function updateHeroPhoto(){
  const place=heroPlaces[heroPhotoIndex];if(!place)return;
  $('#hero-slideshow').querySelectorAll?.('[data-hero-slide]').forEach((img,i)=>{img.classList.toggle('is-active',i===heroPhotoIndex);img.setAttribute('aria-hidden',String(i!==heroPhotoIndex))});
  $('#hero-slideshow').querySelectorAll?.('[data-hero-photo]').forEach((button,i)=>{button.classList.toggle('is-active',i===heroPhotoIndex);button.setAttribute('aria-pressed',String(i===heroPhotoIndex))});
  $('#hero-photo-source').textContent=place.city+' · '+place.name+(place.image?' ↗':' · 照片占位');if(place.image)$('#hero-photo-source').dataset.photoPlace=place.id;else delete $('#hero-photo-source').dataset.photoPlace;$('#hero-photo-source').setAttribute?.('aria-label',heroPhotoLabel(place));
  $('#hero-photo-date').textContent=place.image?photoDateLabel(place):'图形占位 · 尚无实景照片';
  $('#hero-photo-count').textContent=place.image?String(heroPhotoIndex+1).padStart(2,'0')+' / '+String(heroPopular?heroPopular.length:heroPhotos.length).padStart(2,'0'):'实景待补';
  const popularInfo=$('#hero-popular-info');if(popularInfo)popularInfo.textContent=heroPopular?heroPopularInfo(heroPopular[heroPhotoIndex]):'';
  $('#hero-toggle').textContent=heroAutoplay?'Ⅱ':'▶';$('#hero-toggle').setAttribute?.('aria-label',heroAutoplay?'暂停照片轮播':'播放照片轮播');$('#hero-toggle').setAttribute?.('aria-pressed',String(heroAutoplay));
  ensureHeroThumbnailVisible();
}
function heroSlidesHTML(){return heroPlaces.map((p,i)=>'<div class="hero-image '+(i===heroPhotoIndex?'is-active':'')+'" data-hero-slide aria-hidden="'+String(i!==heroPhotoIndex)+'">'+photoMediaHTML(p,{fetchpriority:i===heroPhotoIndex?'high':'low',loading:'eager'})+'</div>').join('')}
function heroThumbnailsHTML(){return heroPlaces.map((p,i)=>'<button data-hero-photo="'+i+'" class="hero-thumbnail '+(i===heroPhotoIndex?'is-active':'')+'" aria-label="查看'+esc(p.city+' · '+p.name)+'照片" aria-pressed="'+String(i===heroPhotoIndex)+'">'+photoMediaHTML(p,{compact:true,alt:''})+'<span>'+esc(p.name)+'</span></button>').join('')}
function ensureHeroThumbnailVisible(){
  const nav=$('#hero-thumbnails'),button=nav?.querySelector?.('[data-hero-photo="'+heroPhotoIndex+'"]');if(!button||!nav.clientWidth)return;
  const left=button.offsetLeft,right=left+button.offsetWidth,current=nav.scrollLeft||0;
  const next=left<current?left:right>current+nav.clientWidth?right-nav.clientWidth:current;
  if(Number.isFinite(next)&&next!==current){if(nav.scrollTo)nav.scrollTo({left:next,behavior:heroReducedMotion()?'instant':'smooth'});else nav.scrollLeft=next}
}
function refreshDailyHeroPhotos(now=Date.now()){
  const day=heroDayIndex(now);if(day===heroSelectionDay||heroPopular)return false;
  heroSelectionDay=day;heroPhotos=selectDailyHeroPhotos(CATALOG,now);heroPlaces=heroPhotos.length?heroPhotos:[heroEmptyPlace()];heroPhotoIndex=0;
  if(typeof refreshAIHeroScenery==='function')refreshAIHeroScenery();
  rebuildHeroSlides();
  return true;
}
function scheduleDailyHeroRefresh(now=Date.now()){
  clearTimeout(heroDailyTimer);
  const delay=(heroDayIndex(now)+1)*HERO_DAY_MS-HERO_BEIJING_OFFSET_MS-Number(now)+25;
  heroDailyTimer=setTimeout(()=>{heroDailyTimer=0;refreshDailyHeroPhotos();scheduleDailyHeroRefresh()},Math.max(25,delay));
}
function selectHeroPhoto(index){if(!Number.isInteger(index)||index<0||index>=heroPlaces.length)return;heroPhotoIndex=index;updateHeroPhoto();scheduleHeroRotation()}
function heroPopularInfo(item){if(!item)return '';return '热门第 '+item.rank+' 名 · '+item.worth+' 人复盘值得多待 · '+item.added+' 次加入行程'+(item.demo?'（演示数据）':'')}
// 热门轮播：热门层按 /api/popular 前 5 名排；取不到数据或可上轮播的
// 热门地点不足 2 个时，恢复现有日期轮换，一字不动。
// 照片筛选沿用 heroPhotoHasPublicMetadata（完整出处与授权才上轮播），
// 热门但没图的地点只进榜、不上轮播。
function rebuildHeroSlides(){
  const hero=$('#hero-slideshow'),slides=$('#hero-photo-slides'),thumbnails=$('#hero-thumbnails');
  if(hero&&slides&&thumbnails){
    slides.innerHTML=heroSlidesHTML();thumbnails.innerHTML=heroThumbnailsHTML();bindPhotoMedia(slides);bindPhotoMedia(thumbnails);
    hero.dataset.heroDay=String(heroSelectionDay);hero.setAttribute?.('aria-roledescription',heroPlaces.length?'照片轮播':'地点展示');
    const label=$('#hero-daily-label');if(label){label.textContent=heroPopular?(heroPopularHasDemo?'热门轮播 · 演示模式 · 演示数据':'热门轮播 · 按复盘与加入排序'):'每日精选 · '+heroDateString(heroSelectionDay*HERO_DAY_MS-HERO_BEIJING_OFFSET_MS)+'（北京时间）';label.dataset.heroDay=String(heroSelectionDay)}
    const controls=hero.querySelector?.('.hero-gallery-controls');if(controls)controls.hidden=heroPlaces.length<2;
    const toggle=$('#hero-toggle');if(toggle){toggle.hidden=heroPlaces.length<2;toggle.disabled=heroPlaces.length<2}
    updateHeroPhoto();scheduleHeroRotation();
  }
}
function restoreDailyHero(){
  heroPopular=null;heroPopularHasDemo=false;heroSelectionDay=heroDayIndex();heroPhotos=selectDailyHeroPhotos(CATALOG);heroPlaces=heroPhotos.length?heroPhotos:[heroEmptyPlace()];heroPhotoIndex=0;
  if(typeof setAIHeroCoverPlace==='function')setAIHeroCoverPlace(null);
  if(typeof refreshAIHeroScenery==='function')refreshAIHeroScenery();
  rebuildHeroSlides();
}
// 热门轮播：首屏封面与热门层都接 /api/popular 前 5 名。
// 演示开时传 demo 会话（演示复盘 + 演示加入数），平时只看真实复盘；
// 取不到数据或可上轮播的热门地点不足 2 个时，恢复现有日期轮换，一字不动。
// 照片筛选沿用 heroPhotoHasPublicMetadata（完整出处与授权才上轮播），
// 热门但没图的地点只进榜、不上轮播。首屏封面用热门第 1 名，
// 没热门数据时回落到日期轮换选景（aiHeroScenery）。
async function refreshPopularHero(){
  try{
    const data=await api('/api/popular'+(typeof demoOn==='function'&&demoOn()?'?demo='+encodeURIComponent(demoSessionId()):''));
    const items=(data.items||[]).filter(item=>{const p=CATALOG.find(x=>x.id===item.id);return p&&heroPhotoHasPublicMetadata(p)}).slice(0,5);
    if(items.length<2){if(heroPopular)restoreDailyHero();return}
    heroPopular=items.map((item,i)=>({...item,rank:i+1}));
    heroPopularHasDemo=heroPopular.some(item=>item.demo);
    heroPlaces=heroPopular.map(item=>CATALOG.find(x=>x.id===item.id));heroPhotoIndex=0;
    if(typeof setAIHeroCoverPlace==='function')setAIHeroCoverPlace(heroPlaces[0]);
    if(typeof refreshAIHeroScenery==='function')refreshAIHeroScenery();
    rebuildHeroSlides();
  }catch{ if(heroPopular)restoreDailyHero(); }
}
function initializeHeroSlideshow(){
  refreshDailyHeroPhotos();scheduleDailyHeroRefresh();
  const hero=$('#hero-slideshow');heroHover=false;heroFocus=false;heroVisible=true;heroObserver?.disconnect();
  hero.onpointerenter=()=>{heroHover=true;scheduleHeroRotation()};hero.onpointerleave=()=>{heroHover=false;scheduleHeroRotation()};
  hero.onfocusin=()=>{heroFocus=true;scheduleHeroRotation()};hero.onfocusout=e=>{heroFocus=Boolean(hero.contains?.(e.relatedTarget));scheduleHeroRotation()};
  if(typeof IntersectionObserver==='function'){heroObserver=new IntersectionObserver(entries=>{heroVisible=entries[0].isIntersecting;scheduleHeroRotation()},{threshold:0});heroObserver.observe(hero)}
  updateHeroPhoto();scheduleHeroRotation();
}
document.addEventListener?.('visibilitychange',()=>{if(!document.hidden){refreshDailyHeroPhotos();scheduleDailyHeroRefresh()}scheduleHeroRotation()});
globalThis.addEventListener?.('pageshow',()=>{refreshDailyHeroPhotos();scheduleDailyHeroRefresh();scheduleHeroRotation()});
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',()=>{if(heroReducedMotion())heroAutoplay=false;updateHeroPhoto();scheduleHeroRotation()});
function renderHeaderCount(){$('#headertripcount').textContent=String(trip.length)}
function initializeMap(attempt=mapAttempt){
  if(attempt!==mapAttempt||map)return;
  try{
    $('#map').innerHTML='';map=new AMap.Map('map',{zoom:8,center:[113.5,34.8],resizeEnable:true});mapConnection='loading';showMapStatus();
    const instance=map;map.on('complete',()=>{if(attempt!==mapAttempt||map!==instance)return;clearTimeout(mapTimer);mapConnection='ready';showMapStatus()});
    mapTimer=setTimeout(()=>{if(attempt!==mapAttempt||map!==instance||mapConnection==='ready')return;mapConnection='slow';showMapStatus()},12000);renderMap();fit();
  }catch{map?.destroy?.();map=null;markers=[];line=null;renderMap();mapConnection='failed';showMapStatus()}
}
// 首页嵌套层：首屏只放 hero；需求表单、热门轮播各是单独一屏，
// 点开始规划 / 看看热门才进，不在首屏堆叠。闭环四步条不在首页，
// 在行程总览页顶部（见 loopStripHTML）。
let homeLayer='hero';
function showHomeLayer(layer){
 if(!['hero','plan','popular'].includes(layer))layer='hero';
 const previous=homeLayer;homeLayer=layer;
 if(previous==='plan'&&layer!=='plan'){if(typeof cancelBriefCandidate==='function')cancelBriefCandidate();if(typeof unmountBriefFromLayer==='function')unmountBriefFromLayer()}
 for(const name of ['hero','plan','popular']){const section=$('#home-'+name+'-layer');if(section)section.hidden=name!==layer}
 if(document.body)document.body.dataset.homeLayer=layer;
 if(layer==='popular')refreshPopularHero();
 if(layer==='hero'&&typeof refreshAIHeroScenery==='function')refreshAIHeroScenery();
 globalThis.scrollTo?.({top:0,behavior:'instant'});
}
function planExtrasHTML(){
 return '<section class="home-plan-extras" aria-label="演示、拼团与其他入口"><div class="demo-mode" data-demo-mode><span>演示模式：<b data-demo-state>'+(demoOn()?'已开启':'已关闭')+'</b></span><button class="quiet" data-demo-toggle>'+(demoOn()?'关闭演示模式':'开启演示模式')+'</button><button class="quiet" data-demo-clear>一键清空演示数据</button><small>开启后造一套模拟复盘：2 人觉得景点值得多待、1 人觉得美食值得多待，另 1 单含实际花费与超时站；另造 8 个地点的模拟加入数，热门层按热门分排，全程标演示数据。演示数据只存本次会话，不影响真实复盘；关闭只关开关，不自动清空。</small></div><div class="group-entry"><button class="quiet" data-open-group>宿舍拼团</button><small>和宿舍一起拼一趟周末游：建团、合偏好、发起人定冲突后生成拼团行程。</small></div><div class="home-plan-links"><button type="button" class="quiet" data-home-vision>拍照识景点</button><button type="button" class="quiet" data-open-sources>资料与照片来源</button></div></section>';
}
function loopStripHTML(){
 return '<nav class="loop-strip" aria-label="规划到出行的闭环四步"><ol><li><button type="button" data-loop-step="plan"><b>01 · 规划</b><span>确认旅行条件，让智能体生成候选</span></button></li><li><button type="button" data-loop-step="spots"><b>02 · 出行</b><span>去景点页看 3D 与沉浸式玩法</span></button></li><li><button type="button" data-loop-step="review"><b>03 · 复盘</b><span>走完回来记四件事</span></button></li><li><button type="button" data-loop-step="popular"><b>04 · 迭代</b><span>看热门怎么变，下一轮越用越准</span></button></li></ol></nav>';
}
function renderGallery(){
  if(typeof captureAIHeroDraft==='function')captureAIHeroDraft();
  if(typeof cancelSTTHero==='function')cancelSTTHero();
  if(typeof unmountBriefFromLayer==='function')unmountBriefFromLayer();
  homeLayer='hero';if(document.body)document.body.dataset.homeLayer='hero';
  const hero=heroPlaces[heroPhotoIndex];
  const coverCount=CATALOG.filter(place=>photoImageURL(place.image)).length;
  $('#gallery').innerHTML=`
    <div class="home-layers">
    <section id="home-hero-layer" class="home-layer home-hero-layer" data-home-layer="hero" aria-label="首页">
    ${typeof aiPlanningHeroHTML==='function'?aiPlanningHeroHTML():''}
    </section>
    <section id="home-plan-layer" class="home-layer home-plan-layer" data-home-layer="plan" aria-label="需求表单" hidden>
      <div class="home-layer-head"><button type="button" class="home-back" data-home-back>← 回首页</button><h2>确认旅行需求</h2></div>
      <p class="home-plan-note">5 个智能体按你的条件执行：需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验。确认后才会生成候选行程。</p>
      <div id="home-plan-host" class="home-plan-host"></div>
      ${planExtrasHTML()}
    </section>
    <section id="home-popular-layer" class="home-layer home-popular-layer" data-home-layer="popular" aria-label="热门轮播" hidden>
      <div class="home-layer-head"><button type="button" class="home-back" data-home-back>← 回首页</button><p class="home-layer-kicker">看看热门</p></div>
    <section id="hero-slideshow" class="journey-hero" aria-labelledby="hero-title" aria-roledescription="${heroPhotos.length?'照片轮播':'地点展示'}" data-hero-day="${heroSelectionDay}">
      <div class="hero-grid" aria-hidden="true"></div>
      <p id="hero-daily-label" class="hero-daily-label" data-hero-day="${heroSelectionDay}">每日精选 · ${heroDateString(heroSelectionDay*HERO_DAY_MS-HERO_BEIJING_OFFSET_MS)}（北京时间）</p>
      <button class="hero-album-entry" data-open-album ${albumPlaces.length?'':'hidden disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="8" r="2"/></svg>精选实景相册<span>${albumPlaces.length} 张 · 看完整照片 ↗</span></button>
      <div id="hero-photo-slides">${heroSlidesHTML()}</div>
      <div class="hero-content">
        <p class="hero-eyebrow">HENAN · A WEEKEND AWAY <span class="hero-seal">AI 智游</span></p>
        <h2 id="hero-title">今天，想去哪里？<span>从一张风景，开始你的周末。</span></h2>
        <p class="hero-description">走进古都的日常，或去山水间慢下来。<br>从你的时间与预算出发，安排一段刚刚好的旅程。</p>
        <div class="hero-actions"><button class="primary" data-home-plan>开始规划 <span aria-hidden="true">↗</span></button></div>
        <div class="hero-stats" aria-label="站点数据"><div><b>${CITY_GUIDES.length}</b><span>城目的地</span></div><div><b>${CATALOG.length}</b><span>精选去处</span></div><div><b>${coverCount}</b><span>处已有封面</span></div><div><b>${PRESETS.length}</b><span>条主题路线</span></div></div>
      </div>
      <div class="hero-bottom"><div class="hero-photo-meta"><span id="hero-photo-count">${hero.image?String(heroPhotoIndex+1).padStart(2,'0')+' / '+String(heroPhotos.length).padStart(2,'0'):'实景待补'}</span><div class="hero-photo-info">${hero.image?'<button id="hero-photo-source" data-open-album data-photo-place="'+esc(hero.id)+'" aria-label="'+esc(heroPhotoLabel(hero))+'">'+esc(hero.city+' · '+hero.name)+' ↗</button>':'<span id="hero-photo-source">'+esc(hero.city+' · '+hero.name)+' · 照片占位</span>'}<span id="hero-photo-date">${hero.image?esc(photoDateLabel(hero)):'图形占位 · 尚无实景照片'}</span><span id="hero-popular-info"></span></div><button id="hero-toggle" data-hero-toggle ${heroPhotos.length>1?'':'hidden disabled'} aria-label="${heroAutoplay?'暂停照片轮播':'播放照片轮播'}" aria-pressed="${String(heroAutoplay)}">${heroAutoplay?'Ⅱ':'▶'}</button></div><div class="hero-gallery-controls" ${heroPhotos.length>1?'':'hidden'}><button class="hero-arrow" data-hero-step="-1" aria-label="上一张照片">←</button><nav id="hero-thumbnails" class="hero-thumbnails" aria-label="选择河南实景照片">${heroThumbnailsHTML()}</nav><button class="hero-arrow" data-hero-step="1" aria-label="下一张照片">→</button></div></div>
    </section>
    </section>
    </div>`;
  bindPhotoMedia($('#gallery'));initializeHeroSlideshow();
  refreshPopularHero();
  if(typeof bindAIPlanningHero==='function')bindAIPlanningHero();
}

function revealPlannerMap(){
  if(mapConnection==='standby')initializeMap();
  map?.setStatus?.({resizeEnable:true});
  const redraw=()=>{
    if(activeView!=='planner')return;
    // A hidden map can retain a zero-sized WebGL canvas after a breakpoint change.
    const size=map?.getSize?.(),canvas=$('#map').querySelector?.('canvas');
    if(map&&mapConnection==='ready'&&((size&&(size.width<1||size.height<1))||(canvas&&(canvas.width<1||canvas.height<1)))){
      clearTimeout(mapTimer);map.destroy();map=null;markers=[];line=null;initializeMap();
    }
    if(typeof Event==='function')globalThis.dispatchEvent?.(new Event('resize'));
    renderMap();fit();
  };
  if(typeof requestAnimationFrame==='function')requestAnimationFrame(redraw);else redraw();
}
function setView(view){
  if(!['gallery','planner','overview','decision','spots'].includes(view))return;
  if(typeof cancelSTTHero==='function')cancelSTTHero();
  if(view!=='planner')map?.setStatus?.({resizeEnable:false});
  activeView=view;document.body&&(document.body.dataset.view=view);
  document.querySelectorAll('.view-nav [data-view]').forEach(b=>{b.setAttribute?.('aria-current',b.dataset.view===view?'page':'false')});
  if(view==='gallery')renderGallery();if(view==='overview')renderOverview();if(view==='decision')renderDecision();if(view==='spots')renderSpots();else if(typeof spots3DStop==='function')spots3DStop();
  if(view==='planner')revealPlannerMap();
  scheduleHeroRotation();
  if(typeof refreshAIHeroLifecycle==='function')refreshAIHeroLifecycle();
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
  $('#overview').innerHTML=loopStripHTML()+'<div class="folio-heading"><div><div class="eyebrow">YOUR JOURNEY / HENAN</div><h2>'+esc(preset?.title||'我的河南旅程')+'</h2><p>地点、停留和交通分别呈现。确认自己的节奏，再出发。</p></div><div class="folio-actions"><button data-overview-action="edit">继续编辑</button><button data-overview-action="poster" '+(!trip.length?'disabled':'')+'>导出行程图</button><button data-overview-action="check">检查条件</button><button class="primary" data-overview-action="plan" '+(!trip.length?'disabled':'')+'>生成规划对照</button></div></div><div class="folio-metrics"><div class="folio-metric"><small>旅行安排</small><b>'+days+'</b><span>天 / '+trip.length+' 站</span></div><div class="folio-metric"><small>到访城市</small><b>'+cities.length+'</b><span>'+esc(cities.join('、')||'尚未选择')+'</span></div><div class="folio-metric"><small>游览停留合计</small><b>'+Math.round(total/6)/10+'</b><span>小时，不含交通</span></div><div class="folio-metric"><small>已确认交通定位</small><b>'+confirmed+' / '+trip.length+'</b><span>地点</span></div></div>'+(comparisonRecord&&comparisonRecord.afterSnapshot===JSON.stringify(compactDraft())?comparisonHTML(comparisonRecord.before,trip,days):'')+'<div class="folio-days">'+Array.from({length:days},(_,i)=>{
    const items=trip.filter(s=>s.day===i+1),localCities=[...new Set(items.map(s=>s.place.city).filter(Boolean))],cover=items.find(s=>s.place.image)?.place;
    const duration=items.reduce((n,s)=>n+s.duration,0),cached=cachedTraffic(items);
    return '<article class="folio-day"><div class="folio-day-cover">'+photoMediaHTML(cover||{city:localCities[0],name:localCities.join(' / ')||'自由安排',theme:'分日行程'},{className:'folio-cover-photo',compact:true})+'<small>DAY 0'+(i+1)+'</small><h3>'+esc(localCities.join(' / ')||'自由安排')+'</h3><span>'+items.length+' 个地点 · 游览 '+esc(durationLabel(duration))+'</span>'+(cover?'<p class="folio-photo-label">照片：'+esc(cover.city||'河南')+' · '+esc(cover.name)+'</p>':'')+'</div><div class="folio-day-content">'+(items.length?items.map((s,j)=>{
      const leg=cached?.legs[j-1];return (j?'<div class="folio-leg">'+(leg?esc(modeNames[cached.mode])+' · 约 '+Math.ceil(leg.duration/60)+' 分钟':'站间交通待核算')+'</div>':'')+'<div class="folio-stop"><span class="folio-stop-number">'+(j+1)+'</span><div><button data-folio-place="'+esc(s.place.id)+'">'+esc(s.place.name)+'</button><p>'+esc(s.place.theme||labels[s.place.category])+' · 停留 '+esc(durationLabel(s.duration))+'</p>'+(s.place.visitTip?'<p class="folio-tip">'+esc(s.place.visitTip)+'</p>':'')+'</div></div>';
    }).join(''):'<div class="folio-empty">留给下一段旅程。</div>')+'<div class="folio-day-footer">'+(localCities.length>1?'当天跨城，城际交通需另行确认。':cached?'站间耗时来自查询时的高德方案。':'停留时长已列出，交通尚未计入。')+'<button data-edit-day="'+(i+1)+'">在地图上编辑第 '+(i+1)+' 天</button></div></div></article>';
  }).join('')+'</div><div class="folio-proof"><div><b>规划依据</b><br>AI 智能体根据你的条件与工具结果规划；服务不可用时显示规则候选。</div><div><b>交通与资料</b><br>高德实时查询；实景照片、作者和许可可在地点详情与资料说明中查看。</div><div><b>出发前确认</b><br>营业时间、预约和景区内部交通尚未校验，请以官方当日信息为准。</div></div>'+reviewSectionHTML();bindPhotoMedia($('#overview'));refreshReviewSummary();
}
// 闭环改革一期：出行复盘。复盘按（账号，行程编号）保存；行程总览页展示，写复盘走对话框。
let reviewCache={tripId:null,review:null,loaded:false};
function reviewSectionHTML(){
 return '<section class="review-section" aria-label="出行复盘"><div class="review-heading"><div><h3>出行复盘</h3><p>走完回来记四件事，下一轮推荐会越用越准。复盘只保存在你的账号下，匿名访客请先登录。</p></div><button class="primary" data-overview-action="review" '+(!trip.length?'disabled':'')+'>写复盘</button></div><p id="reviewsummary" class="review-summary" role="status">正在读取复盘…</p></section>';
}
function reviewSummaryHTML(review){
 if(!review)return '还没有复盘。走完回来记四件事：实际花了多少、哪站超时、哪站值得多待、最终选了哪个方案。';
 const parts=[];
 if(review.actualCost!=null)parts.push('实际总花费 ¥'+review.actualCost);
 if(review.overtimeStop)parts.push('超时：'+review.overtimeStop);
 if(review.worthMoreStop)parts.push('值得多待：'+review.worthMoreStop);
 if(review.chosenPlan)parts.push('最终方案：'+review.chosenPlan);
 return '已复盘（'+new Date(review.updatedAt).toLocaleString('zh-CN')+'）：'+parts.join(' · ');
}
async function refreshReviewSummary(){
 const box=$('#reviewsummary');if(!box)return;
 if(!trip.length){box.textContent='先加入地点，再写复盘。';return}
 const id=getTripId();
 if(!reviewCache.loaded||reviewCache.tripId!==id){
  try{const data=await api('/api/trips/'+encodeURIComponent(id)+'/review');reviewCache={tripId:id,review:data.review,loaded:true}}catch(e){const current=$('#reviewsummary');if(current)current.textContent='复盘暂不可用：'+e.message;return}
 }
 const current=$('#reviewsummary');if(current)current.innerHTML=esc(reviewSummaryHTML(reviewCache.review));
}
function fillReviewForm(review){
 const options=trip.map(s=>'<option value="'+esc(s.place.name)+'">'+esc(s.place.name)+'</option>').join('');
 $('#reviewovertime').innerHTML='<option value="">未填</option>'+options;
 $('#reviewworthmore').innerHTML='<option value="">未填</option>'+options;
 $('#reviewcost').value=review?.actualCost??'';
 $('#reviewovertime').value=review?.overtimeStop||'';
 $('#reviewworthmore').value=review?.worthMoreStop||'';
 $('#reviewplan').value=review?.chosenPlan||'';
 $('#reviewerror').hidden=true;
}
async function openReview(){
 if(!trip.length){toast('请先加入地点');return}
 if(cfg.authMode==='standalone'&&!authUser){toast('请先登录，复盘会保存到你的账号');openAuth('login');return}
 const id=getTripId();
 try{const data=await api('/api/trips/'+encodeURIComponent(id)+'/review');reviewCache={tripId:id,review:data.review,loaded:true}}catch(e){toast(e.message);return}
 fillReviewForm(reviewCache.review);
 if(!$('#review').open)$('#review').showModal();
}
async function submitReview(e){
 e.preventDefault();
 const err=$('#reviewerror'),btn=$('#reviewsubmit');err.hidden=true;btn.disabled=true;
 const cost=$('#reviewcost').value===''?null:Number($('#reviewcost').value);
 const body={actualCost:cost,overtimeStop:$('#reviewovertime').value||null,worthMoreStop:$('#reviewworthmore').value||null,chosenPlan:$('#reviewplan').value.trim()||null};
 if(Object.values(body).every(v=>v==null)){err.textContent='请至少填写一项复盘内容';err.hidden=false;btn.disabled=false;return}
 try{
  const data=await api('/api/trips/'+encodeURIComponent(getTripId())+'/review',body);
  reviewCache={tripId:getTripId(),review:data.review,loaded:true};
  $('#review').close();refreshReviewSummary();toast('复盘已保存');
 }catch(ex){err.textContent=ex.message;err.hidden=false}
 finally{btn.disabled=false}
}
async function generate(scopeDay=null){
  if(planningBusy){toast('正在计算建议，请稍后');return}
  const scoped=Number.isInteger(scopeDay)&&scopeDay>=1&&scopeDay<=Number($('#days').value)?scopeDay:null;
  if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}if(!trip.length)return;const button=$('#plan');cancelAgentReplay($('#advicebody'));let replayFinished=false;planningBusy=true;button.disabled=true;button.textContent='智能体正在检查安排…';
  try{
    const snapshot=JSON.stringify(compactDraft()),before=trip.map(s=>({...s,place:{...s.place}}));const selected=scoped?before.filter(s=>s.day===scoped):before;if(!selected.length)throw Error('当天没有可重排的地点');const payload=scoped?{...compactDraft(),days:1,stops:selected.map(s=>({...s,day:1,...(s.lockedDay?{lockedDay:1}:{})}))}:compactDraft();lastAdvice=await api('/api/agent',{...payload,operation:'reorder'});
    if(snapshot!==JSON.stringify(compactDraft()))throw Error('行程已修改，请重新生成规划');lastAdvice.snapshot=snapshot;
    const sorted=adviceStops(lastAdvice,selected);let next=0;const after=scoped?before.map(s=>s.day===scoped?{...sorted[next++],day:scoped}:s):sorted,days=Number($('#days').value);
    $('#advicebody').innerHTML='<span class="source-chip">'+(lastAdvice.source==='ai'?esc(lastAdvice.provider||'模型')+'智能体 · 固定日期已校验':'规则规划 · 可解释的分日安排')+'</span>'+(lastAdvice.fallback?'<p class="brief-unresolved">模型回退：'+esc(lastAdvice.fallback.reason)+'</p>':'')+(scoped?'<p class="instruction">只重排第 '+scoped+' 天；其他日期的地点、顺序与停留时长保持不变。</p>':'')+agentResultHTML(lastAdvice,{replay:true})+'<div data-agent-final hidden>'+comparisonHTML(before,after,days)+'<p class="planning-reason">'+esc(lastAdvice.note)+'</p><div class="advice-days">'+Array.from({length:days},(_,i)=>{const items=after.filter(s=>s.day===i+1);return '<div class="advice-day"><strong>DAY 0'+(i+1)+' · '+esc([...new Set(items.map(s=>s.place.city).filter(Boolean))].join(' / ')||'自由安排')+'</strong><p>'+esc(items.map(s=>s.place.name).join('、')||'暂未安排地点')+'</p><small>游览停留 '+esc(durationLabel(items.reduce((n,s)=>n+s.duration,0)))+'</small></div>'}).join('')+'</div><button class="primary" id="apply" disabled>应用新安排，继续编辑</button><button class="secondary" id="keepcurrent">保留当前安排</button></div>';
    $('#advice').showModal();$('#keepcurrent').onclick=()=>$('#advice').close();refreshLearningSignals($('#advicebody'));
    $('#apply').onclick=()=>{if(!replayFinished||!$('#advice').open)return;if(lastAdvice.snapshot!==JSON.stringify(compactDraft())){toast('行程已修改，请重新生成规划');$('#advice').close();return}checkpoint();trip=after;lastPlanningSource=lastAdvice.source;decisionState.source=lastAdvice.source;day=scoped||1;renderAll();comparisonRecord={before,afterSnapshot:JSON.stringify(compactDraft())};renderOverview();$('#advice').close();setView('overview');toast('已应用新安排，可查看分日总览或撤销')};
    startAgentReplay($('#advicebody'),{isCurrent:()=>$('#advice').open&&snapshot===JSON.stringify(compactDraft()),onComplete:()=>{replayFinished=true;$('#apply').disabled=false},onCancel:()=>{$('#apply').disabled=true}});
  }catch(e){toast(e.message)}finally{planningBusy=false;button.disabled=!trip.length;button.textContent='生成规划对照'}
}
$('#plan').onclick=generate;
$('#gallery').onclick=e=>{
 const popular=e.target.closest('[data-home-popular]');if(popular){showHomeLayer('popular');return}
 const spots=e.target.closest('[data-home-spots]');if(spots){setView('spots');return}
 const plan=e.target.closest('[data-home-plan]');if(plan){if(typeof openBriefLayer==='function')openBriefLayer('');return}
 const back=e.target.closest('[data-home-back]');if(back){showHomeLayer('hero');return}
 const vision=e.target.closest('[data-home-vision]');if(vision){if(typeof openVision==='function')openVision();return}
 const album=e.target.closest('[data-open-album]');if(album){openPhotoAlbum(album.dataset.photoPlace||heroPlaces[heroPhotoIndex]?.id);return}
 const heroPhoto=e.target.closest('[data-hero-photo]'),heroStep=e.target.closest('[data-hero-step]');if(heroPhoto){selectHeroPhoto(Number(heroPhoto.dataset.heroPhoto));return}if(heroStep){selectHeroPhoto((heroPhotoIndex+Number(heroStep.dataset.heroStep)+heroPlaces.length)%heroPlaces.length);return}
 if(e.target.closest('[data-hero-toggle]')){heroAutoplay=!heroAutoplay;updateHeroPhoto();scheduleHeroRotation();return}
 const photo=e.target.closest('[data-photo-place]');if(photo){openDetail(CATALOG.find(p=>p.id===photo.dataset.photoPlace));return}
 if(e.target.closest('[data-demo-toggle]')){toggleDemo();return}
 if(e.target.closest('[data-demo-clear]')){clearDemoData();return}
 if(e.target.closest('[data-open-group]')){openGroup();return}
 if(e.target.closest('[data-open-sources]')){$('#connect').showModal();return}
};
$('#overview').onclick=e=>{const loop=e.target.closest('[data-loop-step]');
 if(loop){const step=loop.dataset.loopStep;
  if(step==='plan'){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}setView('gallery');if(typeof openBriefLayer==='function')openBriefLayer('');return}
  if(step==='spots'){setView('spots');return}
  if(step==='review'){document.querySelector('.review-section')?.scrollIntoView({behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});return}
  if(step==='popular'){setView('gallery');if(typeof showHomeLayer==='function')showHomeLayer('popular');return}
 }
 const action=e.target.closest('[data-overview-action]'),edit=e.target.closest('[data-edit-day]'),place=e.target.closest('[data-folio-place]');if(action){if(saveBooting&&action.dataset.overviewAction==='plan'){toast('正在读取已保存行程，请稍后操作');return}if(action.dataset.overviewAction==='review'){openReview();return}if(action.dataset.overviewAction==='check')setView('decision');if(action.dataset.overviewAction==='edit')setView('planner');if(action.dataset.overviewAction==='plan')generate();if(action.dataset.overviewAction==='poster')$('#poster').onclick()}else if(edit){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}day=Number(edit.dataset.editDay);setView('planner');const cities=[...new Set(dayStops().map(s=>s.place.city).filter(Boolean))];selectCity(cities.length===1?cities[0]:'河南');renderTrip();renderMap()}else if(place){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}setView('planner');focusPlace(trip.find(s=>s.place.id===place.dataset.folioPlace)?.place)}};
$('#reviewform').onsubmit=submitReview;
document.querySelectorAll('.site-header [data-view]').forEach(button=>button.onclick=e=>{e.preventDefault?.();setView(button.dataset.view)});