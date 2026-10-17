// Sharing sends a public timeline snapshot only; it never modifies the draft.
let shareOperation=0,shareRequest=null,shareCached=null;
function currentShareSnapshot(){return createShareSnapshot(trip,Number($('#days').value)||1,stops=>cachedTraffic(stops))}
function resetShareResult(){
 $('#shareresult').hidden=true;$('#sharelink').value='';$('#copyshare').textContent='复制链接';$('#copyshare').disabled=false;$('#retryshare').hidden=true;
 $('#shareqr').hidden=true;$('#shareqrnote').textContent='扫码查看行程 · 无需登录';
}
function cancelShareRequest(){shareOperation++;shareRequest?.abort();shareRequest=null;$('#share').disabled=false;$('#share').textContent='分享行程'}
async function displayShareLink(token,operation){
 const link=location.origin+'/s/'+token;$('#sharelink').value=link;$('#shareresult').hidden=false;
 $('#sharestatus').textContent='分享链接已生成，30 天后过期。';
 const canvas=$('#shareqr');canvas.hidden=true;
 try{
  if(typeof QRCode==='undefined'||typeof QRCode.toCanvas!=='function')throw Error('二维码组件未加载');
  await QRCode.toCanvas(canvas,link,{width:224,margin:4,errorCorrectionLevel:'M',color:{dark:'#0b1220',light:'#ffffff'}});
  if(operation!==shareOperation||!$('#sharetrip').open)return;canvas.hidden=false;
 }catch{if(operation===shareOperation&&$('#sharetrip').open)$('#shareqrnote').textContent='二维码暂不可用，请复制上方链接。'}
 if(operation===shareOperation&&$('#sharetrip').open)$('#copyshare').focus?.();
}
async function openTripShare(){
 if(shareRequest)return;
 let snapshot;try{snapshot=currentShareSnapshot()}catch(error){toast(error.message);return}
 const dialog=$('#sharetrip');resetShareResult();$('#sharestatus').textContent='正在生成分享链接…';
 if(!dialog.open)dialog.showModal();
 const fingerprint=JSON.stringify(snapshot),operation=++shareOperation;
 if(shareCached?.fingerprint===fingerprint&&Date.now()-shareCached.createdAt<30*86400000){await displayShareLink(shareCached.token,operation);return}
 if(location.protocol==='file:'){$('#sharestatus').textContent='离线页面无法生成分享链接，请打开在线网站后分享。';return}
 const controller=new AbortController();shareRequest=controller;$('#share').disabled=true;$('#share').textContent='正在生成分享…';
 try{
  const response=await fetch('/api/share',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(snapshot),signal:controller.signal});
  let result;try{result=await response.json()}catch{throw Error('分享服务暂时不可用，请稍后重试')}
  if(!response.ok)throw Error(result.error||'分享链接生成失败，请稍后重试');
  if(!/^[A-Za-z0-9_-]{8}$/.test(result.token))throw Error('分享链接返回异常，请稍后重试');
  if(operation!==shareOperation||!dialog.open)return;
  let latest;try{latest=JSON.stringify(currentShareSnapshot())}catch{latest=null}
  if(latest!==fingerprint)throw Error('行程已修改，请关闭后为最新行程重新分享');
  shareCached={fingerprint,token:result.token,createdAt:Date.now()};await displayShareLink(result.token,operation);
 }catch(error){
  if(operation!==shareOperation||!dialog.open||error.name==='AbortError')return;
  $('#sharestatus').textContent=error.message||'网络暂时不可用，请稍后重试';$('#retryshare').hidden=false;
 }finally{
  if(operation===shareOperation){shareRequest=null;$('#share').disabled=false;$('#share').textContent='分享行程'}
 }
}
async function copyTripShare(){
 const field=$('#sharelink'),button=$('#copyshare');if(!field.value)return;
 const operation=shareOperation,link=field.value;button.disabled=true;
 try{if(!navigator.clipboard?.writeText)throw Error('无法访问剪贴板');await navigator.clipboard.writeText(link);if(operation===shareOperation&&$('#sharetrip').open){button.textContent='已复制';$('#sharestatus').textContent='链接已复制，可发送给朋友或在无痕窗口打开。'}}
 catch{if(operation===shareOperation&&$('#sharetrip').open){field.focus?.();field.select?.();$('#sharestatus').textContent='自动复制不可用，链接已选中，请长按或按 Ctrl/Cmd+C 复制。'}}
 finally{if(operation===shareOperation)button.disabled=false}
}
$('#share').onclick=openTripShare;
$('#retryshare').onclick=openTripShare;
$('#copyshare').onclick=copyTripShare;
$('#sharetrip').addEventListener('cancel',cancelShareRequest);
$('#sharetrip').addEventListener('close',cancelShareRequest);
