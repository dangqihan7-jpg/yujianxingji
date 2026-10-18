import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../ai-hero.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../ai-hero.css',import.meta.url),'utf8');
const showcase=readFileSync(new URL('../showcase.js',import.meta.url),'utf8');
const catalogue=JSON.parse(readFileSync(new URL('../henan.json',import.meta.url),'utf8')).places;
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function fixture({daily=[],places=catalogue}={}){
 const nodes=new Map(),bound=[];
 const context={CATALOG:places,heroPlaces:daily,esc:escape,photoMediaHTML:(p,o)=>'<img src="'+escape(p.image)+'" loading="'+o.loading+'" alt="'+o.alt+'">',
  photoDateLabel:p=>p.photoTakenAt?'拍摄于 '+p.photoTakenAt:p.photoYear?'拍摄于 '+p.photoYear+' 年':'拍摄日期未注明',bindPhotoMedia:n=>bound.push(n),
  document:{getElementById:id=>nodes.get(id)||null,querySelector:()=>null,addEventListener(){},hidden:false},setTimeout:()=>0,clearTimeout(){}};
 vm.createContext(context);vm.runInContext(source,context);
 return {context,nodes,bound,run:code=>vm.runInContext(code,context)};
}
{
 const photo=catalogue.find(p=>p.id==='hn-laojunshan'),f=fixture();
 assert.equal(f.context.aiHeroScenery().id,photo.id,'A real current catalogue photograph backs the cover, with no generic foreign scenery');
 const html=f.context.aiPlanningHeroHTML();
 assert(html.includes('id="ai-hero-backdrop"')&&html.includes('src="'+escape(photo.image)+'"'));
 assert(html.includes(photo.photoReference)&&html.includes(photo.licenseUrl));assert(html.includes('拍摄于 '+photo.photoTakenAt));
 assert(html.includes('一句话，让 AI 为你规划河南周末游'));assert.equal((html.match(/class="ai-hero-agent"/g)||[]).length,5);
 assert(html.includes('id="ai-hero-vision"')&&html.includes('id="ai-hero-form"'),'The camera and existing confirmation entry remain in the cover');
 assert(!html.includes('images.unsplash.com')&&!html.includes('picsum.photos'),'Existing audited Henan scenery keeps its identity and licence');
}
{
 const f=fixture({daily:['hn-taihao','hn-mangdang','hn-baoquan'].map(id=>catalogue.find(p=>p.id===id))});
 assert.equal(f.context.aiHeroScenery().id,'hn-baoquan','Prefer a real landscape over a temple even when the temple is first in the daily album');
 f.context.heroPlaces=[catalogue.find(p=>p.id==='hn-taihao')];assert.equal(f.context.aiHeroScenery().id,'hn-laojunshan','A cultural-only day uses the known mountain fallback without changing the daily photo album');
}
{
 const daily=catalogue.filter(p=>['hn-yuntai','hn-longmen'].includes(p.id)),f=fixture({daily});
 assert.equal(f.context.aiHeroScenery().id,'hn-yuntai','A mountain photograph in today’s album is preferred over the fallback');
 const backdrop={dataset:{place:'old-day'},innerHTML:''},credit={innerHTML:''};f.nodes.set('ai-hero-backdrop',backdrop);f.nodes.set('ai-hero-photo-credit',credit);
 f.context.refreshAIHeroScenery();assert.equal(backdrop.dataset.place,'hn-yuntai');assert(backdrop.innerHTML.includes('yuntai-mountain'));assert(credit.innerHTML.includes('焦作 · 云台山'));assert.equal(f.bound.length,1);
 f.context.refreshAIHeroScenery();assert.equal(f.bound.length,1,'The lifecycle must not reset a loaded photograph on each input or visibility event');
 f.context.heroPlaces=[catalogue.find(p=>p.id==='hn-laojunshan')];f.context.refreshAIHeroScenery();assert.equal(backdrop.dataset.place,'hn-laojunshan');assert(credit.innerHTML.includes('2025-03-18'));assert.equal(f.bound.length,2);
 assert.match(showcase,/heroPhotoIndex=0;\s*if\(typeof refreshAIHeroScenery==='function'\)refreshAIHeroScenery\(\);/,'A real daily album change refreshes the immersive cover too');
}
{
 const f=fixture({places:[],daily:[{id:'unknown',name:'未确认照片',image:'/assets/unknown.jpg'}]});
 assert.equal(f.context.aiHeroScenery(),null,'A photograph without source metadata must not become a public cover');
 const html=f.context.aiPlanningHeroHTML();assert(html.includes('图形背景 · 未使用实景照片'));assert(!html.includes('src='));
 const invalid={id:'untrusted',name:'名字',city:'河南',image:'https://picsum.photos/1000',photoReference:'https://example.test/photo'};
 f.context.heroPlaces=[invalid];assert.equal(f.context.aiHeroScenery(),null,'Only existing local photographs are accepted by this cover');
 const known={...invalid,image:'/assets/valid.jpg',name:'<script>',photoReference:'javascript:alert(1)',licenseUrl:'data:text/html,bad'};
 assert(!f.context.aiHeroCreditHTML(known).includes('javascript:'));assert(!f.context.aiHeroCreditHTML(known).includes('data:text'));
 assert(f.context.aiHeroCreditHTML(known).includes('&lt;script&gt;'));assert(f.context.aiHeroCreditHTML(known).includes('拍摄日期未注明'));
}
{
 const f=fixture({places:[]});delete f.context.CATALOG;delete f.context.heroPlaces;
 assert.doesNotThrow(()=>f.context.aiPlanningHeroHTML(),'Isolated legacy fixtures need no new catalogue globals');
 assert.match(css,/min-height:\s*calc\(100svh - 84px\)/);assert.match(css,/@media \(max-width: 767px\)/);
 assert.match(css,/#ai-hero-input\s*\{[^}]*font-size:\s*16px/s);assert.match(css,/min-height:\s*44px/);
 assert.match(css,/backdrop-filter:\s*blur/);assert.match(css,/focus-within::after\s*\{\s*opacity:\s*1/);
 assert.match(css,/@media \(prefers-reduced-motion: reduce\)/);
 for(const keyframes of css.matchAll(/@keyframes\s+[^{}]+\{((?:[^{}]|\{[^{}]*\})*)\}/g)){
  assert(!/\b(?:box-shadow|filter|background|width|height|top|left)\s*:/.test(keyframes[1]),'Motion animates only compositor-friendly properties');
 }
 assert(!/transition:\s*(?:all|box-shadow|background|border)/.test(css),'The focus halo fades through opacity instead of animating paint properties');
}
console.log('沉浸式 AI 首屏：真实本地照片/拍摄日期与许可、日切同步、缺图诚实占位、原始入口保留、移动断点及减少动效验证通过。');
