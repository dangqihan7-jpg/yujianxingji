let briefResult=null,briefSnapshot='',briefBusy=false,studyTimer=null,briefGeneration=0,briefAgentRequest=null;
/* trackFlow 定义在 showcase.js；decision.js 被单独测试时用空实现兜底 */
function trackFlowSafe(event){if(typeof trackFlow==='function')trackFlow(event)}
const agentReplays=new Map();
const agentSourceLabels={ai:'AI 生成',rules:'规则回退',confirmed:'已确认条件'};
function agentSourceLabel(source){return Object.hasOwn(agentSourceLabels,source)?agentSourceLabels[source]:''}
function agentExecutionHeading(result){const sources=(result.agents||[]).map(a=>a.source);return sources.includes('ai')||result.source==='ai'||result.source==='agent-ai'?'智能体的实际执行记录':'本次规则候选的执行记录'}
function agentStepHTML(step,replay=false){
 const status=['completed','pending','conflict'].includes(step.status)?step.status:'pending';
 const source=agentSourceLabel(step.source);
 return '<p data-agent-step'+(replay?' hidden':'')+'><span class="agent-step-state '+status+'">'+({completed:'✓ 已完成',pending:'待确认',conflict:'有冲突'}[status])+'</span><span class="agent-step-copy">'+esc(step.label)+(source?'<small class="agent-step-source" data-agent-source="'+esc(step.source)+'">'+esc(source)+'</small>':'')+'</span></p>';
}
function agentTimelineHTML(result){
 const timeline=Array.isArray(result.timeline)?result.timeline.filter(s=>s&&typeof s.name==='string'):[];
 if(!timeline.length)return '';
 const duration=s=>s.durationMs==null?'—':s.durationMs<1000?s.durationMs+' 毫秒':(Math.round(s.durationMs/100)/10)+' 秒';
 const overall={ 'agent-ai':'AI','agent-mixed':'混合（模型+规则）','agent-rules':'规则','ai':'AI'}[result.source]||'规则';
 return '<div class="agent-timeline" aria-label="AI 思考过程时间线"><h4>AI 思考过程</h4><ol>'+timeline.map(s=>'<li data-timeline-step="'+esc(s.key)+'" data-timeline-status="'+esc(s.status)+'"><span class="agent-timeline-state '+(s.status==='completed'?'done':s.status==='skipped'?'skipped':'pending')+'">'+(s.status==='completed'?'✓':s.status==='skipped'?'—':'·')+'</span><span class="agent-timeline-copy"><b>'+esc(s.name)+'</b><small>'+esc(s.detail||'')+'</small></span><span class="agent-timeline-meta">'+esc(({ai:'AI 生成',mixed:'混合',rules:'规则回退',confirmed:'已确认条件'})[s.source]||'')+' · '+esc(duration(s))+'</span></li>').join('')+'</ol><p class="agent-timeline-source">本次来源：'+esc(overall)+'。耗时为服务端各步骤实际用时；回退步骤未触发时不计耗时。</p><div class="learning-signals" data-learning-signals role="status">正在汇总复盘信号…</div></div>';
}
// 闭环改革二期：演示模式。演示复盘只存在 demo_reviews，与真实复盘隔离；
// 开关与会话 id 存在 sessionStorage（键名 yujianxingji.demoSession / yujianxingji.demoOn，
// 会话 id 形如 demo_<随机>）。关闭只关开关、不自动清数据，清空必须点按钮。
const DEMO_SESSION_KEY='yujianxingji.demoSession';
const DEMO_ON_KEY='yujianxingji.demoOn';
function demoSessionId(){try{let id=sessionStorage.getItem(DEMO_SESSION_KEY);if(!id||!/^[A-Za-z0-9_-]{1,64}$/.test(id)){id='demo_'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);sessionStorage.setItem(DEMO_SESSION_KEY,id)}return id}catch{return 'demo_fallback'}}
function demoOn(){try{return sessionStorage.getItem(DEMO_ON_KEY)==='1'}catch{return false}}
function updateDemoControl(){const box=document.querySelector('[data-demo-mode]');if(!box)return;const on=demoOn();const state=box.querySelector('[data-demo-state]');if(state)state.textContent=on?'已开启':'已关闭';const toggle=box.querySelector('[data-demo-toggle]');if(toggle)toggle.textContent=on?'关闭演示模式':'开启演示模式'}
async function toggleDemo(){const on=!demoOn();try{if(on){const data=await api('/api/demo/reviews/seed',{sessionId:demoSessionId()});sessionStorage.setItem(DEMO_ON_KEY,'1');updateDemoControl();toast(data.seeded?'演示模式已开启，已造 '+data.count+' 条模拟复盘。':'演示模式已开启，本次会话已有 '+data.count+' 条模拟复盘。')}else{sessionStorage.setItem(DEMO_ON_KEY,'0');updateDemoControl();toast('演示模式已关闭，演示数据已保留；要点“一键清空演示数据”才会删除。')}if(typeof refreshPopularHero==='function')refreshPopularHero()}catch(e){toast(e.message||'演示模式切换失败')}}
async function clearDemoData(){try{const data=await api('/api/demo/reviews/clear',{sessionId:demoSessionId()});updateDemoControl();toast('已清空 '+data.cleared+' 条演示复盘与 '+data.addsCleared+' 组演示加入数，真实复盘不受影响。');if(typeof refreshPopularHero==='function')refreshPopularHero()}catch(e){toast(e.message||'清空演示数据失败')}}
// 闭环改革二期：宿舍拼团最小版。建团、加入/更新偏好、发起人定冲突、生成拼团行程。
// 生成后展示拼团行程候选，“应用拼团行程”复用 buildCandidate 里的载入流程
// （/api/validate 校验 + applyDraft 载入）。地点偏好在对话框里按名字输入，用逗号分隔。
let currentGroupId=null,currentGroupDetail=null,groupPlanResult=null;
function groupPlaceNames(ids){return (ids||[]).map(id=>CATALOG.find(p=>p.id===id)?.name||id)}
function groupIdsFromNames(value){
 const names=String(value||'').split(/[,，、\n]/).map(s=>s.trim()).filter(Boolean);
 const ids=[],unknown=[];
 for(const name of names){const place=CATALOG.find(p=>p.name===name);if(place)ids.push(place.id);else unknown.push(name)}
 return {ids:[...new Set(ids)],unknown};
}
function groupPlanCity(detail){
 const cities=[...new Set((detail?.merged?.requiredIds||[]).map(id=>CATALOG.find(p=>p.id===id)?.city).filter(Boolean))];
 return cities.length===1?cities[0]:'河南';
}
async function openGroup(){
 try{
  const data=await api('/api/groups');
  currentGroupId=null;currentGroupDetail=null;groupPlanResult=null;
  renderGroupList(data.groups||[]);
  if(!$('#group').open)$('#group').showModal();
 }catch(e){toast(e.message||'拼团暂不可用');if(e.status===401&&typeof openAuth==='function')openAuth('login')}
}
function renderGroupList(groups){
 const body=$('#groupbody');if(!body)return;
 body.innerHTML='<p class="instruction">和宿舍一起拼一趟周末游：建团后各自填必去、排除和预算，发起人定冲突，再生成一趟拼团行程。</p><div class="group-create"><label>团名<input id="groupname" type="text" maxlength="40" placeholder="例如：302 宿舍洛阳周末游"></label><label>人数上限<select id="groupmax">'+[2,3,4,5,6,7,8].map(n=>'<option value="'+n+'" '+(n===6?'selected':'')+'>'+n+' 人</option>').join('')+'</select></label><button class="primary" data-group-create>建团</button></div>'+(groups.length?'<div class="group-list">'+groups.map(g=>'<article class="group-item"><div><strong>'+esc(g.name)+'</strong><span>'+esc(g.creatorName||g.creatorId)+' 发起 · '+g.memberCount+'/'+g.maxMembers+' 人</span></div><button data-group-open="'+esc(g.id)+'">查看</button></article>').join('')+'</div>':'<p>还没有拼团，先建一个。</p>');
}
async function submitGroupCreate(){
 const name=$('#groupname')?.value||'';
 const maxMembers=Number($('#groupmax')?.value||6);
 try{
  const data=await api('/api/groups',{name,maxMembers});
  toast('已建团：'+data.group.name);
  await openGroupDetail(data.group.id);
 }catch(e){toast(e.message||'建团失败')}
}
async function openGroupDetail(id){
 try{
  const data=await api('/api/groups/'+encodeURIComponent(id));
  currentGroupId=id;currentGroupDetail=data;groupPlanResult=null;
  renderGroupDetail(data);
  if(!$('#group').open)$('#group').showModal();
 }catch(e){toast(e.message||'拼团暂不可用')}
}
function renderGroupDetail(data){
 const body=$('#groupbody');if(!body)return;
 const group=data.group,isMember=Array.isArray(data.members),me=data.me||null;
 const isCreator=typeof authUser!=='undefined'&&authUser?authUser.id===group.creatorId:true;
 let html='<button class="quiet" data-group-back>← 全部拼团</button><h3>'+esc(group.name)+'</h3><p class="group-meta">'+esc(group.creatorName||group.creatorId)+' 发起 · '+group.memberCount+'/'+group.maxMembers+' 人</p>';
 if(!isMember){
  html+='<p class="instruction">你还不是成员，只能看到团名、成员数与发起人。加入后才能看到成员偏好。</p>';
 }else{
  html+='<div class="group-members"><h4>成员（'+data.members.length+' 人）</h4><ul>'+data.members.map(m=>'<li><b>'+esc(m.username)+'</b><span>必去：'+esc(groupPlaceNames(m.requiredIds).join('、')||'未填')+'；排除：'+esc(groupPlaceNames(m.excludedIds).join('、')||'未填')+'；预算：'+(m.budget!=null?'¥'+m.budget:'未填')+'</span></li>').join('')+'</ul></div>';
  const merged=data.merged;
  html+='<div class="group-merged"><h4>合并偏好</h4><p>必去（并集）：'+esc(groupPlaceNames(merged.requiredIds).join('、')||'无')+'</p><p>排除（并集）：'+esc(groupPlaceNames(merged.excludedIds).join('、')||'无')+'</p><p>预算目标：'+(merged.budget!=null?'¥'+merged.budget+'（取成员所填最小值）':'未填')+(merged.spread?' · 成员预算 ¥'+merged.spread.min+'–¥'+merged.spread.max:'')+'</p></div>';
  if(data.conflicts?.length){
   html+='<div class="group-conflicts"><h4>冲突清单（'+data.conflicts.length+' 处）</h4>'+data.conflicts.map(c=>'<p class="conflict-text">'+esc(c.name)+'：'+esc(c.requiredBy.join('、')||'—')+' 想去，'+esc(c.excludedBy.join('、')||'—')+' 排除</p>').join('')+'<p>只有发起人能在生成时逐项定夺：必去还是排除。</p></div>';
  }else html+='<p>暂无冲突，可以直接生成拼团行程。</p>';
 }
 html+='<div class="group-join"><h4>'+(me?'更新我的偏好':'加入拼团')+'</h4><label>必去地点（名字，逗号分隔）<input id="grouprequired" type="text" maxlength="500" placeholder="例如：龙门石窟、白马寺" value="'+esc(groupPlaceNames(me?.requiredIds).join('、'))+'"></label><label>排除地点（名字，逗号分隔）<input id="groupexcluded" type="text" maxlength="500" placeholder="例如：西工小街" value="'+esc(groupPlaceNames(me?.excludedIds).join('、'))+'"></label><label>人均预算（元，可留空）<input id="groupbudget" type="number" min="0" max="100000" step="1" placeholder="可留空" value="'+(me?.budget??'')+'"></label><button class="primary" data-group-join>'+(me?'更新偏好':'加入拼团')+'</button></div>';
 if(isMember){
  html+='<div class="group-plan"><h4>生成拼团行程</h4><label>目的地<select id="groupcity">'+selectOptions(DECISION_CITIES.map(v=>[v,v==='河南'?'河南多城':v]),groupPlanCity(data))+'</select></label><label>旅行天数<select id="groupdays">'+selectOptions([1,2,3,4,5,7].map(v=>[v,v+' 天']),2)+'</select></label><label>出行方式<select id="groupmode">'+selectOptions(Object.entries(modeNames),'driving')+'</select></label><label>每天时长上限<select id="grouphours">'+selectOptions([6,8,10].map(v=>[v,v+' 小时']),8)+'</select></label><label>每天休息预留<select id="grouprest">'+selectOptions([[0,'不预留'],[30,'30 分钟'],[60,'60 分钟']],30)+'</select></label>';
  if(data.conflicts?.length&&isCreator){
   html+='<div class="group-resolutions"><h4>发起人定夺冲突</h4>'+data.conflicts.map(c=>'<fieldset><legend>'+esc(c.name)+'</legend><label><input type="radio" name="group-resolution-'+esc(c.placeId)+'" value="required">必去（'+esc(c.requiredBy.join('、'))+'）</label><label><input type="radio" name="group-resolution-'+esc(c.placeId)+'" value="excluded">排除（'+esc(c.excludedBy.join('、')||'无人排除')+'）</label></fieldset>').join('')+'</div>';
  }
  html+='<button class="primary" data-group-plan>生成拼团行程</button>'+(isCreator?'':'<p class="group-plan-note">只有发起人能生成拼团行程。</p>')+'</div><div id="groupplan"></div>';
 }
 body.innerHTML=html;
}
async function submitGroupJoin(){
 if(!currentGroupId)return;
 const required=groupIdsFromNames($('#grouprequired')?.value),excluded=groupIdsFromNames($('#groupexcluded')?.value);
 const unknown=[...required.unknown,...excluded.unknown];
 if(unknown.length){toast('以下地点不在目录里：'+unknown.join('、'));return}
 const budgetRaw=$('#groupbudget')?.value;
 const budget=budgetRaw==null||budgetRaw==='' ?null:Number(budgetRaw);
 if(budget!=null&&(!Number.isFinite(budget)||budget<0||budget>100000)){toast('预算需要为 0–100000 的数字');return}
 try{
  await api('/api/groups/'+encodeURIComponent(currentGroupId)+'/join',{requiredIds:required.ids,excludedIds:excluded.ids,budget});
  toast('偏好已保存');
  await openGroupDetail(currentGroupId);
 }catch(e){toast(e.message||'加入拼团失败')}
}
async function submitGroupPlan(){
 if(!currentGroupId)return;
 const resolutions={};
 for(const input of ($('#groupbody').querySelectorAll('input[type="radio"]:checked')||[])){
  const name=input.name||'';
  if(name.startsWith('group-resolution-'))resolutions[name.slice('group-resolution-'.length)]=input.value;
 }
 const body={city:$('#groupcity')?.value,days:Number($('#groupdays')?.value),mode:$('#groupmode')?.value,maxHours:Number($('#grouphours')?.value),restMinutes:Number($('#grouprest')?.value),resolutions};
 try{
  const result=await api('/api/groups/'+encodeURIComponent(currentGroupId)+'/plan',body);
  groupPlanResult=result;
  renderGroupPlan(result);
 }catch(e){
  if(e.status===409)toast('有冲突待发起人定夺，请逐项选择必去或排除');
  else if(e.status===403)toast('只有发起人能生成拼团行程');
  else toast(e.message||'生成拼团行程失败');
 }
}
function renderGroupPlan(result){
 const box=$('#groupplan');if(!box)return;
 const candidate={...result.draft,decision:{...result.draft.decision,records:decisionState.records,intent:result.draft.decision.intent}};
 const audit=result.audit||auditDecision(candidate);
 box.innerHTML='<div class="candidate-preview"><span class="source-chip">拼团行程 · '+esc(result.group.members.join('、'))+'</span>'+agentResultHTML(result)+'<h3>候选地点与分日</h3><p>宿舍拼团行程：已合并全部成员的必去地点，冲突由发起人定夺。</p><div class="candidate-days">'+Array.from({length:result.draft.days},(_,i)=>'<p><b>第 '+(i+1)+' 天</b> '+esc(candidate.stops.filter(s=>s.day===i+1).map(s=>s.place.name).join('、')||'自由安排')+'</p>').join('')+'</div>'+agentRationaleHTML(result)+auditHTML(audit)+'<button class="primary" id="applygroupplan">应用拼团行程</button></div>';
 refreshLearningSignals(box);
 $('#applygroupplan').onclick=applyGroupPlan;
}
async function applyGroupPlan(){
 if(!groupPlanResult)return;
 const apply=$('#applygroupplan');if(!apply||apply.disabled)return;
 apply.disabled=true;
 try{
  const result=groupPlanResult;
  const candidate={...result.draft,decision:{...result.draft.decision,records:decisionState.records,intent:result.draft.decision.intent}};
  const validated=await api('/api/validate',candidate);
  validateDecisionState(candidate.decision,validated.stops);
  checkpoint();
  candidate.decision.source=result.source;lastPlanningSource=result.source;
  const applied=await applyDraft(candidate,validated);
  if(!applied)throw Error('行程已变化，本次载入未应用');
  $('#group').close();setView('decision');trackFlowSafe('ai_plan_applied');toast('拼团行程已载入，预算和交通仍需核对');
 }catch(e){toast(e.message||'应用拼团行程失败')}
 finally{if(apply)apply.disabled=false}
}
// 闭环改革一期：v3 学习最小版（演示）。只在规划结果页展示一行提示，不改排序。
async function refreshLearningSignals(root){
 const boxes=[...(root?.querySelectorAll?.('[data-learning-signals]')||[])];
 if(!boxes.length)return;
 const demo=demoOn()?demoSessionId():null;
 let data;
 try{data=await api('/api/learning-signals'+(demo?'?demo='+encodeURIComponent(demo):''))}catch{data=null}
 const prefix=demo?'演示模式 · 以下含演示数据：':'';
 const text=!data?prefix+'复盘信号暂不可用。':!data.signals?.length?prefix+'学习版：暂无复盘信号——至少 2 名用户标过同一类地点“值得多待”后才会加权；加权只在信号出现后生效。':prefix+data.signals.map(s=>'学习版：'+s.hint+'（'+s.users+' 名用户复盘，含'+s.places.join('、')+'）'+(s.demo?'（演示数据）':'')).join('；')+'。生成行程时这类地点小幅加权（+1，仅影响同分候选顺序），可在需求确认里关闭。';
 for(const box of boxes)box.textContent=text;
}
// 闭环改革二期：v3 学习加权的原因行。写清“因为复盘里 N 个人觉得这类地方值得多待，所以排前了”。
function learningAppliedHTML(result){
 const applied=result.learningApplied;
 if(!applied)return '';
 if(!applied.enabled)return '<p class="learning-applied" data-learning-applied>复盘学习已关闭，本次未应用加权。</p>';
 if(!applied.applied?.length)return '<p class="learning-applied" data-learning-applied>学习版：本次暂无复盘信号，未应用加权。</p>';
 const parts=applied.applied.map(a=>'因为复盘里 '+a.users+' 个人觉得'+a.label+'类地方值得多待，所以这类地点在候选里排前了'+(a.demo?'（演示数据）':''));
 return '<p class="learning-applied" data-learning-applied>学习版：'+parts.join('；')+'（加权 +1，仅影响同分候选顺序）。</p>';
}
function agentResultHTML(result,{replay=false}={}){
 const agent=result.agent;if(!agent)return '';
 const steps=Array.isArray(agent.steps)?agent.steps.filter(s=>s&&typeof s.label==='string'):[],final=replay?' data-agent-final hidden':'';
 const demoApplied=Array.isArray(result.learningApplied?.applied)&&result.learningApplied.applied.some(a=>a.demo);
 return '<section class="agent-result" aria-label="智能体规划依据"><h3>'+agentExecutionHeading(result)+'</h3>'+(replay?'<p class="agent-replay-caption">结果已返回，按实际执行顺序回放。</p><p class="agent-replay-status" data-agent-replay-status role="status" aria-live="polite" aria-atomic="true">'+(steps.length?'逐条展示返回的执行记录。':'本次未返回执行步骤。')+'</p><button class="quiet agent-replay-skip" data-agent-replay-skip>直接查看结果</button>':'')+'<div class="agent-steps">'+steps.map((s,index)=>agentStepHTML({...s,source:s.source||result.agents?.[index]?.source},replay)).join('')+'</div>'+agentTimelineHTML(result)+(demoApplied?'<p class="demo-banner" data-demo-banner>演示模式 · 以下含演示数据</p>':'')+learningAppliedHTML(result)+'<div'+final+'>'+(result.summary?'<p>'+esc(result.summary)+'</p>':'')+(result.reasons?.length?'<ul class="agent-reasons">'+result.reasons.map(r=>'<li><b>'+esc((result.draft?.stops||[]).find(s=>s.place.id===r.id)?.place.name||r.id)+'</b> '+esc(r.reason)+'</li>').join('')+'</ul>':'')+(result.pending?.length?'<p class="agent-pending">智能体提醒：'+esc(result.pending.join('；'))+'</p>':'')+(result.transport?.length?'<p class="agent-transport">'+result.transport.map(t=>'第 '+t.day+' 天：'+(t.status==='queried'?'高德站间交通约 '+t.minutes+' 分钟，查询于 '+new Date(t.queriedAt).toLocaleTimeString('zh-CN'):t.note)).map(esc).join('；')+'</p>':'')+'<small>本次模型调用 '+agent.modelCalls+' 次，工具调用 '+agent.toolCalls+' 次。生成结果经你确认后才载入。</small></div></section>';
}
function cancelAgentReplay(root){agentReplays.get(root)?.cancel()}
function agentSourceChip(result){
 const s=result.source;
 if(s==='agent-ai')return esc(result.provider||'模型')+'五智能体规划';
 if(s==='agent-mixed')return '混合五智能体规划（模型+规则）';
 if(s==='agent-rules')return '规则五智能体规划';
 return result.source==='ai'?esc(result.provider||'模型')+'智能体规划':'规则候选';
}
function agentPipelineHTML(result){
 const agents=Array.isArray(result.agents)?result.agents:[];
 if(!agents.length)return '';
 const label=a=>agentSourceLabel(a.source)+(a.source==='ai'&&a.provider?' · '+esc(a.provider):'');
 return '<ul class="agent-pipeline">'+agents.map(a=>'<li><b>'+esc(a.name)+'智能体</b><span>'+label(a)+'</span></li>').join('')+'</ul>';
}
function agentRationaleHTML(result){
 const list=Array.isArray(result.rationale)?result.rationale:[];
 if(!list.length)return '';
 return '<h3 class="agent-rationale-title">决策依据</h3><ul class="agent-rationale">'+list.map(x=>'<li><b>'+esc(x.decision)+'</b><span>'+esc(x.reason)+'</span></li>').join('')+'</ul>';
}
function startAgentReplay(root,{isCurrent=()=>true,onComplete=()=>{},onCancel=()=>{}}={}){
 cancelAgentReplay(root);
 const rows=[...(root?.querySelectorAll?.('[data-agent-step]')||[])],finals=[...(root?.querySelectorAll?.('[data-agent-final]')||[])],status=root?.querySelector?.('[data-agent-replay-status]'),skip=root?.querySelector?.('[data-agent-replay-skip]');
 let timer=null,index=0,done=false,cancelled=false;
 const valid=()=>{try{return !cancelled&&root?.isConnected!==false&&isCurrent()}catch{return false}};
 function cleanup(){if(timer!==null)clearTimeout(timer);timer=null;if(skip){skip.hidden=true;skip.onclick=null}if(agentReplays.get(root)===control)agentReplays.delete(root)}
 function cancel(){if(done||cancelled)return;cancelled=true;cleanup();if(status)status.textContent='本次执行记录回放已停止。';onCancel()}
 function finish(){if(done||cancelled)return;if(!valid()){cancel();return}done=true;cleanup();finals.forEach(node=>node.hidden=false);if(status)status.textContent=rows.length?'执行记录已全部展示，候选尚未应用。':'本次未返回执行步骤，候选尚未应用。';onComplete()}
 function showAll(){if(done||cancelled)return;if(!valid()){cancel();return}rows.forEach(row=>row.hidden=false);index=rows.length;finish()}
 function advance(){if(done||cancelled)return;if(!valid()){cancel();return}const row=rows[index++];row.hidden=false;row.classList?.add('agent-step-reveal');if(status)status.textContent='执行记录回放：'+row.textContent.trim();if(index===rows.length)finish();else timer=setTimeout(advance,480)}
 const control={skip:showAll,cancel};agentReplays.set(root,control);if(skip)skip.onclick=showAll;
 // The interval is presentation pacing, never measured tool execution time.
 if(!rows.length||globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)showAll();else advance();
 if(valid())root?.scrollIntoView?.({block:'start',behavior:'instant'});
 return control;
}
function cancelBriefCandidate(){
 briefGeneration++;briefAgentRequest?.abort();briefAgentRequest=null;const preview=$('#candidatepreview'),body=$('#briefbody');cancelAgentReplay(preview);if(preview)preview.innerHTML='';if(body)body.inert=false;
 const button=$('#buildcandidate');if(button){button.disabled=false;button.textContent='让智能体生成行程'}
}
const expenseNames={tickets:'门票',food:'餐饮',lodging:'住宿',transport:'全部交通',other:'其他费用'};
function briefEntryHTML(){return '<div class="brief-entry"><div><span class="eyebrow">PLAN YOUR WEEKEND</span><h3>让 AI 安排你的河南周末</h3><p>告诉智能体时间、预算与偏好，确认条件后由 AI 选点、查资料和安排行程。</p></div><div class="brief-compose"><label class="sr-only" for="brieftext">描述旅行需求</label><textarea id="brieftext" maxlength="600" rows="2" placeholder="例如：洛阳周末两天，人均预算300元，只坐公交，想看博物馆，每天6小时，不跨城"></textarea><div class="brief-compose-actions"><span>'+ (cfg.aiConfigured?(cfg.authMode==='standalone'&&!authUser&&!cfg.publicAiDemo?'访客可体验规则规划 · 登录后由 AI 智能体规划':'AI 智能体已连接 · 选点、调用工具、检查行程'):'规则规划可直接使用')+'</span><button class="quiet" data-manual-brief>手动填写条件</button><button class="primary" data-parse-brief>开始 AI 规划</button></div><div class="brief-examples"><button data-brief-example="洛阳周末两天，人均预算300元，只坐公交，想看博物馆，每天6小时，不跨城">洛阳公交慢游</button><button data-brief-example="开封两天，打车，想看古城和吃美食，每天8小时，预算500元">开封文化与美食</button><button data-brief-example="新乡两天，自驾，想去宝泉看山水，每天8小时">新乡宝泉山水</button><button data-brief-example="许昌两天，想去胖东来和曹魏古城，每天6小时">许昌商贸与夜游</button><button data-brief-example="信阳两天，自驾，想看南湾湖和茶园，每天8小时">信阳湖山茶乡</button></div><div class="demo-mode" data-demo-mode><span>演示模式：<b data-demo-state>'+(demoOn()?'已开启':'已关闭')+'</b></span><button class="quiet" data-demo-toggle>'+(demoOn()?'关闭演示模式':'开启演示模式')+'</button><button class="quiet" data-demo-clear>一键清空演示数据</button><small>开启后造一套模拟复盘：2 人觉得景点值得多待、1 人觉得美食值得多待，另 1 单含实际花费与超时站；另造 8 个地点的模拟加入数，首页轮播按热门分排，全程标演示数据。演示数据只存本次会话，不影响真实复盘；关闭只关开关，不自动清空。</small></div><div class="group-entry"><button class="quiet" data-open-group>宿舍拼团</button><small>和宿舍一起拼一趟周末游：建团、合偏好、发起人定冲突后生成拼团行程。</small></div></div></div>'}
function intentSummary(intent){return [intent.city||'目的地未限定',intent.days?intent.days+' 天':'天数未指定',intent.mode?modeNames[intent.mode]:'交通方式未指定',intent.budget!=null?'人均目标 ¥'+intent.budget:'预算待填',intent.avoidCrossCity?'不跨城':null].filter(Boolean).join(' · ')}
function selectOptions(values,current){return values.map(([value,label])=>'<option value="'+value+'" '+(String(value)===String(current)?'selected':'')+'>'+label+'</option>').join('')}
function currentAudit(){const d=compactDraft(),traffic=[];for(let i=1;i<=d.days;i++){const list=trip.filter(s=>s.day===i),t=cachedTraffic(list);if(t&&(!t.queriedAt||Date.now()-t.queriedAt<1800000))traffic.push({day:i,minutes:t.legs.reduce((n,l)=>n+Math.ceil(l.duration/60),0),queriedAt:t.queriedAt})}return auditDecision(d,traffic)}
function auditHTML(report,{actions=true}={}){return '<div class="audit-heading"><span class="check-state '+report.status+'">'+({checked:'已检查的条件内无冲突',pending:'还有条件待确认',conflict:'发现行程冲突'}[report.status])+'</span><p>'+report.conflicts+' 项冲突 · '+report.pending+' 项待确认。这里只检查已提供的条件，预约、营业与景区道路需另行确认。</p>'+report.missingRequired.map(p=>'<p class="conflict-text">必去地点尚未加入：'+esc(p.name)+'</p>').join('')+report.excludedPresent.map(p=>'<p class="conflict-text">已排除地点仍在行程中：'+esc(p.name)+'</p>').join('')+(report.modeConflict?'<p class="conflict-text">当前出行方式与排除条件冲突</p>':'')+'</div><div class="audit-days">'+report.daily.map(d=>'<article class="audit-day"><div><strong>DAY '+String(d.day).padStart(2,'0')+' · '+esc(d.cities.join(' / ')||'自由安排')+'</strong><span class="check-state '+d.status+'">'+({checked:'时长已检查',pending:'待确认',conflict:'有冲突',empty:'未安排'}[d.status])+'</span></div><p>'+d.stops+' 站 · 游览 '+durationLabel(d.visit)+' · '+(d.travel!=null?'交通约 '+durationLabel(d.travel):d.stops<2?'无需站间交通':'交通未知')+'</p>'+d.conflicts.map(x=>'<p class="conflict-text">'+esc(x)+'</p>').join('')+d.pending.map(x=>'<p class="pending-text">'+esc(x)+'</p>').join('')+(actions?'<div class="audit-actions"><button data-scope-plan="'+d.day+'" '+(!d.stops?'disabled':'')+'>只重排这一天</button><button data-audit-traffic="'+d.day+'" '+(d.stops<2?'disabled':'')+'>核算交通</button></div>':'')+'</article>').join('')+'</div>'}
function renderDecision(){
 const panel=$('#decision');if(!panel)return;const report=currentAudit(),intent=decisionState.intent,records=decisionState.records;
 panel.innerHTML='<div class="decision-heading"><div><div class="eyebrow">CHECK BEFORE YOU GO</div><h2>条件明确，旅程才好调整</h2><p>'+esc(intentSummary(intent))+'</p></div><div class="decision-heading-actions"><button data-decision-action="conditions">修改条件</button><button class="primary" data-decision-action="plan" '+(!trip.length?'disabled':'')+'>重新分日</button></div></div><div class="decision-layout"><div class="decision-main">'+auditHTML(report)+'<p class="traffic-age-note">交通缓存仅在本次页面中保留，超过 30 分钟后需重新查询。</p></div><aside class="decision-side"><section class="decision-block"><h3>保留某站的日期</h3><p>已预约的地点可固定日期。重新分日不会移动它，手动改日期仍由你决定。</p><div class="lock-list">'+(trip.length?trip.map(s=>'<label><input type="checkbox" data-lock-day="'+esc(s.place.id)+'" '+(s.lockedDay?'checked':'')+'><span>'+esc(s.place.name)+'<small>第 '+s.day+' 天 · '+durationLabel(s.duration)+'</small></span></label>').join(''):'<p>先选择旅行地点。</p>')+'</div></section><section class="decision-block"><h3>人均预算核对</h3><p>填写整趟旅行的个人预估费用。空白表示未知；无需支出的项目请明确填 0。</p><div class="expense-grid">'+Object.entries(expenseNames).map(([key,label])=>'<label>'+label+'<span>¥ <input type="number" data-expense="'+key+'" min="0" max="100000" step="0.01" inputmode="decimal" placeholder="待填" value="'+(decisionState.expenses[key]??'')+'"></span></label>').join('')+'</div><div class="budget-result '+report.budget.status+'"><b>已填费用 ¥'+report.budget.subtotal.toFixed(2)+'</b><span>'+(report.budget.target==null?'人均目标尚未设置':report.budget.subtotal>report.budget.target?'已填金额超出目标 ¥'+(report.budget.subtotal-report.budget.target).toFixed(2):report.budget.missing.length?'尚有 '+report.budget.missing.length+' 类费用未知':'填写金额在 ¥'+report.budget.target+' 目标内')+'</span></div></section></aside></div><section class="study-section"><div class="study-heading"><div><h3>留下一次真实体验</h3><p>记录实际操作时长、修改次数和反馈，用于后续验证。当前账号已有 '+records.length+' 次记录。</p></div><button data-decision-action="export-records" '+(!records.length?'disabled':'')+'>导出体验记录</button></div>'+(activeStudy?'<div class="study-live"><b id="studyelapsed">已体验 '+Math.floor((Date.now()-activeStudy.startedAt)/1000)+' 秒</b><span>编辑操作 '+activeStudy.edits+' 次</span><button class="quiet" data-decision-action="cancel-study">取消本次记录</button></div><div class="study-fields"><label>体验评分<select id="studyrating">'+selectOptions([[1,'1 分 · 很难完成'],[2,'2 分'],[3,'3 分'],[4,'4 分'],[5,'5 分 · 容易完成']],activeStudy.rating??4)+'</select></label><label>原先方法用时（可选，分钟）<input id="baseline" type="number" value="'+esc(activeStudy.baseline||'')+'" min="0.1" max="1440" step="0.1" placeholder="本人实测后填写"></label><label class="study-feedback">哪里有用，哪里仍难用？<textarea id="studyfeedback" maxlength="500" rows="3" placeholder="填写你的实际体验">'+esc(activeStudy.feedback||'')+'</textarea></label></div><button class="primary" data-decision-action="finish-study">结束体验并保存记录</button>':'<div class="study-start"><label for="studytask">本次任务<input id="studytask" maxlength="200" value="安排洛阳两日游，检查每天时长并调整一处地点"></label><button class="primary" data-decision-action="start-study">开始计时体验</button></div>')+'<p class="study-note">评分与原先方法用时由体验者填写，不自动推断效率提升；未完成的体验不计入记录。</p>'+(records.length?'<div class="study-records">'+records.slice(-3).reverse().map(r=>'<article><strong>'+esc(r.task)+'</strong><span>'+new Date(r.endedAt).toLocaleString('zh-CN')+' · '+r.elapsedSeconds+' 秒 · '+r.edits+' 次修改 · '+r.rating+'/5 分</span><p>'+esc(r.feedback||'未填写文字反馈')+'</p></article>').join('')+'</div>':'')+'</section>';
}
function renderBrief(fields,unresolved=[],source='manual',provider=''){
 cancelBriefCandidate();
 const f=validateIntent(fields),availableModes=Object.entries(modeNames).filter(([v])=>!f.excludedModes.includes(v)),preferredMode=f.mode||(!f.excludedModes.includes($('#travelmode').value)?$('#travelmode').value:availableModes[0]?.[0]);$('#briefbody').innerHTML='<span class="source-chip">'+(source==='ai'?esc(provider||'模型')+'需求提取':source==='rules'?'文字规则识别':'手动确认旅行条件')+'</span><p class="instruction">以下条件可修改。每天时长包括游览、休息和已核算的交通；预算为个人目标，不代表已查询到真实价格。</p>'+(unresolved.length?'<ul class="brief-unresolved">'+unresolved.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'')+'<div class="brief-fields"><label>目的地<select id="briefcity">'+selectOptions(DECISION_CITIES.map(v=>[v,v==='河南'?'河南多城':v]),f.city||$('#city').value)+'</select></label><label>旅行天数<select id="briefdays">'+selectOptions([1,2,3,4,5,7].map(v=>[v,v+' 天']),f.days||$('#days').value)+'</select></label><label>出行方式<select id="briefmode">'+selectOptions(availableModes,preferredMode)+'</select></label><label>每天时长上限<select id="briefhours">'+selectOptions([6,8,10].map(v=>[v,v+' 小时']),f.maxHours||$('#maxhours').value)+'</select></label><label>每天休息预留<select id="briefrest">'+selectOptions([[0,'不预留'],[30,'30 分钟'],[60,'60 分钟']],f.restMinutes??$('#restmins').value)+'</select></label><label>人均目标预算<input id="briefbudget" type="number" min="0" max="100000" step="1" placeholder="可留空" value="'+(f.budget??'')+'"></label></div><fieldset class="brief-interests"><legend>想体验什么</legend>'+[['culture','文化与博物馆'],['nature','山水与自然'],['food','地方美食'],['immersive','沉浸演艺'],['family','亲子乐园']].map(([v,label])=>'<label><input type="checkbox" data-interest="'+v+'" '+(f.interests.includes(v)?'checked':'')+'>'+label+'</label>').join('')+'</fieldset><label class="brief-cross"><input id="briefcross" type="checkbox" '+(f.avoidCrossCity?'checked':'')+'>每天避免跨城</label>'+'<fieldset class="brief-place-conditions"><legend>地点条件（可取消勾选）</legend>'+f.requiredIds.map(id=>'<label><input type="checkbox" data-required-id="'+esc(id)+'" checked>必去：'+esc(CATALOG.find(p=>p.id===id)?.name||id)+'</label>').join('')+f.excludedIds.map(id=>'<label><input type="checkbox" data-excluded-id="'+esc(id)+'" checked>排除：'+esc(CATALOG.find(p=>p.id===id)?.name||id)+'</label>').join('')+(!f.requiredIds.length&&!f.excludedIds.length?'<p>没有识别到明确地点条件，可以在地图里继续选点。</p>':'')+'</fieldset>'+'<fieldset class="brief-place-conditions"><legend>不使用的交通方式（可修改）</legend>'+Object.entries(modeNames).map(([v,label])=>'<label><input type="checkbox" data-excluded-mode="'+v+'" '+(f.excludedModes.includes(v)?'checked':'')+'>'+esc(label)+'</label>').join('')+'</fieldset>'+'<label class="brief-learning"><input type="checkbox" id="brieflearning" checked>应用复盘学习（学习版）：复盘里多人觉得值得多待的地点类型，在候选里小幅加权（+1，仅影响同分候选顺序）</label><div class="brief-confirm-actions"><button id="applyconditions">把条件应用到当前行程</button><button class="primary" id="buildcandidate">让智能体生成行程</button></div><div id="candidatepreview"></div>';
 $('#applyconditions').onclick=()=>{try{if(!guardBrief())return;const intent=readBrief();ensureDayCount(intent.days);checkpoint();decisionState.intent=intent;$('#days').value=String(intent.days);$('#city').value=intent.city;$('#travelmode').value=intent.mode;$('#maxhours').value=String(intent.maxHours);$('#restmins').value=String(intent.restMinutes);trip.forEach(s=>{s.day=Math.min(s.day,intent.days);if(s.lockedDay)s.lockedDay=s.day});day=Math.min(day,intent.days);renderAll();search();$('#brief').close();setView('decision');toast('条件已应用，原地点保留，请查看冲突检查')}catch(e){toast(e.message)}};
 $('#buildcandidate').onclick=buildCandidate;
}
function readBrief(){if($('#briefbody').querySelectorAll('[data-excluded-mode]:checked').length===3)throw Error('请至少保留一种出行方式');const intent=validateIntent({city:$('#briefcity').value,days:Number($('#briefdays').value),mode:$('#briefmode').value,maxHours:Number($('#briefhours').value),restMinutes:Number($('#briefrest').value),budget:$('#briefbudget').value===''?null:Number($('#briefbudget').value),avoidCrossCity:$('#briefcross').checked,interests:[...$('#briefbody').querySelectorAll('[data-interest]:checked')].map(e=>e.dataset.interest),requiredIds:[...$('#briefbody').querySelectorAll('[data-required-id]:checked')].map(e=>e.dataset.requiredId),excludedIds:[...$('#briefbody').querySelectorAll('[data-excluded-id]:checked')].map(e=>e.dataset.excludedId),excludedModes:[...$('#briefbody').querySelectorAll('[data-excluded-mode]:checked')].map(e=>e.dataset.excludedMode)});intent.learning=$('#brieflearning')?.checked!==false;return intent}
function guardBrief(){if(saveBooting||briefSnapshot!==JSON.stringify(compactDraft())){toast('当前行程已改变，请重新确认需求');return false}return true}
async function openBrief(input=''){
 if(saveBooting){toast('正在恢复已保存行程，请稍后操作');return}if(briefBusy)return;cancelBriefCandidate();briefBusy=true;const trigger=$('#gallery [data-parse-brief]');if(input&&trigger){trigger.disabled=true;trigger.textContent='正在识别…'}briefSnapshot=JSON.stringify(compactDraft());
 try{briefResult=input?await api('/api/intent',{text:input}):{source:'manual',fields:decisionState.intent,unresolved:[]};if(!guardBrief())return;renderBrief(briefResult.fields,[...(briefResult.unresolved||[]),...(briefResult.fallback?['模型回退原因：'+briefResult.fallback.reason]:[])],briefResult.source,briefResult.provider);$('#brief').showModal();trackFlowSafe('ai_brief_opened');}
 catch(e){toast(e.message)}finally{briefBusy=false;if(trigger){trigger.disabled=false;trigger.textContent='开始 AI 规划'}}
}
function candidateStops(intent){
 const mentioned=intent.requiredIds.map(id=>CATALOG.find(p=>p.id===id)).filter(p=>p&&!intent.excludedIds.includes(p.id)),pool=CATALOG.filter(p=>p.planningEligible!==false&&!intent.excludedIds.includes(p.id)&&(intent.city==='河南'||p.city===intent.city)),score=p=>intent.interests.reduce((n,t)=>n+(p.interests?.includes(t)||t==='culture'&&/文化|历史|博物|石窟|古城|寺|古都/.test(p.theme+' '+p.name)||t==='nature'&&/山|峡|自然|水|湖/.test(p.theme)||t==='food'&&p.category==='food'||t==='immersive'&&/演艺|戏剧|夜游|武侠|电影|宋韵/.test(p.theme)?3:0),0),ranked=[...pool].sort((a,b)=>score(b)-score(a)||Number(Boolean(b.weekendPick))-Number(Boolean(a.weekendPick))),places=[...new Map([...mentioned,...ranked].map(p=>[p.id,p])).values()].slice(0,Math.min(15,Math.max(mentioned.length,intent.days*2)));
 if(!places.length)throw Error('该城市暂无候选地点，请在地图中选择');return places.map(place=>({place,day:1,duration:place.duration||90}));
}
function agentAbortError(){const error=Error('本次智能体请求已取消');error.name='AbortError';return error}
function agentLiveHTML(state){
 const counter=state.index==null?'等待服务端执行状态…':'第 '+state.index+'/5 个智能体 · 模型调用 '+state.modelCalls+' 次';
 return '<section class="agent-result agent-live" aria-label="智能体实时执行记录"><h3>智能体实时执行记录</h3><p class="agent-live-counter" role="status" aria-live="polite" aria-atomic="true">'+esc(counter)+'</p><div class="agent-steps">'+state.steps.map((step,index)=>agentStepHTML(step).replace('<p data-agent-step','<p'+(state.reveal&&index===state.steps.length-1?' class="agent-step-reveal"':'')+' data-agent-step')).join('')+'</div><p class="agent-live-running" role="status" aria-live="polite">'+esc(state.running?state.running+'运行中…':state.index===5&&state.steps.length===5?'全部智能体已完成，等待完整候选结果…':state.index==null?'正在连接智能体服务…':'已收到执行记录，等待下一项服务端状态…')+'</p><small>这里只显示服务端实际执行的状态；结果经你确认后才会应用。</small></section>';
}
// Parse fetch's POST response incrementally; EventSource cannot send this POST body.
// SSE framing is line based, so split UTF-8 characters and CRLF pairs are retained.
async function readAgentEventStream(response,{signal,isCurrent=()=>true,onEvent=()=>{}}={}){
 if(!response.body?.getReader||typeof TextDecoder!=='function')throw Error('当前环境不支持读取实时执行记录');
 const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),steps=[];
 let buffer='',eventName='',data=[],result,finished=false,currentStart=null,modelCalls=0;
 const valid=()=>{if(signal?.aborted||!isCurrent())throw agentAbortError()};
 const abort=()=>{reader.cancel().catch(()=>{})};signal?.addEventListener?.('abort',abort,{once:true});
 const checkIndex=value=>{if(!value||value.total!==5||!Number.isInteger(value.index)||value.index<1||value.index>5||!Number.isInteger(value.modelCalls)||value.modelCalls<0||value.modelCalls<modelCalls)throw Error('实时执行记录格式不完整');modelCalls=value.modelCalls};
 function dispatch(){
  const type=eventName||'message',payload=data.join('\n');eventName='';data=[];if(!payload||!['start','progress','step','done','error'].includes(type))return;
  valid();if(finished)throw Error('实时结果结束后仍收到执行记录');let value;try{value=JSON.parse(payload)}catch{throw Error('实时执行记录格式不完整')}
  if(type==='error'){const error=Error(typeof value.error==='string'?value.error:'智能体执行中断');error.code=value.code;throw error}
  if(type==='done'){
   if(steps.length!==5||!value?.draft||!Array.isArray(value.agent?.steps)||value.agent.steps.length!==5)throw Error('实时结果缺少完整执行记录');
   if(!Number.isInteger(value.agent.modelCalls)||value.agent.modelCalls!==modelCalls)throw Error('实时结果调用次数不一致');
   if(value.agents!==undefined&&(!Array.isArray(value.agents)||value.agents.length!==5))throw Error('最终智能体记录不完整');
   for(let i=0;i<5;i++){const step=value.agent.steps[i],agent=value.agents?.[i];if(step.tool!==steps[i].tool||step.label!==steps[i].label||step.status!==steps[i].status||(step.source??agent?.source)!==steps[i].source||(agent&&(agent.name+'智能体'!==steps[i].tool||agent.source!==steps[i].source)))throw Error('实时记录与最终结果不一致')}
   result=value;finished=true;return;
  }
  checkIndex(value);
  if(type==='start'){if(value.index!==steps.length+1||currentStart||typeof value.tool!=='string'||!value.tool)throw Error('实时执行顺序不完整');currentStart=value.tool}
  if(type==='progress'&&(value.index!==steps.length+1||!currentStart))throw Error('实时执行顺序不完整');
  if(type==='step'){
   if(value.index!==steps.length+1||value.tool!==currentStart||typeof value.label!=='string'||!['completed','pending','conflict'].includes(value.status)||!agentSourceLabel(value.source))throw Error('实时执行记录格式不完整');
   steps.push(value);currentStart=null;
  }
  onEvent(type,value);
 }
 function line(value){if(value===''){dispatch();return}if(value.startsWith(':'))return;const colon=value.indexOf(':'),field=colon<0?value:value.slice(0,colon),raw=colon<0?'':value.slice(colon+1),text=raw.startsWith(' ')?raw.slice(1):raw;if(field==='event')eventName=text;else if(field==='data')data.push(text)}
 function consume(text,eof=false){buffer+=text;if(buffer.length>2097152)throw Error('实时执行记录过大');let match;while((match=/[\r\n]/.exec(buffer))){const at=match.index;if(buffer[at]==='\r'&&at===buffer.length-1&&!eof)break;const size=buffer[at]==='\r'&&buffer[at+1]==='\n'?2:1;line(buffer.slice(0,at));buffer=buffer.slice(at+size)}}
 try{while(!finished){valid();const chunk=await reader.read();valid();if(chunk.done){consume(decoder.decode(),true);if(!finished)throw Error('实时连接中断，未收到完整结果');break}consume(decoder.decode(chunk.value,{stream:true}))}return result}
 finally{signal?.removeEventListener?.('abort',abort);try{await reader.cancel()}catch{}try{reader.releaseLock()}catch{}}
}
// The service has a 120-second execution limit. Allow five seconds for delivery,
// then terminate a stalled transport rather than leaving the dialog waiting.
const AGENT_TRANSPORT_TIMEOUT_MS=125000;
async function agentTransportAttempt(run,signal){
 const controller=new AbortController();let timer=null,rejectGate;
 const gate=new Promise((resolve,reject)=>{rejectGate=reject});
 const abort=()=>{rejectGate(agentAbortError());controller.abort()};
 timer=setTimeout(()=>{const error=Error('智能体连接等待超时，请稍后重试');error.code='AGENT_TRANSPORT_TIMEOUT';rejectGate(error);controller.abort()},AGENT_TRANSPORT_TIMEOUT_MS);
 signal?.addEventListener?.('abort',abort,{once:true});
 try{if(signal?.aborted)abort();return await Promise.race([gate,Promise.resolve().then(()=>{if(controller.signal.aborted)throw agentAbortError();return run(controller.signal)})])}
 finally{if(timer!==null)clearTimeout(timer);signal?.removeEventListener?.('abort',abort);controller.abort()}
}
async function requestAgentCandidate(body,{signal,isCurrent=()=>true,onEvent=()=>{},onFallback=()=>{}}={}){
 // Legacy browser fixtures and environments without fetch retain the existing API path.
 if(typeof fetch!=='function'||typeof AbortController!=='function')return {result:await api('/api/agent',body),streamed:false};
 const valid=requestSignal=>{if(signal?.aborted||requestSignal?.aborted||!isCurrent())throw agentAbortError()};
 async function post(accept,requestSignal){valid(requestSignal);const response=await fetch('/api/agent',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:accept},body:JSON.stringify(body),signal:requestSignal});valid(requestSignal);if(!response.ok){let payload;try{payload=await response.json()}catch{}valid(requestSignal);const error=Error(payload?.error||'智能体请求失败');error.status=response.status;error.noFallback=![406,415,500,501,502,503,504].includes(response.status);throw error}return response}
 try{
  return await agentTransportAttempt(async requestSignal=>{
   const response=await post('text/event-stream',requestSignal),type=response.headers.get('Content-Type')||'';
   // A server or proxy may ignore Accept and already return a complete JSON result.
   if(/application\/json/i.test(type)){const result=await response.json();valid(requestSignal);return {result,streamed:false}}
   if(!/text\/event-stream/i.test(type)){try{await response.body?.cancel()}catch{}throw Error('服务端未返回实时执行记录')}
   const result=await readAgentEventStream(response,{signal:requestSignal,isCurrent,onEvent});valid(requestSignal);return {result,streamed:true};
  },signal);
 }catch(error){
  valid();if(error.noFallback)throw error;onFallback(error);valid();
  // One fresh JSON attempt has its own deadline. It never retries itself.
  return await agentTransportAttempt(async requestSignal=>{const response=await post('application/json',requestSignal),result=await response.json();valid(requestSignal);return {result,streamed:false,fallback:true}},signal);
 }
}
async function buildCandidate(){
 if(!guardBrief())return;const button=$('#buildcandidate');if(button.disabled)return;cancelBriefCandidate();const generation=briefGeneration,controller=typeof AbortController==='function'?new AbortController():null;briefAgentRequest=controller;let replayFinished=false;button.disabled=true;button.textContent='正在连接智能体…';
 try{const intent=readBrief(),seed={...compactDraft(),city:intent.city,days:intent.days,mode:intent.mode,maxHours:intent.maxHours,restMinutes:intent.restMinutes,presetId:null,stops:[],decision:{...validateDecisionState(),records:decisionState.records,intent}};const requestFingerprint=JSON.stringify(intent),preview=$('#candidatepreview'),isCurrent=()=>{try{return generation===briefGeneration&&$('#brief').open&&briefSnapshot===JSON.stringify(compactDraft())&&requestFingerprint===JSON.stringify(readBrief())}catch{return false}};
 const live={index:null,modelCalls:0,steps:[],running:'',reveal:false};preview.innerHTML=agentLiveHTML(live);preview.scrollIntoView?.({block:'nearest',behavior:'instant'});
 const received=await requestAgentCandidate({...seed,operation:'select',learning:intent.learning!==false,demoSession:demoOn()?demoSessionId():undefined},{signal:controller?.signal,isCurrent,onEvent:(type,event)=>{if(!isCurrent())return;live.index=event.index;live.modelCalls=event.modelCalls;live.reveal=type==='step'&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;if(type==='start'){live.running=event.tool;button.textContent='智能体运行中…'}if(type==='step'){live.steps.push(event);live.running=''}preview.innerHTML=agentLiveHTML(live)},onFallback:()=>{if(!isCurrent())return;preview.innerHTML='<section class="agent-result agent-live" aria-label="智能体连接状态"><h3>正在获取完整候选</h3><p role="status" aria-live="polite">实时连接未完成，已停止本次连接，正在重新请求完整结果。返回后将回放真实执行记录。</p></section>';button.textContent='等待完整候选结果…'}});
 if(generation!==briefGeneration||!$('#brief').open)return;if(!isCurrent())throw Error('条件已修改，请重新生成候选');const result=received.result,candidate={...result.draft,decision:{...result.draft.decision,records:decisionState.records,intent}},audit=result.audit||auditDecision(candidate),final=received.streamed?' data-agent-final':' data-agent-final hidden';
 preview.innerHTML='<div class="candidate-preview"><span class="source-chip">'+agentSourceChip(result)+' · 地点来自河南精选目录</span>'+agentPipelineHTML(result)+(received.streamed?'<p class="agent-live-counter" role="status">第 5/5 个智能体 · 模型调用 '+esc(result.agent.modelCalls)+' 次</p>':'')+(received.fallback?'<p class="agent-replay-caption">实时连接未完成，已重新获取完整结果；以下回放本次返回的真实执行记录。</p>':'')+agentResultHTML(result,{replay:!received.streamed})+'<div'+final+'>'+(result.fallback?'<p class="brief-unresolved">模型回退：'+esc(result.fallback.reason)+'</p>':'')+'<h3>候选地点与分日</h3><p>五个智能体协作完成规划：需求理解→地点推荐→日程编排→交通核算→冲突校验。每条决策的依据列在下方；确认后才会应用，票价、预约和体力条件仍需确认。</p><div class="candidate-days">'+Array.from({length:intent.days},(_,i)=>'<p><b>第 '+(i+1)+' 天</b> '+esc(candidate.stops.filter(s=>s.day===i+1).map(s=>s.place.name).join('、')||'自由安排')+'</p>').join('')+'</div>'+agentRationaleHTML(result)+auditHTML(audit)+'<button class="primary" id="applycandidate" disabled>用候选行程替换当前草稿</button></div></div>';
 $('#applycandidate').onclick=async()=>{const apply=$('#applycandidate');if(apply.disabled||!replayFinished||generation!==briefGeneration)return;if(!guardBrief()||requestFingerprint!==JSON.stringify(readBrief())){toast('条件已修改，请重新生成候选');return}apply.disabled=true;$('#briefbody').inert=true;try{const validated=await api('/api/validate',candidate);validateDecisionState(candidate.decision,validated.stops);if(generation!==briefGeneration||!guardBrief()||requestFingerprint!==JSON.stringify(readBrief()))throw Error('行程或条件已变化，本次载入未应用');checkpoint();candidate.decision.source=result.source;lastPlanningSource=result.source;const applied=await applyDraft(candidate,validated);if(!applied)throw Error('行程已变化，本次载入未应用');$('#brief').close();setView('decision');trackFlowSafe('ai_plan_applied');toast('候选行程已载入，预算和交通仍需核对')}catch(e){toast(e.message)}finally{apply.disabled=false;if(generation===briefGeneration)$('#briefbody').inert=false}};
 refreshLearningSignals(preview);
 const onComplete=()=>{if(!isCurrent())return;replayFinished=true;$('#applycandidate').disabled=false;trackFlowSafe('ai_plan_generated')};
 if(received.streamed)onComplete();else startAgentReplay(preview,{isCurrent,onComplete,onCancel:()=>{$('#applycandidate').disabled=true}});
 }catch(e){if(generation===briefGeneration){$('#candidatepreview').innerHTML='';if(e.name!=='AbortError')toast(e.message)}}finally{if(briefAgentRequest===controller)briefAgentRequest=null;if(generation===briefGeneration){button.disabled=false;button.textContent='让智能体生成行程'}}
}
function startStudy(){if(activeStudy)return;const task=$('#studytask').value.trim();if(!task){toast('请填写本次体验任务');return}activeStudy={task,startedAt:Date.now(),edits:0,rating:4,baseline:'',feedback:''};renderDecision();if(globalThis.setInterval)studyTimer=globalThis.setInterval(()=>{const node=$('#studyelapsed');if(activeStudy&&node)node.textContent='已体验 '+Math.floor((Date.now()-activeStudy.startedAt)/1000)+' 秒'},1000);toast('计时已开始，请操作行程，再回来填写反馈')}
function stopStudyTimer(){if(studyTimer!=null)globalThis.clearInterval?.(studyTimer);studyTimer=null}
function finishStudy(){if(!activeStudy)return;try{const baseline=$('#baseline').value,report=currentAudit(),record={...activeStudy,id:'experience-'+Date.now(),endedAt:Date.now(),rating:Number($('#studyrating').value),baselineSeconds:baseline?Number(baseline)*60:null,feedback:$('#studyfeedback').value,source:decisionState.source||lastPlanningSource,stops:trip.length,days:Number($('#days').value),unresolved:report.pending+report.conflicts};const next=validateDecisionState({...decisionState,records:[...decisionState.records,record]},trip);decisionState=next;activeStudy=null;stopStudyTimer();renderTrip();toast('已记录本次体验，可以导出原始数据')}catch(e){toast(e.message)}}
function exportRecords(){if(!decisionState.records.length)return;const data={project:'豫见行迹',exportedAt:new Date().toISOString(),method:'操作时长由页面计时；评分、反馈及原先方法用时由体验者填写。记录不等于正式用户研究。',records:decisionState.records};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='豫见行迹-体验记录.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('#decision').onclick=e=>{
 const scope=e.target.closest('[data-scope-plan]'),traffic=e.target.closest('[data-audit-traffic]'),action=e.target.closest('[data-decision-action]');if(!scope&&!traffic&&!action)return;if(saveBooting){toast('正在读取已保存行程，请稍后操作');return}
 if(scope){generate(Number(scope.dataset.scopePlan));return}if(traffic){day=Number(traffic.dataset.auditTraffic);setView('planner');renderTrip();checkTraffic();return}
 switch(action.dataset.decisionAction){case'conditions':openBrief();break;case'plan':generate();break;case'start-study':startStudy();break;case'finish-study':finishStudy();break;case'cancel-study':activeStudy=null;stopStudyTimer();renderDecision();break;case'export-records':exportRecords();break;}
};
$('#decision').oninput=e=>{if(!activeStudy)return;if(e.target.id==='studyrating')activeStudy.rating=Number(e.target.value);if(e.target.id==='baseline')activeStudy.baseline=e.target.value;if(e.target.id==='studyfeedback')activeStudy.feedback=e.target.value};
$('#decision').onchange=e=>{if(saveBooting)return;const lock=e.target.dataset.lockDay,expense=e.target.dataset.expense;try{if(lock){const stop=trip.find(s=>s.place.id===lock);if(!stop)return;checkpoint();if(e.target.checked)stop.lockedDay=stop.day;else delete stop.lockedDay;renderTrip()}else if(EXPENSE_KEYS.includes(expense)){const value=e.target.value===''?null:Number(e.target.value),next=validateDecisionState({...decisionState,expenses:{...decisionState.expenses,[expense]:value}},trip);checkpoint();decisionState=next;renderTrip()}}catch(error){toast(error.message);renderDecision()}};
$('#briefbody').onclick=e=>{const traffic=e.target.closest('[data-audit-traffic]');if(traffic)toast('载入候选后，再在地图中确认地点并核算交通');const scope=e.target.closest('[data-scope-plan]');if(scope)toast('载入候选后，可以只调整某一天')};
renderDecision();

$('#briefbody').onchange=e=>{if(!e.target.dataset.excludedMode)return;const excluded=[...$('#briefbody').querySelectorAll('[data-excluded-mode]:checked')].map(n=>n.dataset.excludedMode),allowed=Object.entries(modeNames).filter(([v])=>!excluded.includes(v)),previous=$('#briefmode').value;$('#briefmode').innerHTML=selectOptions(allowed,excluded.includes(previous)?allowed[0]?.[0]:previous)};

$('#brief').addEventListener('close',cancelBriefCandidate);
$('#brief').addEventListener('cancel',cancelBriefCandidate);
for(const event of ['input','change'])$('#briefbody').addEventListener(event,e=>{if(e.target.matches?.('input,select,textarea'))cancelBriefCandidate()});
$('#advice').addEventListener('close',()=>cancelAgentReplay($('#advicebody')));
$('#advice').addEventListener('cancel',()=>cancelAgentReplay($('#advicebody')));
$('#group').onclick=e=>{
 if(e.target.closest('[data-group-create]')){submitGroupCreate();return}
 const open=e.target.closest('[data-group-open]');
 if(open){openGroupDetail(open.dataset.groupOpen);return}
 if(e.target.closest('[data-group-back]')){openGroup();return}
 if(e.target.closest('[data-group-join]')){submitGroupJoin();return}
 if(e.target.closest('[data-group-plan]')){submitGroupPlan();return}
};
