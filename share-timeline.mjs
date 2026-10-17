// A public-only timeline view model shared by the image export and share page.
// No account, AI prompt, location coordinates, or saved-draft metadata is copied.
export function shareFormatMinutes(minutes){const value=Number(minutes)||0;return value>=60?Math.floor(value/60)+'小时'+(value%60?value%60+'分钟':''):value+'分钟'}
export function shareTimelineDays(trip,days,trafficForStops=()=>null){
 return Array.from({length:days},(_,index)=>{
  const stops=trip.filter(stop=>stop.day===index+1),traffic=trafficForStops(stops);
  return {day:index+1,stops:stops.map((stop,stopIndex)=>{
   const leg=stopIndex>0?traffic?.legs?.[stopIndex-1]:null,seconds=leg?.duration;
   const travelMinutes=seconds!==null&&seconds!==undefined&&Number.isFinite(Number(seconds))&&Number(seconds)>=0?Math.max(1,Math.round(Number(seconds)/60)):null;
   return {name:String(stop.place.name),city:String(stop.place.city||''),duration:Number(stop.duration),travelMinutes};
  })};
 });
}
export function createShareSnapshot(trip,days,trafficForStops=()=>null){
 if(!Array.isArray(trip)||!trip.length)throw Error('请先加入地点');
 if(!Number.isInteger(days)||days<1||days>7)throw Error('旅行天数应为 1–7 天');
 if(trip.some(stop=>!stop.place||typeof stop.place.name!=='string'||!stop.place.name.trim()||stop.place.name.length>150||String(stop.place.city||'').length>80||!Number.isInteger(stop.day)||stop.day<1||stop.day>days||!Number.isInteger(stop.duration)||stop.duration<15||stop.duration>720))throw Error('请先确认每站的名称、日期和停留时间');
 const places=[...new Set(trip.map(stop=>stop.place.name))];
 if(places.length>15||trip.length>15)throw Error('分享行程最多包含 15 站安排，请先精简行程');
 const schedule=shareTimelineDays(trip,days,trafficForStops);
 if(schedule.some(day=>day.stops.some(stop=>stop.travelMinutes!==null&&stop.travelMinutes>1440)))throw Error('站间交通超过一天，请先调整行程');
 return {places,days,schedule};
}
function shareEscape(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
const SHARE_PAGE_STYLES=`
:root{color-scheme:dark;--space:#0b1220;--neon:#4dd8ff;--mono:ui-monospace,SFMono-Regular,Consolas,monospace}*{box-sizing:border-box}body{margin:0;min-width:0;color:#e2e8f0;background:radial-gradient(ellipse at 50% 0,rgba(56,189,248,.14),transparent 600px),linear-gradient(145deg,#0b1526,#081020 55%,#050a16);font:16px/1.65 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(rgba(56,189,248,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(56,189,248,.035) 1px,transparent 1px);background-size:64px 64px;z-index:-1}a{color:inherit}.shared-trip{width:min(100% - 36px,860px);margin:0 auto;padding:36px 0 40px;overflow-wrap:anywhere}.shared-brand{margin:0;color:var(--neon);font:600 13px/1.6 var(--mono);letter-spacing:.12em}.shared-head{padding:24px 0 30px;border-bottom:1px solid rgba(77,216,255,.18)}.shared-head h1{font-size:clamp(30px,7vw,52px);line-height:1.3;letter-spacing:-.03em;margin:14px 0}.shared-description{margin:0;color:#94a3b8;font-size:14px}.shared-stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px}.shared-stats span{padding:6px 12px;border-radius:24px;border:1px solid rgba(56,189,248,.28);background:rgba(56,189,248,.08);color:#bae6fd;font-size:13px}.shared-day{padding-top:30px}.shared-day-head{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap;margin-bottom:20px}.shared-day-head b{color:var(--neon);font:800 20px/1.4 var(--mono)}.shared-day-head h2{margin:0;font-size:18px;font-weight:650;min-width:0;flex:1}.shared-day-head p{flex-basis:100%;margin:0;color:#94a3b8;font-size:13px}.shared-timeline{list-style:none;margin:0;padding:0 0 0 28px}.shared-stop{position:relative;padding:0 0 18px 0;min-width:0}.shared-stop:before{content:"";position:absolute;width:2px;top:16px;bottom:-16px;left:-21px;background:rgba(56,189,248,.3)}.shared-stop:last-child:before{display:none}.shared-stop:after{content:"";position:absolute;top:21px;left:-25px;width:10px;height:10px;border:3px solid #0b1526;border-radius:50%;background:#38bdf8;box-shadow:0 0 0 1px #38bdf8,0 0 18px 3px rgba(56,189,248,.4)}.shared-card{position:relative;border:1px solid rgba(148,197,255,.16);border-radius:12px;background:rgba(148,197,255,.07);padding:16px 46px 16px 16px;min-width:0}.shared-card h3{font-size:17px;line-height:1.6;margin:0;color:#f1f5f9;font-weight:650;overflow-wrap:anywhere}.shared-card p{font-size:13px;color:rgba(125,211,252,.85);margin:6px 0 0}.shared-number{position:absolute;top:18px;right:14px;font:700 14px/1.6 var(--mono);color:rgba(77,216,255,.65)}.shared-travel{color:#94a3b8;font-size:12px;margin:12px 0 -3px 15px}.shared-free{margin:0 0 0 28px;padding:18px 16px;border:1px dashed rgba(148,197,255,.22);border-radius:12px;color:#94a3b8}.shared-foot{border-top:1px solid rgba(77,216,255,.18);margin-top:32px;padding-top:24px}.shared-foot p{font-size:13px;color:#94a3b8;margin:0 0 20px}.shared-home{display:inline-flex;align-items:center;justify-content:center;padding:12px 24px;min-height:48px;border:1px solid rgba(77,216,255,.5);border-radius:8px;background:rgba(77,216,255,.12);color:#bae6fd;text-decoration:none;font-weight:650}.shared-home:focus-visible{outline:3px solid var(--neon);outline-offset:4px}.shared-not-found{display:grid;place-content:center;min-height:100vh;padding:24px;text-align:center}.shared-not-found main{max-width:520px}.shared-not-found h1{font-size:clamp(26px,6vw,38px);line-height:1.45}.shared-not-found p:not(.shared-brand){color:#94a3b8;margin-bottom:28px}@media(min-width:640px){.shared-trip{padding-top:58px}.shared-day-head p{flex-basis:auto;margin-left:auto}.shared-day-head h2{flex:initial}.shared-timeline{padding-left:42px}.shared-stop:before{left:-29px}.shared-stop:after{left:-33px}.shared-card{padding:20px 56px 20px 24px}.shared-card h3{font-size:21px}.shared-number{top:22px;right:22px}.shared-free{margin-left:42px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
`;
function shareDocument(title,body){return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+shareEscape(title)+' · 豫见行迹</title><style>'+SHARE_PAGE_STYLES+'</style></head><body>'+body+'</body></html>'}
export function sharePageHTML(data){
 const allStops=data.schedule.flatMap(day=>day.stops),totalMinutes=allStops.reduce((sum,stop)=>sum+stop.duration,0);
 const blocks=data.schedule.map(block=>{
  const cities=[...new Set(block.stops.map(stop=>stop.city).filter(Boolean))],minutes=block.stops.reduce((sum,stop)=>sum+stop.duration,0);
  const stops=block.stops.map((stop,index)=>{
   const next=block.stops[index+1],travel=next?(next.travelMinutes===null||next.travelMinutes===undefined?'站间交通待确认':'站间交通约 '+shareFormatMinutes(next.travelMinutes)):'';
   return '<li class="shared-stop"><article class="shared-card"><span class="shared-number" aria-hidden="true">'+String(index+1).padStart(2,'0')+'</span><h3>'+shareEscape(stop.name)+'</h3><p>'+shareEscape([stop.city,'建议游览 '+shareFormatMinutes(stop.duration)].filter(Boolean).join(' · '))+'</p></article>'+(next?'<p class="shared-travel">'+shareEscape(travel)+'</p>':'')+'</li>';
  }).join('');
  return '<section class="shared-day" aria-labelledby="shared-day-'+block.day+'"><div class="shared-day-head"><b>DAY '+block.day+'</b><h2 id="shared-day-'+block.day+'">第 '+block.day+' 天'+(cities.length?' · '+shareEscape(cities.join('、')):'')+'</h2><p>'+block.stops.length+' 站 · 游览 '+shareEscape(shareFormatMinutes(minutes))+'</p></div>'+(stops?'<ol class="shared-timeline">'+stops+'</ol>':'<p class="shared-free">自由安排</p>')+'</section>';
 }).join('');
 return shareDocument('河南 '+data.days+' 日游', '<main class="shared-trip"><header class="shared-head"><p class="shared-brand">由豫见行迹生成</p><h1>河南 '+data.days+' 日游</h1><p class="shared-description">一份分享给你的旅行安排 · 只读行程</p><div class="shared-stats"><span>'+allStops.length+' 站安排</span><span>'+data.days+' 天行程</span><span>游览 '+shareEscape(shareFormatMinutes(totalMinutes))+'</span></div></header>'+blocks+'<footer class="shared-foot"><p>此页为分享时的行程快照，不会随原草稿修改。交通耗时为分享时已核算的预计值；标为待确认的路段尚无交通数据。开放时间、预约和票价请在出发前核实。</p><a class="shared-home" href="/">我也要规划 ↗</a></footer></main>');
}
export function shareNotFoundHTML(message='该分享已过期或不存在'){
 const unavailable=message!=='该分享已过期或不存在';
 return shareDocument(unavailable?'分享暂时不可用':'分享不存在','<div class="shared-not-found"><main><p class="shared-brand">豫见行迹 · HENAN WEEKEND</p><h1>'+shareEscape(message)+'</h1><p>'+(unavailable?'请稍后重新打开此链接，或先返回首页。':'分享链接有效期为 30 天，你也可以从首页开始规划新的旅程。')+'</p><a class="shared-home" href="/">回首页</a></main></div>');
}
