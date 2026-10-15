import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker,{HTML,CATALOG,PRESETS,rulePlan,validatePlan} from '../worker/index.js';

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
const context={document:{body,querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(){}}},navigator:{},URL,Blob,Map,Set,console,setTimeout:()=>0,clearTimeout(){},fetch:(path,options)=>worker.fetch(new Request('https://fixture.test'+path,options),{})};context.window=context;vm.createContext(context);
vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,''),context);const run=s=>vm.runInContext(s,context);
assert(get('#gallery').innerHTML.includes('data-start-route="luoyang"'));assert(get('#gallery').innerHTML.includes('data-feature-route="classic"'));
assert(get('#gallery').innerHTML.includes('data-open-sources'),'Mobile gallery must retain sources access');
assert(get('#gallery').innerHTML.includes('data-pick-plan="hn-wansui"'));assert(get('#gallery').innerHTML.includes('data-pick-detail="hn-laojunshan"'));
assert(get('#gallery').innerHTML.includes('实景照片待补充'),'Unverified destination photos must not be disguised as real images');
const carouselDraft=run('JSON.stringify(compactDraft())');get('#brieftext').value='两天时间，想看山水';
get('#gallery').onclick({target:{closest:s=>s==='[data-hero-photo]'?{dataset:{heroPhoto:'1'}}:null}});
assert.equal(run('heroPhotoIndex'),1);assert(get('#hero-photo-source').textContent.includes('洛阳 · 龙门石窟'));assert.equal(get('#hero-photo-source').dataset.photoPlace,'hn-longmen');
run('selectHeroPhoto(0)');get('#gallery').onclick({target:{closest:s=>s==='[data-hero-step]'?{dataset:{heroStep:'-1'}}:null}});assert.equal(run('heroPhotoIndex'),4);assert(get('#hero-photo-source').textContent.includes('洛阳 · 老君山'));
run('selectHeroPhoto(-1)');assert.equal(run('heroPhotoIndex'),4);assert.equal(run('JSON.stringify(compactDraft())'),carouselDraft);assert.equal(get('#brieftext').value,'两天时间，想看山水','Photo selection must preserve the travel input');
const carouselTimers=new Map();let timerId=0;context.setTimeout=callback=>{carouselTimers.set(++timerId,callback);return timerId};context.clearTimeout=id=>carouselTimers.delete(id);context.document.querySelector=s=>s==='dialog[open]'?null:get(s);
run('selectHeroPhoto(0)');assert.equal(carouselTimers.size,1);const nextPhoto=carouselTimers.get(run('heroTimer'));carouselTimers.delete(run('heroTimer'));nextPhoto();assert.equal(run('heroPhotoIndex'),1);assert.equal(carouselTimers.size,1,'Autoplay schedules one next photo');
get('#hero-slideshow').onpointerenter();assert.equal(carouselTimers.size,0);get('#hero-slideshow').onpointerleave();assert.equal(carouselTimers.size,1);
get('#hero-slideshow').onfocusin();assert.equal(carouselTimers.size,0);get('#hero-slideshow').onfocusout({relatedTarget:null});assert.equal(carouselTimers.size,1);
context.document.hidden=true;run('scheduleHeroRotation()');assert.equal(carouselTimers.size,0);context.document.hidden=false;
run("activeView='planner';scheduleHeroRotation()");assert.equal(carouselTimers.size,0);run("activeView='gallery';heroVisible=false;scheduleHeroRotation()");assert.equal(carouselTimers.size,0);run('heroVisible=true;scheduleHeroRotation()');assert.equal(carouselTimers.size,1);
get('#gallery').onclick({target:{closest:s=>s==='[data-hero-toggle]'?{}:null}});assert.equal(run('heroAutoplay'),false);assert.equal(carouselTimers.size,0);
context.setTimeout=()=>0;context.clearTimeout=()=>{};context.document.querySelector=get;run('selectHeroPhoto(0)');
const albumDraft=run('JSON.stringify(compactDraft())'),albumTotal=String(CATALOG.filter(p=>p.image).length).padStart(2,'0');
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
function photoCatalogueFixture(catalog){
 const nodes=new Map(),body={dataset:{view:'gallery'}},get=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:selector==='#days'?'3':selector==='#start'?'09:00':selector==='#city'?'河南':selector==='#maxhours'?'6':selector==='#restmins'?'30':selector==='#travelmode'?'driving':'',style:{},dataset:{},hidden:false,open:false,classList:{add(){},toggle(){}},querySelectorAll:()=>[],addEventListener(){},setAttribute(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(selector)};
 const context={document:{body,querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(){}}},navigator:{},URL,Blob,Map,Set,console,setTimeout:()=>0,clearTimeout(){},fetch(){throw Error('Photo catalogue fixture must not make network requests')}};context.window=context;vm.createContext(context);
 let script=HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');const start=script.indexOf('const CATALOG='),end=script.indexOf(';const PRESETS=',start);assert(start>=0&&end>start,'Replace only the compiled catalogue declaration');script=script.slice(0,start)+'const CATALOG='+JSON.stringify(catalog)+script.slice(end);
 assert.doesNotThrow(()=>vm.runInContext(script,context),'Photo availability must not prevent the browser script from initializing');
 return {get,run:expression=>vm.runInContext(expression,context),hero:()=>get('#gallery').innerHTML.split('<div class="gallery-inner">')[0]};
}
const configuredHeroIds=['hn-qingming','hn-longmen','hn-luoyi','hn-henan-museum','hn-laojunshan'];
assert.deepEqual(Array.from(run('heroPlaces.map(place=>place.id)')),configuredHeroIds,'Existing verified hero photos keep their editorial order');
{
 const catalog=CATALOG.map(place=>configuredHeroIds.includes(place.id)?{...place,image:null}:place),fixture=photoCatalogueFixture(catalog),remaining=catalog.filter(place=>place.image);
 assert.deepEqual(Array.from(fixture.run('heroPlaces.map(place=>place.id)')),remaining.slice(0,5).map(place=>place.id),'If all configured covers are removed, use other actual catalogue photographs');
 assert.equal(fixture.run('albumPlaces.length'),remaining.length);assert.equal(new Set(Array.from(fixture.run('albumPlaces.map(place=>place.id)'))).size,remaining.length,'Fallback photos are not counted twice in the album');
 for(const place of remaining.slice(0,5))assert(fixture.hero().includes(place.image),'A fallback cover uses its actual image URL');
 const draft=fixture.run('JSON.stringify(compactDraft())');fixture.run('selectHeroPhoto(1);openPhotoAlbum()');assert.equal(fixture.get('#photoalbum').open,true);assert.equal(fixture.get('#album-title').textContent,remaining[1].name);assert.equal(fixture.run('JSON.stringify(compactDraft())'),draft);
}
for(const catalog of [CATALOG.map(place=>({...place,image:null})),[]]){
 const fixture=photoCatalogueFixture(catalog),markup=fixture.hero();assert.equal(fixture.run('albumPlaces.length'),0,'A placeholder is never counted as a real album photo');assert.equal(fixture.run('heroPlaces.length'),1);assert.equal(fixture.run('Boolean(heroPlaces[0].image)'),false);
 if(catalog.length)assert(catalog.some(place=>place.id===fixture.run('heroPlaces[0].id')),'A missing-photo hero still names an actual catalogue place');
 assert(markup.includes('photo-placeholder'));assert.match(markup,/实景待补|照片占位/);assert(!/<img\b/.test(markup),'An empty photo catalogue must not create a fictitious real-image slide');
 const albumEntry=markup.match(/<button\b[^>]*class="hero-album-entry"[^>]*>/)?.[0];assert(!albumEntry||/\shidden(?:\s|>)/.test(albumEntry),'Hide the unavailable real-photo album entry');
 const sourceTag=markup.match(/<(?:button|span)\b[^>]*id="hero-photo-source"[^>]*>/)?.[0];assert(sourceTag,'Keep an honest visible photo-state label');assert(!sourceTag.includes('data-open-album'),'A placeholder cannot link to nonexistent photo provenance');assert(!sourceTag.startsWith('<button')||/\sdisabled(?:\s|>)/.test(sourceTag),'Photo-state labels cannot masquerade as enabled source controls');
 const controls=markup.match(/<div\b[^>]*class="hero-gallery-controls"[^>]*>/)?.[0],toggle=markup.match(/<button\b[^>]*id="hero-toggle"[^>]*>/)?.[0];assert(!controls||/\shidden(?:\s|>)/.test(controls),'Hide unavailable carousel navigation');assert(!toggle||/\shidden(?:\s|>)/.test(toggle),'Hide the unavailable autoplay control');assert(!markup.includes('拍摄于'),'Residual photo metadata cannot imply that a graphic placeholder is a dated photograph');assert(markup.includes('<b>0</b><span>张实景照片</span>'));
 assert.equal(fixture.run('heroAutoplay'),false);assert.equal(fixture.run('heroTimer'),0);assert.equal(fixture.run('heroPhotoIndex'),0);
 fixture.run('selectHeroPhoto(0);scheduleHeroRotation();openPhotoAlbum();stepAlbumPhoto(1)');assert.equal(fixture.get('#photoalbum').open,false,'An absent album cannot be opened programmatically');assert.equal(fixture.run('heroTimer'),0);
}
console.log('Passed: full-frame album, photo navigation and failure recovery, alternate real hero covers and honest all-missing/empty catalogue startup, preserved draft, load-aware/city-aware planning across 75 cases, gallery routes, overview and truthful comparison.');
