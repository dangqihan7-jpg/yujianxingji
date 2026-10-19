// Session-only, read-only trip questions. No account fields, images, draft metadata,
// previous messages or credentials are copied into the model's trip context.
const ASK_EXAMPLES=['龙门石窟需要提前预约吗？','第二天中午在开封有啥好吃的？','这两天的交通大概花多少钱？'];
const ASK_REFERENCE='AI 回答仅供参考，出行前请核实';
let askInstalled=false,askHistory=[],askOperation=0,askRequest=null,askPendingEntry=null,askReturnFocus=null,askExampleIndex=0,askExampleTimer=null,askObserver=null,askRefreshQueued=false,askScrollState=null;
const askElement=id=>document.getElementById?.(id)||document.querySelector?.('#'+id);
function askCurrentView(){return document.body?.dataset?.view||(typeof activeView!=='undefined'?activeView:'gallery')}
function askAllowedView(){return ['planner','overview'].includes(askCurrentView())}
function askReducedMotion(){return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)}
function askTripSnapshot(){
  if(typeof saveBooting!=='undefined'&&saveBooting)throw Error('正在恢复已保存行程，请稍后提问');
  const source=typeof currentShareSnapshot==='function'?currentShareSnapshot():typeof createShareSnapshot==='function'&&typeof trip!=='undefined'?createShareSnapshot(trip,Number(askElement('days')?.value)||1):null;
  if(!source||!Array.isArray(source.places)||!source.places.length||!Array.isArray(source.schedule))throw Error('请先加入地点或生成行程，再来提问');
  const local=typeof trip!=='undefined'&&Array.isArray(trip)?trip:[];
  const snapshot={places:source.places.map(name=>String(name)),days:Number(source.days),schedule:source.schedule.map(block=>{
    const candidates=local.filter(stop=>stop.day===block.day),used=new Set();
    return {day:Number(block.day),stops:block.stops.map(stop=>{
      const result={name:String(stop.name),city:String(stop.city||''),duration:Number(stop.duration),travelMinutes:stop.travelMinutes==null?null:Number(stop.travelMinutes)};
      const index=candidates.findIndex((item,i)=>!used.has(i)&&item.place?.name===result.name&&String(item.place?.city||'')===result.city);
      if(index>=0){used.add(index);const place=candidates[index].place;if(typeof place.id==='string')result.id=place.id;if(['scenic','food','stay'].includes(place.category))result.category=place.category}
      return result;
    })};
  })};
  const mode=askElement('travelmode')?.value,start=askElement('start')?.value;
  if(['driving','transit','walking'].includes(mode))snapshot.mode=mode;
  if(/^\d{2}:\d{2}$/.test(start||''))snapshot.start=start;
  return snapshot;
}
function askSnapshotFingerprint(){try{return JSON.stringify(askTripSnapshot())}catch{return null}}
function askDialogHTML(){return `<header class="ask-head"><div><span class="ask-eyebrow">AI TRIP ASSISTANT</span><h2 id="ask-title">问问我的行程</h2></div><button id="ask-close" type="button" aria-label="关闭行程问答">✕</button></header>
  <p id="ask-context" class="ask-context">只读取提问时的行程，不会修改安排。</p><section id="ask-history" class="ask-history" aria-label="本次会话问答"><p id="ask-empty" class="ask-empty">关于选了哪些地点、分日安排或交通，你可以直接问。<span>仅回答当前行程相关问题；不确定的信息会说明。</span></p></section>
  <p id="ask-status" class="ask-status" role="status" aria-live="polite"></p><form id="ask-form" class="ask-form"><label for="ask-question">关于这份行程，你想了解什么？</label><div class="ask-compose"><textarea id="ask-question" rows="2" maxlength="600" placeholder="龙门石窟需要提前预约吗？" enterkeyhint="send"></textarea><button id="ask-send" class="primary" type="submit">发送 <span aria-hidden="true">↗</span></button></div><p class="ask-input-note">Enter 发送 · Shift + Enter 换行 · 最多 600 字</p></form><p id="ask-reference" class="ask-reference">${ASK_REFERENCE}</p>`}
function ensureAskDialog(){
  let dialog=askElement('ask-dialog');if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='ask-dialog';dialog.className='ask-dialog';dialog.setAttribute('aria-labelledby','ask-title');dialog.setAttribute('aria-describedby','ask-context ask-reference');dialog.innerHTML=askDialogHTML();document.body.append(dialog);
  askElement('ask-close').onclick=closeAsk;
  askElement('ask-form').onsubmit=submitAskQuestion;
  const input=askElement('ask-question');
  input.addEventListener('focus',refreshAskPlaceholder);input.addEventListener('blur',refreshAskPlaceholder);input.addEventListener('input',refreshAskUI);
  input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();void submitAskQuestion()}});
  dialog.addEventListener('cancel',finishAskClose);
  dialog.addEventListener('close',()=>{if(!dialog.open)finishAskClose()});
  renderAskHistory();return dialog;
}
function finishAskClose(){
  cancelAskRequest('提问已取消，你可以重新发送。');stopAskPlaceholder();
  if(askScrollState){document.body.style.overflow=askScrollState.body;document.documentElement.style.overflow=askScrollState.root;askScrollState=null}
  const target=askReturnFocus;askReturnFocus=null;if(target?.isConnected&&askAllowedView())target.focus?.({preventScroll:true});
}
function closeAsk(){const dialog=askElement('ask-dialog');if(!dialog?.open)return;dialog.close();finishAskClose()}
function stopAskPlaceholder(){if(askExampleTimer!==null)clearTimeout(askExampleTimer);askExampleTimer=null}
function refreshAskPlaceholder(){
  stopAskPlaceholder();const input=askElement('ask-question'),dialog=askElement('ask-dialog');
  if(!input||!dialog?.open||!askAllowedView()||document.hidden||input.value||document.activeElement===input||askRequest||askReducedMotion())return;
  askExampleTimer=setTimeout(()=>{askExampleTimer=null;askExampleIndex=(askExampleIndex+1)%ASK_EXAMPLES.length;input.placeholder=ASK_EXAMPLES[askExampleIndex];refreshAskPlaceholder()},5000);
}
function askSetStatus(message,state='idle'){const element=askElement('ask-status');if(element){if(element.textContent!==message)element.textContent=message;if(element.dataset.state!==state)element.dataset.state=state}}
function renderAskHistory(){
  const history=askElement('ask-history');if(!history)return;
  const empty=askElement('ask-empty');if(empty)empty.hidden=askHistory.length>0;
  for(const entry of askHistory){
    if(!entry.element){
      const article=document.createElement('article');article.className='ask-exchange';
      const question=document.createElement('p');question.className='ask-user-question';question.textContent=entry.question;article.append(question);
      const answer=document.createElement('p');answer.className='ask-answer';article.append(answer);
      const note=document.createElement('p');note.className='ask-answer-note';article.append(note);
      entry.element=article;entry.answerElement=answer;entry.noteElement=note;history.append(article);
    }
    entry.element.dataset.state=entry.state;entry.answerElement.textContent=entry.answer||entry.message||'AI 正在回答…';
    entry.noteElement.textContent=entry.state==='answered'?'基于提问时行程 · '+ASK_REFERENCE:entry.state==='pending'?'基于提问时行程 · 处理中':'基于提问时行程 · 未获得回答';
  }
  history.scrollTop=history.scrollHeight;
}
function cancelAskRequest(message){
  if(!askRequest)return;
  askOperation++;askRequest.abort();askRequest=null;
  if(askPendingEntry){askPendingEntry.state='cancelled';askPendingEntry.message=message;askPendingEntry=null;renderAskHistory()}
  const send=askElement('ask-send');if(send){send.disabled=false;send.textContent='发送 ↗'}
  askElement('ask-dialog')?.setAttribute('aria-busy','false');askSetStatus(message);refreshAskPlaceholder();
}
function refreshAskUI(){
  const button=askElement('ask-launcher');if(button){button.hidden=!askAllowedView();button.setAttribute('aria-expanded',String(Boolean(askElement('ask-dialog')?.open)))}
  const dialog=askElement('ask-dialog');if(!dialog?.open)return;
  if(!askAllowedView()){closeAsk();return}
  let snapshot,error;try{snapshot=askTripSnapshot()}catch(e){error=e.message||'请先加入地点或生成行程，再来提问'}
  if(askRequest&&JSON.stringify(snapshot)!==askPendingEntry?.fingerprint){cancelAskRequest('行程已修改，本次提问已取消。请针对最新行程重新发送。')}
  const context=askElement('ask-context'),copy=snapshot?`${snapshot.days} 天 · ${snapshot.schedule.reduce((sum,block)=>sum+block.stops.length,0)} 站 · 只读取提问时的行程，不会修改安排。`:error;
  if(context&&context.textContent!==copy)context.textContent=copy;
  const send=askElement('ask-send');if(send)send.disabled=Boolean(askRequest||error||!askElement('ask-question')?.value.trim());
  refreshAskPlaceholder();
}
function queueAskRefresh(){if(askRefreshQueued)return;askRefreshQueued=true;Promise.resolve().then(()=>{askRefreshQueued=false;refreshAskUI()})}
function openAsk(){
  if(!askAllowedView())return;
  const dialog=ensureAskDialog();if(dialog.open)return;
  // Native close events can be queued after a very quick reopen. Finish the old
  // lifecycle before saving new scroll state or accepting another request.
  if(askScrollState||askRequest)finishAskClose();
  askReturnFocus=document.activeElement;
  askScrollState={body:document.body.style.overflow,root:document.documentElement.style.overflow};
  document.body.style.overflow='hidden';document.documentElement.style.overflow='hidden';
  askSetStatus('本次会话问答仅保留在此页面，刷新后清空。');dialog.showModal();refreshAskUI();askElement('ask-question').focus?.({preventScroll:true});
}
function askErrorMessage(status,result){
  if(status===429)return typeof result?.error==='string'&&result.error.length<220?result.error:'今天的行程问答次数已用完，请明天再试';
  if(status===503&&(result?.code==='ASK_NOT_CONFIGURED'||/尚未配置/.test(result?.error||'')))return '行程问答服务尚未配置，请稍后再试';
  if(status===503||status>=500)return '行程问答服务暂时不可用，请稍后重试';
  if(status===413)return '行程内容过大，请精简行程后再提问';
  return typeof result?.error==='string'&&result.error.length<220?result.error:'暂时无法回答，请稍后重试';
}
async function submitAskQuestion(event){
  event?.preventDefault?.();const dialog=askElement('ask-dialog'),input=askElement('ask-question');if(!dialog?.open||!askAllowedView()||askRequest)return;
  const question=input.value.trim();if(!question){askSetStatus('请输入与这份行程相关的问题。','error');input.focus?.();return}
  if(question.length>600){askSetStatus('问题最多 600 字，请精简后再发送。','error');return}
  let snapshot;try{snapshot=askTripSnapshot()}catch(error){askSetStatus(error.message,'error');refreshAskUI();return}
  if(location.protocol==='file:'){askSetStatus('离线页面无法使用行程问答，请打开在线网站。','error');return}
  const fingerprint=JSON.stringify(snapshot),controller=new AbortController(),operation=++askOperation;
  const entry={question,fingerprint,state:'pending',answer:'',message:''};askHistory.push(entry);askPendingEntry=entry;askRequest=controller;input.value='';renderAskHistory();
  askSetStatus('AI 正在回答…','loading');dialog.setAttribute('aria-busy','true');askElement('ask-send').textContent='回答中…';refreshAskUI();
  try{
    const response=await fetch('/api/ask',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({question,trip:snapshot}),signal:controller.signal});
    let result;try{result=await response.json()}catch{throw Error('行程问答服务暂时不可用，请稍后重试')}
    if(operation!==askOperation||!dialog.open)return;
    if(fingerprint!==askSnapshotFingerprint()){cancelAskRequest('行程已修改，本次提问已取消。请针对最新行程重新发送。');return}
    if(!response.ok)throw Error(askErrorMessage(response.status,result));
    if(typeof result?.answer!=='string'||!result.answer.trim()||result.answer.length>12000)throw Error('暂时没有收到有效回答，请换个行程相关问题重试');
    entry.answer=result.answer.trim();entry.state='answered';renderAskHistory();askSetStatus('已回答。你可以继续询问当前行程。','success');
  }catch(error){
    if(operation!==askOperation||!dialog.open||error.name==='AbortError')return;
    entry.state='error';entry.message=error instanceof TypeError?'网络暂时不可用，请稍后重试':error.message||'暂时无法回答，请稍后重试';renderAskHistory();askSetStatus(entry.message,'error');
  }finally{if(operation===askOperation){askRequest=null;askPendingEntry=null;dialog.setAttribute('aria-busy','false');askElement('ask-send').textContent='发送 ↗';refreshAskUI()}}
}
function installAskUI(){
  if(askInstalled||!document.body?.append||typeof document.createElement!=='function')return;askInstalled=true;
  const button=document.createElement('button');button.id='ask-launcher';button.className='ask-launcher';button.type='button';button.setAttribute('aria-label','打开 AI 行程问答');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','ask-dialog');button.setAttribute('aria-expanded','false');
  const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent='💬';button.append(icon);const label=document.createElement('span');label.textContent='问 AI';button.append(label);button.onclick=openAsk;document.body.append(button);
  const clearance=document.createElement('div');clearance.className='ask-dock-clearance';clearance.setAttribute('aria-hidden','true');document.body.append(clearance);
  document.addEventListener?.('visibilitychange',refreshAskPlaceholder);document.addEventListener?.('change',queueAskRefresh);document.addEventListener?.('input',queueAskRefresh);
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change',refreshAskPlaceholder);
  if(typeof MutationObserver==='function'){askObserver=new MutationObserver(queueAskRefresh);askObserver.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-view']})}
  globalThis.addEventListener?.('pagehide',()=>{cancelAskRequest('页面已离开，本次提问已取消。');stopAskPlaceholder()});refreshAskUI();
}
