import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import worker,{HTML} from '../worker/index.js';

const source=readFileSync(new URL('../ai-hero.js',import.meta.url),'utf8');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}}
function fixture({reduced=false}={}){
 const nodes=new Map(),timers=new Map(),events=new Map(),requests=[],messages=[];let next=0,modal=false;
 class Node{
  constructor(id){this.id=id;this.value='';this.placeholder='';this.disabled=false;this.isConnected=true;this.attributes={};this.innerHTML='';this.textContent=''}
  setAttribute(name,value){this.attributes[name]=value}
  focus(){context.document.activeElement=this;this.onfocus?.()}
  setSelectionRange(start,end,direction){this.selectionStart=start;this.selectionEnd=end;this.selectionDirection=direction}
 }
 const ids=['ai-planning-hero','ai-hero-form','ai-hero-input','ai-hero-submit','ai-hero-status'];
 for(const id of ids)nodes.set(id,new Node(id));
 const context={console,esc:escape,cfg:{aiConfigured:true,authMode:'standalone',publicAiDemo:false},authUser:null,activeView:'gallery',saveBooting:false,briefBusy:false,
  document:{hidden:false,activeElement:null,body:{dataset:{view:'gallery'}},getElementById:id=>nodes.get(id)||null,querySelector:s=>s==='dialog[open]'?(modal?{}:null):nodes.get(s.slice(1))||null,addEventListener(type,fn){events.set(type,fn)}},
  setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id),matchMedia:()=>({matches:reduced,addEventListener(){}}),addEventListener(type,fn){events.set(type,fn)},toast:text=>messages.push(text),openBrief:async text=>requests.push(text)};
 vm.createContext(context);vm.runInContext(source,context);context.bindAIPlanningHero();
 return {context,nodes,timers,events,requests,messages,run:s=>vm.runInContext(s,context),get:id=>nodes.get(id),replace(){for(const id of ids){nodes.get(id).isConnected=false;nodes.set(id,new Node(id))}context.bindAIPlanningHero()},modal(value){modal=value;context.refreshAIHeroLifecycle()},tick(){const entry=[...timers.entries()][0];assert(entry,'Expected a placeholder timer');timers.delete(entry[0]);entry[1].fn()}};
}
{
 const f=fixture(),html=f.context.aiPlanningHeroHTML();
 assert(html.includes('一句话，让 AI 为你规划河南周末游'));assert(html.includes('5 个 AI 智能体协同'));
 assert.equal((html.match(/class="ai-hero-agent"/g)||[]).length,5);
 for(const role of ['需求理解','地点推荐','日程编排','交通核算','冲突校验'])assert(html.includes(role));
 assert(html.includes('type="submit"'));assert(html.includes('maxlength="600"'));assert(html.includes('规则规划'));
 f.context.authUser={id:1};assert(f.context.aiPlanningHeroHTML().includes('AI 服务已配置'));
 f.context.cfg.aiConfigured=false;assert(f.context.aiPlanningHeroHTML().includes('当前使用规则规划'));
 assert(!html.includes('AI 正在思考'),'Idle decoration cannot claim an active model request');
}
{
 const f=fixture();let prevented=0;
 await f.get('ai-hero-form').onsubmit({preventDefault(){prevented++}});assert.equal(prevented,1);assert.equal(f.requests.length,0);assert.match(f.get('ai-hero-status').textContent,/先写下/);
 f.get('ai-hero-input').value='   洛阳周末2天，预算800元   ';
 await f.get('ai-hero-form').onsubmit({preventDefault(){}});assert.deepEqual(f.requests,['洛阳周末2天，预算800元']);
 assert.equal(f.get('ai-hero-input').value,'   洛阳周末2天，预算800元   ','Submitting retains the original draft text');
 assert.equal(f.get('ai-hero-submit').disabled,false);assert.equal(f.get('ai-hero-input').onkeydown,undefined,'Enter and IME input retain native textarea behavior');
 f.context.saveBooting=true;await f.context.submitAIHero();assert.equal(f.requests.length,1);assert.match(f.messages.at(-1),/恢复/);
 f.context.saveBooting=false;f.context.briefBusy=true;await f.context.submitAIHero();assert.equal(f.requests.length,1);
}
{
 const f=fixture(),pending=deferred();f.context.openBrief=text=>{f.requests.push(text);return pending.promise};f.get('ai-hero-input').value='开封一日游';
 const first=f.context.submitAIHero();assert(f.get('ai-hero-submit').disabled);assert.equal(f.get('ai-hero-form').attributes['aria-busy'],'true');
 await f.context.submitAIHero();assert.equal(f.requests.length,1,'Repeated taps must not start another intent request');
 f.context.captureAIHeroDraft();f.replace();assert.equal(f.get('ai-hero-input').value,'开封一日游');assert(f.get('ai-hero-submit').disabled,'Rerendering cannot bypass the in-flight guard');
 pending.reject(Error('fixture unavailable'));await first;assert.equal(f.get('ai-hero-submit').disabled,false);assert.match(f.messages.at(-1),/fixture unavailable/);assert.equal(f.get('ai-hero-input').value,'开封一日游');
}
{
 const f=fixture(),seen=new Set();assert.equal(f.timers.size,1);
 for(let i=0;i<3;i++){f.tick();seen.add(f.get('ai-hero-input').placeholder);assert.equal(f.timers.size,1);assert.equal(f.get('ai-hero-input').value,'')}
 assert.equal(seen.size,3,'Cycle through three distinct examples without entering or submitting them');assert.equal(f.requests.length,0);
 f.get('ai-hero-input').focus();assert.equal(f.timers.size,0);f.context.document.activeElement=null;f.get('ai-hero-input').onblur();assert.equal(f.timers.size,1);
 f.get('ai-hero-input').value='还没写完 <script>，别替换我的文字';f.get('ai-hero-input').oninput();assert.equal(f.timers.size,0);
 f.context.captureAIHeroDraft();const html=f.context.aiPlanningHeroHTML();assert(html.includes('&lt;script&gt;'));assert(!html.includes('还没写完 <script>'));
 f.replace();assert.equal(f.get('ai-hero-input').value,'还没写完 <script>，别替换我的文字');
 f.get('ai-hero-input').value='';f.get('ai-hero-input').oninput();assert.equal(f.timers.size,1);
 f.modal(true);assert.equal(f.timers.size,0);f.modal(false);assert.equal(f.timers.size,1);
 f.context.activeView='planner';f.context.refreshAIHeroLifecycle();assert.equal(f.timers.size,0);f.context.activeView='gallery';f.context.refreshAIHeroLifecycle();assert.equal(f.timers.size,1);
 f.context.document.hidden=true;f.events.get('visibilitychange')();assert.equal(f.timers.size,0);f.context.document.hidden=false;f.events.get('visibilitychange')();assert.equal(f.timers.size,1);
 const late=[...f.timers.values()][0].fn;f.context.document.hidden=true;late();assert.equal(f.requests.length,0,'Late timer callbacks never submit a plan');
 assert.equal(fixture({reduced:true}).timers.size,0,'Reduced-motion users see a static example');
}

{
 const f=fixture(),input=f.get('ai-hero-input');input.value='保留正在输入的河南周末计划';input.focus();input.setSelectionRange(2,5,'backward');
 f.context.captureAIHeroDraft();f.replace();const restored=f.get('ai-hero-input');
 assert.equal(f.context.document.activeElement,restored);assert.equal(restored.selectionStart,2);assert.equal(restored.selectionEnd,5);assert.equal(restored.selectionDirection,'backward');
 f.context.activeView='planner';f.context.captureAIHeroDraft();f.replace();assert.notEqual(f.context.document.activeElement,f.get('ai-hero-input'),'Leaving the gallery must not force focus into a hidden entry');
}

// Execute the built application, so the new form must actually reach the
// existing openBrief and /api/intent path rather than an isolated duplicate.
{
 const nodes=new Map(),requests=[];const body={dataset:{view:'gallery'},contains:()=>true};
 const get=selector=>{if(selector==='dialog[open]')return [...nodes.values()].find(n=>n.open)||null;if(!nodes.has(selector))nodes.set(selector,{value:selector==='#days'?'2':selector==='#city'?'河南':selector==='#start'?'09:00':selector==='#travelmode'?'driving':selector==='#maxhours'?'8':selector==='#restmins'?'30':'',innerHTML:'',textContent:'',style:{},dataset:{},hidden:false,open:false,isConnected:true,classList:{add(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},setAttribute(){},focus(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(selector)};
 const context={console,Map,Set,URL,Blob,Date,navigator:{},document:{body,querySelector:get,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}}),head:{append(){}}},setTimeout:()=>0,clearTimeout(){},fetch:async(path,options)=>{requests.push({path,body:options?.body?JSON.parse(options.body):null});return worker.fetch(new Request('https://fixture.test'+path,options),{})}};context.window=context;
 vm.createContext(context);vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,''),context);
 const run=code=>vm.runInContext(code,context),markup=get('#gallery').innerHTML;
 assert(markup.indexOf('id="ai-planning-hero"')>=0&&markup.indexOf('id="ai-planning-hero"')<markup.indexOf('id="hero-slideshow"'));
 for(const old of ['id="hero-slideshow"','id="henan-cities"','id="weekend-plan"','id="theme-routes"'])assert(markup.includes(old),'Keep the existing gallery section '+old);
 run('saveBooting=false');const before=run('JSON.stringify(compactDraft())');get('#ai-hero-input').value='洛阳两天，公交，预算800元';
 await get('#ai-hero-form').onsubmit({preventDefault(){}});
 const intents=requests.filter(r=>r.path==='/api/intent');assert.equal(intents.length,1);assert.equal(intents[0].body.text,'洛阳两天，公交，预算800元');
 assert(get('#brief').open,'The existing requirement confirmation opens');assert(get('#briefbody').innerHTML.includes('id="buildcandidate"'));
 assert.equal(run('JSON.stringify(compactDraft())'),before,'The Hero cannot apply or replace a draft without confirmation');
 assert(!requests.some(r=>r.path==='/api/agent'),'Agent generation still waits for the existing condition confirmation');
 run("setView('planner');setView('gallery')");assert.equal(get('#ai-hero-input').value,'洛阳两天，公交，预算800元');
}
console.log('AI 首页：五角色渲染、真实入口桥接、条件确认门禁、空输入/重复/加载保护、三示例轮换、焦点/后台/弹窗/减少动效暂停与草稿保留通过。');
