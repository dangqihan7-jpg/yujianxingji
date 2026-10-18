import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {shareTimelineDays,shareFormatMinutes} from '../share-timeline.mjs';

const root=new URL('../',import.meta.url),source=readFileSync(new URL('journey.js',root),'utf8');
const posterFlowCode=source.slice(source.indexOf('let posterPreviewOperation='),source.indexOf("$('#file').onchange="));
const app=readFileSync(new URL('app.html',root),'utf8');
assert(app.includes('id="posterpreview"'));assert(app.includes('id="posterpreviewimage"'));assert(app.includes('可长按保存的完整分日行程图'));

function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}}
function fixture({width=375,canShare=true,shareResult,shareThrows,canShareThrows=false,fileSupport=true,delayedBlob=false,apiResult={}}={}){
 const nodes=new Map(),created=[],revoked=[],downloads=[],shares=[],messages=[],handlers={},blobCallbacks=[];
 class Node{
  constructor(){this.hidden=false;this.disabled=false;this.open=false;this.value='';this.textContent='';this.handlers={}}
  addEventListener(type,handler){this.handlers[type]=handler}
  removeAttribute(name){delete this[name]}
  showModal(){this.open=true}
  close(){this.open=false;this.handlers.close?.()}
  click(){downloads.push({href:this.href,download:this.download})}
 }
 const get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector)};
 get('#days').value='2';get('#travelmode').value='driving';get('#poster').textContent='导出行程图';
 const gradient={addColorStop(){}},canvasContext=new Proxy({fillText(){},measureText:text=>({width:String(text).length*30}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true}});
 const canvas={getContext:()=>canvasContext,toBlob(callback){if(delayedBlob)blobCallbacks.push(callback);else callback(new Blob(['png'],{type:'image/png'}))}};
 const context={console,Number,String,Date,Set,Blob,shareTimelineDays,shareFormatMinutes,File:fileSupport?File:undefined,
  trip:[{day:1,duration:90,place:{name:'龙门石窟',city:'洛阳'}}],$:get,cachedTraffic:()=>null,
  document:{createElement:tag=>tag==='canvas'?canvas:new Node()},navigator:{share(data){shares.push(data);if(shareThrows)throw shareThrows;return shareResult||Promise.resolve()},canShare:canShare?data=>{if(canShareThrows)throw Error('file sharing denied');return data.files.length===1}:undefined},
  URL:{createObjectURL(blob){const url='blob:test/'+created.length;created.push({url,blob});return url},revokeObjectURL:url=>revoked.push(url)},
  matchMedia:query=>({matches:query==='(max-width: 767px)'&&width<=767}),addEventListener:(type,handler)=>{handlers[type]=handler},setTimeout:callback=>{callback();return 1},toast:text=>messages.push(text),api:async()=>apiResult instanceof Promise?await apiResult:apiResult};
 vm.createContext(context);vm.runInContext(posterFlowCode,context);
 return {context,get,created,revoked,downloads,shares,messages,blobCallbacks,resize(next){width=next;handlers.resize?.()},run:code=>vm.runInContext(code,context)};
}

// Only the mobile breakpoint opens the preview; desktops retain one direct PNG download.
for(const width of [375,390,414,767,768,1280]){
 const f=fixture({width});await f.get('#poster').onclick();
 assert.equal(f.get('#posterpreview').open,width<=767,`${width}px dialog gate`);
 assert.equal(f.downloads.length,width<=767?0:1,`${width}px direct download gate`);
 assert.equal(f.get('#poster').disabled,false);
 if(width<=767){assert.equal(f.get('#posterpreviewimage').hidden,false);assert(f.get('#posterpreviewimage').src.startsWith('blob:'));assert.equal(f.get('#posterpreviewdownload').download,'豫见行迹-河南2日游行程.png');assert.match(f.get('#posterpreviewstatus').textContent,/长按/);assert.equal(f.shares.length,0,'Generating never opens native sharing without a fresh tap')}
 else assert.equal(f.downloads[0].download,'豫见行迹-河南2日游行程.png');
}
{
 const f=fixture(),job=deferred();await f.get('#poster').onclick();
 f.context.navigator.share=data=>{f.shares.push(data);return job.promise};
 const sharing=f.get('#posterpreviewshare').onclick();assert.equal(f.shares.length,1,'Native sharing is invoked synchronously by the click handler');
 assert.equal(f.shares[0].files[0].type,'image/png');assert.equal(f.shares[0].files[0].name,'豫见行迹-河南2日游行程.png');assert(f.get('#posterpreviewshare').disabled);
 await f.get('#posterpreviewshare').onclick();assert.equal(f.shares.length,1,'Repeated sharing taps are ignored while busy');
 job.resolve();await sharing;assert.equal(f.get('#posterpreviewshare').disabled,false);assert(!/已保存|保存成功/.test(f.get('#posterpreviewstatus').textContent),'Native share completion cannot claim that a photo was saved');
 f.get('#posterpreview').close();assert.equal(f.revoked.length,1);assert.equal(f.get('#posterpreviewimage').src,undefined);
}
for(const options of [{canShare:false},{fileSupport:false},{canShareThrows:true}]){
 const f=fixture(options);await f.get('#poster').onclick();
 assert(f.get('#posterpreviewshare').hidden);assert(!f.get('#posterpreviewdownload').hidden);assert(!f.get('#posterpreviewimage').hidden);assert.equal(f.downloads.length,0);
 f.get('#posterpreviewdownload').onclick();assert.match(f.get('#posterpreviewstatus').textContent,/预览.*长按/);
}
for(const name of ['AbortError','NotAllowedError']){
 const f=fixture({shareThrows:Object.assign(Error(name),{name})});await f.get('#poster').onclick();await f.get('#posterpreviewshare').onclick();
 assert.match(f.get('#posterpreviewstatus').textContent,name==='AbortError'?/已取消/:/暂不可用/);assert(!f.get('#posterpreviewimage').hidden);assert(!f.get('#posterpreviewdownload').hidden);assert(!f.get('#posterpreviewshare').disabled);assert.equal(f.downloads.length,0);
}
{
 const api=deferred(),f=fixture({apiResult:api.promise});const generating=f.get('#poster').onclick();
 f.get('#posterpreview').close();api.resolve({});await generating;
 assert(!f.get('#posterpreview').open);assert.equal(f.created.length,0,'Closing before the async API result does not create an orphan image or download');
}
{
 const f=fixture({delayedBlob:true});await f.get('#poster').onclick();f.get('#posterpreview').close();
 f.blobCallbacks[0](new Blob(['old'],{type:'image/png'}));assert.equal(f.created.length,0,'Closing while canvas encoding is pending ignores its late result');
 await f.get('#poster').onclick();f.blobCallbacks[1](new Blob(['new'],{type:'image/png'}));assert.equal(f.created.length,1,'A new export still works');
 f.get('#posterpreview').close();assert.equal(f.revoked.length,1);
}
{
 const f=fixture({delayedBlob:true});await f.get('#poster').onclick();f.resize(1280);f.blobCallbacks[0](new Blob(['png'],{type:'image/png'}));
 assert(!f.get('#posterpreview').open);assert.equal(f.created.length,0);assert.equal(f.downloads.length,0,'Resizing does not unexpectedly trigger a desktop download');
}
{
 const f=fixture({delayedBlob:true});await f.get('#poster').onclick();f.blobCallbacks[0](null);
 assert.match(f.get('#posterpreviewstatus').textContent,/生成失败/);assert.equal(f.created.length,0);
}
{
 const sharing=deferred(),f=fixture({shareResult:sharing.promise});await f.get('#poster').onclick();const old=f.get('#posterpreviewshare').onclick();f.get('#posterpreview').close();await f.get('#poster').onclick();
 const status=f.get('#posterpreviewstatus').textContent;sharing.reject(Object.assign(Error('cancel'),{name:'AbortError'}));await old;assert.equal(f.get('#posterpreviewstatus').textContent,status,'A closed share operation cannot overwrite a newer preview');
}
console.log('移动端行程图：375/390/414/767 与 768/1280 断点、预览与桌面下载、手势内文件分享、取消/拒绝/缺失 API、关闭/横屏与异步回收通过；真实 iOS 相册行为需设备复核。');
