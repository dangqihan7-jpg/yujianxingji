import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createShareSnapshot} from '../share-timeline.mjs';

const source=readFileSync(new URL('../ask.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../ask.css',import.meta.url),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}}
const copy=value=>JSON.parse(JSON.stringify(value));
const localTrip=[
  {day:1,duration:120,place:{id:'hn-longmen',name:'龙门石窟',city:'洛阳',category:'scenic',image:'/assets/private.jpg',routing:{location:[112,34]},description:'私人行程不应透传的字段'}},
  {day:1,duration:60,place:{id:'food-kaifeng',name:'开封美食',city:'开封',category:'food'}},
  {day:2,duration:90,place:{id:'hn-kaifeng-fu',name:'开封府',city:'开封',category:'scenic'}}
];
function fixture({view='planner',protocol='https:',observer=true,domMutations=false}={}){
  const nodes=new Map(),requests=[],timers=new Map(),documentEvents=new Map(),globalEvents=new Map(),mutationRecords=[];let nextTimer=0,observerCallback=null,observing=false;
  function recordChildList(target){
    if(!domMutations||!observing)return;
    for(let node=target;node;node=node.parentNode)if(node===body){mutationRecords.push({type:'childList',target});break}
  }
  class Node {
    constructor(tag='div'){this.tagName=tag;this._id='';this._html='';this._text='';this.textWrites=0;this.value='';this.placeholder='';this.open=false;this.hidden=false;this.disabled=false;this.dataset={};this.attributes={};this.children=[];this.handlers=new Map();this.style={overflow:''};this.isConnected=true;this.scrollTop=0;this.scrollHeight=400}
    set id(value){this._id=value;nodes.set(value,this)}get id(){return this._id}
    set innerHTML(value){this._html=value;for(const match of value.matchAll(/\bid="([^"]+)"/g)){const node=new Node(match[1]==='ask-question'?'textarea':'div');node.id=match[1];node.parentNode=this;if(match[1]==='ask-question')node.placeholder='我的行程每天分别安排了哪些地点？';this.children.push(node)}recordChildList(this)}get innerHTML(){return this._html}
    // Native textContent replaces text nodes even when the string is unchanged.
    set textContent(value){this._text=String(value);this.textWrites++;recordChildList(this)}get textContent(){return this._text}
    append(node){node.parentNode=this;node.isConnected=true;this.children.push(node);if(node.id)nodes.set(node.id,node);recordChildList(this)}
    setAttribute(key,value){this.attributes[key]=value}getAttribute(key){return this.attributes[key]}
    addEventListener(type,handler){const list=this.handlers.get(type)||[];list.push(handler);this.handlers.set(type,list)}
    emit(type,event={}){for(const handler of this.handlers.get(type)||[])handler(event)}
    showModal(){this.open=true}close(){this.open=false;this.emit('close')}
    cancel(){this.emit('cancel');this.close()}
    focus(){context.document.activeElement=this;this.emit('focus')}
    blur(){if(context.document.activeElement===this)context.document.activeElement=null;this.emit('blur')}
  }
  const body=new Node('body');body.dataset.view=view;const html=new Node('html');
  for(const [id,value]of [['days','2'],['travelmode','transit'],['start','09:00']]){const node=new Node('select');node.id=id;node.value=value}
  const motion={matches:false,addEventListener(type,handler){this.handler=handler}};
  const context={console,JSON,Number,String,Boolean,Array,Set,Promise,AbortController,TypeError,location:{protocol},trip:copy(localTrip),saveBooting:false,
    createShareSnapshot,currentShareSnapshot:()=>createShareSnapshot(context.trip,Number(nodes.get('days').value),stops=>({legs:stops.slice(1).map(()=>({duration:1200}))})),
    document:{body,documentElement:html,activeElement:null,hidden:false,getElementById:id=>nodes.get(id)||null,querySelector:selector=>nodes.get(selector.slice(1))||null,
      createElement:tag=>new Node(tag),addEventListener(type,handler){const list=documentEvents.get(type)||[];list.push(handler);documentEvents.set(type,list)}},
    matchMedia:()=>motion,addEventListener(type,handler){globalEvents.set(type,handler)},setTimeout(fn,delay){const id=++nextTimer;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),
    localStorage:new Proxy({},{get(){throw Error('Question history must never use localStorage')}}),
    fetch:async(path,options)=>{requests.push({path,options});return context.response instanceof Promise?await context.response:context.response},response:{ok:true,status:200,json:async()=>({answer:'第一天安排了 1 个景点：龙门石窟；另外有 1 站美食。'})}};
  if(observer)context.MutationObserver=class{constructor(callback){observerCallback=callback}observe(node,options){assert.equal(node,body);assert(options.childList&&options.subtree);this.options=options;observing=true}};
  vm.createContext(context);vm.runInContext(source,context);
  const emit=(type,event={})=>{for(const handler of documentEvents.get(type)||[])handler(event)};
  return {context,nodes,requests,timers,motion,globalEvents,body,html,Node,emit,get:id=>nodes.get(id),run:code=>vm.runInContext(code,context),install:()=>context.installAskUI(),open:()=>context.openAsk(),send:question=>{nodes.get('ask-question').value=question;return context.submitAskQuestion({preventDefault(){}})},
    mutate(){observerCallback?.()},async settleMutations(){
      // Deliver batched childList records between microtask checkpoints, bounded
      // so a refresh -> textContent -> observer loop fails rather than hangs.
      for(let round=0;round<20;round++){
        await Promise.resolve();await Promise.resolve();await Promise.resolve();
        if(!mutationRecords.length)return;
        observerCallback?.(mutationRecords.splice(0));
      }
      assert.fail('Ask UI MutationObserver refresh must settle without rewriting unchanged text');
    },tick(){const entry=[...timers.entries()][0];assert(entry,'Expected a placeholder timer');timers.delete(entry[0]);assert.equal(entry[1].delay,5000);entry[1].fn()},async flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve()}};
}

// Persistent native entry, exact view scope and accessibility; opening is read-only.
{
  const f=fixture();f.install();assert.equal(f.body.children.length,2);assert(!f.get('ask-launcher').hidden);assert(!f.get('ask-dialog'));
  f.install();assert.equal(f.body.children.length,2,'Install once despite page renders');
  f.context.document.activeElement=f.get('ask-launcher');f.body.style.overflow='auto';f.html.style.overflow='clip';f.open();
  const dialog=f.get('ask-dialog');assert(dialog.open);assert.equal(dialog.tagName,'dialog');assert.equal(dialog.attributes['aria-labelledby'],'ask-title');assert(dialog.innerHTML.includes('最多 600 字'));
  assert.equal(f.context.document.activeElement,f.get('ask-question'));assert.equal(f.body.style.overflow,'hidden');assert.equal(f.html.style.overflow,'hidden');assert.equal(f.requests.length,0);
  f.open();assert.equal(f.get('ask-dialog'),dialog);dialog.close();assert.equal(f.body.style.overflow,'auto');assert.equal(f.html.style.overflow,'clip');assert.equal(f.context.document.activeElement,f.get('ask-launcher'));
  f.body.dataset.view='gallery';f.context.refreshAskUI();assert(!f.get('ask-launcher').hidden);f.open();assert(dialog.open);assert.equal(f.get('ask-dialog'),dialog,'Gallery reuses the same drawer');f.context.closeAsk();
  f.body.dataset.view='overview';f.context.refreshAskUI();assert(!f.get('ask-launcher').hidden);f.open();assert(dialog.open);
  f.body.dataset.view='decision';f.context.refreshAskUI();assert(!dialog.open);assert(f.get('ask-launcher').hidden);
}
// Public-service presentation is limited to actual trip and site functions on the home entry.
{
  const f=fixture({view:'gallery'});f.install();assert(!f.get('ask-launcher').hidden);assert.equal(f.get('ask-launcher').children[1].textContent,'问行程与站内功能');
  assert.match(f.get('ask-launcher').attributes['aria-label'],/公众服务问答/);f.open();const html=f.get('ask-dialog').innerHTML;
  assert.match(html,/公众服务问答 · 河南周末游/);assert.match(html,/解释当前行程、分享与导出操作、拍照识景点/);assert.match(html,/不会替你改单或执行操作/);assert.match(html,/实时票价、天气、预约及站外服务信息未核实/);
  assert(!/便民热线|一键预约|实时天气查询/.test(html));assert.equal(f.requests.length,0);
  f.context.saveBooting=true;f.context.restoreFailed=true;f.context.refreshAskUI();assert.match(f.get('ask-context').textContent,/重试读取行程/);assert(f.get('ask-send').disabled);
  f.context.saveBooting=false;f.context.trip=[];f.context.refreshAskUI();assert.equal(f.get('ask-context').textContent,'请先加入地点');assert(f.get('ask-send').disabled);assert.equal(f.requests.length,0);
}
// Example chips only fill an editable question, protect user input and disable while pending.
{
  const f=fixture({view:'gallery'}),pending=deferred();f.install();f.open();const input=f.get('ask-question');
  const ids=['ask-example-trip','ask-example-share','ask-example-export','ask-example-vision'];
  assert.equal(f.get(ids[0]).textContent,'第 1 天安排了几站，会不会太赶？');
  for(const [index,id] of ids.entries()){
    input.value='';f.get(id).onclick();assert.equal(input.value,f.get(id).textContent);assert.match(f.get('ask-status').textContent,/手动发送/);assert.equal(f.requests.length,0);
    input.value='保留我正在写的问题';f.get(id).onclick();assert.equal(input.value,'保留我正在写的问题');assert.match(f.get('ask-status').textContent,/不会覆盖/);assert.equal(f.requests.length,0);
  }
  // The trip example follows the draft's actual nonempty day, not a hardcoded destination/order.
  f.context.trip=f.context.trip.filter(stop=>stop.day===2);f.context.refreshAskUI();assert.equal(f.get(ids[0]).textContent,'第 2 天安排了几站，会不会太赶？');
  input.value='';f.get(ids[1]).onclick();f.context.response=pending.promise;const work=f.send(input.value);assert.equal(f.requests.length,1);
  for(const id of ids){assert(f.get(id).disabled);f.get(id).onclick();assert.equal(input.value,'','Busy chips must not insert a new question even if invoked directly')}
  pending.resolve({ok:true,status:200,json:async()=>({answer:'站内功能说明：在地图规划的我的行程底部点击分享行程，可复制链接或查看二维码。'})});await work;
  for(const id of ids)assert(!f.get(id).disabled);
  const entry=f.run('askHistory[0]');assert.match(entry.answerElement.textContent,/^站内功能说明：/);assert.match(entry.noteElement.textContent,/依据本站操作说明/);assert(!/AI|模型|已执行/.test(entry.noteElement.textContent));assert.equal(f.requests.length,1);assert.equal(f.requests[0].path,'/api/ask');
}
// Real childList notifications must not turn unchanged button text into a microtask loop.
{
  const f=fixture({domMutations:true}),pending=deferred();f.install();await f.settleMutations();f.open();await f.settleMutations();
  const send=f.get('ask-send'),input=f.get('ask-question');
  async function assertStableRefresh(state){
    const writes=send.textWrites;
    for(let i=0;i<3;i++){f.context.refreshAskUI();await f.settleMutations()}
    assert.equal(send.textWrites,writes,`${state}: refreshing unchanged controls must not replace their text nodes`);
  }
  assert.equal(send.textContent,'发送 ↗');assert(send.disabled);await assertStableRefresh('open');
  input.value='第二天会不会太赶？';input.emit('input');f.emit('input');await f.settleMutations();
  assert(!send.disabled);await assertStableRefresh('typing');
  f.context.response=pending.promise;const work=f.send(input.value);await f.settleMutations();
  assert.equal(send.textContent,'取消回答');assert.equal(send.type,'button');await assertStableRefresh('pending');
  send.onclick({preventDefault(){}});await f.settleMutations();
  assert.equal(send.textContent,'发送 ↗');assert.equal(input.value,'第二天会不会太赶？');await assertStableRefresh('cancelled');
  pending.resolve({ok:true,status:200,json:async()=>({answer:'迟到的结果'})});await work;await f.settleMutations();
  assert.equal(f.run('askHistory[0].state'),'cancelled');assert.equal(f.requests.length,1);
}
// Real share snapshot builder, category-aware, immutable and privacy-whitelisted.
{
  const f=fixture();const before=copy(f.context.trip);f.install();f.open();await f.send('  第一天有几个景点？  ');
  assert.equal(f.requests.length,1);const {path,options}=f.requests[0],body=JSON.parse(options.body);
  assert.equal(path,'/api/ask');assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');assert(options.signal instanceof AbortSignal);
  assert.deepEqual(body,{question:'第一天有几个景点？',trip:{places:['龙门石窟','开封美食','开封府'],days:2,schedule:[{day:1,stops:[{name:'龙门石窟',city:'洛阳',duration:120,travelMinutes:null,id:'hn-longmen',category:'scenic'},{name:'开封美食',city:'开封',duration:60,travelMinutes:20,id:'food-kaifeng',category:'food'}]},{day:2,stops:[{name:'开封府',city:'开封',duration:90,travelMinutes:null,id:'hn-kaifeng-fu',category:'scenic'}]}],mode:'transit',start:'09:00'}});
  assert.deepEqual(f.context.trip,before,'Asking cannot mutate the draft');assert(!/user|routing|private|description|history/.test(options.body));
  const exchange=f.run('askHistory[0]');assert.equal(exchange.state,'answered');assert.equal(exchange.answerElement.textContent,f.context.response? '第一天安排了 1 个景点：龙门石窟；另外有 1 站美食。':'');assert.match(exchange.noteElement.textContent,/基于提问时行程/);assert.match(exchange.noteElement.textContent,/AI 回答仅供参考，出行前请核实/);
  f.get('ask-dialog').close();f.body.dataset.view='overview';f.open();assert.equal(f.run('askHistory.length'),1,'History remains in this page session across drawer closes and view changes');
  f.context.trip[0].duration=150;f.context.response={ok:true,status:200,json:async()=>({answer:'根据更新后的行程，第一站预留了 150 分钟。'})};await f.send('现在第一站停多久？');
  assert.equal(f.run('askHistory.length'),2);assert.equal(JSON.parse(f.requests[1].options.body).trip.schedule[0].stops[0].duration,150);assert.equal(Object.keys(JSON.parse(f.requests[1].options.body)).join(','),'question,trip','No conversation history is sent to the model');
  const fresh=fixture();fresh.install();fresh.open();assert.equal(fresh.run('askHistory.length'),0,'Refreshing/reloading starts a fresh in-memory session');
}
// A confirmed numeric budget is the only intent field copied; unknown and unconfirmed values stay private.
{
  for(const budget of [0,800,100000,null,undefined,'800',-1,100001,NaN,Infinity]){
    const f=fixture();f.context.decisionState={intent:{budget,rawText:'PRIVATE_INTENT',notes:'PRIVATE_NOTES'},expenses:{tickets:42},user:{name:'PRIVATE_ACCOUNT'}};
    f.context.briefResult={fields:{budget:999},rawText:'UNCONFIRMED_BRIEF'};const before=copy(f.context.trip);f.install();f.open();await f.send('我的预算是多少？');
    const payload=JSON.parse(f.requests[0].options.body),valid=typeof budget==='number'&&Number.isFinite(budget)&&budget>=0&&budget<=100000;
    assert.equal(Object.hasOwn(payload.trip,'budget'),valid);if(valid)assert.equal(payload.trip.budget,budget);
    assert(!/PRIVATE|UNCONFIRMED|rawText|notes|expenses|user/.test(f.requests[0].options.body));assert.deepEqual(f.context.trip,before);
  }
  const f=fixture(),pending=deferred();f.context.decisionState={intent:{budget:800}};f.install();f.open();f.context.response=pending.promise;const work=f.send('预算会不会超？');
  f.context.decisionState.intent.budget=500;f.context.refreshAskUI();assert(f.requests[0].options.signal.aborted);assert.match(f.get('ask-status').textContent,/行程已修改/);
  pending.resolve({ok:true,status:200,json:async()=>({answer:'基于旧预算'})});await work;assert.equal(f.run('askHistory[0].answer'),'');
}
// Browser-bound user/model strings can never create elements or HTML.
{
  const f=fixture();f.install();f.open();const unsafe='<img src=x onerror=alert(1)>';f.context.response={ok:true,status:200,json:async()=>({answer:'<script>alert(2)</script>\n仅作回答文字'})};await f.send(unsafe);
  const item=f.run('askHistory[0]');assert.equal(item.element.children[0].textContent,unsafe);assert.equal(item.element.children[0].innerHTML,'');assert.equal(item.answerElement.innerHTML,'');assert.equal(item.answerElement.textContent,'<script>alert(2)</script>\n仅作回答文字');
  assert(!source.includes('localStorage.'),'Do not persist question history');assert(!source.includes('compactDraft('));assert.equal((source.match(/fetch\('/g)||[]).length,1);
}
// Empty, oversized, missing trip, recovery and offline states cannot charge a call.
{
  const f=fixture();f.install();f.open();await f.send('   ');assert.match(f.get('ask-status').textContent,/请输入/);await f.send('问'.repeat(601));assert.match(f.get('ask-status').textContent,/最多 600/);
  f.context.saveBooting=true;await f.send('第一天有几个景点？');assert.match(f.get('ask-status').textContent,/恢复/);f.context.saveBooting=false;f.context.trip=[];await f.send('几个景点？');assert.match(f.get('ask-status').textContent,/加入地点|行程/);assert.equal(f.requests.length,0);assert(f.get('ask-send').disabled);
  const offline=fixture({protocol:'file:'});offline.install();offline.open();await offline.send('一天几站？');assert.match(offline.get('ask-status').textContent,/离线/);assert.equal(offline.requests.length,0);
}
// No silent retries; quota/configuration and upstream failures are friendly and truthful.
{
  for(const [status,result,message] of [
    [429,{error:'今天的匿名行程问答次数已用完，请明天再试'},'今天的匿名行程问答次数已用完，请明天再试'],
    [503,{code:'ASK_NOT_CONFIGURED',error:'diagnostic'},'行程问答服务尚未配置，请稍后再试'],
    [503,{error:'图片识别服务尚未配置'},'行程问答服务尚未配置，请稍后再试'],
    [502,{error:'upstream HTTP 500 internal key'},'行程问答服务暂时不可用，请稍后重试'],
    [413,{error:'too big'},'行程内容过大，请精简行程后再提问']
  ]){const f=fixture();f.context.response={ok:false,status,json:async()=>result};f.install();f.open();await f.send('第一天有几站？');assert.equal(f.get('ask-status').textContent,message);assert.equal(f.run('askHistory[0].state'),'error');assert.equal(f.requests.length,1);assert.equal(f.run('askRequest'),null)}
  const f=fixture();f.context.response={ok:true,status:200,json:async()=>({answer:''})};f.install();f.open();await f.send('第一天？');assert.match(f.get('ask-status').textContent,/有效回答/);
  f.context.response={ok:false,status:502,json:async()=>{throw Error('proxy html')}};await f.send('第二天？');assert.equal(f.get('ask-status').textContent,'行程问答服务暂时不可用，请稍后重试');assert.equal(f.requests.length,2);
}
// Closing/Escape aborts one pending request. Late results cannot leak into another question.
{
  const f=fixture(),pending=deferred();f.context.response=pending.promise;f.install();f.open();const first=f.send('第一个问题？');await f.flush();assert.equal(f.requests.length,1);assert.match(f.get('ask-status').textContent,/正在处理问题/);assert(!f.get('ask-send').disabled);assert.equal(f.get('ask-send').type,'button');assert.equal(f.get('ask-send').textContent,'取消回答');
  await f.send('不应重复发送？');assert.equal(f.requests.length,1);f.get('ask-dialog').cancel();assert(f.requests[0].options.signal.aborted);assert.equal(f.run('askHistory[0].state'),'cancelled');
  f.context.response={ok:true,status:200,json:async()=>({answer:'新的问题答案'})};f.open();await f.send('新的问题？');pending.resolve({ok:true,status:200,json:async()=>({answer:'迟到的旧答案'})});await first;
  assert.equal(f.run('askHistory[1].answer'),'新的问题答案');assert.equal(f.run('askHistory[0].answer'),'');assert.equal(f.run('askHistory[0].state'),'cancelled');assert.equal(f.requests.length,2);
}
// Native close events are queued by browsers; rapid reopen cannot retain old requests or locks.
{
  for(const ownButton of [true,false]){
    const f=fixture(),pending=deferred();f.context.response=pending.promise;f.install();f.open();const request=f.send('旧问题？');await f.flush();
    const dialog=f.get('ask-dialog');dialog.close=()=>{dialog.open=false};
    if(ownButton){f.get('ask-close').onclick();assert.equal(f.body.style.overflow,'');assert(f.requests[0].options.signal.aborted)}else dialog.close();
    f.open();assert(f.requests[0].options.signal.aborted);assert.equal(f.run('askHistory[0].state'),'cancelled');
    dialog.emit('close');assert(dialog.open);assert.equal(f.body.style.overflow,'hidden','A delayed old close event cannot unlock the reopened drawer');
    pending.resolve({ok:true,status:200,json:async()=>({answer:'旧结果'})});await request;assert.equal(f.run('askHistory[0].answer'),'');
    f.get('ask-close').onclick();assert.equal(f.body.style.overflow,'');
  }
}
// Rendering or input changes cancel obsolete context, and response checks work without observers.
{
  const f=fixture(),pending=deferred();f.context.response=pending.promise;f.install();f.open();const request=f.send('第一天几站？');await f.flush();f.context.trip[0].duration=180;f.mutate();await f.flush();assert(f.requests[0].options.signal.aborted);assert.match(f.get('ask-status').textContent,/行程已修改/);pending.resolve({ok:true,status:200,json:async()=>({answer:'基于旧行程'})});await request;assert.equal(f.run('askHistory[0].answer'),'');
  const without=fixture({observer:false}),late=deferred();without.context.response=late.promise;without.install();without.open();const old=without.send('一天几站？');without.context.trip.pop();late.resolve({ok:true,status:200,json:async()=>({answer:'过时答案'})});await old;assert.match(without.get('ask-status').textContent,/行程已修改/);assert.equal(without.run('askHistory[0].answer'),'');
  const changed=fixture(),wait=deferred();changed.context.response=wait.promise;changed.install();changed.open();const work=changed.send('怎么坐车？');changed.get('travelmode').value='driving';changed.emit('change');await changed.flush();assert(changed.requests[0].options.signal.aborted);wait.resolve({ok:true,status:200,json:async()=>({answer:'公交答案'})});await work;
}
// Cancelling in place keeps the drawer and original question, without a second call.
{
  const f=fixture(),pending=deferred();f.context.response=pending.promise;f.install();f.open();const question='第二天我想保留开封府，但担心安排太赶，应该怎么调整？',work=f.send(question);await f.flush();
  const deadline=[...f.timers.values()].find(timer=>timer.delay===35000);assert(deadline,'The whole request has a bounded deadline');
  let prevented=0;f.get('ask-send').onclick({preventDefault(){prevented++}});
  assert.equal(prevented,1);assert(f.get('ask-dialog').open);assert(f.requests[0].options.signal.aborted);assert.equal(f.requests.length,1);assert.equal(f.get('ask-question').value,question);
  assert.equal(f.run('askHistory[0].state'),'cancelled');assert(!f.run('askHistory[0].recoverElement.hidden'));assert.equal(f.get('ask-send').type,'submit');assert(!f.get('ask-send').disabled);assert.equal(f.get('ask-dialog').attributes['aria-busy'],'false');assert(![...f.timers.values()].some(timer=>timer.delay===35000));
  pending.resolve({ok:true,status:200,json:async()=>({answer:'取消后的迟到答案'})});await work;assert.equal(f.run('askHistory[0].answer'),'');assert.equal(f.requests.length,1);
}
// Recovery never overwrites a new draft question or silently retries a paid request.
{
  const f=fixture(),pending=deferred();f.context.response=pending.promise;f.install();f.open();const work=f.send('第一天会不会太赶？');f.get('ask-question').value='我正在写另一个问题';
  pending.resolve({ok:false,status:502,json:async()=>({error:'upstream failed'})});await work;
  const recovery=f.run('askHistory[0].recoverElement');assert(!recovery.hidden);assert(!recovery.disabled);assert.equal(f.get('ask-question').value,'我正在写另一个问题');
  recovery.onclick();assert.equal(f.get('ask-question').value,'我正在写另一个问题');assert.match(f.get('ask-status').textContent,/已有新的问题/);assert.equal(f.requests.length,1);
  f.get('ask-question').value='';recovery.onclick();assert.equal(f.get('ask-question').value,'第一天会不会太赶？');assert.match(f.get('ask-status').textContent,/手动发送/);assert.equal(f.requests.length,1);
  f.context.trip[0].duration=180;f.context.response={ok:true,status:200,json:async()=>({answer:'根据当前安排，第一站预留180分钟。'})};await f.send(f.get('ask-question').value);
  assert.equal(f.requests.length,2);assert.equal(JSON.parse(f.requests[1].options.body).trip.schedule[0].stops[0].duration,180);assert.deepEqual(Object.keys(JSON.parse(f.requests[1].options.body)),['question','trip']);assert.equal(f.run('askHistory[0].state'),'error');assert.equal(f.run('askHistory[1].state'),'answered');assert(f.run('askHistory[1].recoverElement.hidden'));
  const cancel=fixture(),waiting=deferred();cancel.context.response=waiting.promise;cancel.install();cancel.open();const old=cancel.send('旧问题');cancel.get('ask-question').value='保留新问题';cancel.get('ask-send').onclick({preventDefault(){}});assert.equal(cancel.get('ask-question').value,'保留新问题');waiting.resolve({ok:true,status:200,json:async()=>({answer:'迟到'})});await old;
}
// The deadline covers both fetch and body reading, and stale timers/results cannot cancel new work.
{
  for(const stage of ['fetch','body']){
    const f=fixture(),pending=deferred(),next=deferred();f.context.response=stage==='fetch'?pending.promise:{ok:true,status:200,json:()=>pending.promise};f.install();f.open();const first=f.send('长时间等待的问题');await f.flush();
    const [timerId,timer]=[...f.timers.entries()].find(([,entry])=>entry.delay===35000);f.timers.delete(timerId);timer.fn();
    assert(f.requests[0].options.signal.aborted);assert.equal(f.run('askHistory[0].state'),'error');assert.equal(f.get('ask-question').value,'长时间等待的问题');assert.match(f.get('ask-status').textContent,/超时/);assert.equal(f.requests.length,1);assert.equal(f.run('askRequest'),null);assert(!f.run('askHistory[0].recoverElement.hidden'));
    f.context.response=next.promise;const second=f.send('超时后手动发起的新问题');await f.flush();timer.fn();assert(!f.requests[1].options.signal.aborted,'An old deadline cannot abort a new request');assert.equal([...f.timers.values()].filter(entry=>entry.delay===35000).length,1);
    pending.resolve(stage==='fetch'?{ok:true,status:200,json:async()=>({answer:'过时回答'})}:{answer:'过时回答'});await first;assert.equal(f.run('askHistory[0].answer'),'');assert.equal(f.run('askHistory[1].state'),'pending');assert.equal(f.get('ask-send').textContent,'取消回答');assert(f.run('askHistory[0].recoverElement.disabled'));
    next.resolve({ok:true,status:200,json:async()=>({answer:'新的有效回答'})});await second;assert.equal(f.run('askHistory[1].answer'),'新的有效回答');assert(![...f.timers.values()].some(entry=>entry.delay===35000));assert(!f.run('askHistory[0].recoverElement.disabled'));
  }
}
// Unexpected upstream aborts are recoverable rather than leaving a permanent pending entry.
{
  const f=fixture(),error=Error('interrupted');error.name='AbortError';f.context.response=Promise.reject(error);f.install();f.open();await f.send('需要保留的问题');assert.equal(f.run('askHistory[0].state'),'error');assert.equal(f.get('ask-question').value,'需要保留的问题');assert.match(f.get('ask-status').textContent,/中断/);assert.equal(f.run('askRequest'),null);assert(![...f.timers.values()].some(entry=>entry.delay===35000));assert.equal(f.requests.length,1);
  const failure=fixture();failure.context.response={ok:false,status:429,json:async()=>({error:'今天额度已用完'})};failure.install();failure.open();await failure.send('原问题');assert.equal(failure.get('ask-question').value,'原问题');assert.equal(failure.requests.length,1);assert.match(failure.get('ask-status').textContent,/额度已用完/);
}
// Examples rotate only when the open drawer is visible, idle, empty and blurred.
{
  const f=fixture();f.install();assert.equal(f.timers.size,0);f.open();assert.equal(f.timers.size,0,'Autofocused input cannot rotate');f.get('ask-question').blur();assert.equal(f.timers.size,1);f.tick();assert.equal(f.get('ask-question').placeholder,'怎么分享这份行程？');f.tick();assert.equal(f.get('ask-question').placeholder,'怎么导出行程图？');f.tick();assert.equal(f.get('ask-question').placeholder,'拍照识景点怎么用，没识别出来怎么办？');f.tick();assert.equal(f.get('ask-question').placeholder,'第 1 天安排了几站，会不会太赶？');assert.equal(f.get('ask-question').value,'');assert.equal(f.requests.length,0);
  f.get('ask-question').focus();assert.equal(f.timers.size,0);f.get('ask-question').value='我自己的问题';f.get('ask-question').blur();assert.equal(f.timers.size,0);f.get('ask-question').value='';f.context.refreshAskUI();assert.equal(f.timers.size,1);
  f.context.document.hidden=true;f.emit('visibilitychange');assert.equal(f.timers.size,0);f.context.document.hidden=false;f.emit('visibilitychange');assert.equal(f.timers.size,1);
  f.motion.matches=true;f.motion.handler();assert.equal(f.timers.size,0);f.motion.matches=false;f.motion.handler();assert.equal(f.timers.size,1);f.get('ask-dialog').close();assert.equal(f.timers.size,0);
}
// The real binding respects Chinese composition and Shift+Enter, while plain Enter submits.
{
  const f=fixture();f.install();f.open();const input=f.get('ask-question');input.value='第一天几站？';let prevented=0;
  for(const options of [{isComposing:true},{keyCode:229},{shiftKey:true}])input.emit('keydown',{key:'Enter',preventDefault(){prevented++},...options});assert.equal(f.requests.length,0);assert.equal(prevented,0);
  input.emit('keydown',{key:'Enter',preventDefault(){prevented++}});await f.flush();assert.equal(f.requests.length,1);assert.equal(prevented,1);
}
// Scoped styling, touch-safe mobile layout, truthful animation and legacy fixture guards.
{
  assert.match(css,/@media \(max-width: 767px\)/);assert.match(css,/#ask-question[\s\S]*font-size: 16px/);assert.match(css,/min-height: 4[468]px/);assert.match(css,/safe-area-inset-bottom/);assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);assert.match(css,/overscroll-behavior: contain/);assert(!/animation[^;]*infinite/.test(css));
  assert.match(css,/body:not\(\[data-view="gallery"\]\)/);assert.match(css,/\.ask-examples button \{[^}]*min-height: 44px/);assert.match(css,/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  const legacy={document:{body:{dataset:{view:'gallery'}}}};vm.createContext(legacy);vm.runInContext(source,legacy);assert.doesNotThrow(()=>legacy.installAskUI());
}
console.log('Ask UI tests passed: gallery public-service entry, scoped help, fill-only protected examples, honest site-instruction notes, numeric budget privacy, view entry, MutationObserver convergence, privacy-safe snapshots, read-only history, recoverable errors, in-place cancellation, bounded fetch/body deadlines, stale timers/results, preserved new input, manual resend with fresh context, IME, examples and mobile controls.');
