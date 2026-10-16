let activeView='gallery',featuredRouteId='luoyang',comparisonRecord=null,planningBusy=false;
/* 流程埋点：AI 规划 vs 预设路线的使用比例，用于验证"AI 主导"的产品定位。匿名、无个人信息，失败静默。 */
function trackFlow(event){try{fetch('/api/flow-stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event}),keepalive:true}).catch(()=>{})}catch{}}
const preferredHeroPhotos=['hn-qingming','hn-longmen','hn-luoyi','hn-henan-museum','hn-laojunshan'].map(id=>CATALOG.find(p=>p.id===id)).filter(p=>p?.image);
const heroEmptyPlace=()=>({...CATALOG[0],id:CATALOG[0]?.id||'henan-photo-placeholder',city:CATALOG[0]?.city||'河南',name:CATALOG[0]?.name||'河南周末游',category:CATALOG[0]?.category||'scenic',theme:'实景待补',image:null});
let heroSelectionDay=heroDayIndex(),heroPhotos=selectDailyHeroPhotos(CATALOG),heroPlaces=heroPhotos.length?heroPhotos:[heroEmptyPlace()],heroDailyTimer=0;
const weekendPicks=['hn-wansui','hn-laojunshan','hn-yinji','hn-movie-town'].map(id=>CATALOG.find(p=>p.id===id)).filter(Boolean);
const pickBrief=p=>p.city+'周末两天，想去'+p.name+'，'+(p.id==='hn-laojunshan'?'想看山水，给老君山单独留一天，往返交通另行核算':p.id==='hn-yinji'?'安排亲子游，预留休息时间':'想体验'+p.theme);
function weekendPicksHTML(){return '<section id="weekend-picks" class="weekend-picks" aria-labelledby="picks-title"><div class="editorial-heading"><div><p class="section-kicker">A DIFFERENT WEEKEND</p><h2 id="picks-title">这个周末，换个玩法。</h2></div><p>去江湖看一场戏，去山顶吹吹风。<br>也给电影夜游和亲子时光留一个位置。</p></div><div class="picks-grid">'+weekendPicks.map((p,i)=>'<article class="weekend-pick pick-'+p.id+'"><button class="pick-media" data-pick-detail="'+p.id+'" aria-label="查看'+esc(p.name)+'详情">'+photoMediaHTML(p)+'<span class="pick-city">'+esc(p.city)+(p.id==='hn-laojunshan'?' · 栾川':p.id==='hn-yinji'?' · 新密':p.id==='hn-movie-town'?' · 中牟':'')+'</span></button><div class="pick-copy"><p class="section-kicker">'+esc(p.theme)+' · 建议 '+durationLabel(p.duration)+'</p><h3>'+esc(p.name)+'</h3><p>'+esc(p.description)+'</p><div class="pick-actions"><button data-pick-plan="'+p.id+'">规划这里 ↗</button><button data-pick-detail="'+p.id+'">了解玩法</button></div>'+(p.image?'<button class="pick-photo-note" data-open-album data-photo-place="'+p.id+'">实景照片 · '+esc(photoDateLabel(p))+' ↗</button>':'<p class="pick-photo-note">实景照片待补充</p>')+'</div></article>').join('')+'</div><p class="picks-note">展示的是精选出游方向；演出、门票、预约和交通请在出发前确认。</p></section>'}
const heroPhotoLabel=place=>place.city+' · '+place.name+(place.image?' · '+photoDateLabel(place)+' · 照片说明 ↗':' · 照片占位');
const albumPlaces=[...preferredHeroPhotos,...CATALOG.filter(p=>p.image&&!preferredHeroPhotos.some(h=>h.id===p.id))];
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
  const index=albumPlaces.findIndex(p=>p.id===id);if(index<0)return;
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
  $('#hero-photo-count').textContent=place.image?String(heroPhotoIndex+1).padStart(2,'0')+' / '+String(heroPhotos.length).padStart(2,'0'):'实景待补';
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
  const day=heroDayIndex(now);if(day===heroSelectionDay)return false;
  heroSelectionDay=day;heroPhotos=selectDailyHeroPhotos(CATALOG,now);heroPlaces=heroPhotos.length?heroPhotos:[heroEmptyPlace()];heroPhotoIndex=0;
  const hero=$('#hero-slideshow'),slides=$('#hero-photo-slides'),thumbnails=$('#hero-thumbnails');
  if(hero&&slides&&thumbnails){
    slides.innerHTML=heroSlidesHTML();thumbnails.innerHTML=heroThumbnailsHTML();bindPhotoMedia(slides);bindPhotoMedia(thumbnails);
    hero.dataset.heroDay=String(day);hero.setAttribute?.('aria-roledescription',heroPhotos.length?'照片轮播':'地点展示');
    const label=$('#hero-daily-label');if(label){label.textContent='每日精选 · '+heroDateString(now)+'（北京时间）';label.dataset.heroDay=String(day)}
    const controls=hero.querySelector?.('.hero-gallery-controls');if(controls)controls.hidden=heroPhotos.length<2;
    const toggle=$('#hero-toggle');if(toggle){toggle.hidden=heroPhotos.length<2;toggle.disabled=heroPhotos.length<2}
    updateHeroPhoto();scheduleHeroRotation();
  }
  return true;
}
function scheduleDailyHeroRefresh(now=Date.now()){
  clearTimeout(heroDailyTimer);
  const delay=(heroDayIndex(now)+1)*HERO_DAY_MS-HERO_BEIJING_OFFSET_MS-Number(now)+25;
  heroDailyTimer=setTimeout(()=>{heroDailyTimer=0;refreshDailyHeroPhotos();scheduleDailyHeroRefresh()},Math.max(25,delay));
}
function selectHeroPhoto(index){if(!Number.isInteger(index)||index<0||index>=heroPlaces.length)return;heroPhotoIndex=index;updateHeroPhoto();scheduleHeroRotation()}
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
const routeEditorial={classic:{title:'郑汴洛 · 古都三日',theme:'中原古都 / CULTURAL JOURNEY',cities:['郑州','开封','洛阳']},luoyang:{title:'洛阳 · 两日慢游',theme:'河洛慢游 / SLOW TRAVEL',cities:['洛阳']},taihang:{title:'太行 · 山水两日',theme:'山水与人文 / MOUNTAIN JOURNEY',cities:['焦作','安阳']}};
let atlasCityName='郑州',atlasRegion='全部',atlasQuery='';
const atlasRegions=['全部',...new Set(CITY_GUIDES.map(c=>c.region))];
function atlasMatches(c){const q=atlasQuery.trim();return (atlasRegion==='全部'||c.region===atlasRegion)&&(!q||(c.name+c.tagline+c.intro+' '+c.aliases.join(' ')+' '+CATALOG.filter(p=>p.city===c.name).map(p=>p.name+' '+(p.aliases||[]).join(' ')).join(' ')).includes(q))}
function cityDetailHTML(c){
 const places=c.highlights.map(id=>CATALOG.find(p=>p.id===id)).filter(Boolean),route=PRESETS.find(r=>r.id===c.routeId);
 return '<div class="atlas-city-heading"><div><p class="section-kicker">'+esc(c.region)+' / '+esc(c.id.toUpperCase())+'</p><h3>'+esc(c.name)+'<span>'+esc(c.tagline)+'</span></h3></div><span class="atlas-city-count">'+CATALOG.filter(p=>p.city===c.name).length+' 个精选地点</span></div><p class="atlas-city-intro">'+esc(c.intro)+'</p><div class="atlas-highlights">'+places.map(p=>'<button data-pick-detail="'+esc(p.id)+'">'+'<span class="atlas-highlight-photo">'+photoMediaHTML(p)+(p.image?'<span class="atlas-photo-date">实景 · '+esc(photoDateLabel(p))+'</span>':'')+'</span>'+'<span>'+esc(p.district||p.city)+'</span><b>'+esc(p.name)+'</b><small>'+esc(p.theme)+' · 建议 '+durationLabel(p.duration)+'<span aria-hidden="true">↗</span></small></button>').join('')+'</div><div class="atlas-city-actions"><button class="primary" data-city-brief="'+esc(c.name)+'">规划'+esc(c.name)+'周末 ↗</button><button data-atlas-map="'+esc(c.name)+'">打开城市地图</button>'+(route?'<button data-city-route="'+esc(route.id)+'">预览两日路线</button>':'')+'<a href="'+esc(c.reference)+'" target="_blank" rel="noreferrer">城市资料 ↗</a></div><p class="atlas-city-note">地图可继续查找当地餐饮和住宿；门票、预约、县域交通与营业请在出发前确认。</p>';
}
function cityExplorerHTML(){return '<section id="henan-cities" class="province-atlas" aria-labelledby="cities-title"><div class="editorial-heading"><div><p class="section-kicker">18 DESTINATIONS / EXPLORE HENAN</p><h2 id="cities-title">十八座城，各有一段周末。</h2></div><p>古都、太行、黄河、伏牛与茶乡。<br>先选目的地，再展开具体玩法。</p></div><div class="atlas-discovery"><nav class="atlas-region-tabs" aria-label="按旅行片区选择城市">'+atlasRegions.map(r=>'<button data-atlas-region="'+esc(r)+'" aria-pressed="'+String(atlasRegion===r)+'">'+esc(r)+'</button>').join('')+'</nav><label class="atlas-search"><span class="sr-only">搜索河南城市、县域或景点</span><input id="atlasquery" type="search" maxlength="80" placeholder="搜城市、县域或景点，如宝泉、禹州" value="'+esc(atlasQuery)+'"><span aria-hidden="true">⌕</span></label></div><p id="atlasresults" class="atlas-results" role="status"></p><div id="city-atlas-list" class="city-atlas"></div><article id="atlas-city-detail" class="atlas-city-detail" aria-label="当前城市的周末玩法"></article></section>'}
function renderCityAtlas(){
 const visible=CITY_GUIDES.filter(atlasMatches);if(!visible.some(c=>c.name===atlasCityName)&&visible.length)atlasCityName=visible[0].name;
 $('#city-atlas-list').innerHTML=visible.map(c=>'<button data-atlas-city="'+esc(c.name)+'" aria-pressed="'+String(c.name===atlasCityName)+'"><span class="city-index">'+String(CITY_GUIDES.indexOf(c)+1).padStart(2,'0')+' / '+esc(c.region)+'</span><b>'+esc(c.name)+'</b><small>'+CATALOG.filter(p=>p.city===c.name).length+' 个精选去处</small><span class="city-arrow" aria-hidden="true">↗</span></button>').join('');
 $('#atlasresults').textContent=visible.length?'当前展示 '+visible.length+' / '+CITY_GUIDES.length+' 个目的地 · 点击城市查看玩法':'暂无匹配城市，试试其他城市、县域或景点名称。';
 $('#atlas-city-detail').innerHTML=visible.length?cityDetailHTML(CITY_GUIDES.find(c=>c.name===atlasCityName)):'<p class="atlas-city-intro">可以换个关键词，或选择“全部”片区继续浏览。</p>';
 bindPhotoMedia($('#atlas-city-detail'));
 $('#gallery').querySelectorAll?.('[data-atlas-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.atlasRegion===atlasRegion)));
}
function chooseAtlasCity(name){if(!CITY_GUIDES.some(c=>c.name===name))return;atlasCityName=name;renderCityAtlas();if(globalThis.matchMedia?.('(max-width: 760px)').matches)$('#atlas-city-detail').scrollIntoView?.({behavior:heroReducedMotion()?'instant':'smooth',block:'start'})}
function routeMediaHTML(r,small=false){const cover=r.image?CATALOG.find(p=>p.image===r.image):null;return photoMediaHTML(cover||{...r,image:null,name:r.title,theme:'路线示意 · 未使用实景照片'},{className:'route-type-cover'+(small?' is-small':''),compact:small,alt:r.photoLabel||r.title})}

function renderHeaderCount(){$('#headertripcount').textContent=String(trip.length)}
function initializeMap(attempt=mapAttempt){
  if(attempt!==mapAttempt||map)return;
  try{
    $('#map').innerHTML='';map=new AMap.Map('map',{zoom:8,center:[113.5,34.8],resizeEnable:true});mapConnection='loading';showMapStatus();
    const instance=map;map.on('complete',()=>{if(attempt!==mapAttempt||map!==instance)return;clearTimeout(mapTimer);mapConnection='ready';showMapStatus()});
    mapTimer=setTimeout(()=>{if(attempt!==mapAttempt||map!==instance||mapConnection==='ready')return;mapConnection='slow';showMapStatus()},12000);renderMap();fit();
  }catch{map?.destroy?.();map=null;markers=[];line=null;renderMap();mapConnection='failed';showMapStatus()}
}
function routeDays(preset){return Array.from({length:preset.days},(_,i)=>{const stops=preset.stops.filter(s=>s[1]===i+1).map(s=>CATALOG.find(p=>p.id===s[0])).filter(Boolean);return {day:i+1,city:[...new Set(stops.map(p=>p.city))].join(' / '),names:stops.map(p=>p.name).join('、')}})}
function routePreviewHTML(r){
  const editorial=routeEditorial[r.id]||{title:r.title,theme:r.theme||r.kicker,cities:r.cities||[r.city]},days=routeDays(r),cover=r.image?CATALOG.find(p=>p.image===r.image):null;
  return `        <div class="route-picker"><label for="route-preview-select">选择周末路线<select id="route-preview-select" data-route-select>${PRESETS.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===r.id?'selected':'')+'>'+esc(p.title)+'</option>').join('')}</select></label><span>${PRESETS.length} 条人工精选组合 · 覆盖 ${CITY_GUIDES.length} 个目的地</span></div>
        <nav class="route-switcher" aria-label="预览经典主题路线">${PRESETS.filter(p=>['classic','luoyang','taihang'].includes(p.id)).map(p=>'<button data-feature-route="'+p.id+'" data-route-tab aria-pressed="'+String(p.id===r.id)+'">'+esc(p.title)+'</button>').join('')}</nav>
        <div class="editorial-heading"><div><p class="section-kicker">02 / INSPIRATION · 灵感库</p><h2 id="routes-title">没灵感？先看看，再让 AI 按你的想法排。</h2></div><p>以下 20 条为人工精选路线，仅供找灵感。<br>有想法了，直接让 AI 按你的时间、预算和偏好重新安排。</p></div>
        <div class="gallery-grid">
          <article class="feature-route">
            <div class="feature-media">${routeMediaHTML(r)}<span class="route-number">JOURNEY ${String(PRESETS.indexOf(r)+1).padStart(2,'0')}</span></div>
            <div class="photo-context"><span>${cover?'照片：'+esc(cover.city)+' · '+esc(cover.name):'路线示意 · 未使用实景照片'}</span>${cover?'<button data-photo-place="'+esc(cover.id)+'">照片说明 ↗</button>':''}</div>
            <div class="feature-content"><p class="section-kicker">${esc(editorial.theme)}</p><p class="route-facts">${r.days} 天 · ${r.stops.length} 站 · ${esc(editorial.cities.join(" / "))}</p><h3>${esc(editorial.title)}</h3><p class="feature-subtitle">${esc(r.story||r.subtitle)}</p><details class="route-preview-days"><summary>先看看每天去哪</summary><ol>${days.map(d=>'<li><b>第 '+d.day+' 天 · '+esc(d.city)+'</b><span>'+esc(d.names)+'</span></li>').join('')}</ol><p>${esc(r.note||'示例安排可调整；交通、门票与预约需另行确认。')}</p></details><div class="feature-bottom"><div class="feature-days">${days.map(d=>'<div><b>DAY 0'+d.day+'</b><span>'+esc(d.city)+'</span></div>').join('')}</div><button class="feature-cta" data-start-route="${r.id}">直接用这条路线 <span aria-hidden="true">↗</span></button><button class="feature-ai" data-ai-route="${r.id}">让 AI 按我的条件优化 ↗</button></div></div>
          </article>
          <div class="route-sidebar">${PRESETS.filter(p=>p.id!==r.id&&(p.city===r.city||p.city==='河南'||p.id==='luoyang')).slice(0,2).map(p=>'<button class="side-route" data-feature-route="'+p.id+'"><div class="side-media">'+routeMediaHTML(p,true)+'</div><div class="side-copy"><small>'+esc((routeEditorial[p.id]?.theme||p.theme||p.kicker).split(' / ')[0])+' · '+p.days+' 天 / '+p.stops.length+' 站</small><strong>'+esc(p.title)+' <span aria-hidden="true">↗</span></strong><span>'+esc(p.subtitle)+'</span><em>查看路线 <span aria-hidden="true">→</span></em></div></button>').join('')}</div>
        </div>
`;
}
function previewFeaturedRoute(id){
  const r=PRESETS.find(p=>p.id===id);if(!r)return;
  trackFlow('preset_previewed');
  const position=globalThis.scrollY||0;featuredRouteId=r.id;
  $('#theme-routes').innerHTML=routePreviewHTML(r);bindPhotoMedia($('#theme-routes'));
  $('#theme-routes').querySelector?.('[data-route-tab][aria-pressed="true"]')?.focus?.({preventScroll:true});
  globalThis.scrollTo?.({top:position,behavior:'instant'});
}
function renderGallery(){
  const pendingText=$('#brieftext')?.value||'';
  const r=PRESETS.find(p=>p.id===featuredRouteId)||PRESETS[0];
  const hero=heroPlaces[heroPhotoIndex];
  $('#gallery').innerHTML=`
    <section id="hero-slideshow" class="journey-hero" aria-labelledby="hero-title" aria-roledescription="${heroPhotos.length?'照片轮播':'地点展示'}" data-hero-day="${heroSelectionDay}">
      <div class="hero-grid" aria-hidden="true"></div>
      <p id="hero-daily-label" class="hero-daily-label" data-hero-day="${heroSelectionDay}">每日精选 · ${heroDateString(heroSelectionDay*HERO_DAY_MS-HERO_BEIJING_OFFSET_MS)}（北京时间）</p>
      <button class="hero-album-entry" data-open-album ${albumPlaces.length?'':'hidden disabled'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m3 16 5-5 4 4 3-3 6 6"/><circle cx="16" cy="8" r="2"/></svg>实景相册<span>${albumPlaces.length} 张 · 看完整照片 ↗</span></button>
      <div id="hero-photo-slides">${heroSlidesHTML()}</div>
      <div class="hero-content">
        <p class="hero-eyebrow">HENAN · A WEEKEND AWAY <span class="hero-seal">AI 智游</span></p>
        <h2 id="hero-title">豫见行迹<span>把周末，交给河南。</span></h2>
        <p class="hero-description">走进古都的日常，或去山水间慢下来。<br>从你的时间与预算出发，安排一段刚刚好的旅程。</p>
        <div class="hero-actions"><button class="primary" data-gallery-scroll="weekend-plan">开始规划 <span aria-hidden="true">↗</span></button><button class="hero-secondary" data-gallery-scroll="theme-routes">看看灵感路线 <span aria-hidden="true">↓</span></button><button class="hero-city-entry" data-gallery-scroll="henan-cities">探索河南 ${CITY_GUIDES.length} 城 ↓</button></div>
        <div class="hero-stats" aria-label="站点数据"><div><b>${CITY_GUIDES.length}</b><span>城目的地</span></div><div><b>${CATALOG.length}</b><span>精选去处</span></div><div><b>${albumPlaces.length}</b><span>张实景照片</span></div><div><b>${PRESETS.length}</b><span>条主题路线</span></div></div>
      </div>
      <div class="hero-bottom"><div class="hero-photo-meta"><span id="hero-photo-count">${hero.image?String(heroPhotoIndex+1).padStart(2,'0')+' / '+String(heroPhotos.length).padStart(2,'0'):'实景待补'}</span><div class="hero-photo-info">${hero.image?'<button id="hero-photo-source" data-open-album data-photo-place="'+esc(hero.id)+'" aria-label="'+esc(heroPhotoLabel(hero))+'">'+esc(hero.city+' · '+hero.name)+' ↗</button>':'<span id="hero-photo-source">'+esc(hero.city+' · '+hero.name)+' · 照片占位</span>'}<span id="hero-photo-date">${hero.image?esc(photoDateLabel(hero)):'图形占位 · 尚无实景照片'}</span></div><button id="hero-toggle" data-hero-toggle ${heroPhotos.length>1?'':'hidden disabled'} aria-label="${heroAutoplay?'暂停照片轮播':'播放照片轮播'}" aria-pressed="${String(heroAutoplay)}">${heroAutoplay?'Ⅱ':'▶'}</button></div><div class="hero-gallery-controls" ${heroPhotos.length>1?'':'hidden'}><button class="hero-arrow" data-hero-step="-1" aria-label="上一张照片">←</button><nav id="hero-thumbnails" class="hero-thumbnails" aria-label="选择河南实景照片">${heroThumbnailsHTML()}</nav><button class="hero-arrow" data-hero-step="1" aria-label="下一张照片">→</button></div></div>
    </section>
    <div class="gallery-inner">
      ${weekendPicksHTML()}
      ${cityExplorerHTML()}
      <section class="planning-guide" aria-labelledby="guide-title">
        <div class="guide-intro"><p class="section-kicker">A LITTLE GUIDE</p><h2 id="guide-title">从想法，到出发。</h2><p>不用一次想好全部，跟着三步慢慢安排。</p></div>
        <ol class="guide-steps"><li><span aria-hidden="true">01</span><div><h3>说说你的周末</h3><p>填写时间、预算和喜好，确认旅行条件。</p></div></li><li><span aria-hidden="true">02</span><div><h3>用 AI 的方案</h3><p>看 AI 给的候选安排，确认后载入；也可以先去灵感库找找感觉。</p></div></li><li><span aria-hidden="true">03</span><div><h3>在地图上慢慢调整</h3><p>修改每一站，核对交通与费用，再保存或导出。</p></div></li></ol>
      </section>
      <section id="weekend-plan" class="weekend-plan" aria-label="开始规划周末旅行">
        <div class="editorial-heading"><div><p class="section-kicker">01 / YOUR WEEKEND</p><h2>你的周末，你来定义。</h2></div><p>几天时间，怎样出行，想去哪里。<br>把想法写下来，从一份可调整的安排开始。</p></div>
        ${briefEntryHTML()}
        <div class="planning-demo"><div><strong>还没想好去哪？</strong><span>先看洛阳五个地点怎样分成两天，演示不会修改当前行程。</span></div><button data-try-planning>看看规划示例 <span aria-hidden="true">↗</span></button></div>
      </section>
      <section id="theme-routes" class="theme-routes" aria-labelledby="routes-title">
        ${routePreviewHTML(r)}
      </section>

      <footer class="atlas-footer"><div class="atlas-signature">豫见行迹 <span>HENAN JOURNEY ATLAS</span></div><p>${new Set(CATALOG.map(p=>p.city)).size} 座城市 · ${CATALOG.length} 个精选去处 · 门票与预约请在出发前确认</p><div class="gallery-utility"><button class="try-plan" data-try-planning>体验规划对照 ↗</button><button class="gallery-sources" data-open-sources>资料与照片来源</button></div></footer>
    </div>`;
  if(pendingText)$('#brieftext').value=pendingText;
  renderCityAtlas();
  bindPhotoMedia($('#gallery'));initializeHeroSlideshow();
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
  if(!['gallery','planner','overview','decision'].includes(view))return;
  if(view!=='planner')map?.setStatus?.({resizeEnable:false});
  activeView=view;document.body&&(document.body.dataset.view=view);
  document.querySelectorAll('.view-nav [data-view]').forEach(b=>{b.setAttribute?.('aria-current',b.dataset.view===view?'page':'false')});
  if(view==='gallery')renderGallery();if(view==='overview')renderOverview();if(view==='decision')renderDecision();
  if(view==='planner')revealPlannerMap();
  scheduleHeroRotation();
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
  $('#overview').innerHTML='<div class="folio-heading"><div><div class="eyebrow">YOUR JOURNEY / HENAN</div><h2>'+esc(preset?.title||'我的河南旅程')+'</h2><p>地点、停留和交通分别呈现。确认自己的节奏，再出发。</p></div><div class="folio-actions"><button data-overview-action="edit">继续编辑</button><button data-overview-action="export" '+(!trip.length?'disabled':'')+'>导出行程</button><button data-overview-action="print">打印行程</button><button data-overview-action="check">检查条件</button><button class="primary" data-overview-action="plan" '+(!trip.length?'disabled':'')+'>生成规划对照</button></div></div><div class="folio-metrics"><div class="folio-metric"><small>旅行安排</small><b>'+days+'</b><span>天 / '+trip.length+' 站</span></div><div class="folio-metric"><small>到访城市</small><b>'+cities.length+'</b><span>'+esc(cities.join('、')||'尚未选择')+'</span></div><div class="folio-metric"><small>游览停留合计</small><b>'+Math.round(total/6)/10+'</b><span>小时，不含交通</span></div><div class="folio-metric"><small>已确认交通定位</small><b>'+confirmed+' / '+trip.length+'</b><span>地点</span></div></div>'+(comparisonRecord&&comparisonRecord.afterSnapshot===JSON.stringify(compactDraft())?comparisonHTML(comparisonRecord.before,trip,days):'')+'<div class="folio-days">'+Array.from({length:days},(_,i)=>{
    const items=trip.filter(s=>s.day===i+1),localCities=[...new Set(items.map(s=>s.place.city).filter(Boolean))],cover=items.find(s=>s.place.image)?.place;
    const duration=items.reduce((n,s)=>n+s.duration,0),cached=cachedTraffic(items);
    return '<article class="folio-day"><div class="folio-day-cover">'+photoMediaHTML(cover||{city:localCities[0],name:localCities.join(' / ')||'自由安排',theme:'分日行程'},{className:'folio-cover-photo',compact:true})+'<small>DAY 0'+(i+1)+'</small><h3>'+esc(localCities.join(' / ')||'自由安排')+'</h3><span>'+items.length+' 个地点 · 游览 '+esc(durationLabel(duration))+'</span>'+(cover?'<p class="folio-photo-label">照片：'+esc(cover.city||'河南')+' · '+esc(cover.name)+'</p>':'')+'</div><div class="folio-day-content">'+(items.length?items.map((s,j)=>{
      const leg=cached?.legs[j-1];return (j?'<div class="folio-leg">'+(leg?esc(modeNames[cached.mode])+' · 约 '+Math.ceil(leg.duration/60)+' 分钟':'站间交通待核算')+'</div>':'')+'<div class="folio-stop"><span class="folio-stop-number">'+(j+1)+'</span><div><button data-folio-place="'+esc(s.place.id)+'">'+esc(s.place.name)+'</button><p>'+esc(s.place.theme||labels[s.place.category])+' · 停留 '+esc(durationLabel(s.duration))+'</p>'+(s.place.visitTip?'<p class="folio-tip">'+esc(s.place.visitTip)+'</p>':'')+'</div></div>';
    }).join(''):'<div class="folio-empty">留给下一段旅程。</div>')+'<div class="folio-day-footer">'+(localCities.length>1?'当天跨城，城际交通需另行确认。':cached?'站间耗时来自查询时的高德方案。':'停留时长已列出，交通尚未计入。')+'<button data-edit-day="'+(i+1)+'">在地图上编辑第 '+(i+1)+' 天</button></div></div></article>';
  }).join('')+'</div><div class="folio-proof"><div><b>规划依据</b><br>AI 智能体根据你的条件与工具结果规划；服务不可用时显示规则候选。</div><div><b>交通与资料</b><br>高德实时查询；实景照片、作者和许可可在地点详情与资料说明中查看。</div><div><b>出发前确认</b><br>营业时间、预约和景区内部交通尚未校验，请以官方当日信息为准。</div></div>';bindPhotoMedia($('#overview'));
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
    $('#advice').showModal();$('#keepcurrent').onclick=()=>$('#advice').close();
    $('#apply').onclick=()=>{if(!replayFinished||!$('#advice').open)return;if(lastAdvice.snapshot!==JSON.stringify(compactDraft())){toast('行程已修改，请重新生成规划');$('#advice').close();return}checkpoint();trip=after;lastPlanningSource=lastAdvice.source;decisionState.source=lastAdvice.source;day=scoped||1;renderAll();comparisonRecord={before,afterSnapshot:JSON.stringify(compactDraft())};renderOverview();$('#advice').close();setView('overview');toast('已应用新安排，可查看分日总览或撤销')};
    startAgentReplay($('#advicebody'),{isCurrent:()=>$('#advice').open&&snapshot===JSON.stringify(compactDraft()),onComplete:()=>{replayFinished=true;$('#apply').disabled=false},onCancel:()=>{$('#apply').disabled=true}});
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
$('#gallery').onclick=e=>{const region=e.target.closest('[data-atlas-region]'),atlas=e.target.closest('[data-atlas-city]'),cityBrief=e.target.closest('[data-city-brief]'),cityMap=e.target.closest('[data-atlas-map]'),cityRoute=e.target.closest('[data-city-route]');if(region){atlasRegion=region.dataset.atlasRegion;renderCityAtlas();return}if(atlas){chooseAtlasCity(atlas.dataset.atlasCity);return}if(cityBrief){const c=CITY_GUIDES.find(c=>c.name===cityBrief.dataset.cityBrief);if(c)openBrief(c.name+'周末两天，'+c.tagline);return}if(cityMap){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}setView('planner');selectCity(cityMap.dataset.atlasMap);return}if(cityRoute){previewFeaturedRoute(cityRoute.dataset.cityRoute);$('#theme-routes').scrollIntoView?.({behavior:heroReducedMotion()?'instant':'smooth',block:'start'});return}const pickDetail=e.target.closest('[data-pick-detail]'),pickPlan=e.target.closest('[data-pick-plan]');if(pickDetail){openDetail(CATALOG.find(p=>p.id===pickDetail.dataset.pickDetail));return}if(pickPlan){const p=CATALOG.find(p=>p.id===pickPlan.dataset.pickPlan);if(p)openBrief(pickBrief(p));return}const album=e.target.closest('[data-open-album]');if(album){openPhotoAlbum(album.dataset.photoPlace||heroPlaces[heroPhotoIndex]?.id);return}const heroPhoto=e.target.closest('[data-hero-photo]'),heroStep=e.target.closest('[data-hero-step]');if(heroPhoto){selectHeroPhoto(Number(heroPhoto.dataset.heroPhoto));return}if(heroStep){selectHeroPhoto((heroPhotoIndex+Number(heroStep.dataset.heroStep)+heroPlaces.length)%heroPlaces.length);return}if(e.target.closest('[data-hero-toggle]')){heroAutoplay=!heroAutoplay;updateHeroPhoto();scheduleHeroRotation();return}const photo=e.target.closest('[data-photo-place]');if(photo){openDetail(CATALOG.find(p=>p.id===photo.dataset.photoPlace));return}const jump=e.target.closest('[data-gallery-scroll]');if(jump){const target=document.getElementById(jump.dataset.galleryScroll);target?.scrollIntoView({behavior:globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});if(jump.dataset.galleryScroll==='weekend-plan')$('#brieftext').focus({preventScroll:true});return}const prompt=e.target.closest('[data-brief-example]');if(prompt){$('#brieftext').value=prompt.dataset.briefExample;return}if(e.target.closest('[data-parse-brief]')){openBrief($('#brieftext').value);return}if(e.target.closest('[data-manual-brief]')){openBrief();return}if(e.target.closest('[data-open-sources]')){$('#connect').showModal();return}const example=e.target.closest('[data-try-planning]');if(example){showPlanningExample();return}const aiRoute=e.target.closest('[data-ai-route]');if(aiRoute){const r=PRESETS.find(p=>p.id===aiRoute.dataset.aiRoute);if(r){trackFlow('preset_ai_optimized');const names=r.stops.slice(0,3).map(s=>{const p=CATALOG.find(x=>x.id===s[0]);return p?p.name:''}).filter(Boolean).join('、');openBrief('想去'+names+'，'+r.days+'天，参考「'+r.title+'」的行程思路重新规划')}return}const start=e.target.closest('[data-start-route]'),feature=e.target.closest('[data-feature-route]'),city=e.target.closest('[data-atlas-city]');if(start){if(saveBooting){toast('正在读取已保存行程，请稍后开始规划');return}trackFlow('preset_started');loadPreset(start.dataset.startRoute);setView('planner')}else if(feature){previewFeaturedRoute(feature.dataset.featureRoute)}else if(city){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}setView('planner');selectCity(city.dataset.atlasCity)}};
$('#overview').onclick=e=>{const action=e.target.closest('[data-overview-action]'),edit=e.target.closest('[data-edit-day]'),place=e.target.closest('[data-folio-place]');if(action){if(saveBooting&&action.dataset.overviewAction==='plan'){toast('正在读取已保存行程，请稍后操作');return}if(action.dataset.overviewAction==='check')setView('decision');if(action.dataset.overviewAction==='edit')setView('planner');if(action.dataset.overviewAction==='plan')generate();if(action.dataset.overviewAction==='print')globalThis.print?.();if(action.dataset.overviewAction==='export')$('#export').onclick()}else if(edit){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}day=Number(edit.dataset.editDay);setView('planner');const cities=[...new Set(dayStops().map(s=>s.place.city).filter(Boolean))];selectCity(cities.length===1?cities[0]:'河南');renderTrip();renderMap()}else if(place){if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}setView('planner');focusPlace(trip.find(s=>s.place.id===place.dataset.folioPlace)?.place)}};
document.querySelectorAll('.site-header [data-view]').forEach(button=>button.onclick=e=>{e.preventDefault?.();setView(button.dataset.view)});
renderGallery();renderOverview();renderHeaderCount();

$('#gallery').oninput=e=>{if(e.target.id==='atlasquery'){atlasQuery=e.target.value;renderCityAtlas()}};
$('#gallery').onchange=e=>{if(e.target.matches?.('[data-route-select]'))previewFeaturedRoute(e.target.value)};
