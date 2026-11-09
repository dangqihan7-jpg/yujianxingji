// 后台人物画像（仅管理员）：画像在服务端算，前端只渲染。
// 用户端响应不含画像名、分数与理由；本页只在登录 + 管理员时可见，
// 非管理员或未登录只看到提示，不会拿到任何画像数据。
let personaCache=null,personaSelected=0;
async function renderPersona(){
 const el=$('#persona');if(!el)return;
 if(!authUser){el.innerHTML='<div class="persona-gate"><div class="k">Admin · Only you</div><h2>后台 · 人物画像</h2><p>请先登录管理员账号查看。</p></div>';return}
 if(!authUser.isAdmin){el.innerHTML='<div class="persona-gate"><div class="k">Admin · Only you</div><h2>后台 · 人物画像</h2><p>仅管理员可见。你当前登录的账号不是管理员。</p></div>';return}
 if(!personaCache){
  el.innerHTML='<div class="persona-gate"><div class="k">Admin · Only you</div><h2>后台 · 人物画像</h2><p>正在读取画像…</p></div>';
  try{personaCache=await api('/api/admin/personas')}
  catch(e){el.innerHTML='<div class="persona-gate"><div class="k">Admin · Only you</div><h2>后台 · 人物画像</h2><p>读取失败：'+esc(e.message||'请稍后重试')+'</p><div class="row"><button data-persona-retry>重试</button></div></div>';
   const b=el.querySelector('[data-persona-retry]');if(b)b.onclick=()=>{personaCache=null;renderPersona()};return}
 }
 renderPersonaPage(personaCache);
}
function personaWeightsHTML(weights){
 return Object.entries(weights).map(([k,v])=>'<div style="margin-bottom:12px"><div class="wl"><span>'+esc({culture:'文化',nature:'山水',food:'美食',immersive:'沉浸',family:'亲子'}[k]||k)+'</span><b>'+Math.round(v*100)+'%</b></div><div class="wbar"><i style="width:'+Math.round(v*100)+'%"></i></div></div>').join('');
}
function personaTop3HTML(top3){
 if(!top3||!top3.length)return '<p class="persona-empty">暂无可推地点。</p>';
 return '<div class="preview"><h4>推流预览（前 3，按画像规则算出）</h4>'+top3.map((s,j)=>{
  const parts=[];
  parts.push('画像匹配 '+(s.match?'+'+s.match:'＋0'));
  parts.push('复盘信号 '+(s.signal?'+'+s.signal:'＋0'));
  parts.push('热度 '+s.heat+'（值得多待 '+s.heatWorth+' 人×3'+(s.heatAdded?'＋加入 '+s.heatAdded:'')+'）');
  return '<div class="pr"><span class="rk">'+(j+1)+'.</span><div><div class="pn">'+esc(s.name)+'</div><small>'+esc(s.city)+' · '+esc(s.theme||'')+' · '+parts.join(' ／ ')+' ＝ '+s.total+' 分</small></div></div>';
 }).join('')+'</div>';
}
function personaDetailHTML(u){
 const d=u.signals.demand,b=u.signals.behavior;
 const demandLine='需求：'+(d.interests.length?d.interests.map(i=>i.name).join('、'):'未填兴趣')+(d.city?' · '+d.city:'')+(d.budget!=null?' · 预算 ¥'+d.budget:'');
 const behaviorLine='行为：草稿 '+b.stops+' 站'+(b.durationAdjusts?'（调过时长 '+b.durationAdjusts+' 站）':'')+' · 复盘 '+b.reviewCount+' 次'+(b.worthStops.length?' · 值得多待：'+b.worthStops.join('、'):'')+(b.overtimeStops.length?' · 超时：'+b.overtimeStops.join('、'):'');
 return '<h3>'+esc(u.username)+' · '+esc(u.persona.name)+(u.persona.baseline?' <span class="badge">群体基线</span>':'')+'<span>置信度 '+Math.round(u.persona.confidence*100)+'%</span></h3>'
 +'<div class="meta">'+esc(u.persona.blurb)+' · 注册 '+esc(new Date(u.createdAt).toLocaleDateString('zh-CN'))+' · 信号事件 '+u.signals.events+' 个</div>'
 +'<div class="wrow">'+personaWeightsHTML(u.weights)+'</div>'
 +'<p>'+esc(demandLine)+'<br>'+esc(behaviorLine)+'<br>推流依据（仅后台可见）：画像匹配 +3 ／ 复盘信号 ≥2 人 +1 ／ 热度分——分数和理由不下发到用户端。</p>'
 +personaTop3HTML(u.top3);
}
function renderPersonaPage(data){
 const el=$('#persona');if(!el)return;
 const users=data.users||[];
 if(personaSelected>=users.length)personaSelected=0;
 const dist=(data.distribution||[]).map(d=>'<div class="stat"><b>'+d.count+' 人</b><span>'+esc(d.name)+'<br>'+d.pct+'%</span><div class="bar"><i style="width:'+d.pct+'%"></i></div></div>').join('')
  +'<div class="stat"><b>'+data.totalUsers+'</b><span>注册用户<br>真实数，非演示</span></div>'
  +'<div class="stat"><b>'+data.baseline.questionnaire.n+' 份</b><span>问卷终稿<br>群体画像基线</span></div>';
 const list=users.length?users.map((u,i)=>'<tr data-i="'+i+'" class="'+(i===personaSelected?'sel':'')+'"><td><span class="id">'+esc(u.username)+'</span></td><td><span class="pill">'+esc(u.persona.name)+(u.persona.baseline?' · 基线':'')+'</span></td><td><span class="conf">'+Math.round(u.persona.confidence*100)+'%</span></td><td>'+esc(u.lastSignal)+'</td><td><span class="sub">'+esc((u.top3||[]).map(t=>t.name).join('、'))+'</span></td></tr>').join(''):'<tr><td colspan="5">暂无注册用户。画像按真实用户算，不编演示用户。</td></tr>';
 const detail=users.length?personaDetailHTML(users[personaSelected]):'<p class="persona-empty">暂无用户画像可看。</p>';
 const dims=data.dimCounts||{};
 el.innerHTML='<div class="page"><div class="head"><div class="k">Admin · Only you</div><h1>后台 · 人物画像</h1><span class="badge">仅管理员可见</span>'
 +'<button class="persona-refresh" data-persona-refresh>刷新</button>'
 +'<p>画像只存在服务端，前端只收到排好序的景点，看不到画像名、分数和推荐理由。下面是真实注册用户（匿名编号已去掉，直接显示用户名），权重全部由真实信号算出。</p></div>'
 +'<h2><span class="no">01</span>画像分布</h2><div class="grid">'+dist+'</div>'
 +'<h2><span class="no">02</span>用户画像列表</h2><div class="tblwrap"><table><thead><tr><th>用户</th><th>画像</th><th>置信度</th><th>最近行为</th><th>最近推流</th></tr></thead><tbody id="persona-list">'+list+'</tbody></table></div>'
 +'<h2><span class="no">03</span>画像详情</h2><div class="detail" id="persona-detail">'+detail+'</div>'
 +'<p class="note"><b>画像来源</b>：① 需求里填的兴趣／城市／预算 ② 行为：加进行程的地点、调过的时长、复盘的“值得多待／超时站” ③ 群体基线：问卷 231 份终稿（宿舍组 45.45%、对象或一位朋友 43.29%、“感兴趣”86.58%），新用户没行为时先按群体画像推。<br>'
 +'<b>景点维度真实分布</b>：文化 '+(dims.culture??'—')+'、山水 '+(dims.nature??'—')+'、沉浸 '+(dims.immersive??'—')+'、亲子 '+(dims.family??'—')+'、美食 '+(dims.food??'—')+'——美食与亲子供给浅，是推流缺口。<br>'
 +'<b>热度说明</b>：'+esc(data.heatNote||'')+'<br>'
 +'<b>权限设计</b>：画像接口只走服务端，后台页要求登录加管理员身份；前端拿到的推荐结果里不带画像名、不带分数、不带“命中偏好”这类理由，只带景点和一条通用说明。</p></div>';
 const refresh=el.querySelector('[data-persona-refresh]');
 if(refresh)refresh.onclick=()=>{personaCache=null;renderPersona()};
 const tbody=el.querySelector('#persona-list');
 if(tbody)tbody.addEventListener('click',e=>{const tr=e.target.closest('tr');if(!tr||tr.dataset.i==null)return;personaSelected=+tr.dataset.i;renderPersonaPage(personaCache)});
}
