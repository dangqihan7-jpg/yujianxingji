// This entry only opens the existing condition-confirmation flow. The five
// agents still execute in buildCandidate(), after the user confirms conditions.
const AI_HERO_EXAMPLES=[
  '郑州周末2天，想看古都和吃烩面，预算800元',
  '开封1天，带爸妈，节奏慢一点',
  '洛阳2天，想去老君山，自驾，预算600元'
];
const AI_HERO_AGENTS=[
  {name:'需求理解',description:'读懂时间、预算和偏好',icon:'<path d="M5 4h14v12H9l-4 4V4Z"/><path d="M9 8h6M9 12h4"/>'},
  {name:'地点推荐',description:'按条件筛选河南好去处',icon:'<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>'},
  {name:'日程编排',description:'组合分日路线和停留',icon:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16M8 14h3m2 3h3"/>'},
  {name:'交通核算',description:'高德核算交通，未知项待确认',icon:'<path d="M4 5h5v5H4zM15 14h5v5h-5zM9 7h7a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h7"/>'},
  {name:'冲突校验',description:'检查超时、预算与行程冲突',icon:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>'}
];
let aiHeroDraft='',aiHeroBusy=false,aiHeroPlaceholderIndex=0,aiHeroPlaceholderTimer=0;
let aiHeroFocus=null;
const aiHeroElement=id=>document.getElementById?.(id)||document.querySelector?.('#'+id);
const aiHeroReducedMotion=()=>Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
function aiHeroAvailability(){
  if(typeof cfg==='undefined'||typeof cfg.aiConfigured!=='boolean')return '先确认条件，再查看智能体候选行程';
  if(!cfg.aiConfigured)return '当前使用规则规划 · 结果需你确认';
  if(cfg.authMode==='standalone'&&!authUser&&!cfg.publicAiDemo)return '访客可用规则规划 · 登录后使用 AI';
  return 'AI 已连接 · 确认条件后开始协同';
}
function aiPlanningHeroHTML(){
  return `<section id="ai-planning-hero" class="ai-planning-hero" aria-labelledby="ai-planning-title">
    <div class="ai-hero-content">
      <p class="ai-hero-kicker"><span aria-hidden="true"></span>AI WEEKEND PLANNER</p>
      <h1 id="ai-planning-title">一句话，让 AI 为你规划河南周末游</h1>
      <p class="ai-hero-subtitle"><strong>5 个 AI 智能体协同</strong><span>需求理解 → 地点推荐 → 日程编排 → 交通核算 → 冲突校验</span></p>
      <form id="ai-hero-form" aria-label="用一句话开始 AI 规划">
        <div class="ai-hero-input-wrap"><label class="ai-hero-input-label" for="ai-hero-input">说说你的周末想法</label><textarea id="ai-hero-input" name="travel-request" rows="2" maxlength="600" placeholder="${esc(AI_HERO_EXAMPLES[aiHeroPlaceholderIndex])}" aria-describedby="ai-hero-status">${esc(aiHeroDraft)}</textarea></div>
        <div class="ai-hero-form-footer"><p id="ai-hero-status" class="ai-hero-hint" role="status">${esc(aiHeroBusy?'正在识别你的旅行需求…':aiHeroAvailability())}</p><button id="ai-hero-submit" class="primary" type="submit" ${aiHeroBusy?'disabled':''}>${aiHeroBusy?'正在识别需求…':'让 AI 规划'}<span aria-hidden="true">↗</span></button></div>
      </form>
    </div>
    <ol class="ai-hero-agents" aria-label="5 个智能体的能力">${AI_HERO_AGENTS.map((agent,index)=>`<li class="ai-hero-agent" data-ai-agent="${index+1}"><span class="ai-hero-agent-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${agent.icon}</svg></span><div class="ai-hero-agent-copy"><strong>${esc(agent.name)}</strong><span>${esc(agent.description)}</span></div></li>`).join('')}</ol>
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
function refreshAIHeroLifecycle(){scheduleAIHeroPlaceholder()}
function updateAIHeroSubmit(){
  const form=aiHeroElement('ai-hero-form'),button=aiHeroElement('ai-hero-submit'),status=aiHeroElement('ai-hero-status');
  if(form)form.setAttribute?.('aria-busy',String(aiHeroBusy));
  if(button){button.disabled=aiHeroBusy;button.innerHTML=(aiHeroBusy?'正在识别需求…':'让 AI 规划')+'<span aria-hidden="true">↗</span>'}
  if(status)status.textContent=aiHeroBusy?'正在识别你的旅行需求…':aiHeroAvailability();
}
async function submitAIHero(event){
  event?.preventDefault?.();
  const input=aiHeroElement('ai-hero-input');if(!input)return;
  captureAIHeroDraft();const text=aiHeroDraft.trim();
  if(aiHeroBusy||(typeof briefBusy!=='undefined'&&briefBusy))return;
  if(!text){const status=aiHeroElement('ai-hero-status');if(status)status.textContent='先写下时间、预算或想去的地方吧';input.focus?.();scheduleAIHeroPlaceholder();return}
  if(typeof saveBooting!=='undefined'&&saveBooting){if(typeof toast==='function')toast('正在恢复已保存行程，请稍后操作');return}
  aiHeroBusy=true;updateAIHeroSubmit();scheduleAIHeroPlaceholder();
  try{await openBrief(text)}
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
