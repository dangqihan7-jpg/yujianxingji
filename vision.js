// Only this explicit upload action sends a photo. Images are never put in a
// draft, localStorage, or a share snapshot; a matched CATALOG entry is reused.
const VISION_MAX_FILE_BYTES=20*1024*1024;
const VISION_MAX_IMAGE_EDGE=1024;
let visionOperation=0,visionRequest=null,visionResult=null;
const visionElement=id=>document.getElementById?.(id)||document.querySelector?.('#'+id);
function visionDialogHTML(){
  return `<div class="dialog-head"><h2 id="vision-title">拍照识景点</h2><button id="vision-close" class="quiet" type="button" aria-label="关闭拍照识景点">✕</button></div>
    <div class="dialog-content vision-content"><p class="vision-intro">上传原始文件的清晰图片，尽量包含景区全貌或标志建筑，不要压缩过的截图。</p><p class="vision-disclosure">选择后将压缩上传至讯飞图片理解服务。AI 识别可能有误，请核对后加入行程。</p>
      <div class="vision-actions"><button id="vision-choose" class="primary" type="button">选择照片</button><button id="vision-camera" class="quiet" type="button">拍一张</button></div>
      <input id="vision-file" class="vision-file" type="file" accept="image/*" tabindex="-1"><input id="vision-camera-file" class="vision-file" type="file" accept="image/*" capture="environment" tabindex="-1">
      <p id="vision-status" class="vision-status" role="status" aria-live="polite">支持浏览器可读取的图片，原文件不超过 20 MB。</p>
      <section id="vision-result" class="vision-result" aria-labelledby="vision-name" hidden><span class="vision-result-label">AI 图片理解 · 请核对</span><h3 id="vision-name"></h3><p id="vision-city" class="vision-city"></p><p id="vision-confidence" class="vision-confidence"></p><p id="vision-description" class="vision-description"></p><p class="vision-reference-note">AI 识别参考，以现场信息为准。</p><p id="vision-match" class="vision-match"></p><button id="vision-add" class="primary" type="button" hidden>加入行程</button></section>
    </div>`;
}
function ensureVisionDialog(){
  let dialog=visionElement('vision-dialog');if(dialog)return dialog;
  dialog=document.createElement('dialog');dialog.id='vision-dialog';dialog.className='vision-dialog';dialog.setAttribute('aria-labelledby','vision-title');dialog.innerHTML=visionDialogHTML();document.body.append(dialog);
  visionElement('vision-close').onclick=()=>dialog.close();
  visionElement('vision-choose').onclick=()=>{if(!visionRequest)visionElement('vision-file').click()};
  visionElement('vision-camera').onclick=()=>{if(!visionRequest)visionElement('vision-camera-file').click()};
  for(const id of ['vision-file','vision-camera-file'])visionElement(id).onchange=event=>{const file=event.target.files?.[0];event.target.value='';if(file)void recognizeVisionFile(file)};
  visionElement('vision-add').onclick=addVisionPlace;
  dialog.addEventListener('cancel',cancelVision);dialog.addEventListener('close',()=>{if(!dialog.open)cancelVision()});
  return dialog;
}
function setVisionBusy(busy){
  const dialog=visionElement('vision-dialog');dialog?.setAttribute('aria-busy',String(busy));
  for(const id of ['vision-choose','vision-camera']){const button=visionElement(id);if(button)button.disabled=busy}
}
function resetVisionResult(){
  visionResult=null;visionElement('vision-result').hidden=true;visionElement('vision-add').hidden=true;
  for(const id of ['vision-name','vision-city','vision-confidence','vision-description','vision-match'])visionElement(id).textContent='';
}
function cancelVision(){
  visionOperation++;visionRequest?.abort();visionRequest=null;visionResult=null;
  setVisionBusy(false);const result=visionElement('vision-result');if(result)result.hidden=true;
  for(const id of ['vision-file','vision-camera-file']){const input=visionElement(id);if(input)input.value=''}
}
function openVision(){
  const dialog=ensureVisionDialog();if(dialog.open)return;
  cancelVision();resetVisionResult();const status=visionElement('vision-status');status.dataset.state='idle';status.textContent='支持浏览器可读取的图片，原文件不超过 20 MB。';
  dialog.showModal();visionElement('vision-choose').focus?.();
}
function visionAbortError(){return new DOMException('图片识别已取消','AbortError')}
function visionReadFile(file,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(visionAbortError());return}
    const reader=new FileReader();
    const cleanup=()=>{signal?.removeEventListener('abort',abort);reader.onload=reader.onerror=reader.onabort=null};
    const abort=()=>{cleanup();try{reader.abort()}catch{}reject(visionAbortError())};
    reader.onload=()=>{const result=reader.result;cleanup();typeof result==='string'?resolve(result):reject(Error('图片读取失败，请重新选择原始图片'))};
    reader.onerror=()=>{cleanup();reject(Error('图片读取失败，请重新选择原始图片'))};
    reader.onabort=()=>{cleanup();reject(visionAbortError())};
    signal?.addEventListener('abort',abort,{once:true});try{reader.readAsDataURL(file)}catch{cleanup();reject(Error('图片读取失败，请重新选择原始图片'))}
  });
}
function visionLoadImage(data,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(visionAbortError());return}
    const image=new Image();
    const cleanup=()=>{signal?.removeEventListener('abort',abort);image.onload=image.onerror=null};
    const abort=()=>{cleanup();image.src='';reject(visionAbortError())};
    image.onload=()=>{cleanup();resolve(image)};
    image.onerror=()=>{cleanup();reject(Error('浏览器无法读取这张图片，请选择原始 JPG、PNG 或 WebP 照片'))};
    signal?.addEventListener('abort',abort,{once:true});image.src=data;
  });
}
async function compressVisionFile(file,signal){
  if(!file||!/^image\//i.test(file.type||''))throw Error('请选择图片原文件');
  if(!Number.isFinite(file.size)||file.size<=0)throw Error('图片文件为空，请重新选择');
  if(file.size>VISION_MAX_FILE_BYTES)throw Error('原图片超过 20 MB，请选择较小的原始照片');
  const data=await visionReadFile(file,signal),image=await visionLoadImage(data,signal);
  let canvas;
  try{
    const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width*height>80000000)throw Error('图片尺寸过大或无法读取，请选择普通分辨率的原始照片');
    const ratio=Math.min(1,VISION_MAX_IMAGE_EDGE/Math.max(width,height));canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
    const context=canvas.getContext('2d');if(!context)throw Error('浏览器暂不支持图片处理，请换个浏览器重试');
    context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    const result=canvas.toDataURL('image/jpeg',0.8);if(!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(result))throw Error('图片处理失败，请换一张原始照片');
    if((result.length-'data:image/jpeg;base64,'.length)*3/4>1400000)throw Error('图片内容过大，请换一张更清晰简洁的原始照片');
    if(signal?.aborted)throw visionAbortError();return result;
  }finally{image.src='';if(canvas){canvas.width=0;canvas.height=0}}
}
function visionErrorMessage(status,result){
  if(status===422||result?.code==='VISION_UNRECOGNIZED')return '没认出来，换张更清晰的试试';
  if(status===429)return typeof result?.error==='string'?result.error:'今天的图片识别次数已用完，请明天再试';
  if(status===503&&(result?.code==='VISION_NOT_CONFIGURED'||result?.error==='图片识别服务尚未配置'))return '图片识别服务尚未配置';
  if(status===503)return '图片识别服务暂时不可用，请稍后重试';
  if(status===502||status>=500)return '图片识别服务暂时不可用，请稍后重试。没认出来，换张更清晰的试试';
  if(status===413)return '图片文件过大，请换一张原始照片';
  return typeof result?.error==='string'&&result.error.length<200?result.error:'没认出来，换张更清晰的试试';
}
function showVisionResult(result){
  if(!result||typeof result.name!=='string'||!result.name.trim()||typeof result.description!=='string'||!result.description.trim())throw Error('没认出来，换张更清晰的试试');
  const place=typeof result.id==='string'&&typeof CATALOG!=='undefined'?CATALOG.find(item=>item.id===result.id):null;
  visionResult={id:place?.id||null};visionElement('vision-name').textContent=result.name;visionElement('vision-city').textContent=typeof result.city==='string'&&result.city?result.city:'城市待确认';visionElement('vision-description').textContent=result.description;
  const confidence=visionElement('vision-confidence');confidence.textContent=typeof result.confidence==='number'&&Number.isFinite(result.confidence)&&result.confidence>=0&&result.confidence<=1?'模型自评置信度 '+Math.round(result.confidence*100)+'% · 非准确率保证':'';
  const match=visionElement('vision-match'),button=visionElement('vision-add');
  if(place){match.textContent='已匹配地点库：'+place.name+' · '+(place.city||'河南');button.hidden=false;button.disabled=typeof same==='function'&&same(place);button.textContent=button.disabled?'已加入行程':'加入行程'}
  else{match.textContent='暂未收录该地点';button.hidden=true;button.disabled=true}
  visionElement('vision-result').hidden=false;visionElement('vision-status').textContent='识别完成，请核对地点。';visionElement('vision-status').dataset.state='success';
}
async function recognizeVisionFile(file){
  const dialog=ensureVisionDialog();if(visionRequest||!dialog.open)return;
  if(location.protocol==='file:'){visionElement('vision-status').textContent='离线页面无法识别照片，请打开在线网站后使用。';return}
  resetVisionResult();const operation=++visionOperation,controller=new AbortController();visionRequest=controller;setVisionBusy(true);
  const status=visionElement('vision-status');status.dataset.state='loading';status.textContent='正在处理图片…';
  try{
    const image=await compressVisionFile(file,controller.signal);if(operation!==visionOperation||!dialog.open)return;
    status.textContent='AI 正在识别…';
    const response=await fetch('/api/vision',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({image}),signal:controller.signal});
    let result;try{result=await response.json()}catch{throw Error('图片识别服务暂时不可用，请稍后重试')}
    if(operation!==visionOperation||!dialog.open)return;
    if(!response.ok)throw Error(visionErrorMessage(response.status,result));
    showVisionResult(result);
  }catch(error){
    if(operation!==visionOperation||!dialog.open||error.name==='AbortError')return;
    status.dataset.state='error';status.textContent=error instanceof TypeError?'网络暂时不可用，请稍后重试':error.message||'没认出来，换张更清晰的试试';
  }finally{if(operation===visionOperation){visionRequest=null;setVisionBusy(false)}}
}
function addVisionPlace(){
  const dialog=visionElement('vision-dialog');if(!dialog?.open||visionRequest||!visionResult?.id)return;
  if(typeof saveBooting!=='undefined'&&saveBooting){if(typeof toast==='function')toast('正在恢复已保存行程，请稍后操作');return}
  const place=typeof CATALOG!=='undefined'?CATALOG.find(item=>item.id===visionResult.id):null;if(!place||typeof add!=='function')return;
  if(add(place))dialog.close();else if(typeof same==='function'&&same(place)){const button=visionElement('vision-add');button.disabled=true;button.textContent='已加入行程'}
}
