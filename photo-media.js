/* Shared photo treatment. A graphic placeholder is never presented as a real photo. */
function photoEscape(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function photoTheme(place){const themes={郑州:'zhengzhou',洛阳:'luoyang',开封:'kaifeng',焦作:'jiaozuo',安阳:'anyang',鹤壁:'hebi',新乡:'xinxiang',濮阳:'puyang',许昌:'xuchang',漯河:'luohe',三门峡:'sanmenxia',平顶山:'pingdingshan',南阳:'nanyang',商丘:'shangqiu',信阳:'xinyang',周口:'zhoukou',驻马店:'zhumadian',济源:'jiyuan'};return Object.hasOwn(themes,place?.city)?themes[place.city]:'henan'}
function photoDateLabel(place){const year=String(place?.photoYear??'');return place?.photoTakenAt?'拍摄于 '+place.photoTakenAt:/^\d{4}$/.test(year)?'拍摄于 '+year+' 年':'拍摄日期未注明'}
function photoImageURL(value){const url=String(value||'').trim();if(/^\/assets\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp|gif)(?:\?[^\s<>]*)?$/i.test(url))return url;if(/^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(url))return url;try{const parsed=new URL(url);return ['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password&&!/[\u0000-\u001f\\]/.test(url)?parsed.href:''}catch{return ''}}
function photoPlaceholderHTML(place={},options={}){
  const categories={scenic:'景点',food:'美食',stay:'住宿'},category=Object.hasOwn(categories,place.category)?categories[place.category]:'旅行地点';
  return '<span class="photo-placeholder'+(options.compact?' is-compact':'')+'" data-photo-placeholder data-photo-theme="'+photoTheme(place)+'"'+(options.hidden?' hidden':'')+'><span class="photo-placeholder-label">'+(options.failed?'加载失败 · 照片占位':options.loading?'照片加载中 · 照片占位':'实景待补 · 照片占位')+'</span><span class="photo-placeholder-city">'+photoEscape(place.city||'河南')+' / HENAN</span><strong class="photo-placeholder-name">'+photoEscape(place.name||'旅行地点')+'</strong><span class="photo-placeholder-tag">'+photoEscape(category+(place.theme&&place.theme!==category?' · '+place.theme:''))+'</span></span>';
}
function photoMediaHTML(place={},options={}){
  const source=photoImageURL(place.image),className=String(options.className||'').replace(/[^\w -]/g,'');
  return '<span class="photo-media'+(className?' '+className:'')+(options.compact?' is-compact':'')+'" data-photo-media data-photo-theme="'+photoTheme(place)+'">'+(source?'<img data-photo-image'+(options.imageId?' id="'+photoEscape(options.imageId)+'"':'')+' src="'+photoEscape(source)+'" alt="'+photoEscape(options.alt??place.photoCaption??((place.city?place.city+' · ':'')+(place.name||'地点')+'实景照片'))+'" loading="'+(options.loading==='eager'?'eager':'lazy')+'"'+(['high','low','auto'].includes(options.fetchpriority)?' fetchpriority="'+options.fetchpriority+'"':'')+'>':'')+photoPlaceholderHTML(place,{compact:options.compact,hidden:Boolean(source)})+'</span>';
}
function bindPhotoMedia(root){
  root?.querySelectorAll?.('[data-photo-image]').forEach(image=>{
    const media=image.closest?.('[data-photo-media]')||image.parentElement,placeholder=media?.querySelector?.('[data-photo-placeholder]'),source=image.getAttribute?.('src');
    if(!media||!placeholder)return;
    const current=()=>media.querySelector?.('[data-photo-image]')===image&&image.getAttribute?.('src')===source;
    const show=failed=>{if(!current())return;image.hidden=failed;placeholder.hidden=!failed;media.classList.toggle('photo-failed',failed);const label=placeholder.querySelector?.('.photo-placeholder-label');if(label)label.textContent='加载失败 · 照片占位'};
    image.onerror=()=>show(true);image.onload=()=>show(false);
    // Cached images may finish before their newly rendered event handlers are bound.
    if(image.complete&&source)show(!image.naturalWidth);
  });
}
