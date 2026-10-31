import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker,{HTML,CATALOG,PRESETS,rulePlan,validatePlan} from '../worker/index.js';
import {heroDayIndex,selectDailyHeroPhotos} from '../hero-photos.mjs';

const fixtureInstant=Date.parse('2026-10-16T04:00:00Z');
function clockDate(clock){return class extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}}}

const preset=PRESETS.find(r=>r.id==='luoyang');
const crowded={days:2,start:'09:00',maxHours:6,restMinutes:30,stops:preset.stops.map(([id,,duration])=>({place:CATALOG.find(p=>p.id===id),day:1,duration}))};
const response=await worker.fetch(new Request('https://fixture.test/api/plan',{method:'POST',body:JSON.stringify(crowded)}),{});
const planned=await response.json();assert.equal(response.status,200);assert.equal(planned.source,'rules');validatePlan(planned.stops,crowded);
const forced=await worker.fetch(new Request('https://fixture.test/api/plan',{method:'POST',body:JSON.stringify({...crowded,engine:'rules'})}),{LLM_API_KEY:'fixture',LLM_BASE_URL:'https://model.invalid',LLM_MODEL:'fixture'});
assert.equal(forced.status,200);assert.equal((await forced.json()).source,'rules','Showcase sample must stay deterministic when a model is configured');
const durations=[1,2].map(day=>planned.stops.filter(s=>s.day===day).reduce((sum,s)=>sum+crowded.stops.find(x=>x.place.id===s.id).duration,30));
assert(Math.max(...durations)<=330,'Five Luoyang places should be split by load rather than packed in one day');
const classic=PRESETS.find(p=>p.id==='classic'),draft={days:3,maxHours:8,restMinutes:30,stops:classic.stops.map(([id,,duration])=>({place:CATALOG.find(p=>p.id===id),day:1,duration}))};
const split=rulePlan(draft);validatePlan(split,draft);for(const day of [1,2,3])assert.equal(new Set(split.filter(s=>s.day===day).map(s=>draft.stops.find(t=>t.place.id===s.id).place.city)).size,1);
for(let n=1;n<=15;n++)for(const days of [1,2,3,5,7]){const sample={days,maxHours:6,restMinutes:30,stops:CATALOG.slice(0,n).map((place,i)=>({place,day:1,duration:30+i*15}))};validatePlan(rulePlan(sample),sample)}

const nodes=new Map(),body={dataset:{view:'gallery'}},get=s=>{if(!nodes.has(s))nodes.set(s,{value:s==='#days'?'3':s==='#start'?'09:00':s==='#city'?'河南':s==='#maxhours'?'6':s==='#restmins'?'30':s==='#travelmode'?'driving':'',style:{},dataset:{},classList:{add(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(s)};
const context={document:{body,querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(){}}},navigator:{},Date:clockDate({now:fixtureInstant}),URL,Blob,Map,Set,console,setTimeout:()=>0,clearTimeout(){},fetch:(path,options)=>worker.fetch(new Request('https://fixture.test'+path,options),{})};context.window=context;vm.createContext(context);
vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,''),context);const run=s=>vm.runInContext(s,context);
assert(get('#gallery').innerHTML.includes('data-start-route="luoyang"'));assert(get('#gallery').innerHTML.includes('data-feature-route="classic"'));
assert(get('#gallery').innerHTML.includes('data-open-sources'),'Mobile gallery must retain sources access');
assert(get('#gallery').innerHTML.includes('data-pick-plan="hn-wansui"'));assert(get('#gallery').innerHTML.includes('data-pick-detail="hn-laojunshan"'));
// 精选区已全部有图；改用仍缺图的周口野生动物世界核对真实占位渲染。
const missingPhotoPlace=CATALOG.find(place=>place.id==='hn-zhoukou-zoo');
assert(missingPhotoPlace&&!missingPhotoPlace.image,'The placeholder probe must use a real destination without a photograph');
const missingPhotoMarkup=run("photoMediaHTML(CATALOG.find(place=>place.id==='hn-zhoukou-zoo'))");
assert(missingPhotoMarkup.includes('实景待补 · 照片占位'),'Missing destination photos must be labelled as placeholders');
assert(!/<img\b/i.test(missingPhotoMarkup),'Missing destination photos must not be disguised as real images');
const carouselDraft=run('JSON.stringify(compactDraft())');get('#brieftext').value='两天时间，想看山水';
const expectedHero=selectDailyHeroPhotos(CATALOG,fixtureInstant);
assert.equal(expectedHero.length,10,'The homepage has ten actual daily photographs when the library supports it');
get('#gallery').onclick({target:{closest:s=>s==='[data-hero-photo]'?{dataset:{heroPhoto:'1'}}:null}});
assert.equal(run('heroPhotoIndex'),1);assert(get('#hero-photo-source').textContent.includes(expectedHero[1].city+' · '+expectedHero[1].name));assert.equal(get('#hero-photo-source').dataset.photoPlace,expectedHero[1].id);
run('selectHeroPhoto(0)');get('#gallery').onclick({target:{closest:s=>s==='[data-hero-step]'?{dataset:{heroStep:'-1'}}:null}});assert.equal(run('heroPhotoIndex'),expectedHero.length-1);assert(get('#hero-photo-source').textContent.includes(expectedHero.at(-1).city+' · '+expectedHero.at(-1).name));
run('selectHeroPhoto(-1)');assert.equal(run('heroPhotoIndex'),expectedHero.length-1);assert.equal(run('JSON.stringify(compactDraft())'),carouselDraft);assert.equal(get('#brieftext').value,'两天时间，想看山水','Photo selection must preserve the travel input');
const carouselTimers=new Map();let timerId=0;context.setTimeout=(callback,delay)=>{carouselTimers.set(++timerId,{callback,delay});return timerId};context.clearTimeout=id=>carouselTimers.delete(id);context.document.querySelector=s=>s==='dialog[open]'?null:get(s);
const rotationTimers=()=>[...carouselTimers.values()].filter(timer=>timer.delay===6000);
run('selectHeroPhoto(0)');assert.equal(rotationTimers().length,1);const nextPhoto=carouselTimers.get(run('heroTimer'));carouselTimers.delete(run('heroTimer'));nextPhoto.callback();assert.equal(run('heroPhotoIndex'),1);assert.equal(rotationTimers().length,1,'Autoplay schedules one next photo independently of the midnight refresh timer');
get('#hero-slideshow').onpointerenter();assert.equal(rotationTimers().length,0);get('#hero-slideshow').onpointerleave();assert.equal(rotationTimers().length,1);
get('#hero-slideshow').onfocusin();assert.equal(rotationTimers().length,0);get('#hero-slideshow').onfocusout({relatedTarget:null});assert.equal(rotationTimers().length,1);
context.document.hidden=true;run('scheduleHeroRotation()');assert.equal(rotationTimers().length,0);context.document.hidden=false;
run("activeView='planner';scheduleHeroRotation()");assert.equal(rotationTimers().length,0);run("activeView='gallery';heroVisible=false;scheduleHeroRotation()");assert.equal(rotationTimers().length,0);run('heroVisible=true;scheduleHeroRotation()');assert.equal(rotationTimers().length,1);
get('#gallery').onclick({target:{closest:s=>s==='[data-hero-toggle]'?{}:null}});assert.equal(run('heroAutoplay'),false);assert.equal(rotationTimers().length,0);
context.setTimeout=()=>0;context.clearTimeout=()=>{};context.document.querySelector=get;run('selectHeroPhoto(0)');
const publicPhotos=CATALOG.filter(p=>p.image&&p.photoSource&&/^https:\/\//.test(p.photoReference||'')&&/^https:\/\//.test(p.licenseUrl||''));
const albumDraft=run('JSON.stringify(compactDraft())'),albumTotal=String(publicPhotos.length).padStart(2,'0');
assert.deepEqual(new Set(Array.from(run('albumPlaces.map(p=>p.id)'))),new Set(publicPhotos.map(p=>p.id)),'The complete public album keeps only covers with provenance and licence metadata');
get('#gallery').onclick({target:{closest:s=>s==='[data-open-album]'?{dataset:{photoPlace:'hn-longmen'}}:null}});
assert.equal(get('#photoalbum').open,true);assert.equal(get('#album-title').textContent,'龙门石窟');
assert.equal(get('#album-count').textContent,'02 / '+albumTotal);assert.equal(get('#album-date').textContent,'拍摄于 2025-05-04');
assert.equal(get('#album-image').src,CATALOG.find(p=>p.id==='hn-longmen').image);
assert.equal(get('#album-source').href,CATALOG.find(p=>p.id==='hn-longmen').photoReference);
const albumThumbs=get('#album-thumbnails').innerHTML;
get('#photoalbum').onclick({target:{closest:s=>s==='[data-album-step]'?{dataset:{albumStep:'1'}}:null}});
assert.equal(get('#album-title').textContent,'洛邑古城');assert.equal(get('#album-thumbnails').innerHTML,albumThumbs,'Switching photos retains thumbnail controls and their focus');
let albumPrevented=0;
get('#photoalbum').onkeydown({key:'ArrowLeft',preventDefault(){albumPrevented++}});
assert.equal(get('#album-title').textContent,'龙门石窟');assert.equal(albumPrevented,1);
get('#photoalbum').onkeydown({key:'ArrowRight',ctrlKey:true,preventDefault(){albumPrevented++}});
assert.equal(get('#album-title').textContent,'龙门石窟');assert.equal(albumPrevented,1,'Modified arrows keep their browser behavior');
run('selectAlbumPhoto(0);stepAlbumPhoto(-1)');assert.equal(get('#album-count').textContent,albumTotal+' / '+albumTotal);
run('stepAlbumPhoto(1)');assert.equal(get('#album-count').textContent,'01 / '+albumTotal);
run('selectAlbumPhoto(-1);selectAlbumPhoto(100);selectAlbumPhoto(1.5)');assert.equal(get('#album-count').textContent,'01 / '+albumTotal);
get('#photoalbum').onclick({target:{closest:s=>s==='[data-album-photo]'?{dataset:{albumPhoto:'2'}}:null}});
assert.equal(get('#album-title').textContent,'洛邑古城');
const staleAlbumError=get('#album-image').onerror,staleAlbumLoad=get('#album-image').onload;
run('selectAlbumPhoto(1)');assert.equal(get('#album-image').hidden,true,'Do not show a previous photograph under a newly selected place name');assert.equal(get('#album-error').hidden,false);assert(get('#album-error').innerHTML.includes('照片加载中'));assert(get('#album-error').innerHTML.includes('龙门石窟'));
staleAlbumError();staleAlbumLoad();assert.equal(get('#album-image').hidden,true);assert.equal(get('#album-error').hidden,false,'Old request callbacks cannot reveal an unconfirmed new photograph');
get('#album-image').onload();assert.equal(get('#album-image').hidden,false);assert.equal(get('#album-error').hidden,true);
get('#album-image').onerror();assert.equal(get('#album-image').hidden,true);assert.equal(get('#album-error').hidden,false);
assert(get('#album-error').innerHTML.includes('照片占位'));assert(!get('#album-error').innerHTML.includes('照片暂时无法加载'));
get('#album-image').onload();assert.equal(get('#album-image').hidden,false);assert.equal(get('#album-error').hidden,true);
assert.equal(run('JSON.stringify(compactDraft())'),albumDraft);assert.equal(get('#brieftext').value,'两天时间，想看山水');
get('#photoalbum').close();get('#photoalbum').onkeydown({key:'ArrowRight',preventDefault(){albumPrevented++}});
assert.equal(get('#album-title').textContent,'龙门石窟');assert.equal(albumPrevented,1,'Closed album does not capture keys');
run("openPhotoAlbum('hn-luoyi')");get('#photoalbum').onclick({target:{closest:s=>s==='[data-album-place]'?{}:null}});
assert.equal(get('#photoalbum').open,false);assert.equal(get('#detail').open,true);assert.equal(get('#detailtitle').textContent,'洛邑古城');
assert.equal(run('JSON.stringify(compactDraft())'),albumDraft,'Opening place details from the album must not add stops');get('#detail').close();
{
 const unverified=CATALOG.filter(p=>p.image&&!p.licenseUrl);assert(unverified.length>0,'Exercise supplied covers with no verified licence');
 const before=run('JSON.stringify(compactDraft())');
 for(const place of unverified){
  assert(!run('albumPlaces.some(p=>p.id==='+JSON.stringify(place.id)+')'),'Unverified cover is not promoted into the public album');
  assert(run('photoMediaHTML(CATALOG.find(p=>p.id==='+JSON.stringify(place.id)+'))').includes(place.image),'Its existing destination card still uses the supplied cover');
 }
 const place=unverified.find(p=>p.id==='hn-yinji')||unverified[0];
 get('#gallery').onclick({target:{closest:s=>s==='[data-open-album]'?{dataset:{photoPlace:place.id}}:null}});
 assert.equal(get('#photoalbum').open,false,'An unverified cover cannot open the public album');
 assert.equal(get('#detail').open,true,'Its photo-information control falls back to place details');assert.equal(get('#detailtitle').textContent,place.name);
 assert(get('#detailbody').innerHTML.includes('来源未核 CC 授权'),'Details retain the actual unverified-licence notice');
 assert(get('#detailbody').innerHTML.includes(place.image),'The supplied image remains visible in the place details');
 assert.equal(run('JSON.stringify(compactDraft())'),before,'The photo-information fallback is read-only');get('#detail').close();
 run("openPhotoAlbum('hn-longmen')");assert.equal(get('#photoalbum').open,true);
 run('openPhotoAlbum('+JSON.stringify(place.id)+')');assert.equal(get('#photoalbum').open,false,'The fallback closes an already-open public album');assert.equal(get('#detail').open,true);get('#detail').close();
}
const hydrating=run('JSON.stringify(compactDraft())');get('#gallery').onclick({target:{closest:s=>s==='[data-atlas-city]'?{dataset:{atlasCity:'洛阳'}}:null}});
get('#overview').onclick({target:{closest:s=>s==='[data-folio-place]'?{dataset:{folioPlace:CATALOG[0].id}}:null}});
assert.equal(run('JSON.stringify(compactDraft())'),hydrating,'Gallery and overview must not edit the draft while saved state is loading');
run('saveBooting=false');
const pickDraft=run('JSON.stringify(compactDraft())');
await run("openBrief(pickBrief(CATALOG.find(p=>p.id==='hn-wansui')))");
assert(get('#briefbody').innerHTML.includes('必去：万岁山武侠城'));assert.equal(run('JSON.stringify(compactDraft())'),pickDraft,'A weekend pick asks for conditions before replacing the itinerary');get('#brief').close();
assert.equal(run("candidateStops(validateIntent({city:'郑州',days:2,interests:['family']}))[0].place.id"),'hn-yinji');
assert.equal(run("candidateStops(validateIntent({city:'洛阳',days:2,interests:['nature']}))[0].place.id"),'hn-laojunshan');
assert.equal(run("catalogue('开封','大宋武侠城')[0].id"),'hn-wansui');
get('#gallery').onclick({target:{closest:s=>s==='[data-pick-detail]'?{dataset:{pickDetail:'hn-wansui'}}:null}});
assert.equal(get('#detailtitle').textContent,'万岁山武侠城');assert.equal(run('JSON.stringify(compactDraft())'),pickDraft);get('#detail').close();
await run("openDetail({...CATALOG.find(p=>p.id==='hn-luoyi'),name:'过期地点名称',image:'https://invalid.example/stale.jpg',photos:[{url:'https://invalid.example/stale.jpg'}],routing:{id:'fixture',name:'洛邑古城入口'}})");
assert.equal(get('#detailtitle').textContent,'洛邑古城');assert(get('#detailbody').innerHTML.includes('洛阳 · 洛邑古城 · 精选实景'));assert(get('#detailbody').innerHTML.includes(run("CATALOG.find(p=>p.id==='hn-luoyi').image")));assert(!get('#detailbody').innerHTML.includes('invalid.example'),'Saved curated places must not override current verified photos');assert(get('#detailbody').innerHTML.includes('洛邑古城入口'),'Canonical refresh retains confirmed routing');get('#detail').close();
const previewDraft=run('JSON.stringify(compactDraft())'),galleryBefore=get('#gallery').innerHTML;
get('#brieftext').value='洛阳两天，公交慢游';
get('#gallery').onclick({target:{closest:s=>s==='[data-feature-route]'?{dataset:{featureRoute:'classic'}}:null}});
assert.equal(run('featuredRouteId'),'classic');assert.equal(get('#gallery').innerHTML,galleryBefore,'Preview must not redraw the hero or input');assert.equal(get('#brieftext').value,'洛阳两天，公交慢游');assert.equal(run('JSON.stringify(compactDraft())'),previewDraft,'Preview must not replace the current itinerary');
assert(get('#theme-routes').innerHTML.includes('第 3 天'),'Preview exposes all route days before loading');
run("previewFeaturedRoute('invalid')");assert.equal(run('featuredRouteId'),'classic');
get('#gallery').onclick({target:{closest:s=>s==='[data-start-route]'?{dataset:{startRoute:'luoyang'}}:null}});
assert.equal(body.dataset.view,'planner');assert.equal(run('trip.length'),5);
run("setView('overview')");assert.equal(body.dataset.view,'overview');assert(get('#overview').innerHTML.includes('DAY 02'));assert(get('#overview').innerHTML.includes('站间交通待核算'));
run('trip.forEach(s=>s.day=1);renderTrip()');await run('generate()');assert(get('#advicebody').innerHTML.includes('调整前 / 调整后'));assert(get('#advicebody').innerHTML.includes('交通尚需按新顺序核算'));
get('#apply').onclick();assert.equal(body.dataset.view,'overview');assert(get('#overview').innerHTML.includes('单日最长已知安排'));assert.equal(run('trip.length'),5);
run('trip[0].duration+=15;renderTrip()');assert(!get('#overview').innerHTML.includes('单日最长已知安排'),'Changed draft must clear obsolete comparison');
const untouched=run('JSON.stringify(compactDraft())');await run('showPlanningExample()');assert.equal(run('JSON.stringify(compactDraft())'),untouched,'Trying an example must not mutate or save the current itinerary');assert(get('#advicebody').innerHTML.includes('互动示例'));get('#applyexample').onclick();assert.equal(run('currentPresetId'),'luoyang');assert.equal(get('#maxhours').value,'6');assert(get('#overview').innerHTML.includes('单日最长已知安排'));

// Run the complete compiled browser script against independently supplied photo
// catalogues. This catches startup failures that a standalone media helper test
// cannot detect, without invoking init(), models, maps or outbound requests.
function photoCatalogueFixture(catalog,instant=fixtureInstant){
 const nodes=new Map(),body={dataset:{view:'gallery'}},get=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#days'?'3':selector==='#start'?'09:00':selector==='#city'?'河南':selector==='#maxhours'?'6':selector==='#restmins'?'30':selector==='#travelmode'?'driving':'',style:{},dataset:{},hidden:false,open:false,classList:{add(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},setAttribute(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(selector)};
 const clock={now:instant},timers=new Map(),documentEvents=new Map(),windowEvents=new Map();let timerId=0;
 const listen=(events,type,callback)=>{if(!events.has(type))events.set(type,[]);events.get(type).push(callback)};
 const context={document:{body,hidden:false,querySelector:selector=>selector==='dialog[open]'?[...nodes.values()].find(node=>node.open)||null:get(selector),querySelectorAll:()=>[],addEventListener:(type,callback)=>listen(documentEvents,type,callback),createElement:()=>({click(){}}),head:{append(){}}},navigator:{},Date:clockDate(clock),URL,Blob,Map,Set,console,setTimeout:(callback,delay)=>{timers.set(++timerId,{callback,delay,due:clock.now+delay});return timerId},clearTimeout:id=>timers.delete(id),addEventListener:(type,callback)=>listen(windowEvents,type,callback),fetch(){throw Error('Photo catalogue fixture must not make network requests')}};context.window=context;vm.createContext(context);
 let script=HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');const start=script.indexOf('const CATALOG='),end=script.indexOf(';const PRESETS=',start);assert(start>=0&&end>start,'Replace only the compiled catalogue declaration');script=script.slice(0,start)+'const CATALOG='+JSON.stringify(catalog)+script.slice(end);
 assert.doesNotThrow(()=>vm.runInContext(script,context),'Photo availability must not prevent the browser script from initializing');
 return {get,clock,timers,document:context.document,run:expression=>vm.runInContext(expression,context),hero:()=>get('#gallery').innerHTML.split('<div class="gallery-inner">')[0],dispatchDocument:type=>{for(const callback of documentEvents.get(type)||[])callback({type})},dispatchWindow:type=>{for(const callback of windowEvents.get(type)||[])callback({type})},fireTimer:id=>{const timer=timers.get(id);assert(timer,'The requested timer must still be scheduled');timers.delete(id);clock.now=timer.due;timer.callback()}};
}
const configuredHeroIds=['hn-qingming','hn-longmen','hn-luoyi','hn-henan-museum','hn-laojunshan'];
{
 const valid=publicPhotos[0],excluded=[
  {...valid,id:'unlicensed-cover',licenseUrl:undefined,credit:'来源未核 CC 授权，公开使用前请核对'},
  {...valid,id:'unsafe-licence-cover',licenseUrl:'javascript:alert(1)'},
  {...valid,id:'missing-source-cover',photoReference:''},
  {...valid,id:'unsafe-source-cover',photoReference:'https://name:secret@example.org/original'},
  {...valid,id:'unverified-with-links',credit:'来源未核 CC 授权，公开使用前请核对'},
  {...valid,id:'generated-cover',photoSource:'AI-generated'}
 ],fixture=photoCatalogueFixture([valid,...excluded]);
 assert.deepEqual(Array.from(fixture.run('albumPlaces.map(p=>p.id)')),[valid.id],'The public album rejects missing/unsafe source and licence metadata and explicitly unverified or generated covers');
 assert.deepEqual(Array.from(fixture.run('heroPhotos.map(p=>p.id)')),[valid.id],'Daily selection and the public album share the same metadata gate');
 for(const place of excluded.filter(p=>p.photoSource!=='AI-generated'))assert(fixture.run('photoMediaHTML(CATALOG.find(p=>p.id==='+JSON.stringify(place.id)+'))').includes(place.image),'Missing public-gallery metadata cannot remove the supplied cover from its destination card');
}
assert.deepEqual(Array.from(run('heroPlaces.map(place=>place.id)')),expectedHero.map(place=>place.id),'The compiled browser uses the same deterministic daily selector');
assert.deepEqual(Array.from(run('albumPlaces.slice(0,5).map(place=>place.id)')),configuredHeroIds,'The complete album retains its stable editorial order');
{
 const catalog=CATALOG.map(place=>configuredHeroIds.includes(place.id)?{...place,image:null}:place),fixture=photoCatalogueFixture(catalog),remaining=catalog.filter(place=>place.image&&place.photoSource&&/^https:\/\//.test(place.photoReference||'')&&/^https:\/\//.test(place.licenseUrl||''));
 const fallbackHero=selectDailyHeroPhotos(remaining,fixtureInstant);
 assert.deepEqual(Array.from(fixture.run('heroPlaces.map(place=>place.id)')),fallbackHero.map(place=>place.id),'If former editorial covers are removed, select a daily group from other actual photographs');
 assert.equal(fixture.run('albumPlaces.length'),remaining.length);assert.equal(new Set(Array.from(fixture.run('albumPlaces.map(place=>place.id)'))).size,remaining.length,'Fallback photos are not counted twice in the album');
 for(const place of fallbackHero)assert(fixture.hero().includes(place.image),'A fallback cover uses its actual image URL');
 const draft=fixture.run('JSON.stringify(compactDraft())');fixture.run('selectHeroPhoto(1);openPhotoAlbum()');assert.equal(fixture.get('#photoalbum').open,true);assert.equal(fixture.get('#album-title').textContent,fallbackHero[1].name);assert.equal(fixture.run('JSON.stringify(compactDraft())'),draft);
}
for(const catalog of [CATALOG.map(place=>({...place,image:null})),[]]){
 const fixture=photoCatalogueFixture(catalog),markup=fixture.hero();assert.equal(fixture.run('albumPlaces.length'),0,'A placeholder is never counted as a real album photo');assert.equal(fixture.run('heroPlaces.length'),1);assert.equal(fixture.run('Boolean(heroPlaces[0].image)'),false);
 if(catalog.length)assert(catalog.some(place=>place.id===fixture.run('heroPlaces[0].id')),'A missing-photo hero still names an actual catalogue place');
 assert(markup.includes('photo-placeholder'));assert.match(markup,/实景待补|照片占位/);assert(!/<img\b/.test(markup),'An empty photo catalogue must not create a fictitious real-image slide');
 const albumEntry=markup.match(/<button\b[^>]*class="hero-album-entry"[^>]*>/)?.[0];assert(!albumEntry||/\shidden(?:\s|>)/.test(albumEntry),'Hide the unavailable real-photo album entry');
 const sourceTag=markup.match(/<(?:button|span)\b[^>]*id="hero-photo-source"[^>]*>/)?.[0];assert(sourceTag,'Keep an honest visible photo-state label');assert(!sourceTag.includes('data-open-album'),'A placeholder cannot link to nonexistent photo provenance');assert(!sourceTag.startsWith('<button')||/\sdisabled(?:\s|>)/.test(sourceTag),'Photo-state labels cannot masquerade as enabled source controls');
 const controls=markup.match(/<div\b[^>]*class="hero-gallery-controls"[^>]*>/)?.[0],toggle=markup.match(/<button\b[^>]*id="hero-toggle"[^>]*>/)?.[0];assert(!controls||/\shidden(?:\s|>)/.test(controls),'Hide unavailable carousel navigation');assert(!toggle||/\shidden(?:\s|>)/.test(toggle),'Hide the unavailable autoplay control');assert(!markup.includes('拍摄于'),'Residual photo metadata cannot imply that a graphic placeholder is a dated photograph');assert(markup.includes('<b>0</b><span>处已有封面</span>'));
 assert.equal(fixture.run('heroAutoplay'),false);assert.equal(fixture.run('heroTimer'),0);assert.equal(fixture.run('heroPhotoIndex'),0);
 fixture.run('selectHeroPhoto(0);scheduleHeroRotation();openPhotoAlbum();stepAlbumPhoto(1)');assert.equal(fixture.get('#photoalbum').open,false,'An absent album cannot be opened programmatically');assert.equal(fixture.run('heroTimer'),0);
 fixture.clock.now+=86400000;fixture.run('refreshDailyHeroPhotos()');assert.equal(fixture.run('heroPhotos.length'),0);assert.equal(fixture.run('heroPlaces.length'),1);assert.equal(fixture.run('Boolean(heroPlaces[0].image)'),false,'A new date must not turn a missing-photo placeholder into a fictitious photo');
}

// Keep a real draft, partially written travel conditions and an open album
// while China midnight changes only the homepage's photo fragments.
{
 const beforeMidnight=Date.parse('2026-10-15T15:59:58Z'),fixture=photoCatalogueFixture(CATALOG,beforeMidnight);
 fixture.run("trip=[{place:CATALOG.find(place=>place.id==='hn-longmen'),day:2,duration:75,lockedDay:true}];selectHeroPhoto(3);openPhotoAlbum('hn-luoyi')");
 fixture.get('#brieftext').value='开封两天，想看演出，预算还没写完';
 fixture.get('#briefbudget').value='45';fixture.get('#briefcity').value='开封';fixture.get('#briefbody').innerHTML='<p>尚未提交的旅行条件</p>';
 fixture.document.activeElement=fixture.get('#brieftext');
 const draft=fixture.run('JSON.stringify(compactDraft())'),gallery=fixture.get('#gallery').innerHTML,briefNode=fixture.get('#brieftext'),previousGroup=Array.from(fixture.run('heroPhotos.map(place=>place.id)'));
 const album={index:fixture.run('albumIndex'),attempt:fixture.run('albumImageAttempt'),title:fixture.get('#album-title').textContent,src:fixture.get('#album-image').src,date:fixture.get('#album-date').textContent,thumbs:fixture.get('#album-thumbnails').innerHTML,onload:fixture.get('#album-image').onload};
 const independentPhotoTimers=()=>[...fixture.timers.entries()].filter(([id,timer])=>timer.delay!==6000&&id!==fixture.run('aiHeroPlaceholderTimer'));
 const midnightTimers=independentPhotoTimers();
 assert.equal(midnightTimers.length,1,'Schedule exactly one separate daily refresh');
 assert(midnightTimers[0][1].delay>=2000&&midnightTimers[0][1].delay<3000,'Refresh shortly after Beijing midnight, not after local-system midnight');
 fixture.fireTimer(midnightTimers[0][0]);
 const expected=selectDailyHeroPhotos(CATALOG,fixture.clock.now),newGroup=Array.from(fixture.run('heroPhotos.map(place=>place.id)'));
 assert.equal(heroDayIndex(fixture.clock.now),heroDayIndex(beforeMidnight)+1);
 assert.deepEqual(newGroup,expected.map(place=>place.id));assert.equal(newGroup.length,10);assert(!newGroup.some(id=>previousGroup.includes(id)),'The scheduled midnight switches the complete ten-photo group');
 assert.equal(fixture.run('heroPhotoIndex'),0,'A new group starts at its first valid photo');
 for(const place of expected){assert(fixture.get('#hero-photo-slides').innerHTML.includes(place.image),'Replace the actual slide fragment with today’s photographs');assert(fixture.get('#hero-thumbnails').innerHTML.includes(place.image)&&fixture.get('#hero-thumbnails').innerHTML.includes(place.name),'Refresh matching thumbnail photographs and labels')}
 assert.equal(fixture.get('#gallery').innerHTML,gallery,'Daily refresh must not redraw the gallery and travel form');
 assert.equal(fixture.run('JSON.stringify(compactDraft())'),draft,'Midnight never edits or saves the itinerary');
 assert.equal(fixture.get('#brieftext'),briefNode);assert.equal(briefNode.value,'开封两天，想看演出，预算还没写完');assert.equal(fixture.document.activeElement,briefNode,'Keep focus in the current travel input');
 assert.equal(fixture.get('#briefbudget').value,'45');assert.equal(fixture.get('#briefcity').value,'开封');assert.equal(fixture.get('#briefbody').innerHTML,'<p>尚未提交的旅行条件</p>');
 assert.equal(fixture.get('#photoalbum').open,true);assert.equal(fixture.run('albumIndex'),album.index);assert.equal(fixture.run('albumImageAttempt'),album.attempt);
 assert.equal(fixture.get('#album-title').textContent,album.title);assert.equal(fixture.get('#album-image').src,album.src);assert.equal(fixture.get('#album-date').textContent,album.date);assert.equal(fixture.get('#album-thumbnails').innerHTML,album.thumbs);assert.equal(fixture.get('#album-image').onload,album.onload,'An open album retains its image request and failure-recovery callbacks');
 assert.equal(independentPhotoTimers().length,1,'Daily refresh re-arms one timer for the next midnight independently of the AI placeholder');
}
for(const event of ['visibilitychange','pageshow']){
 const fixture=photoCatalogueFixture(CATALOG),before=Array.from(fixture.run('heroPhotos.map(place=>place.id)'));
 fixture.get('#brieftext').value='回来后继续写的计划';fixture.run('selectHeroPhoto(4)');
 const draft=fixture.run('JSON.stringify(compactDraft())');
 fixture.clock.now+=2*86400000;
 if(event==='visibilitychange'){fixture.document.hidden=true;fixture.dispatchDocument(event);fixture.document.hidden=false;fixture.dispatchDocument(event)}else fixture.dispatchWindow(event);
 assert.deepEqual(Array.from(fixture.run('heroPhotos.map(place=>place.id)')),selectDailyHeroPhotos(CATALOG,fixture.clock.now).map(place=>place.id),'Returning after a suspended tab checks the actual Beijing date via '+event);
 assert.notDeepEqual(Array.from(fixture.run('heroPhotos.map(place=>place.id)')),before);assert.equal(fixture.run('heroPhotoIndex'),0);
 assert.equal(fixture.get('#brieftext').value,'回来后继续写的计划');assert.equal(fixture.run('JSON.stringify(compactDraft())'),draft);
 fixture.run('selectHeroPhoto(2)');if(event==='visibilitychange')fixture.dispatchDocument(event);else fixture.dispatchWindow(event);
 assert.equal(fixture.run('heroPhotoIndex'),2,'A same-day '+event+' must not restart the carousel or redraw photo fragments');
}

console.log('Passed: daily ten-photo groups, Beijing-midnight and resume refresh, preserved draft/travel input/open album, independent autoplay timer, full-frame album and failure recovery, honest sparse/empty catalogue startup, load-aware/city-aware planning across 75 cases, gallery routes, overview and truthful comparison.');
