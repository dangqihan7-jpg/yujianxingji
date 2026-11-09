import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import worker,{HTML,CATALOG} from '../worker/index.js';

// 首页嵌套层测试：首屏只放 hero；需求表单、热门轮播各是单独一屏，
// 点开始规划 / 看看热门才进；闭环四步条只在行程总览页顶部。
// 城市带入、多城不抢填、热门回落、演示标注、表单挂接都在这里验。
const POPULAR_ITEMS=[
 {id:'hn-longmen',name:'龙门石窟',city:'洛阳',worth:2,added:86,score:92,demo:true,worthReal:0,worthDemo:2},
 {id:'hn-laojunshan',name:'老君山',city:'洛阳',worth:1,added:74,score:77,demo:true,worthReal:0,worthDemo:1}
];
class MockNode{
 constructor(selector){this.selector=selector;this.value=selector==='#days'?'3':selector==='#start'?'09:00':selector==='#city'?'河南':selector==='#maxhours'?'8':selector==='#restmins'?'30':selector==='#travelmode'?'driving':'';this.innerHTML='';this.textContent='';this.style={};this.dataset={};this.hidden=false;this.open=false;this.isConnected=true;this.children=[];this.parentNode=null;this.scrolled=false;this.classList={add(){},toggle(){},remove(){},contains(){return false}};this.label={textContent:''}}
 appendChild(child){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(c=>c!==child);child.parentNode=this;this.children.push(child);return child}
 querySelector(){return null}
 querySelectorAll(){return []}
 addEventListener(){}
 setAttribute(){}
 focus(){}
 showModal(){this.open=true}
 close(){this.open=false}
 scrollIntoView(){this.scrolled=true}
}
function buildFixture({popularItems=POPULAR_ITEMS}={}){
 const nodes=new Map(),requests=[];
 const get=selector=>{
  if(selector==='dialog[open]')return [...nodes.values()].find(n=>n.open)||null;
  if(!nodes.has(selector))nodes.set(selector,new MockNode(selector));
  return nodes.get(selector);
 };
 const body={dataset:{view:'gallery'},contains:()=>true};
 const context={console,Map,Set,URL,Blob,Date,navigator:{},document:{body,hidden:false,getElementById:id=>get('#'+id),querySelector:get,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({click(){}}),head:{append(){}}},setTimeout:()=>0,clearTimeout(){},matchMedia:()=>({matches:false,addEventListener(){}}),fetch:async(path,options)=>{
  if(typeof path==='string'&&path.startsWith('/api/popular'))return {ok:true,json:async()=>({items:popularItems,weights:{worth:3,added:1},demo:popularItems.some(i=>i.demo)})};
  requests.push({path,options});
  return worker.fetch(new Request('https://fixture.test'+path,options),{});
 }};
 context.window=context;
 vm.createContext(context);
 vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,''),context);
 return {get,body,context,requests,run:code=>vm.runInContext(code,context)};
}
const click=(fixture,selector,payload={})=>fixture.get('#gallery').onclick({target:{closest:s=>s===selector?payload:null}});

// 首屏：只有 hero 一层，表单、轮播、四步条都不出现。
{
 const f=buildFixture(),markup=f.get('#gallery').innerHTML;
 const sectionTag=id=>{const i=markup.indexOf('id="'+id+'"');return markup.slice(markup.lastIndexOf('<section',i),markup.indexOf('>',i)+1)};
 assert.equal(f.run('homeLayer'),'hero');
 assert.equal(f.body.dataset.homeLayer,'hero');
 assert(!sectionTag('home-hero-layer').includes('hidden'),'Hero layer is visible');
 assert(sectionTag('home-plan-layer').includes('hidden'),'Form layer is hidden on first screen');
 assert(sectionTag('home-popular-layer').includes('hidden'),'Popular layer is hidden on first screen');
 assert(markup.includes('周末去河南，一句话就出发。'));
 assert(markup.includes('data-home-popular')&&markup.includes('data-home-spots'));
 assert(!markup.includes('id="henan-cities"')&&!markup.includes('id="weekend-plan"')&&!markup.includes('id="theme-routes"'),'First screen stacks nothing below the hero');
 assert(!markup.includes('loop-strip'),'Loop strip is not on the homepage');
 assert(!markup.includes('id="ai-hero-vision"')&&!markup.includes('ai-hero-agent'),'First screen carries no other entries');
 assert(markup.includes('data-demo-mode')&&markup.includes('data-open-group')&&markup.includes('data-home-vision')&&markup.includes('data-open-sources'),'Plan layer keeps demo, group, vision and sources entries off the first screen');
 assert(readFileSync(new URL('../ask.css',import.meta.url),'utf8').includes('body[data-view="gallery"][data-home-layer="hero"] .ask-launcher'),'Ask launcher hides on the hero layer');
}

// 首屏大图：热门第 1 名；没热门数据时回落到日期轮换，不编数。
{
 const f=buildFixture();
 await f.run('refreshPopularHero()');
 assert.equal(f.run('aiHeroScenery().id'),'hn-longmen','Hero cover uses popular #1');
 assert.equal(f.get('#ai-hero-backdrop').dataset.place,'hn-longmen');
 assert.match(f.get('#hero-daily-label').textContent,/热门轮播 · 演示模式 · 演示数据/);
 assert.match(f.get('#hero-popular-info').textContent,/热门第 1 名 · 2 人复盘值得多待 · 86 次加入行程（演示数据）/);
}
{
 const f=buildFixture({popularItems:[]});
 await f.run('refreshPopularHero()');
 f.run('refreshAIHeroScenery()');
 const cover=f.run('aiHeroScenery()');
 assert(cover&&CATALOG.some(p=>p.id===cover.id),'Fallback cover is a real catalogue place');
 assert.equal(f.get('#ai-hero-backdrop').dataset.place,cover.id);
 assert.match(f.get('#gallery').innerHTML,/每日精选/,'No popular data falls back to the daily rotation');
}

// 点开始规划 → 表单层：城市带进表单，提交仍走现有流程，不开对话框。
{
 const f=buildFixture();
 f.run('saveBooting=false');
 f.get('#ai-hero-input').value='洛阳两天，公交，预算800元';
 await f.get('#ai-hero-form').onsubmit({preventDefault(){}});
 assert.equal(f.run('homeLayer'),'plan');
 assert.equal(f.get('#home-plan-layer').hidden,false);
 assert.equal(f.get('#home-hero-layer').hidden,true);
 assert.equal(f.get('#brief').open,false,'Plan layer is a screen, not the dialog');
 assert.equal(f.run('briefLayerMounted'),true,'The shared brief form mounts into the plan layer');
 assert(f.get('#home-plan-host').children.includes(f.get('#briefbody')),'Form host holds the brief body');
 const form=f.get('#briefbody').innerHTML;
 assert(form.includes('id="buildcandidate"')&&form.includes('id="briefcity"')&&form.includes('id="briefbudget"'));
 assert(form.includes('<option value="洛阳" selected>'),'City written in the hero input lands in the form');
 // 回首页：表单搬回对话框，层状态复位。
 click(f,'[data-home-back]');
 assert.equal(f.run('homeLayer'),'hero');
 assert.equal(f.run('briefLayerMounted'),false);
 assert(f.get('#brief').children.includes(f.get('#briefbody')),'Leaving the layer returns the form to the dialog');
}

// 多城不抢填：输入里两个城市时，不把第一个硬填进表单。
{
 const f=buildFixture();
 f.run('saveBooting=false');
 f.get('#ai-hero-input').value='郑州开封两日游';
 await f.get('#ai-hero-form').onsubmit({preventDefault(){}});
 const form=f.get('#briefbody').innerHTML;
 assert(!form.includes('<option value="郑州" selected>')&&!form.includes('<option value="开封" selected>'),'Ambiguous cities stay for the user to confirm');
 assert(form.includes('识别到多个城市'),'Multi-city ambiguity is surfaced, not silently resolved');
}

// 热门是独立层：点看看热门进，点返回回；轮播 5 秒、圆点、上下张、名次拆解都在。
{
 const f=buildFixture();
 await f.run('refreshPopularHero()');
 click(f,'[data-home-popular]');
 assert.equal(f.run('homeLayer'),'popular');
 assert.equal(f.get('#home-popular-layer').hidden,false);
 assert.equal(f.get('#home-hero-layer').hidden,true);
 assert(f.get('#gallery').innerHTML.includes('id="hero-slideshow"'),'Popular layer hosts the slideshow');
 assert.equal(f.run('heroPlaces.length'),2);
 assert.equal(f.run('heroPhotoIndex'),0);
 click(f,'[data-hero-step]',{dataset:{heroStep:'1'}});
 assert.equal(f.run('heroPhotoIndex'),1);
 click(f,'[data-hero-photo]',{dataset:{heroPhoto:'0'}});
 assert.equal(f.run('heroPhotoIndex'),0);
 click(f,'[data-home-back]');
 assert.equal(f.run('homeLayer'),'hero');
}

// 闭环四步条：只在行程总览页顶部，四步各有去处。
{
 const f=buildFixture();
 f.run('saveBooting=false');
 f.run("setView('overview')");
 const overview=f.get('#overview').innerHTML;
 assert(overview.includes('loop-strip'));
 for(const step of ['plan','spots','review','popular'])assert(overview.includes('data-loop-step="'+step+'"'),'Loop step '+step+' must exist');
 const loopClick=(step,payload={})=>f.get('#overview').onclick({target:{closest:s=>s==='[data-loop-step]'?{dataset:{loopStep:step},...payload}:null}});
 loopClick('spots');
 assert.equal(f.run('activeView'),'spots');
 f.run("setView('overview')");
 loopClick('popular');
 assert.equal(f.run('homeLayer'),'popular');
 assert.equal(f.run('activeView'),'gallery');
 f.run("setView('overview')");
 loopClick('review');
 assert.equal(f.get('.review-section').scrolled,true,'Review step scrolls to the review entry');
 f.run("setView('overview')");
 loopClick('plan');
 assert.equal(f.run('homeLayer'),'plan');
 assert(f.get('#briefbody').innerHTML.includes('id="buildcandidate"'),'Plan step opens the demand form layer');
}

console.log('Passed: nested homepage layers, hero cover fallback, city carry-over, popular layer, loop strip on overview.');
