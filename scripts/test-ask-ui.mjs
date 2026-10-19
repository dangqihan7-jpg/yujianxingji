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
function fixture({view='planner',protocol='https:',observer=true}={}){
  const nodes=new Map(),requests=[],timers=new Map(),documentEvents=new Map(),globalEvents=new Map();let nextTimer=0,observerCallback=null;
  class Node {
    constructor(tag='div'){this.tagName=tag;this._id='';this._html='';this._text='';this.value='';this.placeholder='';this.open=false;this.hidden=false;this.disabled=false;this.dataset={};this.attributes={};this.children=[];this.handlers=new Map();this.style={overflow:''};this.isConnected=true;this.scrollTop=0;this.scrollHeight=400}
    set id(value){this._id=value;nodes.set(value,this)}get id(){return this._id}
    set innerHTML(value){this._html=value;for(const match of value.matchAll(/\bid="([^"]+)"/g)){const node=new Node(match[1]==='ask-question'?'textarea':'div');node.id=match[1];if(match[1]==='ask-question')node.placeholder='龙门石窟需要提前预约吗？';this.children.push(node)}}get innerHTML(){return this._html}
    set textContent(value){this._text=String(value)}get textContent(){return this._text}
    append(node){node.parentNode=this;node.isConnected=true;this.children.push(node);if(node.id)nodes.set(node.id,node)}
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
  if(observer)context.MutationObserver=class{constructor(callback){observerCallback=callback}observe(node,options){assert.equal(node,body);assert(options.childList&&options.subtree);this.options=options}};
  vm.createContext(context);vm.runInContext(source,context);
  const emit=(type,event={})=>{for(const handler of documentEvents.get(type)||[])handler(event)};
  return {context,nodes,requests,timers,motion,globalEvents,body,html,Node,emit,get:id=>nodes.get(id),run:code=>vm.runInContext(code,context),install:()=>context.installAskUI(),open:()=>context.openAsk(),send:question=>{nodes.get('ask-question').value=question;return context.submitAskQuestion({preventDefault(){}})},
    mutate(){observerCallback?.()},tick(){const entry=[...timers.entries()][0];assert(entry,'Expected a placeholder timer');timers.delete(entry[0]);assert.equal(entry[1].delay,5000);entry[1].fn()},async flush(){await Promise.resolve();await Promise.resolve();await Promise.resolve()}};
}

// Persistent native entry, exact view scope and accessibility; opening is read-only.
{
  const f=fixture();f.install();assert.equal(f.body.children.length,2);assert(!f.get('ask-launcher').hidden);assert(!f.get('ask-dialog'));
  f.install();assert.equal(f.body.children.length,2,'Install once despite page renders');
  f.context.document.activeElement=f.get('ask-launcher');f.body.style.overflow='auto';f.html.style.overflow='clip';f.open();
  const dialog=f.get('ask-dialog');assert(dialog.open);assert.equal(dialog.tagName,'dialog');assert.equal(dialog.attributes['aria-labelledby'],'ask-title');assert(dialog.innerHTML.includes('最多 600 字'));
  assert.equal(f.context.document.activeElement,f.get('ask-question'));assert.equal(f.body.style.overflow,'hidden');assert.equal(f.html.style.overflow,'hidden');assert.equal(f.requests.length,0);
  f.open();assert.equal(f.get('ask-dialog'),dialog);dialog.close();assert.equal(f.body.style.overflow,'auto');assert.equal(f.html.style.overflow,'clip');assert.equal(f.context.document.activeElement,f.get('ask-launcher'));
  f.body.dataset.view='gallery';f.context.refreshAskUI();assert(f.get('ask-launcher').hidden);f.open();assert(!dialog.open);
  f.body.dataset.view='overview';f.context.refreshAskUI();assert(!f.get('ask-launcher').hidden);f.open();assert(dialog.open);
  f.body.dataset.view='decision';f.context.refreshAskUI();assert(!dialog.open);assert(f.get('ask-launcher').hidden);
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
  const f=fixture(),pending=deferred();f.context.response=pending.promise;f.install();f.open();const first=f.send('第一个问题？');await f.flush();assert.equal(f.requests.length,1);assert.equal(f.get('ask-status').textContent,'AI 正在回答…');assert(f.get('ask-send').disabled);
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
// Examples rotate only when the open drawer is visible, idle, empty and blurred.
{
  const f=fixture();f.install();assert.equal(f.timers.size,0);f.open();assert.equal(f.timers.size,0,'Autofocused input cannot rotate');f.get('ask-question').blur();assert.equal(f.timers.size,1);f.tick();assert.equal(f.get('ask-question').placeholder,'第二天中午在开封有啥好吃的？');f.tick();assert.equal(f.get('ask-question').placeholder,'这两天的交通大概花多少钱？');f.tick();assert.equal(f.get('ask-question').placeholder,'龙门石窟需要提前预约吗？');assert.equal(f.get('ask-question').value,'');assert.equal(f.requests.length,0);
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
  const legacy={document:{body:{dataset:{view:'gallery'}}}};vm.createContext(legacy);vm.runInContext(source,legacy);assert.doesNotThrow(()=>legacy.installAskUI());
}
console.log('Ask UI tests passed: view entry, real privacy-safe snapshots, read-only history, errors, cancellation, stale results, IME, examples and mobile controls.');
