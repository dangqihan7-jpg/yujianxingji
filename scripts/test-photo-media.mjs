import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

// Execute the browser helper and real place-card renderer without network or a
// browser dependency. This small DOM fixture parses elements and dispatches the
// assigned image callbacks; assertions inspect the resulting element tree.
const root=new URL('../',import.meta.url);
const data=JSON.parse(await readFile(new URL('henan.json',root),'utf8'));
const helper=await readFile(new URL('photo-media.js',root),'utf8');
const app=await readFile(new URL('app.html',root),'utf8');
const renderer=app.slice(app.indexOf('function renderPlaces()'),app.indexOf('function minutes('));
assert(renderer.startsWith('function renderPlaces()'),'Use the actual place-card renderer');
const decode=value=>String(value).replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

class Element{
 constructor(tag='div',attributes={}){this.tagName=tag.toUpperCase();this.attributes={...attributes};this.children=[];this.parentElement=null;this.hidden='hidden' in attributes;this.isConnected=true;this._text='';this.style={};this.dataset={};for(const [key,value] of Object.entries(attributes))if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=value;
  this.classList={contains:name=>this.className.split(/\s+/).includes(name),add:name=>{if(!this.classList.contains(name))this.className+=' '+name},remove:name=>{this.className=this.className.split(/\s+/).filter(value=>value!==name).join(' ')},toggle:(name,on)=>{const wanted=on??!this.classList.contains(name);this.classList[wanted?'add':'remove'](name);return wanted}};
 }
 get className(){return this.attributes.class||''}set className(value){this.attributes.class=String(value)}
 get src(){return this.attributes.src||''}set src(value){this.attributes.src=String(value)}
 get currentSrc(){return this.src}
 get id(){return this.attributes.id||''}set id(value){this.attributes.id=String(value)}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('')}set textContent(value){this.children=[];this._text=String(value)}
 get innerHTML(){return this._html||''}
 set innerHTML(value){this._html=String(value);for(const child of this.children)child.detach();this.children=[];this._text='';const stack=[this];
  for(const token of this._html.match(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)||[]){if(token.startsWith('<!--'))continue;if(token.startsWith('</')){if(stack.length>1)stack.pop();continue}if(!token.startsWith('<')){stack.at(-1)._text+=decode(token);continue}
   const match=token.match(/^<([a-z][\w-]*)\b([^>]*)>/i);if(!match)continue;const attributes={};for(const attr of match[2].matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))attributes[attr[1]]=decode(attr[2]??attr[3]??attr[4]??'');const child=new Element(match[1],attributes);stack.at(-1).append(child);if(!['IMG','BR','INPUT','META','LINK','HR'].includes(child.tagName)&&!token.endsWith('/>'))stack.push(child);
  }
 }
 append(child){child.parentElement=this;child.isConnected=this.isConnected;this.children.push(child)}
 detach(){this.isConnected=false;for(const child of this.children)child.detach()}
 getAttribute(name){return this.attributes[name]??null}hasAttribute(name){return name in this.attributes}
 setAttribute(name,value){this.attributes[name]=String(value);if(name.startsWith('data-'))this.dataset[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=String(value)}
 removeAttribute(name){delete this.attributes[name]}
 matches(selector){if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));const tag=selector.match(/^[a-z][\w-]*/i)?.[0];if(tag&&this.tagName!==tag.toUpperCase())return false;for(const match of selector.matchAll(/\.([\w-]+)/g))if(!this.classList.contains(match[1]))return false;const id=selector.match(/#([\w-]+)/)?.[1];if(id&&id!==this.id)return false;for(const match of selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g))if(!this.hasAttribute(match[1])||(match[2]!==undefined&&this.getAttribute(match[1])!==match[2]))return false;return true}
 querySelectorAll(selector){return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)])}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null}
 contains(node){return node===this||this.children.some(child=>child.contains(node))}
}

const nodes=new Map([['#places',new Element()],['#listcount',new Element()]]);
const get=selector=>nodes.get(selector)||null;
const context={URL,console,Map,Set,document:{querySelector:get},CATALOG:data.places,$:get,esc:escape,
 visible:()=>data.places,same:()=>false,activePlace:null,day:1,source:'curated',labels:{scenic:'景点',food:'美食',stay:'住宿'},
 durationLabel:minutes=>minutes+' 分钟',placeIcon:()=>'<svg aria-hidden="true"></svg>'};
context.window=context;vm.createContext(context);vm.runInContext(helper+'\n'+renderer,context);const run=source=>vm.runInContext(source,context);
const render=(place,options={})=>{context.place=place;context.options=options;const container=new Element();container.innerHTML=run('photoMediaHTML(place,options)');context.container=container;run('bindPhotoMedia(container)');return container};
const themes=new Set(['henan',...data.cities.map(city=>city.id)]);

run('renderPlaces()');
const cards=get('#places').querySelectorAll('.place-card');assert.equal(cards.length,data.places.length);
let missing=0;
for(let index=0;index<data.places.length;index++){
 const place=data.places[index],card=cards[index],media=card.querySelector('[data-photo-media]');assert(media,place.id+' has a media container');
 const placeholder=media.querySelector('.photo-placeholder');assert(placeholder,place.id+' has a reusable visual fallback');
 assert(themes.has(placeholder.dataset.photoTheme),place.id+' uses a fixed city theme');
 if(!place.image){missing++;assert(!media.querySelector('img'),place.id+' must not invent a photo');assert(!placeholder.hidden,place.id+' shows the placeholder');assert(placeholder.textContent.includes(place.name),place.id+' placeholder names the place');assert(placeholder.textContent.includes(place.city),place.id+' placeholder names the city');assert.match(placeholder.textContent,/占位|实景待补|实景照片待补充/,place.id+' explicitly identifies missing real photography');assert.match(placeholder.textContent,/景点|美食|住宿/,place.id+' retains its category')}
}
assert(missing>0,'Exercise all currently unphotographed places, without assuming an obsolete photo count');

// A broken photo must retain the same card and its action controls. A subsequent
// load on the same image restores the photo rather than leaving a permanent scar.
{
 const index=data.places.findIndex(place=>place.image),card=cards[index],image=card.querySelector('img'),fallback=card.querySelector('.photo-placeholder'),button=card.querySelector('[data-add]');
 let clicks=0;button.onclick=()=>clicks++;
 assert.equal(typeof image.onerror,'function');assert.equal(typeof image.onload,'function');assert(fallback.hidden);
 image.onerror();assert(image.hidden);assert(!fallback.hidden);assert.match(fallback.textContent,/占位|实景待补/);assert.equal(card.querySelector('[data-add]'),button);button.onclick();assert.equal(clicks,1,'Image failure does not replace or disable card actions');
 image.onload();assert(!image.hidden);assert(fallback.hidden,'A successful retry restores the real photo');
}

// Reusing a media container must not let detached image requests alter new media.
{
 const source=data.places.find(place=>place.image),container=render(source),old=container.querySelector('img'),staleError=old.onerror,staleLoad=old.onload;
 old.onerror();assert(old.hidden);
 context.place={...source,image:'/assets/replacement.jpg'};container.innerHTML=run('photoMediaHTML(place)');run('bindPhotoMedia(container)');
 const current=container.querySelector('img'),fallback=container.querySelector('.photo-placeholder');assert.notEqual(current,old);staleError();staleLoad();assert(!current.hidden);assert(fallback.hidden,'Detached callbacks cannot change the next selected photo');
 current.onerror();assert(!fallback.hidden);current.onload();assert(fallback.hidden);assert(!current.hidden);
}

// Names/cities/categories never become markup or arbitrary theme selectors.
{
 const name='<svg onload="steal()">恶意地点</svg>',city='洛阳" style="background:url(https://leak.invalid)',category='scenic" onmouseover="steal()';
 const container=render({name,city,category}),placeholder=container.querySelector('.photo-placeholder');assert(placeholder.textContent.includes(name));assert(placeholder.textContent.includes(city));assert.equal(placeholder.dataset.photoTheme,'henan');assert.equal(container.querySelector('svg'),null);assert.equal(container.querySelector('script'),null);
 for(const element of container.querySelectorAll('*'))for(const key of Object.keys(element.attributes)){assert(!key.startsWith('on'),'Untrusted fields cannot add event attributes');assert.notEqual(key,'style','Theme styling comes from predefined CSS')}
}

for(const image of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','//leak.invalid/tracker.jpg','https://name:secret@leak.invalid/a.jpg','/assets/../private.env']){
 const container=render({name:'安全测试',city:'洛阳',category:'scenic',image});assert.equal(container.querySelector('img'),null,'Reject unsafe photo URL '+image);assert(!container.querySelector('.photo-placeholder').hidden);
}
// Changing the src of an existing DOM image also invalidates its old callbacks.
{
 const container=render({name:'地点',city:'郑州',category:'scenic',image:'/assets/first.jpg'}),image=container.querySelector('img'),fallback=container.querySelector('.photo-placeholder'),staleError=image.onerror,staleLoad=image.onload;
 image.src='/assets/second.jpg';run('bindPhotoMedia(container)');staleError();assert(fallback.hidden);assert(!image.hidden);image.onerror();assert(!fallback.hidden);staleLoad();assert(!fallback.hidden,'An old load cannot reveal an unrelated request');image.onload();assert(fallback.hidden);
}
for(const naturalWidth of [0,1280]){
 const container=render({name:'缓存照片',city:'新乡',category:'scenic',image:'/assets/cached.jpg'}),image=container.querySelector('img');image.complete=true;image.naturalWidth=naturalWidth;run('bindPhotoMedia(container)');assert.equal(image.hidden,!naturalWidth);assert.equal(container.querySelector('.photo-placeholder').hidden,Boolean(naturalWidth),'Already completed cached images receive the same load/error treatment');
}
for(const image of ['/assets/ruyi.jpg?v=fixture','https://images.example.test/real.jpg','data:image/jpeg;base64,/9j/2Q=='])assert(render({name:'实景',city:'郑州',category:'scenic',image}).querySelector('img'),'Retain supported local, HTTPS and embedded offline photographs');
for(const city of data.cities){const placeholder=render({name:'地点',city:city.name,category:'scenic'}).querySelector('.photo-placeholder');assert.equal(placeholder.dataset.photoTheme,city.id,city.name+' has its own theme')}
context.place={photoYear:2025};assert.match(run('photoDateLabel(place)'),/2025/);context.place={};assert.match(run('photoDateLabel(place)'),/未|未知/,'Unknown dates must stay explicitly unknown');

console.log(`Passed: ${missing} honest city-themed empty photo cards, all ${data.places.length} media containers, real error/load/replacement callbacks, preserved card controls, escaped fields, safe URL handling, 18 fixed city themes and unknown dates. No network requests.`);
