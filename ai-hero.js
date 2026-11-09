// This entry only opens the existing condition-confirmation flow, now as the
// homepage's nested plan layer. The five agents still execute in
// buildCandidate(), after the user confirms conditions.
const AI_HERO_EXAMPLES=[
  '郑州周末2天，想看古都和吃烩面，预算800元',
  '开封1天，带爸妈，节奏慢一点',
  '洛阳2天，想去老君山，自驾，预算600元'
];
let aiHeroDraft='',aiHeroBusy=false,aiHeroPlaceholderIndex=0,aiHeroPlaceholderTimer=0;
let aiHeroFocus=null;
// 首页首屏封面：热门第 1 名（接 /api/popular，由 showcase.js 写入）；
// 没热门数据时为 null，回落到现有日期轮换选景。
let aiHeroCoverPlace=null;
function setAIHeroCoverPlace(place){aiHeroCoverPlace=place&&place.id?place:null}
const aiHeroElement=id=>document.getElementById?.(id)||document.querySelector?.('#'+id);
const aiHeroReducedMotion=()=>Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
function aiHeroAvailability(){
  if(typeof cfg==='undefined'||typeof cfg.aiConfigured!=='boolean')return '先确认条件，再查看智能体候选行程';
  if(!cfg.aiConfigured)return '当前使用规则规划 · 结果需你确认';
  if(cfg.authMode==='standalone'&&!authUser&&!cfg.publicAiDemo)return '访客可用规则规划 · 登录后使用 AI';
  return 'AI 服务已配置 · 确认条件后开始协同';
}
// Choose only a real catalogue photograph. This is a cover crop, never a new
// generated picture; the original photograph and its licence remain reachable.
function aiHeroScenery(){
  const catalogue=typeof CATALOG!=='undefined'&&Array.isArray(CATALOG)?CATALOG:[];
  const daily=typeof heroPlaces!=='undefined'&&Array.isArray(heroPlaces)?heroPlaces:[];
  const usable=place=>Boolean(place?.image&&/^https:\/\//i.test(place.photoReference||'')&&/^https:\/\//i.test(place.licenseUrl||'')&&/^\/assets\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)(?:\?[^\s<>]*)?$/i.test(place.image));
  if(aiHeroCoverPlace&&usable(aiHeroCoverPlace))return aiHeroCoverPlace;
  const landscapes=['hn-baoquan','hn-laojunshan','hn-yuntai','hn-wanxianshan','hn-wangwu','hn-nanwan'];
  const dailyLandscape=landscapes.map(id=>daily.find(place=>place.id===id&&usable(place))).find(Boolean);
  // Cultural landmarks stay in the daily album, while this cover keeps a
  // landscape composition even on dates whose selected group has no mountains.
  return dailyLandscape||['hn-laojunshan','hn-baoquan','hn-yuntai','hn-wanxianshan','hn-wangwu','hn-nanwan'].map(id=>catalogue.find(place=>place.id===id&&usable(place))).find(Boolean)||null;
}
function aiHeroBackdropHTML(place=aiHeroScenery()){
  return place&&typeof photoMediaHTML==='function'?photoMediaHTML(place,{loading:'eager',fetchpriority:'high',alt:''}):'<span class="ai-hero-scenery-placeholder">河南实景照片待补充</span>';
}
function aiHeroCreditHTML(place=aiHeroScenery()){
  if(!place)return '<span class="ai-hero-photo-empty">图形背景 · 未使用实景照片</span>';
  const date=typeof photoDateLabel==='function'?photoDateLabel(place):/^\d{4}$/.test(String(place.photoYear||''))?'拍摄于 '+place.photoYear+' 年':'拍摄日期未注明';
  // Links come from the curated catalogue, but still reject executable schemes.
  const safeLink=value=>/^https:\/\//i.test(String(value||''))?String(value):'';
  const reference=safeLink(place.photoReference),license=safeLink(place.licenseUrl);
  return '<span class="ai-hero-photo-location"><span aria-hidden="true">⌖</span> '+esc(place.city+' · '+place.name)+'</span><span class="ai-hero-photo-date">'+esc(date)+'</span>'+(reference?'<a href="'+esc(reference)+'" target="_blank" rel="noreferrer">实景出处 ↗</a>':'')+(license?'<a href="'+esc(license)+'" target="_blank" rel="noreferrer">许可 ↗</a>':'');
}
function refreshAIHeroScenery(){
  const backdrop=aiHeroElement('ai-hero-backdrop'),credit=aiHeroElement('ai-hero-photo-credit');
  if(!backdrop||!credit)return;
  const place=aiHeroScenery(),key=place?.id||'placeholder';
  if(backdrop.dataset?.place===key)return;
  backdrop.innerHTML=aiHeroBackdropHTML(place);if(backdrop.dataset)backdrop.dataset.place=key;
  credit.innerHTML=aiHeroCreditHTML(place);
  if(typeof bindPhotoMedia==='function')bindPhotoMedia(backdrop);
}
function aiPlanningHeroHTML(){
  return `<section id="ai-planning-hero" class="ai-planning-hero" aria-labelledby="ai-planning-title">
    <div id="ai-hero-backdrop" class="ai-hero-backdrop" aria-hidden="true" data-place="${esc(aiHeroScenery()?.id||'placeholder')}">${aiHeroBackdropHTML()}</div>
    <div class="ai-hero-content">
      <div class="ai-hero-intro">
      <div class="ai-hero-eyebrow"><p class="ai-hero-kicker"><span aria-hidden="true"></span>AI WEEKEND PLANNER</p></div>
      <h1 id="ai-planning-title">周末去河南，一句话就出发。</h1>
      <p class="ai-hero-lead">不用想好全部，写个城市也行，剩下的智能体问你。</p>
      </div>
      <form id="ai-hero-form" aria-label="用一句话开始 AI 规划">
        <div class="ai-hero-compose-heading"><span class="ai-hero-compose-symbol" aria-hidden="true">✦</span><div><p>从这里，出发</p><span>写下时间、预算和你想去的地方</span></div><span class="ai-hero-compose-label" aria-hidden="true">YOUR WEEKEND</span></div>
        <div class="ai-hero-input-wrap"><label class="ai-hero-input-label" for="ai-hero-input">说说你的周末想法</label><textarea id="ai-hero-input" name="travel-request" rows="2" maxlength="600" placeholder="${esc(AI_HERO_EXAMPLES[aiHeroPlaceholderIndex])}" aria-describedby="ai-hero-status">${esc(aiHeroDraft)}</textarea>${typeof sttHeroControlsHTML==='function'?sttHeroControlsHTML():''}</div>
        <div class="ai-hero-form-footer"><p id="ai-hero-status" class="ai-hero-hint" role="status">${esc(aiHeroBusy?'正在识别你的旅行需求…':aiHeroAvailability())}</p><button id="ai-hero-submit" class="primary" type="submit" ${aiHeroBusy?'disabled':''}>${aiHeroBusy?'正在识别需求…':'开始规划'}<span aria-hidden="true">↗</span></button></div>
      </form>
      <nav class="ai-hero-links" aria-label="首页次要入口"><button type="button" class="ai-hero-link" data-home-popular>看看热门 <span aria-hidden="true">↓</span></button><button type="button" class="ai-hero-link" data-home-spots>景点 <span aria-hidden="true">↗</span></button></nav>
    </div>
    <div id="ai-hero-photo-credit" class="ai-hero-photo-credit" aria-label="背景实景照片信息">${aiHeroCreditHTML()}</div>
  </section>`;
}
function captureAIHeroDraft(){
  const input=aiHeroElement('ai-hero-input');
  aiHeroFocus=null;
  if(!input||typeof input.value!=='string')return;
  aiHeroDraft=input.value;
  if(document.activeElement===input&&!document.hidden&&!aiHeroBusy&&typeof activeView!=='undefined'&&activeView==='gallery'&&!document.querySelector?.('dialog[open]')){
    aiHeroFocus={start:input.selectionStart,end:input.selectionEnd,direction:input.selectionDirection};
  }
}
function aiHeroCanRotate(){
  const input=aiHeroElement('ai-hero-input');
  return Boolean(input&&input.isConnected!==false&&typeof input.value==='string'&&!input.value&&!aiHeroBusy&&typeof activeView!=='undefined'&&activeView==='gallery'&&!document.hidden&&document.activeElement!==input&&!document.querySelector?.('dialog[open]')&&!aiHeroReducedMotion());
}
function scheduleAIHeroPlaceholder(){
  clearTimeout(aiHeroPlaceholderTimer);aiHeroPlaceholderTimer=0;
  if(!aiHeroCanRotate())return;
  aiHeroPlaceholderTimer=setTimeout(()=>{
    aiHeroPlaceholderTimer=0;
    if(!aiHeroCanRotate())return;
    aiHeroPlaceholderIndex=(aiHeroPlaceholderIndex+1)%AI_HERO_EXAMPLES.length;
    const input=aiHeroElement('ai-hero-input');if(input)input.placeholder=AI_HERO_EXAMPLES[aiHeroPlaceholderIndex];
    scheduleAIHeroPlaceholder();
  },5000);
}
function refreshAIHeroLifecycle(){scheduleAIHeroPlaceholder();refreshAIHeroScenery()}
function updateAIHeroSubmit(){
  const form=aiHeroElement('ai-hero-form'),button=aiHeroElement('ai-hero-submit'),status=aiHeroElement('ai-hero-status');
  if(form)form.setAttribute?.('aria-busy',String(aiHeroBusy));
  if(button){button.disabled=aiHeroBusy;button.innerHTML=(aiHeroBusy?'正在识别需求…':'开始规划')+'<span aria-hidden="true">↗</span>'}
  if(status)status.textContent=aiHeroBusy?'正在识别你的旅行需求…':aiHeroAvailability();
  if(typeof refreshSTTHero==='function')refreshSTTHero();
}
async function submitAIHero(event){
  event?.preventDefault?.();
  if(typeof cancelSTTHero==='function')cancelSTTHero();
  const input=aiHeroElement('ai-hero-input');if(!input)return;
  captureAIHeroDraft();const text=aiHeroDraft.trim();
  if(aiHeroBusy||(typeof briefBusy!=='undefined'&&briefBusy))return;
  if(!text){const status=aiHeroElement('ai-hero-status');if(status)status.textContent='先写下时间、预算或想去的地方吧';input.focus?.();scheduleAIHeroPlaceholder();return}
  if(typeof saveBooting!=='undefined'&&saveBooting){if(typeof toast==='function')toast('正在恢复已保存行程，请稍后操作');return}
  aiHeroBusy=true;updateAIHeroSubmit();scheduleAIHeroPlaceholder();
  try{await (typeof openBriefLayer==='function'?openBriefLayer(text):openBrief(text))}
  catch(error){if(typeof toast==='function')toast(error.message||'暂时无法开始规划，请重试')}
  finally{aiHeroBusy=false;updateAIHeroSubmit();scheduleAIHeroPlaceholder()}
}
function bindAIPlanningHero(){
  const form=aiHeroElement('ai-hero-form'),input=aiHeroElement('ai-hero-input');if(!form||!input)return;
  input.value=aiHeroDraft;form.onsubmit=submitAIHero;
  input.oninput=()=>{captureAIHeroDraft();if(!aiHeroBusy){const status=aiHeroElement('ai-hero-status');if(status)status.textContent=aiHeroAvailability()}scheduleAIHeroPlaceholder()};
  input.onfocus=scheduleAIHeroPlaceholder;input.onblur=scheduleAIHeroPlaceholder;
  // Enter remains a normal textarea newline, including Chinese IME composition.
  updateAIHeroSubmit();scheduleAIHeroPlaceholder();
  if(typeof bindSTTHero==='function')bindSTTHero();
  const focus=aiHeroFocus;aiHeroFocus=null;
  if(focus&&!aiHeroBusy&&!document.hidden&&activeView==='gallery'&&!document.querySelector?.('dialog[open]')){
    input.focus?.({preventScroll:true});
    if(Number.isInteger(focus.start)&&Number.isInteger(focus.end))input.setSelectionRange?.(focus.start,focus.end,focus.direction||'none');
  }
}
document.addEventListener?.('visibilitychange',refreshAIHeroLifecycle);
document.addEventListener?.('close',refreshAIHeroLifecycle,true);
document.addEventListener?.('toggle',refreshAIHeroLifecycle,true);
globalThis.addEventListener?.('pageshow',refreshAIHeroLifecycle);
globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change',refreshAIHeroLifecycle);
// Dialog open/close is also observed for browsers without dialog toggle events.
if(typeof MutationObserver==='function'&&document.body){
  const aiHeroDialogObserver=new MutationObserver(refreshAIHeroLifecycle);
  aiHeroDialogObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
}
