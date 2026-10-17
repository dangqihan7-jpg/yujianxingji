import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createShareSnapshot,shareTimelineDays,sharePageHTML,shareNotFoundHTML} from '../share-timeline.mjs';

const root=new URL('../',import.meta.url),browserSource=readFileSync(new URL('share.js',root),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const stop=(name,day=1,duration=90)=>({day,duration,place:{id:'p-'+name,name,city:'洛阳',user:{id:7},routing:{location:[112,34]}},user:'secret'});
const trip=[stop('龙门石窟'),stop('洛邑古城'),stop('龙门石窟',2)];
const snapshot=createShareSnapshot(trip,3,stops=>stops.length===2?{legs:[{duration:720}]}:null);
assert.deepEqual(snapshot,{places:['龙门石窟','洛邑古城'],days:3,schedule:[{day:1,stops:[{name:'龙门石窟',city:'洛阳',duration:90,travelMinutes:null},{name:'洛邑古城',city:'洛阳',duration:90,travelMinutes:12}]},{day:2,stops:[{name:'龙门石窟',city:'洛阳',duration:90,travelMinutes:null}]},{day:3,stops:[]}]});
assert(!JSON.stringify(snapshot).includes('user'));assert(!JSON.stringify(snapshot).includes('location'));
assert.equal(shareTimelineDays(trip,3)[0].stops[1].travelMinutes,null);
assert.equal(shareTimelineDays(trip,3,()=>({legs:[{duration:0}]}))[0].stops[1].travelMinutes,1,'Keep poster rounding of known zero-duration legs');
assert.equal(shareTimelineDays(trip,3,()=>({legs:[{duration:-1}]}))[0].stops[1].travelMinutes,null);
assert.throws(()=>createShareSnapshot([],2),/加入地点/);
assert.throws(()=>createShareSnapshot([stop('x',8)],2),/确认/);
assert.throws(()=>createShareSnapshot([stop('x',1,0)],2),/确认/);
assert.throws(()=>createShareSnapshot(Array.from({length:16},(_,i)=>stop('x'+i)),2),/15/);
const html=sharePageHTML(snapshot);
assert.equal((html.match(/class="shared-stop"/g)||[]).length,3);
assert(html.includes('DAY 3'));assert(html.includes('自由安排'));assert(html.includes('站间交通约 12分钟'));assert(html.includes('由豫见行迹生成'));assert(html.includes('我也要规划'));
assert(!/<script\b|<button\b|<input\b|\/api\/(?:agent|plan|poster)/.test(html),'Share page has no editing controls, script, or AI calls');
assert(html.includes('width=device-width'));assert(html.includes('overflow-wrap:anywhere'));
const attack=createShareSnapshot([stop('<img src=x onerror=alert(1)>')],1);const safe=sharePageHTML(attack);assert(!safe.includes('<img '));assert(safe.includes('&lt;img'));
assert(shareNotFoundHTML().includes('该分享已过期或不存在'));assert(shareNotFoundHTML().includes('href="/"'));
const app=readFileSync(new URL('app.html',root),'utf8');
assert(app.indexOf('id="poster"')<app.indexOf('id="share"')&&app.indexOf('id="share"')<app.indexOf('id="import"'),'Share is adjacent to poster');
assert(app.includes('id="sharelink" type="url" readonly'));assert(app.includes('id="shareqr"'));assert(app.includes('任何拿到链接的人'));
const journey=readFileSync(new URL('journey.js',root),'utf8');assert(journey.includes("await api('/api/poster',{places:names,days})"),'Poster API contract is unchanged');assert(journey.includes('shareTimelineDays(trip,days,stops=>cachedTraffic(stops))'));

// Exercise the actual poster renderer with the same shared timeline view model.
// This verifies that adding sharing keeps its existing labels and download flow.
{
 const texts=[],downloads=[],posterCanvas={width:0,height:0,toBlob:callback=>callback({})};
 const gradient={addColorStop(){}};
 const canvasContext=new Proxy({fillText:text=>texts.push(String(text)),measureText:text=>({width:String(text).length*30}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true}});
 posterCanvas.getContext=()=>canvasContext;
 const context={console,Date,Math,Number,String,Set,trip:clone(trip),shareTimelineDays,shareFormatMinutes:(await import('../share-timeline.mjs')).shareFormatMinutes,
  $:selector=>({value:selector==='#days'?'3':'driving'}),cachedTraffic:stops=>stops.length===2?{legs:[{duration:720}]}:null,
  document:{createElement:tag=>tag==='canvas'?posterCanvas:{click(){downloads.push(this.download)}}},URL:{createObjectURL:()=>'/fake-image',revokeObjectURL(){}},setTimeout:()=>0,toast(){}};
 const posterCode=journey.slice(journey.indexOf('function drawPoster(cover){'),journey.indexOf("$('#file').onchange="));
 const roundRectCode=journey.slice(journey.indexOf('function roundRectPath('),journey.indexOf("$('#poster').onclick="));
 vm.createContext(context);vm.runInContext(roundRectCode+posterCode,context);context.drawPoster(null);
 assert(texts.includes('龙门石窟'));assert(texts.includes('洛邑古城'));assert(texts.includes('驾车约12分钟'));assert(texts.includes('DAY 3'));assert(texts.includes('（自由安排）'));assert.equal(downloads[0],'豫见行迹-河南3日游行程.png');
}

function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}}
function fixture({protocol='https:',qrFails=false,copyFails=false}={}){
 class Node{constructor(){this.hidden=false;this.disabled=false;this.open=false;this.value='';this.textContent='';this.handlers={};this.selected=false;this.focused=false}addEventListener(type,handler){this.handlers[type]=handler}focus(){this.focused=true}select(){this.selected=true}showModal(){this.open=true}close(){this.open=false;this.handlers.close?.()}cancel(){this.handlers.cancel?.();this.open=false;this.handlers.close?.()}}
 const nodes=new Map(),get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector)};
 get('#days').value='3';const requests=[],qr=[],copied=[],messages=[];
 const context={console,JSON,Date,AbortController,location:{origin:'https://example.test:8443',protocol},navigator:{clipboard:{writeText:async text=>{if(copyFails)throw Error('denied');copied.push(text)}}},QRCode:{toCanvas:async(canvas,text,options)=>{if(qrFails)throw Error('qr unavailable');qr.push({text,options})}},trip:clone(trip),$:get,toast:text=>messages.push(text),createShareSnapshot,cachedTraffic:()=>null,
  fetch:async(path,options)=>{requests.push({path,options});return context.response instanceof Promise?await context.response:context.response},response:{ok:true,status:200,json:async()=>({token:'abcDEF_1'})}};
 vm.createContext(context);vm.runInContext(browserSource,context);
 return {context,nodes,get,requests,qr,copied,messages,run:source=>vm.runInContext(source,context),open:()=>context.openTripShare()};
}
{
 const f=fixture();await f.open();assert.equal(f.requests.length,1);assert.equal(f.requests[0].path,'/api/share');assert.equal(f.requests[0].options.credentials,'same-origin');
 const body=JSON.parse(f.requests[0].options.body);assert(!JSON.stringify(body).includes('user'));assert(!JSON.stringify(body).includes('routing'));assert.equal(body.schedule.length,3);
 assert.equal(f.get('#sharelink').value,'https://example.test:8443/s/abcDEF_1');assert.equal(f.qr[0].text,f.get('#sharelink').value);assert.equal(f.qr[0].options.margin,4);assert.equal(f.qr[0].options.errorCorrectionLevel,'M');assert.equal(f.get('#shareqr').hidden,false);
 await f.context.copyTripShare();assert.equal(f.copied[0],f.get('#sharelink').value);assert.equal(f.get('#copyshare').textContent,'已复制');
 f.get('#sharetrip').close();await f.open();assert.equal(f.requests.length,1,'Reopening the identical snapshot reuses its valid token');
}
{
 const f=fixture({copyFails:true,qrFails:true});await f.open();assert.equal(f.get('#shareqr').hidden,true);assert.match(f.get('#shareqrnote').textContent,/请复制/);assert.match(f.get('#sharelink').value,/\/s\//);
 await f.context.copyTripShare();assert(f.get('#sharelink').selected);assert.match(f.get('#sharestatus').textContent,/链接已选中/);
}
{
 const f=fixture();await f.open();const firstCopy=deferred(),nextCopy=deferred();let copies=0;
 f.context.navigator.clipboard.writeText=()=>++copies===1?firstCopy.promise:nextCopy.promise;
 const copying=f.context.copyTripShare();assert(f.get('#copyshare').disabled);f.get('#sharetrip').close();await f.open();assert(!f.get('#copyshare').disabled,'Reopening is not blocked by an old pending clipboard operation');
 const newerCopying=f.context.copyTripShare();assert(f.get('#copyshare').disabled);firstCopy.resolve();await copying;assert(f.get('#copyshare').disabled,'An old clipboard completion cannot unlock a newer operation');
 nextCopy.resolve();await newerCopying;assert(!f.get('#copyshare').disabled);assert.equal(f.get('#copyshare').textContent,'已复制');
}
{
 const f=fixture(),pending=deferred();f.context.response=pending.promise;const first=f.open();await f.open();assert.equal(f.requests.length,1,'Double click never creates a second request');assert(f.get('#share').disabled);
 f.get('#sharetrip').cancel();assert(f.requests[0].options.signal.aborted);assert(!f.get('#share').disabled);
 pending.resolve({ok:true,json:async()=>({token:'oldOLD_1'})});await first;assert.equal(f.get('#sharelink').value,'','A late closed-dialog response must not appear');assert.equal(f.qr.length,0);
}
{
 const f=fixture(),pending=deferred();f.context.response=pending.promise;const job=f.open();f.context.trip[0].duration=120;pending.resolve({ok:true,json:async()=>({token:'abcDEF_2'})});await job;assert.equal(f.get('#shareresult').hidden,true);assert.match(f.get('#sharestatus').textContent,/行程已修改/);assert.equal(f.qr.length,0);
}
{
 const f=fixture();f.context.response={ok:false,status:429,json:async()=>({error:'今天的匿名分享次数已用完，请明天再试'})};await f.open();assert.match(f.get('#sharestatus').textContent,/匿名分享次数/);assert.equal(f.get('#retryshare').hidden,false);assert.equal(f.get('#sharelink').value,'');assert.equal(f.requests.length,1,'Rate limits never auto-retry');
}
{
 const f=fixture();f.context.response={ok:true,json:async()=>({token:'<bad>'})};await f.open();assert.match(f.get('#sharestatus').textContent,/返回异常/);assert.equal(f.get('#shareresult').hidden,true);
}
{
 const f=fixture({protocol:'file:'});await f.open();assert.equal(f.requests.length,0);assert.match(f.get('#sharestatus').textContent,/离线页面/);assert(!f.get('#share').disabled);
}
{
 const f=fixture();f.context.trip=[];await f.open();assert.equal(f.requests.length,0);assert.equal(f.get('#sharetrip').open,false);assert.match(f.messages[0],/加入地点/);
}
console.log('分享 UI：公开时间线、二维码/复制、缓存、取消/双击、过期输入与离线/限流错误处理通过。');
