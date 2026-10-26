import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {heroDayIndex,heroDateString,heroPhotoHasPublicMetadata,selectDailyHeroPhotos} from '../hero-photos.mjs';

const root=new URL('../',import.meta.url);
const catalog=JSON.parse(await readFile(new URL('henan.json',root),'utf8')).places;
const now=Date.parse('2026-10-16T04:00:00Z'),day=86400000;
const ids=places=>places.map(place=>place.id);
const imageKey=place=>place.image.split('?')[0];
const available=catalog.filter(place=>place.image&&place.photoSource&&place.photoReference&&place.licenseUrl);
assert(available.length>=25,'Exercise rotation against at least 25 existing audited photographs');
for(const place of available){
 assert.match(place.image,/^\/assets\/[^/]+\.jpe?g(?:\?|$)/i);
 await access(new URL(place.image.split('?')[0].split('/').at(-1),root));
 assert.match(place.photoReference,/^https:\/\//,'Existing candidates retain an actual source page');
 assert.match(place.licenseUrl,/^https:\/\//,'Existing candidates retain their public licence link');
 assert(heroPhotoHasPublicMetadata(place),'Existing gallery photos retain complete public metadata');
}
const unverified=catalog.filter(place=>place.image&&!place.licenseUrl);
assert(unverified.length>0,'Exercise supplied covers whose licences are still unverified');
for(const place of unverified)assert(!heroPhotoHasPublicMetadata(place),place.id+' stays outside public photo galleries without inventing a licence');
assert.deepEqual(selectDailyHeroPhotos(unverified,now),[],'Unverified covers alone cannot become a daily real-photo gallery');

// Use explicit instants around China midnight; these must not depend on the
// operating system timezone or the date on which the test suite is executed.
const before=Date.parse('2026-10-15T15:59:59.999Z'),midnight=before+1;
assert.equal(heroDayIndex(midnight),heroDayIndex(before)+1);
assert.equal(heroDateString(before),'2026-10-15');
assert.equal(heroDateString(midnight),'2026-10-16');
assert.equal(heroDayIndex(midnight),heroDayIndex(midnight+day-1));
assert.equal(heroDayIndex(Date.parse('1970-01-01T15:59:59Z')),0);
assert.equal(heroDayIndex(Date.parse('1970-01-01T16:00:00Z')),1);
for(const invalid of [NaN,Infinity,-Infinity])assert.throws(()=>heroDayIndex(invalid),RangeError);

// Fixture dates below are synthetic test metadata on existing local images;
// they never alter the source catalogue or claim new real photography.
const recent=available.slice(0,25).map(place=>Object.freeze({...place,photoYear:2026,photoTakenAt:'2026-03-01'}));
const frozen=Object.freeze(recent.slice()),original=JSON.stringify(frozen);
const first=selectDailyHeroPhotos(frozen,now);
assert.equal(first.length,10);
assert.equal(new Set(ids(first)).size,10,'A day contains ten distinct places');
assert.equal(new Set(first.map(imageKey)).size,10,'A photograph cannot be repeated to fill the group');
for(const place of first)assert(frozen.includes(place),'Return the existing place object without fabricated photo metadata');
assert.deepEqual(ids(selectDailyHeroPhotos(frozen,midnight)),ids(selectDailyHeroPhotos(frozen,midnight+day-1)),'One Beijing date has one deterministic group');
assert.deepEqual(ids(selectDailyHeroPhotos([...frozen].reverse(),now)),ids(first),'Input ordering cannot reshuffle the daily group');
assert.deepEqual(ids(selectDailyHeroPhotos([...frozen.slice(8),...frozen.slice(0,8)],now)),ids(first));
assert.equal(JSON.stringify(frozen),original,'Selection cannot mutate the source catalogue');
for(let offset=0;offset<12;offset++){
 const today=selectDailyHeroPhotos(frozen,now+offset*day),tomorrow=selectDailyHeroPhotos(frozen,now+(offset+1)*day);
 assert.equal(today.length,10);assert.equal(tomorrow.length,10);
 assert.notDeepEqual(ids(today),ids(tomorrow),'The group changes across China dates');
 assert.equal(today.filter(place=>ids(tomorrow).includes(place.id)).length,0,'At least twenty eligible photos allow disjoint neighbouring ten-photo groups');
}
// Recent-year membership can change on 1 January. It must not weaken the
// no-overlap promise while both dates still have a sufficient real library.
const yearEnd=Date.parse('2026-12-31T15:59:59.999Z');
const yearEndGroup=selectDailyHeroPhotos(catalog,yearEnd),newYearGroup=selectDailyHeroPhotos(catalog,yearEnd+1);
assert.equal(yearEndGroup.length,10);assert.equal(newYearGroup.length,10);
assert.equal(yearEndGroup.filter(place=>ids(newYearGroup).includes(place.id)).length,0,'Changing the preferred photo-year pool at Beijing New Year still gives a different ten-photo group');
const januarySecond=selectDailyHeroPhotos(catalog,yearEnd+1+day);
assert.equal(newYearGroup.filter(place=>ids(januarySecond).includes(place.id)).length,0,'The New Year transition must also leave a different group for 2 January');

const old=available.slice(25,35).map(place=>({...place,photoYear:2018,photoTakenAt:'2018-03-01'}));
for(let offset=0;offset<5;offset++)assert(selectDailyHeroPhotos([...recent,...old],now+offset*day).every(place=>place.photoYear===2026),'A large recent library takes precedence over older photographs');
const yearPriority=available.slice(0,20).map((place,i)=>({...place,photoYear:i<10?2026:2025,photoTakenAt:i<10?'2026-02-01':'2025-02-01'}));
assert(selectDailyHeroPhotos([...yearPriority,...old],now).every(place=>place.photoYear>=2025),'Current and preceding Beijing years count as recent');

const sparseRecent=recent.slice(0,3),smallLibrary=[...sparseRecent,...old.slice(0,5)];
const fallback=selectDailyHeroPhotos(smallLibrary,now);
assert.equal(fallback.length,8,'Do not stretch a small photo library to ten slides');
assert.deepEqual(new Set(ids(fallback)),new Set(ids(smallLibrary)),'Older audited photos fill an insufficient recent library');
const mixedTwenty=[...recent.slice(0,3),...available.slice(3,20).map(place=>({...place,photoYear:2019,photoTakenAt:'2019-03-01'}))];
for(let offset=0;offset<3;offset++){
 const current=selectDailyHeroPhotos(mixedTwenty,now+offset*day),next=selectDailyHeroPhotos(mixedTwenty,now+(offset+1)*day);
 assert.equal(current.length,10);assert.equal(next.length,10);assert(!current.some(place=>ids(next).includes(place.id)),'Older audited fallback photos still preserve disjoint daily groups when twenty are available');
}
const unknown={...available.at(-1),photoYear:null,photoTakenAt:''},unknownSnapshot=JSON.stringify(unknown);
const undated=selectDailyHeroPhotos([unknown],now);
assert.equal(undated.length,1);assert.equal(undated[0],unknown);assert.equal(undated[0].photoYear,null);assert.equal(undated[0].photoTakenAt,'');assert.equal(JSON.stringify(unknown),unknownSnapshot,'Unknown dates remain unknown');
assert.deepEqual(selectDailyHeroPhotos([],now),[]);
assert.deepEqual(selectDailyHeroPhotos(catalog.map(place=>({...place,image:null})),now),[],'Missing photographs never become fabricated image slides');

const valid=recent[0],invalid=[
 {...valid,id:'remote',image:'https://images.invalid/a.jpg'},
 {...valid,id:'relative-remote',image:'//images.invalid/a.jpg'},
 {...valid,id:'unsafe',image:'/assets/../private.env'},
 {...valid,id:'missing-image',image:null},
 {...valid,id:'no-source',photoSource:''},
 {...valid,id:'missing-reference',photoReference:''},
 {...valid,id:'unsafe-reference',photoReference:'javascript:alert(1)'},
 {...valid,id:'http-reference',photoReference:'http://example.org/original'},
 {...valid,id:'credential-reference',photoReference:'https://name:secret@example.org/original'},
 {...valid,id:'missing-licence',licenseUrl:undefined},
 {...valid,id:'unsafe-licence',licenseUrl:'javascript:alert(1)'},
 {...valid,id:'relative-licence',licenseUrl:'//creativecommons.org/licenses/by/4.0/'},
 {...valid,id:'http-licence',licenseUrl:'http://creativecommons.org/licenses/by/4.0/'},
 {...valid,id:'credential-licence',licenseUrl:'https://name:secret@example.org/licence'},
 {...valid,id:'backslash-licence',licenseUrl:'https://example.org\\@untrusted.invalid/licence'},
 {...valid,id:'explicitly-unverified',credit:'来源未核 CC 授权，公开使用前请核对'},
 {...valid,id:'ai-photo',photoSource:'AI-generated'},
 {...valid,id:'generated-photo',photoSource:'AI 生成'},
 {...valid,id:'future-photo',photoYear:2027,photoTakenAt:'2027-01-01'},
 {...valid,id:''}
];
assert.deepEqual(ids(selectDailyHeroPhotos([valid,...invalid],now)),[valid.id],'Only local photographs with public provenance/licence links and honest date metadata qualify');
const duplicate={...valid,id:'duplicate-photo',image:valid.image.split('?')[0]+'?v=another-cache-key'};
const duplicateResult=selectDailyHeroPhotos([valid,duplicate,...recent.slice(1,12)],now,30);
assert.equal(new Set(duplicateResult.map(imageKey)).size,duplicateResult.length,'Different cache strings do not make one photograph into two');
assert.equal(new Set(ids(duplicateResult)).size,duplicateResult.length);
assert.equal(selectDailyHeroPhotos(recent,now,4).length,4,'Respect a smaller requested group');

console.log('Passed: fixed UTC+8 midnight, stable same-day/order-independent groups, disjoint adjacent days, recent-photo preference, older fallback, existing local files and provenance, duplicate rejection, honest sparse/empty libraries and unknown dates.');
