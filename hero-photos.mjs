const HERO_DAY_MS=86400000,HERO_BEIJING_OFFSET_MS=28800000;
const heroStableCompare=(a,b)=>a<b?-1:a>b?1:0;
export function heroDayIndex(now=Date.now()){
  const time=Number(now);if(!Number.isFinite(time))throw new RangeError('Invalid hero selection time');
  return Math.floor((time+HERO_BEIJING_OFFSET_MS)/HERO_DAY_MS);
}
export function heroDateString(now=Date.now()){
  return new Date(heroDayIndex(now)*HERO_DAY_MS).toISOString().slice(0,10);
}
function heroPhotoYear(place){
  if(Number.isInteger(place.photoYear))return place.photoYear;
  const match=String(place.photoTakenAt||'').match(/^(\d{4})(?:-|$)/);return match?Number(match[1]):null;
}
function heroLocalImage(image){
  return typeof image==='string'&&(/^\/assets\/[^/?#]+\.jpe?g(?:\?[^#]*)?$/i.test(image)||/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(image));
}
function heroInterleaveCities(places){
  const cities=new Map();
  for(const place of [...places].sort((a,b)=>heroStableCompare(String(a.id),String(b.id)))){
    const city=String(place.city||'河南');if(!cities.has(city))cities.set(city,[]);cities.get(city).push(place);
  }
  const queues=[...cities.keys()].sort(heroStableCompare).map(city=>cities.get(city)),ordered=[];
  for(let row=0;ordered.length<places.length;row++)for(const queue of queues)if(queue[row])ordered.push(queue[row]);
  return ordered;
}
export function selectDailyHeroPhotos(catalog,now=Date.now(),limit=10){
  const day=heroDayIndex(now),count=Math.floor(Number(limit));if(!Number.isFinite(count)||count<1||!Array.isArray(catalog))return [];
  const year=new Date(day*HERO_DAY_MS).getUTCFullYear();
  const sorted=catalog.filter(place=>place&&typeof place.id==='string'&&place.id&&typeof place.photoSource==='string'&&place.photoSource.trim()&&!/(?:\bai\b|人工智能|生成|合成)/i.test(place.photoSource)&&heroLocalImage(place.image)).sort((a,b)=>heroStableCompare(a.id,b.id)||heroStableCompare(a.image,b.image));
  const candidates=sorted.map(place=>({place,year:heroPhotoYear(place),image:place.image.startsWith('/assets/')?place.image.split('?')[0]:place.image}));
  const firstYear=Math.min(year,1970,...candidates.map(item=>item.year).filter(value=>Number.isInteger(value)&&value>0));
  let previous=new Set(),pool=[];
  for(let poolYear=firstYear;poolYear<=year;poolYear++){
    const ids=new Set(),images=new Set(),available=[];
    for(const item of candidates){
      if(ids.has(item.place.id)||images.has(item.image)||(item.year!==null&&item.year>poolYear))continue;
      ids.add(item.place.id);images.add(item.image);available.push(item.place);
    }
    const recent=available.filter(place=>heroPhotoYear(place)>=poolYear-1),older=available.filter(place=>heroPhotoYear(place)===null||heroPhotoYear(place)<poolYear-1).sort((a,b)=>(heroPhotoYear(b)||0)-(heroPhotoYear(a)||0)||heroStableCompare(a.id,b.id));
    // Keep enough verified photos for two disjoint daily groups when available.
    const interleaved=heroInterleaveCities([...recent,...older.slice(0,Math.max(0,Math.min(available.length,count*2)-recent.length))]);
    // The year boundary can change the recent-photo pool. Its first group must
    // avoid the actual final group of the previous year, then use one fixed ring.
    pool=[...interleaved.filter(place=>!previous.has(place.id)),...interleaved.filter(place=>previous.has(place.id))];
    if(poolYear<year){
      const days=(Date.UTC(poolYear+1,0,1)-Date.UTC(poolYear,0,1))/HERO_DAY_MS;
      const lastStart=pool.length?((days-1)*count)%pool.length:0;
      previous=new Set(Array.from({length:Math.min(count,pool.length)},(_,i)=>pool[(lastStart+i)%pool.length].id));
    }
  }
  if(!pool.length)return [];
  const elapsed=day-Math.floor(Date.UTC(year,0,1)/HERO_DAY_MS),start=((elapsed*count)%pool.length+pool.length)%pool.length;
  return Array.from({length:Math.min(count,pool.length)},(_,i)=>pool[(start+i)%pool.length]);
}
