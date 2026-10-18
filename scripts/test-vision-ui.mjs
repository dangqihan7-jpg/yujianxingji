import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../vision.js',import.meta.url),'utf8');
const hero=readFileSync(new URL('../ai-hero.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../vision.css',import.meta.url),'utf8');
const photo={type:'image/jpeg',size:1024,name:'original.jpg'};
const recognized={name:'龙门石窟',city:'洛阳',confidence:0.93,description:'洛阳的石窟艺术景区。',id:'hn-longmen'};
function deferred(){let resolve,reject;const promise=new Promise((res,rej)=>{resolve=res;reject=rej});return {promise,resolve,reject}}
function fixture({protocol='https:',width=4000,height=3000,readerPending=false}={}){
  const nodes=new Map(),requests=[],draws=[],conversions=[],reads=[],messages=[],added=[],events=[];
  class Node{
    constructor(tag='div'){this.tagName=tag;this.id='';this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.open=false;this.dataset={};this.attributes={};this.handlers=new Map();this._html=''}
    set innerHTML(value){this._html=value;for(const match of value.matchAll(/\bid="([^"]+)"/g)){const node=new Node();node.id=match[1];nodes.set(node.id,node)}}
    get innerHTML(){return this._html}
    setAttribute(name,value){this.attributes[name]=value}
    addEventListener(type,handler){const handlers=this.handlers.get(type)||[];handlers.push(handler);this.handlers.set(type,handlers)}
    showModal(){this.open=true}
    close(){this.open=false;for(const handler of this.handlers.get('close')||[])handler()}
    cancel(){for(const handler of this.handlers.get('cancel')||[])handler();this.close()}
    focus(){context.document.activeElement=this}
    click(){this.clicked=(this.clicked||0)+1}
  }
  class Reader{
    readAsDataURL(file){reads.push({file,reader:this});this.result='data:'+file.type+';base64,b3JpZ2luYWw=';if(!readerPending)Promise.resolve().then(()=>this.onload?.())}
    abort(){this.aborted=true;this.onabort?.()}
  }
  class BrowserImage{
    constructor(){this.naturalWidth=width;this.naturalHeight=height}
    set src(value){this._src=value;if(value)Promise.resolve().then(()=>this.onload?.())}
    get src(){return this._src}
  }
  const catalog=[{id:'hn-longmen',name:'龙门石窟',city:'洛阳',category:'attraction',duration:120,description:'本地地点库介绍'}];
  const context={console,JSON,Number,String,Math,DOMException,AbortController,FileReader:Reader,Image:BrowserImage,location:{protocol},CATALOG:catalog,saveBooting:false,
    document:{activeElement:null,body:{append(node){nodes.set(node.id,node)}},getElementById:id=>nodes.get(id)||null,querySelector:selector=>nodes.get(selector.slice(1))||null,addEventListener(){},
      createElement(tag){if(tag!=='canvas')return new Node(tag);const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(image,x,y,w,h){draws.push({w,h})}}),toDataURL(type,quality){conversions.push({type,quality,width:canvas.width,height:canvas.height});return 'data:image/jpeg;base64,dGVzdA=='}};return canvas}},
    add(place){added.push(place);return context.addSuccess!==false},same:()=>context.alreadyAdded===true,toast:message=>messages.push(message),
    fetch:async(path,options)=>{requests.push({path,options});return context.response instanceof Promise?await context.response:context.response},response:{ok:true,status:200,json:async()=>({...recognized})}};
  vm.createContext(context);vm.runInContext(source,context);
  return {context,nodes,requests,draws,conversions,reads,messages,added,catalog,events,get:id=>nodes.get(id),run:code=>vm.runInContext(code,context),open(){context.openVision()},upload:file=>context.recognizeVisionFile(file||photo)};
}

{
  const f=fixture();f.open();const dialog=f.get('vision-dialog'),html=dialog.innerHTML;
  assert(dialog.open);assert(html.includes('上传原始文件的清晰图片'));assert(html.includes('讯飞图片理解服务'));assert(html.includes('AI 识别可能有误'));
  assert.equal((html.match(/accept="image\/\*"/g)||[]).length,2);assert.equal((html.match(/capture="environment"/g)||[]).length,1,'Keep an independent gallery picker beside camera capture');
  assert.equal(f.requests.length,0,'Opening recognition cannot send a photo or call a model');assert.equal(f.get('vision-status').dataset.state,'idle');
  f.get('vision-choose').onclick();f.get('vision-camera').onclick();assert.equal(f.get('vision-file').clicked,1);assert.equal(f.get('vision-camera-file').clicked,1);
  f.open();assert.equal(f.nodes.get('vision-dialog'),dialog,'Opening twice reuses one persistent dialog');
}
{
  const f=fixture();f.open();await f.upload();assert.equal(f.requests.length,1);const {path,options}=f.requests[0];
  assert.equal(path,'/api/vision');assert.equal(options.method,'POST');assert.equal(options.credentials,'same-origin');assert(options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(options.body),{image:'data:image/jpeg;base64,dGVzdA=='});assert(!options.body.includes('original.jpg'));
  assert.deepEqual(f.conversions,[{type:'image/jpeg',quality:0.8,width:1024,height:768}]);assert.deepEqual(f.draws,[{w:1024,h:768}]);
  assert.equal(f.get('vision-name').textContent,'龙门石窟');assert.equal(f.get('vision-city').textContent,'洛阳');assert.match(f.get('vision-confidence').textContent,/模型自评置信度 93%/);assert.match(f.get('vision-confidence').textContent,/非准确率/);
  assert.equal(f.get('vision-result').hidden,false);assert.equal(f.get('vision-add').hidden,false);assert.equal(f.get('vision-add').disabled,false);assert.equal(f.get('vision-choose').disabled,false);
  f.get('vision-add').onclick();assert.equal(f.added.length,1);assert.equal(f.added[0],f.catalog[0],'Add the existing local record, never model-supplied fields');assert.equal(f.get('vision-dialog').open,false);
}
{
  const f=fixture({width:600,height:900});f.open();await f.upload();assert.deepEqual(f.draws,[{w:600,h:900}],'Small images are not enlarged');
}
{
  const f=fixture();f.context.response={ok:true,status:200,json:async()=>({name:'未收录的园林',city:'河南',confidence:0.7,description:'模型介绍',id:'invented-id'})};f.open();await f.upload();
  assert.equal(f.get('vision-match').textContent,'暂未收录该地点');assert(f.get('vision-add').hidden);f.context.addVisionPlace();assert.equal(f.added.length,0);
  f.context.response={ok:true,status:200,json:async()=>({name:'<img src=x onerror=alert(1)>',city:'<script>bad</script>',description:'<b>仅文本</b>',confidence:2})};await f.upload();
  assert.equal(f.get('vision-name').textContent,'<img src=x onerror=alert(1)>');assert.equal(f.get('vision-name').innerHTML,'');assert.equal(f.get('vision-confidence').textContent,'');
}
{
  for(const [status,result,message] of [
    [422,{code:'VISION_UNRECOGNIZED',error:'provider text'},'没认出来，换张更清晰的试试'],
    [429,{error:'今天的匿名图片识别次数已用完，请明天再试'},'今天的匿名图片识别次数已用完，请明天再试'],
    [503,{code:'VISION_NOT_CONFIGURED',error:'internal'},'图片识别服务尚未配置'],
    [503,{error:'图片识别服务尚未配置'},'图片识别服务尚未配置'],
    [502,{error:'upstream HTTP 500 diagnostic'},'图片识别服务暂时不可用，请稍后重试。没认出来，换张更清晰的试试']
  ]){
    const f=fixture();f.context.response={ok:false,status,json:async()=>result};f.open();await f.upload();assert.equal(f.get('vision-status').textContent,message);assert.equal(f.get('vision-status').dataset.state,'error');assert(f.get('vision-result').hidden);assert.equal(f.requests.length,1,'Errors cannot silently retry billed recognition');assert(!f.get('vision-choose').disabled);
  }
}
{
  const f=fixture();f.open();f.context.response={ok:true,status:200,json:async()=>({name:'',description:''})};await f.upload();assert.equal(f.get('vision-status').textContent,'没认出来，换张更清晰的试试');assert(f.get('vision-result').hidden);
  f.context.response={ok:false,status:502,json:async()=>{throw Error('HTML proxy 500')}};await f.upload();assert.equal(f.get('vision-status').textContent,'图片识别服务暂时不可用，请稍后重试');
}
{
  for(const [file,message] of [[{type:'text/plain',size:1},'请选择图片原文件'],[{type:'image/jpeg',size:0},'图片文件为空'],[{type:'image/jpeg',size:21*1024*1024},'原图片超过 20 MB']]){
    const f=fixture();f.open();await f.upload(file);assert.match(f.get('vision-status').textContent,new RegExp(message));assert.equal(f.requests.length,0);assert.equal(f.reads.length,0);
  }
  const f=fixture({width:12000,height:12000});f.open();await f.upload();assert.match(f.get('vision-status').textContent,/尺寸过大/);assert.equal(f.requests.length,0);
}
{
  const f=fixture(),pending=deferred();f.context.response=pending.promise;f.open();const first=f.upload();
  for(let i=0;i<12&&!f.requests.length;i++)await Promise.resolve();assert.equal(f.requests.length,1);assert.equal(f.get('vision-status').textContent,'AI 正在识别…');assert(f.get('vision-choose').disabled);
  await f.upload();assert.equal(f.requests.length,1,'Repeated file changes cannot send duplicate requests');f.get('vision-dialog').cancel();assert(f.requests[0].options.signal.aborted);assert(!f.get('vision-choose').disabled);
  f.open();f.context.response={ok:true,status:200,json:async()=>({name:'新结果',city:'洛阳',description:'新的识别',id:'hn-longmen'})};await f.upload();pending.resolve({ok:true,status:200,json:async()=>recognized});await first;
  assert.equal(f.get('vision-name').textContent,'新结果','A cancelled late response cannot replace a reopened dialog result');assert.equal(f.requests.length,2);
}
{
  const f=fixture({readerPending:true});f.open();const uploading=f.upload();assert.equal(f.reads.length,1);assert.equal(f.get('vision-status').textContent,'正在处理图片…');f.get('vision-dialog').close();await uploading;
  assert(f.reads[0].reader.aborted);assert.equal(f.requests.length,0,'Closing before compression prevents any upstream request');assert.equal(f.get('vision-dialog').open,false);
}
{
  const f=fixture();f.open();await f.upload();f.context.saveBooting=true;f.context.addVisionPlace();assert.equal(f.added.length,0);assert.match(f.messages[0],/恢复/);assert(f.get('vision-dialog').open);
  f.context.saveBooting=false;f.context.addSuccess=false;f.context.addVisionPlace();assert(f.get('vision-dialog').open,'A full draft remains open when existing add rejects a stop');
  f.context.alreadyAdded=true;await f.upload();assert(f.get('vision-add').disabled);assert.equal(f.get('vision-add').textContent,'已加入行程');
}
{
  const f=fixture({protocol:'file:'});f.open();await f.upload();assert.equal(f.requests.length,0);assert.match(f.get('vision-status').textContent,/离线页面无法识别/);
}
// Bind the real Hero's new camera entry without replacing its planning submit.
{
  const f=fixture();const nodes=f.nodes;
  for(const id of ['ai-hero-form','ai-hero-input','ai-hero-submit','ai-hero-status','ai-hero-vision'])nodes.set(id,{value:'',setAttribute(){}});
  Object.assign(f.context,{esc:value=>String(value),cfg:{},activeView:'gallery',setTimeout:()=>0,clearTimeout(){},addEventListener(){},openBrief(){throw Error('Photo recognition cannot call planning')}});
  vm.runInContext(hero,f.context);assert(f.context.aiPlanningHeroHTML().includes('id="ai-hero-vision"'));f.context.bindAIPlanningHero();nodes.get('ai-hero-vision').onclick();assert(f.get('vision-dialog').open);assert.equal(f.requests.length,0);
}
assert(css.includes('@media (max-width: 767px)'));assert(css.includes('font-size: 16px'));assert(css.includes('min-height: 44px'));
assert(!/localStorage|sessionStorage|indexedDB/.test(source.replace(/\/\/[^\n]*/g,'')),'Photo data must not enter persistent browser storage');
console.log('图片识别 UI：真实上传/1024px JPEG 压缩、本地库加点、未知地点、安全文本、友好失败/限流/未配置、取消/迟到/防重复、离线与 Hero 入口通过。');
