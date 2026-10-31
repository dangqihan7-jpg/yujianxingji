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
function agentResultHTML(result,{replay=false}={}){
 const agent=result.agent;if(!agent)return '';
 const steps=Array.isArray(agent.steps)?agent.steps.filter(s=>s&&typeof s.label==='string'):[],final=replay?' data-agent-final hidden':'';
 return '<section class="agent-result" aria-label="智能体规划依据"><h3>'+agentExecutionHeading(result)+'</h3>'+(replay?'<p class="agent-replay-caption">结果已返回，按实际执行顺序回放。</p><p class="agent-replay-status" data-agent-replay-status role="status" aria-live="polite" aria-atomic="true">'+(steps.length?'逐条展示返回的执行记录。':'本次未返回执行步骤。')+'</p><button class="quiet agent-replay-skip" data-agent-replay-skip>直接查看结果</button>':'')+'<div class="agent-steps">'+steps.map((s,index)=>agentStepHTML({...s,source:s.source||result.agents?.[index]?.source},replay)).join('')+'</div><div'+final+'>'+(result.summary?'<p>'+esc(result.summary)+'</p>':'')+(result.reasons?.length?'<ul class="agent-reasons">'+result.reasons.map(r=>'<li><b>'+esc((result.draft?.stops||[]).find(s=>s.place.id===r.id)?.place.name||r.id)+'</b> '+esc(r.reason)+'</li>').join('')+'</ul>':'')+(result.pending?.length?'<p class="agent-pending">智能体提醒：'+esc(result.pending.join('；'))+'</p>':'')+(result.transport?.length?'<p class="agent-transport">'+result.transport.map(t=>'第 '+t.day+' 天：'+(t.status==='queried'?'高德站间交通约 '+t.minutes+' 分钟，查询于 '+new Date(t.queriedAt).toLocaleTimeString('zh-CN'):t.note)).map(esc).join('；')+'</p>':'')+'<small>本次模型调用 '+agent.modelCalls+' 次，工具调用 '+agent.toolCalls+' 次。生成结果经你确认后才载入。</small></div></section>';
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
function briefEntryHTML(){return '<div class="brief-entry"><div><span class="eyebrow">PLAN YOUR WEEKEND</span><h3>让 AI 安排你的河南周末</h3><p>告诉智能体时间、预算与偏好，确认条件后由 AI 选点、查资料和安排行程。</p></div><div class="brief-compose"><label class="sr-only" for="brieftext">描述旅行需求</label><textarea id="brieftext" maxlength="600" rows="2" placeholder="例如：洛阳周末两天，人均预算300元，只坐公交，想看博物馆，每天6小时，不跨城"></textarea><div class="brief-compose-actions"><span>'+ (cfg.aiConfigured?(cfg.authMode==='standalone'&&!authUser&&!cfg.publicAiDemo?'访客可体验规则规划 · 登录后由 AI 智能体规划':'AI 智能体已连接 · 选点、调用工具、检查行程'):'规则规划可直接使用')+'</span><button class="quiet" data-manual-brief>手动填写条件</button><button class="primary" data-parse-brief>开始 AI 规划</button></div><div class="brief-examples"><button data-brief-example="洛阳周末两天，人均预算300元，只坐公交，想看博物馆，每天6小时，不跨城">洛阳公交慢游</button><button data-brief-example="开封两天，打车，想看古城和吃美食，每天8小时，预算500元">开封文化与美食</button><button data-brief-example="新乡两天，自驾，想去宝泉看山水，每天8小时">新乡宝泉山水</button><button data-brief-example="许昌两天，想去胖东来和曹魏古城，每天6小时">许昌商贸与夜游</button><button data-brief-example="信阳两天，自驾，想看南湾湖和茶园，每天8小时">信阳湖山茶乡</button></div></div></div>'}
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
 const f=validateIntent(fields),availableModes=Object.entries(modeNames).filter(([v])=>!f.excludedModes.includes(v)),preferredMode=f.mode||(!f.excludedModes.includes($('#travelmode').value)?$('#travelmode').value:availableModes[0]?.[0]);$('#briefbody').innerHTML='<span class="source-chip">'+(source==='ai'?esc(provider||'模型')+'需求提取':source==='rules'?'文字规则识别':'手动确认旅行条件')+'</span><p class="instruction">以下条件可修改。每天时长包括游览、休息和已核算的交通；预算为个人目标，不代表已查询到真实价格。</p>'+(unresolved.length?'<ul class="brief-unresolved">'+unresolved.map(s=>'<li>'+esc(s)+'</li>').join('')+'</ul>':'')+'<div class="brief-fields"><label>目的地<select id="briefcity">'+selectOptions(DECISION_CITIES.map(v=>[v,v==='河南'?'河南多城':v]),f.city||$('#city').value)+'</select></label><label>旅行天数<select id="briefdays">'+selectOptions([1,2,3,4,5,7].map(v=>[v,v+' 天']),f.days||$('#days').value)+'</select></label><label>出行方式<select id="briefmode">'+selectOptions(availableModes,preferredMode)+'</select></label><label>每天时长上限<select id="briefhours">'+selectOptions([6,8,10].map(v=>[v,v+' 小时']),f.maxHours||$('#maxhours').value)+'</select></label><label>每天休息预留<select id="briefrest">'+selectOptions([[0,'不预留'],[30,'30 分钟'],[60,'60 分钟']],f.restMinutes??$('#restmins').value)+'</select></label><label>人均目标预算<input id="briefbudget" type="number" min="0" max="100000" step="1" placeholder="可留空" value="'+(f.budget??'')+'"></label></div><fieldset class="brief-interests"><legend>想体验什么</legend>'+[['culture','文化与博物馆'],['nature','山水与自然'],['food','地方美食'],['immersive','沉浸演艺'],['family','亲子乐园']].map(([v,label])=>'<label><input type="checkbox" data-interest="'+v+'" '+(f.interests.includes(v)?'checked':'')+'>'+label+'</label>').join('')+'</fieldset><label class="brief-cross"><input id="briefcross" type="checkbox" '+(f.avoidCrossCity?'checked':'')+'>每天避免跨城</label>'+'<fieldset class="brief-place-conditions"><legend>地点条件（可取消勾选）</legend>'+f.requiredIds.map(id=>'<label><input type="checkbox" data-required-id="'+esc(id)+'" checked>必去：'+esc(CATALOG.find(p=>p.id===id)?.name||id)+'</label>').join('')+f.excludedIds.map(id=>'<label><input type="checkbox" data-excluded-id="'+esc(id)+'" checked>排除：'+esc(CATALOG.find(p=>p.id===id)?.name||id)+'</label>').join('')+(!f.requiredIds.length&&!f.excludedIds.length?'<p>没有识别到明确地点条件，可以在地图里继续选点。</p>':'')+'</fieldset>'+'<fieldset class="brief-place-conditions"><legend>不使用的交通方式（可修改）</legend>'+Object.entries(modeNames).map(([v,label])=>'<label><input type="checkbox" data-excluded-mode="'+v+'" '+(f.excludedModes.includes(v)?'checked':'')+'>'+esc(label)+'</label>').join('')+'</fieldset>'+'<div class="brief-confirm-actions"><button id="applyconditions">把条件应用到当前行程</button><button class="primary" id="buildcandidate">让智能体生成行程</button></div><div id="candidatepreview"></div>';
 $('#applyconditions').onclick=()=>{try{if(!guardBrief())return;const intent=readBrief();ensureDayCount(intent.days);checkpoint();decisionState.intent=intent;$('#days').value=String(intent.days);$('#city').value=intent.city;$('#travelmode').value=intent.mode;$('#maxhours').value=String(intent.maxHours);$('#restmins').value=String(intent.restMinutes);trip.forEach(s=>{s.day=Math.min(s.day,intent.days);if(s.lockedDay)s.lockedDay=s.day});day=Math.min(day,intent.days);renderAll();search();$('#brief').close();setView('decision');toast('条件已应用，原地点保留，请查看冲突检查')}catch(e){toast(e.message)}};
 $('#buildcandidate').onclick=buildCandidate;
}
function readBrief(){if($('#briefbody').querySelectorAll('[data-excluded-mode]:checked').length===3)throw Error('请至少保留一种出行方式');return validateIntent({city:$('#briefcity').value,days:Number($('#briefdays').value),mode:$('#briefmode').value,maxHours:Number($('#briefhours').value),restMinutes:Number($('#briefrest').value),budget:$('#briefbudget').value===''?null:Number($('#briefbudget').value),avoidCrossCity:$('#briefcross').checked,interests:[...$('#briefbody').querySelectorAll('[data-interest]:checked')].map(e=>e.dataset.interest),requiredIds:[...$('#briefbody').querySelectorAll('[data-required-id]:checked')].map(e=>e.dataset.requiredId),excludedIds:[...$('#briefbody').querySelectorAll('[data-excluded-id]:checked')].map(e=>e.dataset.excludedId),excludedModes:[...$('#briefbody').querySelectorAll('[data-excluded-mode]:checked')].map(e=>e.dataset.excludedMode)})}
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
 const received=await requestAgentCandidate({...seed,operation:'select'},{signal:controller?.signal,isCurrent,onEvent:(type,event)=>{if(!isCurrent())return;live.index=event.index;live.modelCalls=event.modelCalls;live.reveal=type==='step'&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;if(type==='start'){live.running=event.tool;button.textContent='智能体运行中…'}if(type==='step'){live.steps.push(event);live.running=''}preview.innerHTML=agentLiveHTML(live)},onFallback:()=>{if(!isCurrent())return;preview.innerHTML='<section class="agent-result agent-live" aria-label="智能体连接状态"><h3>正在获取完整候选</h3><p role="status" aria-live="polite">实时连接未完成，已停止本次连接，正在重新请求完整结果。返回后将回放真实执行记录。</p></section>';button.textContent='等待完整候选结果…'}});
 if(generation!==briefGeneration||!$('#brief').open)return;if(!isCurrent())throw Error('条件已修改，请重新生成候选');const result=received.result,candidate={...result.draft,decision:{...result.draft.decision,records:decisionState.records,intent}},audit=result.audit||auditDecision(candidate),final=received.streamed?' data-agent-final':' data-agent-final hidden';
 preview.innerHTML='<div class="candidate-preview"><span class="source-chip">'+agentSourceChip(result)+' · 地点来自河南精选目录</span>'+agentPipelineHTML(result)+(received.streamed?'<p class="agent-live-counter" role="status">第 5/5 个智能体 · 模型调用 '+esc(result.agent.modelCalls)+' 次</p>':'')+(received.fallback?'<p class="agent-replay-caption">实时连接未完成，已重新获取完整结果；以下回放本次返回的真实执行记录。</p>':'')+agentResultHTML(result,{replay:!received.streamed})+'<div'+final+'>'+(result.fallback?'<p class="brief-unresolved">模型回退：'+esc(result.fallback.reason)+'</p>':'')+'<h3>候选地点与分日</h3><p>五个智能体协作完成规划：需求理解→地点推荐→日程编排→交通核算→冲突校验。每条决策的依据列在下方；确认后才会应用，票价、预约和体力条件仍需确认。</p><div class="candidate-days">'+Array.from({length:intent.days},(_,i)=>'<p><b>第 '+(i+1)+' 天</b> '+esc(candidate.stops.filter(s=>s.day===i+1).map(s=>s.place.name).join('、')||'自由安排')+'</p>').join('')+'</div>'+agentRationaleHTML(result)+auditHTML(audit)+'<button class="primary" id="applycandidate" disabled>用候选行程替换当前草稿</button></div></div>';
 $('#applycandidate').onclick=async()=>{const apply=$('#applycandidate');if(apply.disabled||!replayFinished||generation!==briefGeneration)return;if(!guardBrief()||requestFingerprint!==JSON.stringify(readBrief())){toast('条件已修改，请重新生成候选');return}apply.disabled=true;$('#briefbody').inert=true;try{const validated=await api('/api/validate',candidate);validateDecisionState(candidate.decision,validated.stops);if(generation!==briefGeneration||!guardBrief()||requestFingerprint!==JSON.stringify(readBrief()))throw Error('行程或条件已变化，本次载入未应用');checkpoint();candidate.decision.source=result.source;lastPlanningSource=result.source;const applied=await applyDraft(candidate,validated);if(!applied)throw Error('行程已变化，本次载入未应用');$('#brief').close();setView('decision');trackFlowSafe('ai_plan_applied');toast('候选行程已载入，预算和交通仍需核对')}catch(e){toast(e.message)}finally{apply.disabled=false;if(generation===briefGeneration)$('#briefbody').inert=false}};
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
