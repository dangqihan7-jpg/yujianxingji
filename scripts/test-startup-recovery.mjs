import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker, {HTML, CATALOG} from '../worker/index.js';

const script=HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');
const savedDraft={version:2,city:'洛阳',days:2,start:'10:30',mode:'transit',maxHours:6,restMinutes:30,presetId:'luoyang',stops:[{place:{...CATALOG.find(p=>p.id==='hn-longmen')},day:1,duration:180}]};
const pendingKey='yujianxingji.pendingDraft';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate,message){for(let i=0;i<60&&!predicate();i++)await tick();assert(predicate(),message)}
async function settled(promise,message='Operation must settle without waiting for optional requests'){
  let state='pending',value;Promise.resolve(promise).then(result=>{state='resolved';value=result},error=>{state='rejected';value=error});
  await until(()=>state!=='pending',message);if(state==='rejected')throw value;return value;
}
function fixture(customFetch){
  const nodes=new Map(),timers=new Map(),storage=new Map(),requests=[];let timerId=0;
  const initial={'#days':'2','#start':'09:00','#city':'洛阳','#travelmode':'driving','#maxhours':'6','#restmins':'30','#query':''};
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:initial[selector]||'',textContent:'',innerHTML:'',hidden:false,disabled:false,dataset:{},style:{},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],addEventListener(){},setAttribute(){},removeAttribute(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(selector)};
  const fallback=async(path,options={})=>{
    if(path==='/api/config')return json({authMode:'standalone',persistenceConfigured:true,mapConfigured:false,placesConfigured:false,aiConfigured:false});
    if(path==='/api/auth/me')return json({user:{id:'fixture-user',username:'测试账号'}});
    if(path==='/api/draft'&&options.method!=='POST')return json({draft:savedDraft,revision:7});
    if(path==='/api/draft')return json({revision:8});
    if(path==='/api/validate')return worker.fetch(new Request('https://fixture.test/api/validate',options),{});
    throw Error('Unexpected fixture request: '+path);
  };
  const context={
    document:{querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(){}}},
    navigator:{},location:{origin:'https://fixture.test'},URL,Map,Set,Blob,Response,AbortController,console,
    sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)},
    setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),
    fetch(path,options={}){requests.push({path,options});return customFetch?customFetch(path,options,fallback):fallback(path,options)}
  };
  context.window=context;vm.createContext(context);vm.runInContext(script,context);
  return {get,context,storage,requests,timers,run:source=>vm.runInContext(source,context),
    count:(path,method='GET')=>requests.filter(r=>r.path===path&&(r.options.method||'GET')===method).length,
    deadlines:()=>[...timers.values()].filter(timer=>timer.delay===12000).length,
    deadline(){const entry=[...timers].find(([,timer])=>timer.delay===12000);assert(entry,'A restore request must have a 12 second deadline');timers.delete(entry[0]);entry[1].fn()}
  };
}
async function assertProtected(f){
  assert.equal(f.run('saveBooting'),true,'Failed restoration must keep draft saving blocked');
  assert.equal(f.run('saveBlocked'),true);assert.equal(f.run('restoreFailed'),true);
  assert.equal(f.get('#trip').inert,true);assert.equal(f.get('#restore-status').hidden,false);
  assert.equal(f.get('#restore-status').dataset.state,'error');assert.equal(f.get('#restore-retry').disabled,false);
  await settled(f.run('flushSave()'));assert.equal(f.count('/api/draft','POST'),0,'Failure must never overwrite the saved draft');
}
function assertReady(f){
  assert.equal(f.run('saveBooting'),false);assert.equal(f.run('saveBlocked'),false);assert.equal(f.run('restoreFailed'),false);
  assert.equal(f.get('#trip').inert,false);assert.equal(f.get('#restore-status').hidden,true);
  assert.equal(f.get('#restore-continue').hidden,true);
}
async function assertCannotContinue(f){
  assert.equal(f.get('#restore-continue').hidden,true,'Only a pending handoff failure may offer the continue action');
  f.run('keepRestoredJourney()');await assertProtected(f);
}
async function continueWithoutSaving(f,raw){
  assert.equal(f.get('#restore-continue').hidden,false);
  assert.equal(f.run('saveBooting'),true,'Showing the continue action alone must not unlock the page');
  const current=f.run('JSON.stringify(compactDraft())');
  f.get('#restore-continue').onclick();await tick();assertReady(f);
  assert.equal(f.run('JSON.stringify(compactDraft())'),current,'Continue retains the account draft already read');
  assert.equal(f.run('lastSaved'),current,'Continue must not treat the retained draft as a new cloud write');
  assert.equal(f.storage.get(pendingKey),raw,'Continue never discards the recoverable handoff');
  f.run('scheduleSave()');await settled(f.run('flushSave()'));
  assert.equal(f.count('/api/draft','POST'),0,'Continuing without edits must not issue an automatic save');
}

// The same deadline covers both fetch and body consumption, even if abort is ignored.
for(const stage of ['fetch','body']){
  const late=deferred();const f=fixture(()=>stage==='fetch'?late.promise:Promise.resolve({ok:true,status:200,json:()=>late.promise}));
  const request=f.run("api('/fixture',undefined,{timeoutMs:12000})");
  const rejected=assert.rejects(request,error=>error.code==='REQUEST_TIMEOUT');
  await tick();f.deadline();await settled(rejected);
  assert.equal(f.requests[0].options.signal.aborted,true);assert.equal(f.deadlines(),0);
  late.resolve(stage==='fetch'?json({ok:true}):{ok:true});await tick();
}
{
  const late=deferred();const f=fixture(()=>late.promise);
  const request=f.run("api('/fixture',{value:1})");await tick();
  assert.equal(f.deadlines(),0,'Other API calls retain their existing default timeout behavior');
  assert.equal(f.requests[0].options.signal,undefined);assert.equal(f.requests[0].options.method,'POST');
  assert.equal(f.requests[0].options.body,'{"value":1}');late.resolve(json({ok:true}));
  assert.equal((await settled(request)).ok,true);
  const fast=fixture(()=>Promise.resolve(json({ok:true})));
  await settled(fast.run("api('/fixture',undefined,{timeoutMs:12000})"));assert.equal(fast.deadlines(),0,'Success must clear its deadline');
}

// A hanging config request is retryable and cannot switch into an anonymous save path.
{
  const late=deferred();let hang=true;
  const f=fixture((path,options,next)=>path==='/api/config'&&hang?late.promise:next(path,options));
  const first=f.run('init()'),second=f.run('init()');assert.equal(first,second,'Concurrent starts must share the same attempt');
  assert.equal(f.count('/api/config'),1);assert.equal(f.get('#restore-retry').disabled,true);
  f.deadline();await settled(first);await assertProtected(f);await assertCannotContinue(f);
  assert(f.get('#restore-status-message').textContent.includes('连接超时'));
  hang=false;await settled(f.get('#restore-retry').onclick());assertReady(f);assert.equal(f.run('trip[0].place.id'),'hn-longmen');
  late.resolve(json({persistenceConfigured:false}));await tick();
  assert.equal(f.run('cfg.persistenceConfigured'),true,'A late failed attempt must not replace the successful retry configuration');
  assert.equal(f.run('trip[0].place.id'),'hn-longmen');assert.equal(f.count('/api/config'),2);
}

for(const failure of ['http','network']){
  const f=fixture((path,options,next)=>{
    if(path==='/api/auth/me')return failure==='http'?Promise.resolve(json({error:'账号服务暂时不可用'},503)):Promise.reject(Error('network disconnected'));
    return next(path,options);
  });
  f.run("authUser={id:'known-user',username:'已登录用户'}");
  await settled(f.run('init()'));await assertProtected(f);await assertCannotContinue(f);
  assert.equal(f.run('authUser.id'),'known-user','Auth failure must not be treated as proof of logout');
  assert.equal(f.count('/api/draft'),0);assert.equal(f.run('cfg.persistenceConfigured'),true);
}
{
  const f=fixture((path,options,next)=>['/api/auth/me','/api/draft'].includes(path)?Promise.resolve(json({error:'请先登录'},401)):next(path,options));
  f.run("authUser={id:'old-user'}");await settled(f.run('init()'));assertReady(f);
  assert.equal(f.run('authUser'),null);assert.equal(f.run('cfg.persistenceConfigured'),false);
  assert(f.get('#savestatus').textContent.includes('访客'));assert.equal(f.count('/api/draft','POST'),0);
}

// Exercise every remaining restore request, including JSON parsing, and discard late data.
for(const phase of ['auth','draft','validate','draft-body']){
  const late=deferred();let hang=true;
  const blockedPath=phase==='auth'?'/api/auth/me':phase==='validate'?'/api/validate':'/api/draft';
  const f=fixture((path,options,next)=>{
    if(path===blockedPath&&hang){
      if(phase==='draft-body')return Promise.resolve({ok:true,status:200,json:()=>late.promise});
      return late.promise;
    }
    return next(path,options);
  });
  const attempt=f.run('init()');await until(()=>f.count(blockedPath,phase==='validate'?'POST':'GET')===1,'Restore must reach '+phase);
  await tick();f.deadline();await settled(attempt);await assertProtected(f);await assertCannotContinue(f);
  hang=false;await settled(f.get('#restore-retry').onclick());assertReady(f);
  const restored=f.run('JSON.stringify(compactDraft())');
  const oldDraft={...savedDraft,start:'06:00',stops:[{...savedDraft.stops[0],duration:60}]};
  if(phase==='draft-body')late.resolve({draft:oldDraft,revision:1});
  else if(phase==='draft')late.resolve(json({draft:oldDraft,revision:1}));
  else if(phase==='auth')late.resolve(json({user:{id:'stale-user'}}));
  else late.resolve(json({days:2,start:'06:00',stops:oldDraft.stops}));
  await tick();await tick();assert.equal(f.run('JSON.stringify(compactDraft())'),restored,'Late '+phase+' result must not replace recovered data');
  assert.equal(f.run('authUser.id'),'fixture-user');assert.equal(f.run('saveRevision'),7);
}

{
  const f=fixture();f.run('search=()=>new Promise(()=>{})');
  await settled(f.run('init()'),'An optional hanging place search must not block restoration');assertReady(f);
  assert.equal(f.run('trip.length'),1);assert.equal(f.run('trip[0].place.id'),'hn-longmen');assert.equal(f.get('#start').value,'10:30');
}
{
  let fail=false;const f=fixture((path,options,next)=>path==='/api/config'&&fail?Promise.resolve(json({error:'暂时无法连接'},503)):next(path,options));
  await settled(f.run('init()'));f.run('trip[0].duration=215');f.get('#start').value='11:15';
  const edited=f.run('JSON.stringify(compactDraft())');fail=true;
  await settled(f.run('init()'));await assertProtected(f);
  assert.equal(f.run('JSON.stringify(compactDraft())'),edited,'Retry must never reseed the default itinerary over the page draft');
  await settled(f.get('#restore-retry').onclick());assert.equal(f.run('JSON.stringify(compactDraft())'),edited);
}

// Login handoff stays in sessionStorage until validated and applied, including across retries.
{
  const pending={...savedDraft,start:'11:45',stops:[{...savedDraft.stops[0],duration:240}]};let fail=true;
  const f=fixture((path,options,next)=>path==='/api/validate'&&JSON.parse(options.body).start==='11:45'&&fail?Promise.resolve(json({error:'验证暂时不可用'},503)):next(path,options));
  f.storage.set(pendingKey,JSON.stringify(pending));await settled(f.run('init()'));await assertProtected(f);
  assert.equal(f.storage.get(pendingKey),JSON.stringify(pending));assert(f.get('#restore-status-message').textContent.includes('原暂存内容已保留'));
  assert.equal(f.get('#start').value,'10:30','Failure retains the already restored account draft');
  await continueWithoutSaving(f,JSON.stringify(pending));
  fail=false;await settled(f.get('#restore-retry').onclick());assertReady(f);
  assert.equal(f.storage.has(pendingKey),false);assert.equal(f.get('#start').value,'11:45');assert.equal(f.run('trip[0].duration'),240);
}
{
  const f=fixture();f.storage.set(pendingKey,'{invalid');await settled(f.run('init()'));await assertProtected(f);
  assert.equal(f.storage.get(pendingKey),'{invalid','Malformed pending input must remain available for recovery');
  await continueWithoutSaving(f,'{invalid');
}
{
  const f=fixture(),raw=JSON.stringify({...savedDraft,start:'12:15'});f.storage.set(pendingKey,raw);
  const read=f.context.sessionStorage.getItem;
  f.context.sessionStorage.getItem=()=>{const error=Error('Storage access blocked');error.name='SecurityError';throw error};
  await settled(f.run('init()'));await assertProtected(f);await continueWithoutSaving(f,raw);
  f.context.sessionStorage.getItem=read;
  await settled(f.get('#restore-retry').onclick());assertReady(f);
  assert.equal(f.get('#start').value,'12:15');assert.equal(f.storage.has(pendingKey),false,'A later successful retry can still apply the retained handoff');
}
{
  const late=deferred();let hang=false;
  const f=fixture((path,options,next)=>path==='/api/config'&&hang?late.promise:next(path,options));
  f.storage.set(pendingKey,'{invalid');await settled(f.run('init()'));await assertProtected(f);
  const staleContinue=f.get('#restore-continue').onclick;assert.equal(f.get('#restore-continue').hidden,false);
  hang=true;const retry=f.get('#restore-retry').onclick();
  assert.equal(f.get('#restore-continue').hidden,true);assert.equal(f.get('#restore-continue').disabled,true);
  staleContinue();assert.equal(f.run('saveBooting'),true);assert.equal(f.get('#trip').inert,true);
  assert.equal(f.get('#restore-status').dataset.state,'loading','A stale continue click must not interrupt a retry');
  late.resolve(json({authMode:'standalone',persistenceConfigured:true,mapConfigured:false}));await settled(retry);
  await assertProtected(f);await continueWithoutSaving(f,'{invalid');
}

// Login/logout must not hand off the unedited demo itinerary or an unfinished restore.
{
  const f=fixture((path,options,next)=>path==='/api/config'?Promise.resolve(json({authMode:'none',persistenceConfigured:false,mapConfigured:false})):next(path,options));
  await settled(f.run('init()'));assertReady(f);assert(f.run('trip.length')>0);
  f.run('stashPendingDraft()');assert.equal(f.storage.has(pendingKey),false,'An untouched default preset must not be staged for account restoration');
  f.run('checkpoint();trip[0].duration+=15;stashPendingDraft()');
  assert.equal(f.storage.get(pendingKey),f.run('JSON.stringify(compactDraft())'),'A deliberate user edit may be handed off');
  const staged=f.storage.get(pendingKey);f.run('saveBooting=true;trip[0].duration+=15;stashPendingDraft()');
  assert.equal(f.storage.get(pendingKey),staged,'A restore in progress must not overwrite pending edits even if an undo history exists');
}
{
  const late=deferred();let fail=true,hang=false;
  const f=fixture((path,options,next)=>{
    if(path==='/api/config'&&fail)return Promise.resolve(json({error:'暂时无法连接'},503));
    if(path==='/api/config'&&hang)return late.promise;
    return next(path,options);
  });
  await settled(f.run('init()'));fail=false;hang=true;
  const first=f.get('#restore-retry').onclick(),second=f.get('#restore-retry').onclick();
  assert.equal(first,second);assert.equal(f.count('/api/config'),2,'Repeated retry must start only one request sequence');
  assert.equal(f.get('#restore-retry').disabled,true);
  late.resolve(json({authMode:'standalone',persistenceConfigured:true,mapConfigured:false}));await settled(first);assertReady(f);
  assert.equal(f.count('/api/auth/me'),1);assert.equal(f.count('/api/draft'),1);
}
console.log('Passed: bounded startup fetch/body recovery, auth failure versus confirmed 401, safe retry/concurrency, stale-response protection, optional search isolation, explicit continue without cloud overwrite and edited-only pending handoff preservation.');
