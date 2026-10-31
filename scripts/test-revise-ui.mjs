import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../revise.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../revise.css',import.meta.url),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}};
const seed=()=>({version:2,city:'洛阳',days:2,start:'09:00',mode:'transit',maxHours:6,restMinutes:30,presetId:'classic',decision:{intent:{city:'洛阳',requiredIds:['hn-longmen']},expenses:{tickets:100},records:[],source:'manual'},stops:[
 {place:{id:'hn-longmen',name:'龙门石窟',city:'洛阳',source:'curated',category:'scenic',location:[112,34]},day:1,duration:120,lockedDay:1},
 {place:{id:'hn-museum',name:'洛阳博物馆',city:'洛阳',source:'curated',category:'scenic',location:[112.1,34.1]},day:1,duration:90},
 {place:{id:'hn-whitehorse',name:'白马寺',city:'洛阳',source:'curated',category:'scenic',location:[112.2,34.2]},day:2,duration:100}
]});
function resultFor(draft=seed()) {const after=clone(draft);after.stops=after.stops.filter(s=>s.place.id!=='hn-museum');after.stops[0].duration=90;after.presetId=null;after.decision.expenses={tickets:null};return {source:'ai',provider:'讯飞星火',targetDay:1,draft:after,changes:{added:[],removed:[{id:'hn-museum',name:'洛阳博物馆'}],durations:[{id:'hn-longmen',name:'龙门石窟',before:120,after:90}],reordered:false,beforeCount:2,afterCount:1,beforeMinutes:210,afterMinutes:90},note:'减少停留，不代表交通已核实。'}}
function fixture({view='planner',protocol='https:',observer=true}={}){
 const nodes=new Map(),events=new Map(),timers=new Map(),calls=[],validations=[],applications=[],checkpoints=[],messages=[],cleared=[];let watch=null,nextTimer=0;
 class Node {
  constructor(tag='div'){this.tagName=tag;this._id='';this._html='';this._text='';this.value='';this.open=false;this.hidden=false;this.disabled=false;this.checked=false;this.isConnected=true;this.style={overflow:''};this.attributes={};this.dataset={};this.children=[];this.handlers=new Map()}
  set id(v){this._id=v;nodes.set(v,this)}get id(){return this._id}
  set innerHTML(v){this._html=v;this.children=[];for(const m of v.matchAll(/<(\w+)\b([^>]*)>/g)){const attrs=m[2],id=attrs.match(/\bid="([^"]+)"/)?.[1],keep=attrs.match(/\bdata-revise-keep="([^"]+)"/)?.[1];if(!id&&!keep)continue;const n=new Node(m[1]);if(id)n.id=id;if(keep)n.dataset.reviseKeep=keep;n.checked=/\bchecked\b/.test(attrs);n.disabled=/\bdisabled\b/.test(attrs);n.hidden=/\bhidden\b/.test(attrs);this.children.push(n)}}get innerHTML(){return this._html}
  set textContent(v){this._text=String(v)}get textContent(){return this._text}
  append(n){n.parentNode=this;this.children.push(n);if(n.id)nodes.set(n.id,n)}
  querySelector(selector){return selector[0]==='#'?this.children.find(n=>n.id===selector.slice(1))||null:null}
  querySelectorAll(selector){return selector==='[data-revise-keep]'?this.children.filter(n=>n.dataset.reviseKeep):[]}
  setAttribute(k,v){this.attributes[k]=v}getAttribute(k){return this.attributes[k]}
  addEventListener(type,handler){const list=this.handlers.get(type)||[];list.push(handler);this.handlers.set(type,list)}
  emit(type,event={}){for(const handler of this.handlers.get(type)||[])handler(event)}
  showModal(){this.open=true}close(){this.open=false;this.emit('close')}focus(){context.document.activeElement=this}
  scrollIntoView(options){this.scrollOptions=options}
 }
 const body=new Node('body'),html=new Node('html'),footer=new Node(),overviewActions=new Node();body.dataset.view=view;
 const context={console,JSON,Number,String,Boolean,Array,Object,Set,Promise,Error,TypeError,AbortController,location:{protocol},saveBooting:false,day:1,lastPlanningSource:'manual',draft:seed(),trip:seed().stops,
  document:{body,documentElement:html,activeElement:null,hidden:false,getElementById:id=>nodes.get(id)||null,querySelector:selector=>selector==='.trip-footer'?footer:selector==='#overview .folio-actions'?overviewActions:selector[0]==='#'?nodes.get(selector.slice(1))||null:null,createElement:tag=>new Node(tag),addEventListener(type,handler){const list=events.get(type)||[];list.push(handler);events.set(type,list)}},
  matchMedia:()=>({matches:false}),addEventListener(type,handler){events.set(type,[handler])},setTimeout(fn,ms){const id=++nextTimer;timers.set(id,{fn,ms});return id},clearTimeout:id=>timers.delete(id),compactDraft:()=>clone(context.draft),
  fetch:async(path,options)=>{calls.push({path,options});return context.response instanceof Promise?await context.response:context.response},response:{ok:true,status:200,json:async()=>resultFor()},
  api:async(path,body)=>{validations.push({path,body:clone(body)});return context.validation instanceof Promise?await context.validation:{days:body.days,start:body.start,stops:clone(body.stops)}},
  validateDecisionState:(state,stops)=>{assert(state);assert(Array.isArray(stops))},checkpoint:()=>checkpoints.push(clone(context.draft)),
  applyDraft:async(raw,validated)=>{applications.push({raw:clone(raw),validated:clone(validated)});context.draft=clone(raw);context.trip=clone(raw.stops);return true},
  setView:view=>{body.dataset.view=view},toast:message=>messages.push(message),trafficCache:{delete:key=>cleared.push(key)},trafficKey:stops=>stops.map(s=>s.place.id).join(','),scheduleTrafficExpiry:()=>{}
 };
 if(observer)context.MutationObserver=class{constructor(callback){watch=callback}observe(){}};
 vm.createContext(context);vm.runInContext(source,context);
 const get=id=>nodes.get(id),emit=(type,event={})=>{for(const fn of events.get(type)||[])fn(event)};
 return {context,get,nodes,calls,validations,applications,checkpoints,messages,cleared,timers,body,html,footer,overviewActions,Node,emit,run:code=>vm.runInContext(code,context),open:()=>context.openRevise(),close:()=>context.closeRevise(),install:()=>context.installReviseUI(),mutate:records=>watch?.(records),async flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve()},send:async text=>{get('revise-instruction').value=text;return context.submitRevision({preventDefault(){}})}};
}
let passed=0;async function check(label,fn){await fn();passed++;console.log('PASS '+label)}
await check('planner/overview entries are unique, modal names one-day scope and protects mandatory places',()=>{
 const f=fixture();f.install();f.install();assert.equal(f.footer.children.length,1);assert.equal(f.overviewActions.children.length,1);assert.equal(f.get('revise-planner-entry').textContent,'和 AI 调整这一天');f.context.document.activeElement=f.get('revise-planner-entry');f.body.style.overflow='auto';f.html.style.overflow='clip';f.open();
 assert.equal(f.get('revise-dialog').attributes['aria-labelledby'],'revise-title');assert.match(f.get('revise-dialog').innerHTML,/一次只调整一天/);assert.match(f.get('revise-dialog').innerHTML,/新增地点限当天城市/);assert(f.get('revise-dialog').open);assert.equal(f.context.document.activeElement,f.get('revise-instruction'));assert.equal(f.get('revise-day').value,'1');const keep=f.get('revise-keep').querySelectorAll('[data-revise-keep]');assert(keep[0].checked&&keep[0].disabled);assert(!keep[1].checked);assert.equal(f.calls.length,0);f.close();assert.equal(f.body.style.overflow,'auto');assert.equal(f.html.style.overflow,'clip');assert.equal(f.context.document.activeElement,f.get('revise-planner-entry'));
 f.body.dataset.view='gallery';f.open();assert(!f.get('revise-dialog').open);f.body.dataset.view='overview';f.open();assert(f.get('revise-dialog').open);f.body.dataset.view='decision';f.context.refreshReviseUI();assert(!f.get('revise-dialog').open);
});
await check('request carries current draft/day/keep choices; candidate never edits draft or invokes validate until explicit confirmation',async()=>{
 const f=fixture();f.install();f.open();const before=clone(f.context.draft);await f.send('  少安排一站，保留龙门石窟  ');assert.equal(f.calls.length,1);const {path,options}=f.calls[0];assert.equal(path,'/api/revise');assert.equal(options.credentials,'same-origin');assert.equal(options.method,'POST');assert(options.signal instanceof AbortSignal);assert.deepEqual(JSON.parse(options.body),{targetDay:1,instruction:'少安排一站，保留龙门石窟',keepIds:['hn-longmen'],draft:before});assert.deepEqual(f.context.draft,before);assert.equal(f.validations.length,0);assert.equal(f.applications.length,0);assert.equal(f.checkpoints.length,0);assert(!f.get('revise-preview').hidden);assert(!f.get('revise-apply').disabled);assert.match(f.get('revise-preview').innerHTML,/210 分钟/);assert.match(f.get('revise-preview').innerHTML,/90 分钟/);assert.match(f.get('revise-preview').innerHTML,/移除：洛阳博物馆/);assert.match(f.get('revise-preview').innerHTML,/不包含交通/);
 await f.context.applyRevision();assert.equal(f.validations.length,1);assert.equal(f.validations[0].path,'/api/validate');assert.equal(f.checkpoints.length,1);assert.equal(f.applications.length,1);assert.deepEqual(f.context.draft.stops.filter(s=>s.day===2),before.stops.filter(s=>s.day===2));assert.equal(f.body.dataset.view,'overview');assert(!f.get('revise-dialog').open);assert.deepEqual(f.cleared,['hn-longmen,hn-museum','hn-longmen']);assert(f.messages.some(m=>m.includes('撤销')));await f.context.applyRevision();assert.equal(f.applications.length,1);
});
await check('discard and editable requirements invalidate old candidates without changing draft',async()=>{
 const f=fixture();f.open();const before=clone(f.context.draft);await f.send('少一站');f.get('revise-discard').onclick();assert(f.get('revise-preview').hidden);await f.context.applyRevision();assert.equal(f.applications.length,0);assert.deepEqual(f.context.draft,before);
 await f.send('少一站');f.get('revise-instruction').value='改成晚一点';f.get('revise-instruction').emit('input');assert(f.get('revise-preview').hidden);await f.context.applyRevision();assert.equal(f.applications.length,0);
 await f.send('少一站');f.get('revise-day').value='2';f.get('revise-day').emit('change');assert(f.get('revise-preview').hidden);assert.match(f.get('revise-keep').innerHTML,/白马寺/);assert(!f.get('revise-keep').innerHTML.includes('龙门石窟'));assert.deepEqual(f.context.draft,before);
});
await check('candidate audit is explicitly read-only and cannot expose actions against the current draft',async()=>{
 const f=fixture(),response=resultFor(),audits=[];response.audit={status:'pending',daily:[]};f.context.response={ok:true,status:200,json:async()=>response};f.context.auditHTML=(report,options)=>{audits.push({report:clone(report),options:clone(options)});return options.actions===false?'<p>交通待核算</p>':'<button data-check-traffic>核算交通</button>'};f.open();await f.send('少一站');assert.equal(audits.length,1);assert.deepEqual(audits[0],{report:response.audit,options:{actions:false}});assert.match(f.get('revise-preview').innerHTML,/交通待核算/);assert(!f.get('revise-preview').innerHTML.includes('data-check-traffic'));assert.equal(f.applications.length,0);
});
await check('closing pending request aborts it and late response cannot enter a reopened dialog',async()=>{
 const f=fixture(),pending=deferred();f.install();f.open();f.context.response=pending.promise;const send=f.send('少一站');await f.flush();assert(f.get('revise-generate').disabled);await f.send('重复发送');assert.equal(f.calls.length,1);f.close();assert(f.calls[0].options.signal.aborted);f.open();pending.resolve({ok:true,status:200,json:async()=>resultFor()});await send;assert(f.get('revise-preview').hidden);assert.equal(f.run('reviseCandidate'),null);assert.equal(f.applications.length,0);assert.equal(f.get('revise-instruction').value,'重复发送');
});
await check('draft mutation aborts pending work and stale response without observer is rejected too',async()=>{
 for(const observer of [true,false]){const f=fixture({observer}),pending=deferred();f.install();f.open();f.context.response=pending.promise;const send=f.send('少一站');await f.flush();f.context.draft.stops[2].duration=110;if(observer){f.mutate();await f.flush();assert(f.calls[0].options.signal.aborted)}pending.resolve({ok:true,status:200,json:async()=>resultFor()});await send;assert.equal(f.run('reviseCandidate'),null);assert.equal(f.applications.length,0);assert.match(f.get('revise-status').textContent,/变化|修改/)}
});
await check('closing, switching view, changing draft or editing keep choices while apply validation waits cannot apply',async()=>{
 for(const action of ['close','view','draft','keep']){const f=fixture();f.install();f.open();await f.send('少一站');const pending=deferred();f.context.validation=pending.promise;const applying=f.context.applyRevision();await f.flush();await f.context.applyRevision();assert.equal(f.validations.length,1);if(action==='close')f.close();if(action==='view')f.body.dataset.view='gallery';if(action==='draft')f.context.draft.stops[2].duration=120;if(action==='keep'){f.get('revise-keep').querySelectorAll('[data-revise-keep]')[1].checked=true;f.get('revise-keep').emit('change')}pending.resolve({days:2,start:'09:00',stops:resultFor().draft.stops});await applying;assert.equal(f.applications.length,0,action);assert.equal(f.checkpoints.length,0,action);assert.equal(f.cleared.length,0,action)}
});
await check('server validation failure leaves candidate recoverable and does not create undo or save',async()=>{
 const f=fixture();f.open();await f.send('少一站');f.context.validation=Promise.reject(Error('候选校验失败'));await f.context.applyRevision();assert.match(f.get('revise-status').textContent,/候选校验失败/);assert(!f.get('revise-apply').disabled);assert(!f.get('revise-fields').disabled);assert.equal(f.checkpoints.length,0);assert.equal(f.applications.length,0);
});
await check('late post-apply search cannot navigate or notify over a newer view, draft or revision session',async()=>{
 for(const action of ['view','draft','reopen','view-roundtrip']){const f=fixture(),pending=deferred();f.install();f.open();await f.send('少一站');f.context.applyDraft=async(raw,validated)=>{f.applications.push({raw:clone(raw),validated:clone(validated)});f.context.draft=clone(raw);f.context.trip=clone(raw.stops);return pending.promise};const applying=f.context.applyRevision();await f.flush();assert.equal(f.applications.length,1);assert(!f.get('revise-dialog').open);
  if(action==='view')f.body.dataset.view='gallery';if(action==='draft')f.context.draft.stops[0].duration=75;if(action==='reopen')f.open();if(action==='view-roundtrip'){f.body.dataset.view='gallery';f.mutate([{type:'attributes',attributeName:'data-view'}]);await f.flush();f.body.dataset.view='planner';f.mutate([{type:'attributes',attributeName:'data-view'}]);await f.flush()}
  const latestView=f.body.dataset.view;pending.resolve(true);await applying;assert.equal(f.body.dataset.view,latestView,action);assert.equal(f.messages.length,0,action);if(action==='reopen')assert(f.get('revise-dialog').open);
 }
});
await check('apply false and pre/post-commit errors never claim unconfirmed success',async()=>{
 for(const mode of ['false','throw-before','throw-after']){const f=fixture();f.open();await f.send('少一站');f.context.applyDraft=async(raw)=>{if(mode==='false')return false;if(mode==='throw-after'){f.context.draft=clone(raw);f.context.trip=clone(raw.stops)}throw Error('search failed')};await f.context.applyRevision();assert.equal(f.body.dataset.view,'planner');assert.equal(f.messages.length,1);assert(!f.messages[0].includes('可用“撤销”恢复'));assert.match(f.messages[0],mode==='false'?/未应用/:mode==='throw-before'?/未能应用/:/已更新.*刷新未完成/)}
});
await check('rejects results that move another day, omit locked/kept stops, duplicate places or alter travel conditions',async()=>{
 for(const tamper of [r=>r.draft.stops[1].duration++,r=>r.draft.stops.shift(),r=>r.draft.stops.push(clone(r.draft.stops[0])),r=>r.draft.days=3,r=>delete r.draft.stops[0].lockedDay,r=>r.source='rules',r=>r.targetDay=2]){const f=fixture();f.open();const response=resultFor();tamper(response);f.context.response={ok:true,status:200,json:async()=>response};await f.send('少一站');assert.equal(f.run('reviseCandidate'),null);assert(f.get('revise-preview').hidden);assert.equal(f.applications.length,0);assert.equal(f.get('revise-status').dataset.state,'error')}
 const f=fixture();f.open();f.get('revise-keep').querySelectorAll('[data-revise-keep]')[1].checked=true;await f.send('放松一点');assert.match(f.get('revise-status').textContent,/保留地点/);assert.equal(f.run('reviseCandidate'),null);
});
await check('offline, loading saved draft, empty and oversized requests never call a model',async()=>{
 const f=fixture();f.open();await f.send('  ');await f.send('好'.repeat(601));assert.equal(f.calls.length,0);assert.match(f.get('revise-status').textContent,/600/);const offline=fixture({protocol:'file:'});offline.open();await offline.send('少一站');assert.equal(offline.calls.length,0);assert.match(offline.get('revise-status').textContent,/离线/);const loading=fixture();loading.context.saveBooting=true;loading.open();assert(!loading.get('revise-dialog'));assert.match(loading.messages[0],/恢复/);const empty=fixture();empty.context.draft.stops=[];empty.open();assert(!empty.get('revise-dialog'));
});
await check('quota, permissions, configuration and malformed/upstream failures preserve text without retry',async()=>{
 for(const [status,message]of [[403,/登录/],[429,/额度/],[503,/配置|不可用/],[502,/暂时无法/],[400,/要求/]]){const f=fixture();f.open();f.context.response={ok:false,status,json:async()=>({error:'请核对要求'})};await f.send('少一站');assert.equal(f.calls.length,1);assert.equal(f.get('revise-instruction').value,'少一站');assert.match(f.get('revise-status').textContent,message);assert(!f.get('revise-generate').disabled);assert.equal(f.applications.length,0)}
 const f=fixture();f.open();f.context.response={ok:true,status:200,json:async()=>{throw Error('bad json')}};await f.send('少一站');assert.match(f.get('revise-status').textContent,/不可用/);assert.equal(f.calls.length,1);
});
await check('bounded network timeout, page hide and Escape release request and body scroll',async()=>{
 const f=fixture(),pending=deferred();f.install();f.open();f.context.response=pending.promise;const sending=f.send('少一站');await f.flush();const timeout=[...f.timers.values()][0];assert.equal(timeout.ms,45000);timeout.fn();assert(f.calls[0].options.signal.aborted);const error=Error('aborted');error.name='AbortError';pending.reject(error);await sending;assert.match(f.get('revise-status').textContent,/超时/);assert.equal(f.timers.size,0);f.context.document.hidden=true;f.emit('visibilitychange');assert(!f.get('revise-dialog').open);assert.equal(f.body.style.overflow,'');f.context.document.hidden=false;f.open();f.get('revise-dialog').emit('cancel');f.get('revise-dialog').close();assert.equal(f.run('reviseSession'),null);
});
await check('untrusted strings are escaped; unchanged candidate cannot reset costs; mobile/reduced-motion styles remain scoped',async()=>{
 const f=fixture();f.open();const response=resultFor();response.note='<script>alert(1)</script>';response.changes.removed[0].name='<img src=x onerror=alert(1)>';f.context.response={ok:true,status:200,json:async()=>response};await f.send('<b>少一站</b>');const html=f.get('revise-preview').innerHTML;assert(!html.includes('<script>'));assert(!html.includes('<img'));assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;img'));
 const same=fixture();same.open();const result=resultFor();result.draft=seed();result.changes={added:[],removed:[],durations:[],reordered:false};same.context.response={ok:true,status:200,json:async()=>result};await same.send('保留原安排');assert(same.get('revise-apply').disabled);await same.context.applyRevision();assert.equal(same.applications.length,0);
 assert.match(css,/@media \(max-width: 767px\)/);assert.match(css,/\.revise-comparison \{ grid-template-columns: minmax\(0,1fr\); \}/);assert.match(css,/\.revise-dialog input \{ font-size: 16px;/);assert.match(css,/min-height: 44px/);assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);assert(!source.includes('localStorage'));
 const ask=readFileSync(new URL('../ask.js',import.meta.url),'utf8');assert.match(ask,/closeAsk\(\);openRevise\(\)/);assert.equal((ask.match(/fetch\('/g)||[]).length,1,'asking still only calls read-only /api/ask');
});
console.log(`Revision UI tests passed: ${passed} groups; guarded previews, confirmation, cancellation, validation races, safe rendering and mobile controls.`);
