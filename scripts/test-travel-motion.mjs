import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../travel-motion.js',import.meta.url),'utf8');
// A small DOM fixture keeps this presentation test independent of npm/browser
// packages. Selectors implement only the standard subset used by the module.
function matches(node,selector){
  return selector.split(',').some(branch=>{
    const tokens=branch.trim().replace(/\s*>\s*/g,' > ').split(/\s+/);
    function simple(item,part){
      if(!item||!part)return false;
      if(part==='dialog:not([open])')return item.tagName==='dialog'&&!item.hasAttribute('open');
      const tag=part.match(/^[a-z]+/i)?.[0];if(tag&&item.tagName!==tag.toLowerCase())return false;
      for(const id of part.matchAll(/#([\w-]+)/g))if(item.id!==id[1])return false;
      for(const cls of part.matchAll(/\.([\w-]+)/g))if(!item.classList.contains(cls[1]))return false;
      for(const attr of part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)){
        if(!item.hasAttribute(attr[1])||(attr[2]!==undefined&&item.getAttribute(attr[1])!==attr[2]))return false;
      }
      return Boolean(tag||/[.#[]/.test(part));
    }
    function walk(item,index){
      if(!simple(item,tokens[index]))return false;
      if(index===0)return true;
      if(tokens[index-1]==='>')return walk(item.parentElement,index-2);
      for(let parent=item.parentElement;parent;parent=parent.parentElement)if(walk(parent,index-1))return true;
      return false;
    }
    return walk(node,tokens.length-1);
  });
}
function fixture({reduced=false,intersection=true,mutation=true,hidden=false,observerThrows=false,legacyMedia=false,raf=true}={}){
  const events=new Map(),windowEvents=new Map(),frames=new Map(),timers=new Map(),observers=[],mutationObservers=[],scans=[];
  let serial=0,mediaListener;
  class Node{
    constructor(tag='div',{id='',classes='',text='',hidden=false,open=false,attrs={}}={}){
      this.nodeType=1;this.tagName=tag;this.id=id;this.children=[];this.parentElement=null;this.attributes=new Map(Object.entries(attrs));this.textContent=text;this.disabled=false;this.displayNone=false;
      this.classValues=new Set(classes.split(' ').filter(Boolean));
      this.classList={add:(...names)=>names.forEach(name=>this.classValues.add(name)),remove:(...names)=>names.forEach(name=>this.classValues.delete(name)),contains:name=>this.classValues.has(name)};
      this.styleValues=new Map();this.style={setProperty:(key,value)=>this.styleValues.set(key,value),removeProperty:key=>this.styleValues.delete(key),getPropertyValue:key=>this.styleValues.get(key)||''};
      this.hidden=hidden;if(open)this.setAttribute('open','');
    }
    get isConnected(){let node=this;while(node.parentElement)node=node.parentElement;return node===body}
    get hidden(){return this.hasAttribute('hidden')}
    set hidden(value){if(value)this.setAttribute('hidden','');else this.removeAttribute('hidden')}
    append(...nodes){for(const node of nodes){node.parentElement=this;this.children.push(node)}return nodes.at(-1)}
    remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(node=>node!==this);this.parentElement=null}
    contains(node){for(let item=node;item;item=item.parentElement)if(item===this)return true;return false}
    matches(selector){return matches(this,selector)}
    closest(selector){for(let node=this;node;node=node.parentElement)if(node.matches(selector))return node;return null}
    querySelectorAll(selector){scans.push({root:this,selector});return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)])}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null}
    hasAttribute(key){return key==='id'?Boolean(this.id):this.attributes.has(key)}
    getAttribute(key){return key==='id'?this.id:this.attributes.get(key)??null}
    setAttribute(key,value){if(key==='id')this.id=String(value);else this.attributes.set(key,String(value))}
    removeAttribute(key){this.attributes.delete(key)}
    getClientRects(){for(let node=this;node;node=node.parentElement)if(node.hidden||node.displayNone||(node.tagName==='dialog'&&!node.hasAttribute('open')))return [];return [{}]}
  }
  const body=new Node('body'),media={matches:reduced};
  const listen=(map,type,callback)=>{const list=map.get(type)||[];list.push(callback);map.set(type,list)};
  const document={body,hidden,querySelectorAll:selector=>body.querySelectorAll(selector),querySelector:selector=>body.querySelector(selector),getElementById:id=>id===body.id?body:body.querySelector('#'+id),addEventListener:(type,callback)=>listen(events,type,callback)};
  if(legacyMedia)media.addListener=callback=>mediaListener=callback;else media.addEventListener=(type,callback)=>mediaListener=callback;
  class IO{
    constructor(callback,options){if(observerThrows)throw Error('Observer unavailable');this.callback=callback;this.options=options;this.observed=new Set();this.unobserved=[];observers.push(this)}
    observe(node){this.observed.add(node)}
    unobserve(node){this.observed.delete(node);this.unobserved.push(node)}
  }
  class MO{
    constructor(callback){this.callback=callback;mutationObservers.push(this)}
    observe(node,options){this.root=node;this.options=options}
  }
  const context={console,document,matchMedia:()=>media,addEventListener:(type,callback)=>listen(windowEvents,type,callback),setTimeout:(callback,delay)=>{const id=++serial;timers.set(id,{callback,delay});return id},clearTimeout:id=>timers.delete(id),api(){throw Error('Motion must not call a backend')},fetch(){throw Error('Motion must not call a backend')},replayFinished:false,applyDisabled:true};
  if(raf)context.requestAnimationFrame=callback=>{const id=++serial;frames.set(id,callback);return id};
  if(intersection)context.IntersectionObserver=IO;if(mutation)context.MutationObserver=MO;
  vm.createContext(context);
  const make=(tag,options,parent=body)=>{const node=new Node(tag,options);parent?.append(node);return node};
  const runFrames=()=>{let guard=0;while(frames.size){if(++guard>10)throw Error('Unexpected frame loop');const batch=[...frames.values()];frames.clear();batch.forEach(callback=>callback())}};
  const runTimers=()=>{const batch=[...timers.values()];timers.clear();batch.forEach(timer=>timer.callback());runFrames()};
  const dispatch=(type,target,extra={})=>{const event={target,...extra};for(const callback of events.get(type)||[])callback(event);return event};
  const mutate=records=>mutationObservers[0]?.callback(records);
  const attributes=target=>mutate([{type:'attributes',target}]);
  const added=(target,...nodes)=>mutate([{type:'childList',target,addedNodes:nodes,removedNodes:[]}]);
  const start=()=>{vm.runInContext(source,context);runFrames();return observers[0]};
  return {body,context,document,media,frames,timers,observers,mutationObservers,scans,make,start,runFrames,runTimers,dispatch,mutate,attributes,added,
    intersect(node,value=true){observers[0]?.callback([{target:node,isIntersecting:value,intersectionRatio:value?0.5:0}])},
    motion(value){media.matches=value;mediaListener?.({matches:value});runFrames()},windowEvent(type,event={}){for(const callback of windowEvents.get(type)||[])callback(event)},
  };
}

{
  const f=fixture(),section=f.make('section',{classes:'weekend-picks'}),input=f.make('button',{text:'规划这里'},section),io=f.start();
  assert(section.classList.contains('travel-reveal-pending'));assert(io.observed.has(section));assert.equal(io.options.threshold,0.08);
  f.intersect(section,false);assert(section.classList.contains('travel-reveal-pending'));
  f.intersect(section);assert(!section.classList.contains('travel-reveal-pending'));assert(section.classList.contains('travel-reveal-visible'));assert(!io.observed.has(section));
  f.attributes(f.body);f.runFrames();assert(!io.observed.has(section),'Repeated renders cannot restart an already visible section');
  assert.equal(input.textContent,'规划这里');
}
{
  const f=fixture(),section=f.make('section',{classes:'province-atlas'}),detail=f.make('article',{classes:'atlas-city-detail'},section);f.start();assert(section.classList.contains('travel-reveal-pending'));assert(!detail.classList.contains('travel-reveal-pending'),'Nested blocks share one 24px movement rather than stacking transforms');
}
{
  const f=fixture(),section=f.make('section',{classes:'weekend-picks'});f.start();assert(section.classList.contains('travel-reveal-pending'));
  f.windowEvent('pageshow',{persisted:false});f.runFrames();assert(section.classList.contains('travel-reveal-pending'),'Initial pageshow must preserve offscreen sections until their first intersection');assert(f.observers[0].observed.has(section));
  f.intersect(section);assert(!section.classList.contains('travel-reveal-pending'));assert(section.classList.contains('travel-reveal-visible'));
}
{
  const f=fixture(),section=f.make('section',{classes:'weekend-picks'});f.start();f.windowEvent('pageshow',{persisted:true});f.runFrames();assert(!section.classList.contains('travel-reveal-pending'),'A persisted pageshow restores readable content even if pagehide was not delivered');assert(section.classList.contains('travel-reveal-visible'));assert(!f.observers[0].observed.has(section));
  f.windowEvent('pageshow',{persisted:false});f.runFrames();assert(!section.classList.contains('travel-reveal-pending'),'Restored content is never hidden for another initial-style pageshow');
}
for(const options of [{intersection:false},{reduced:true},{hidden:true},{observerThrows:true}]){
  const f=fixture(options),section=f.make('section',{classes:'weekend-picks'});f.start();assert(!section.classList.contains('travel-reveal-pending'),'Unsupported/reduced/background motion never hides content');assert(section.classList.contains('travel-reveal-visible'));
}
{
  const f=fixture(),section=f.make('section',{classes:'planning-guide'}),button=f.make('button',{},section);f.start();f.dispatch('focusin',button);assert(!section.classList.contains('travel-reveal-pending'),'Keyboard focus reveals its containing section immediately');
}
{
  const f=fixture(),section=f.make('section',{classes:'province-atlas'});f.start();f.motion(true);assert(!section.classList.contains('travel-reveal-pending'));f.motion(false);assert(!section.classList.contains('travel-reveal-pending'),'Changing preference back does not replay old content');
  const next=f.make('article',{classes:'atlas-city-detail'});f.added(f.body,next);f.runFrames();assert(next.classList.contains('travel-reveal-pending'),'New content may animate after the preference is restored');
  f.document.hidden=true;f.dispatch('visibilitychange',f.body);assert(!next.classList.contains('travel-reveal-pending'));f.document.hidden=false;f.dispatch('visibilitychange',f.body);f.runFrames();assert(!next.classList.contains('travel-reveal-pending'),'Returning from background does not hide content again');
}
{
  const f=fixture({legacyMedia:true}),section=f.make('section',{classes:'theme-routes'});f.start();f.motion(true);assert(!section.classList.contains('travel-reveal-pending'),'Older MediaQueryList addListener is supported');
}
{
  const f=fixture(),gallery=f.make('section',{id:'gallery'});f.start();f.scans.length=0;
  const section=f.make('section',{classes:'weekend-plan'},gallery);f.added(gallery,section);f.added(gallery,section);assert.equal(f.frames.size,1,'Dynamic mutations share one animation frame');f.runFrames();assert(section.classList.contains('travel-reveal-pending'));assert(!f.scans.some(scan=>scan.root===f.body),'Adding a small subtree does not rescan the whole document');
  const options=f.mutationObservers[0].options;assert.deepEqual([...options.attributeFilter],['hidden','open','aria-hidden','data-view']);assert(!options.attributeFilter.includes('class'));assert(!options.attributeFilter.includes('style'),'Own animation updates cannot recurse through MutationObserver');
  section.remove();f.mutate([{type:'childList',target:gallery,addedNodes:[],removedNodes:[section]}]);f.runFrames();assert(!f.observers[0].observed.has(section),'Removed cards release IntersectionObserver references');
}
{
  const f=fixture(),overview=f.make('section',{id:'overview'}),day=f.make('article',{classes:'folio-day'},overview);overview.displayNone=true;f.start();assert(!day.classList.contains('travel-reveal-pending'));
  overview.displayNone=false;f.attributes(f.body);f.runFrames();assert(day.classList.contains('travel-reveal-pending'),'An existing hidden view is discovered when data-view changes');
  f.windowEvent('pagehide');assert(!day.classList.contains('travel-reveal-pending'));const later=f.make('article',{classes:'folio-day'},overview);f.added(overview,later);f.runFrames();assert(!later.classList.contains('travel-reveal-pending'),'Queued renders after pagehide cannot hide content');f.windowEvent('pageshow');f.runFrames();assert(!day.classList.contains('travel-reveal-pending'),'Browser page-cache restore never re-hides a seen view');
}
{
  const f=fixture(),dialog=f.make('dialog',{id:'brief',open:true}),preview=f.make('div',{classes:'candidate-preview'},dialog),result=f.make('section',{classes:'agent-result'},preview),steps=f.make('div',{classes:'agent-steps'},result),step=f.make('p',{text:'需求理解：已确认条件',attrs:{'data-agent-step':''}},steps),final=f.make('div',{hidden:true,attrs:{'data-agent-final':''}},result),summary=f.make('p',{text:'真实返回：龙门石窟与白马寺。'},final),reasonList=f.make('ul',{classes:'agent-reasons'},final),reason=f.make('li',{text:'真实依据：符合文化偏好。'},reasonList),apply=f.make('button',{id:'applycandidate',text:'用候选行程替换当前草稿'},final);apply.disabled=true;
  f.start();assert(!summary.classList.contains('travel-result-paragraph'));assert(!reason.classList.contains('travel-result-paragraph'));assert(final.hidden);assert(apply.disabled);assert.equal(f.context.replayFinished,false);
  // This represents the existing startAgentReplay finish path. Motion only
  // reacts after that path clears hidden; it cannot release the gate itself.
  final.hidden=false;f.attributes(final);f.runFrames();assert(summary.classList.contains('travel-result-paragraph'));assert(reason.classList.contains('travel-result-paragraph'));assert.equal(summary.style.getPropertyValue('--travel-reveal-delay'),'0ms');assert.equal(reason.style.getPropertyValue('--travel-reveal-delay'),'70ms');
  assert.equal(summary.textContent,'真实返回：龙门石窟与白马寺。');assert.equal(reason.textContent,'真实依据：符合文化偏好。');assert.equal(step.textContent,'需求理解：已确认条件');assert(!step.classList.contains('travel-result-paragraph'),'Existing truthful SSE step effects remain owned by the agent renderer');assert(!apply.classList.contains('travel-result-paragraph'));assert(apply.disabled);assert.equal(f.context.replayFinished,false);
  f.runTimers();assert(!summary.classList.contains('travel-result-paragraph'));assert.equal(summary.style.getPropertyValue('--travel-reveal-delay'),'');f.attributes(preview);f.runFrames();assert(!summary.classList.contains('travel-result-paragraph'),'A completed final paragraph animates once only');
}
{
  const f=fixture(),dialog=f.make('dialog',{id:'advice'}),reason=f.make('p',{classes:'planning-reason',text:'真实分日结果'},dialog);f.start();assert(!reason.classList.contains('travel-result-paragraph'),'Closed dialog content is never animated early');dialog.setAttribute('open','');f.attributes(dialog);f.runFrames();assert(reason.classList.contains('travel-result-paragraph'));f.motion(true);assert(!reason.classList.contains('travel-result-paragraph'));assert.equal(f.timers.size,0,'Preference changes cancel paragraph timers and keep real text readable');
}
{
  const f=fixture({reduced:true}),dialog=f.make('dialog',{open:true}),preview=f.make('div',{classes:'candidate-preview'},dialog),final=f.make('div',{attrs:{'data-agent-final':''}},preview),day=f.make('div',{classes:'candidate-days'},final),paragraph=f.make('p',{text:'第 1 天 龙门石窟'},day);f.start();assert(!paragraph.classList.contains('travel-result-paragraph'));assert.equal(paragraph.textContent,'第 1 天 龙门石窟');assert.equal(f.timers.size,0);
}
{
  const f=fixture(),places=f.make('div',{id:'places'}),old=f.make('button',{attrs:{'data-add':'hn-longmen'},text:'加入第1天'},places);f.start();let prevented=false;f.dispatch('click',old,{preventDefault(){prevented=true}});
  old.remove();const current=f.make('button',{classes:'added',attrs:{'data-add':'hn-longmen'},text:'✓ 已加入'},places);current.disabled=true;f.runFrames();assert(current.classList.contains('travel-feedback'),'Successful add feedback targets the actual replacement button');assert(!prevented);assert.equal(current.textContent,'✓ 已加入');f.runTimers();assert(!current.classList.contains('travel-feedback'));
  const failed=f.make('button',{attrs:{'data-add':'hn-yuntai'},text:'加入第1天'},places);f.dispatch('click',failed);f.runFrames();assert(!failed.classList.contains('travel-feedback'),'A failed/limit-blocked add cannot masquerade as success');
}
{
  const f=fixture(),button=f.make('button',{attrs:{'data-atlas-city':'洛阳','aria-pressed':'false'},text:'洛阳'});f.start();f.dispatch('click',button);button.setAttribute('aria-pressed','true');f.runFrames();assert(button.classList.contains('travel-feedback'));f.motion(true);assert(!button.classList.contains('travel-feedback'));assert.equal(f.timers.size,0);
  f.dispatch('click',button);f.runFrames();assert(!button.classList.contains('travel-feedback'),'Reduced motion suppresses selection pulses');
}
{
  const f=fixture(),count=f.make('span',{id:'headertripcount',text:'2'}),header=f.make('button',{classes:'header-trip'}),dialog=f.make('dialog',{open:true}),add=f.make('button',{id:'vision-add'},dialog);f.start();f.dispatch('click',add);count.textContent='3';dialog.removeAttribute('open');f.runFrames();assert(header.classList.contains('travel-feedback'),'A closed recognition/detail dialog can confirm a real count change on the visible itinerary button');
}
{
  const f=fixture({raf:false,intersection:false,mutation:false}),section=f.make('section',{classes:'weekend-picks'});f.start();f.runTimers();assert(!section.classList.contains('travel-reveal-pending'),'Fallback scheduling without observers or rAF remains readable');
}
assert.doesNotThrow(()=>vm.runInNewContext(source,{}),'Non-browser environments fail open');
assert.doesNotThrow(()=>vm.runInNewContext(source,{document:{body:{}}}),'Minimal legacy fixtures do not require new browser APIs');
assert(!source.includes('innerHTML='));assert(!source.includes('.hidden='));assert(!source.includes('fetch('));assert(!source.includes('replayFinished='));
// The presentation contract must preserve per-paragraph timing, not merely
// animate all returned text in a single frame.
const theme=readFileSync(new URL('../travel-theme.css',import.meta.url),'utf8');
assert.match(theme,/\.travel-result-paragraph\s*\{[^}]*var\(--travel-reveal-delay,\s*0ms\)/s,'Real paragraphs consume their individual stagger delay');
assert.match(theme,/transition-property:\s*transform,\s*opacity\s*!important/,'Legacy paint transitions cannot override the compositor-only motion policy');
assert.match(theme,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
console.log('Passed: one-shot section reveals, dynamic subtree batching, reduced-motion and background/page-cache cancellation, no-observer fallbacks, keyboard visibility, truthful post-replay paragraph effects, unchanged SSE/apply gates, replacement-node add feedback, and no new requests or data changes.');
