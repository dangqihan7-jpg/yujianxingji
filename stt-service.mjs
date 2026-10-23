// Server-only speech dictation. Raw PCM, transcripts, credentials and signed
// upstream URLs are never stored or returned; only the recognition text leaves
// this adapter. Assembled with server.mjs for the existing auth/DB helpers.
const STT_PCM_LIMIT=16000*2*60;
const STT_UNAVAILABLE='语音识别服务暂时不可用，请稍后重试';
function sttConfig(env){
 const names=['XF_ASR_APPID','XF_ASR_APIKEY','XF_ASR_APISECRET'],values=names.map(name=>env[name]);
 if(values.some(value=>typeof value!=='string'||!value.trim()))fail('语音识别服务尚未配置',503);
 if(values.some(value=>value!==value.trim()||value.length>256||!/^[\x21-\x7e]+$/.test(value)||/["\\]/.test(value))||!/^[A-Za-z0-9_-]{1,50}$/.test(values[0]))fail('语音识别服务配置不正确',503);
 return {appId:values[0],key:values[1],secret:values[2]};
}
function sttBase64(bytes){let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw)}
async function readSttPCM(request){
 if(!/^application\/octet-stream(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))fail('请上传16kHz、16位、单声道原始PCM录音',415);
 const length=request.headers.get('Content-Length');if(length&&/^\d+$/.test(length)&&Number(length)>STT_PCM_LIMIT)fail('录音不能超过60秒',413);
 if(request.signal.aborted)fail('语音识别已取消',408);
 const reader=request.body?.getReader();if(!reader)fail('录音为空，请先说话再识别');
 const chunks=[];let size=0,expired=false;
 // In addition to the byte bound, limit a stalled or highly fragmented upload.
 // Cancel without awaiting an untrusted stream's cancel callback.
 const cancel=()=>{try{Promise.resolve(reader.cancel()).catch(()=>{})}catch{}};
 const timeout=setTimeout(()=>{expired=true;cancel()},15000);
 request.signal.addEventListener('abort',cancel,{once:true});
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>STT_PCM_LIMIT){cancel();fail('录音不能超过60秒',413)}if(chunks.length>=8192){cancel();fail('录音数据格式不正确')}chunks.push(value)}
  if(request.signal.aborted)fail('语音识别已取消',408);
  if(expired)fail('录音上传超时，请重新录音');
 }catch(error){if(error.status)throw error;if(request.signal.aborted)fail('语音识别已取消',408);fail('录音数据读取失败，请重新录音')}
 finally{clearTimeout(timeout);request.signal.removeEventListener('abort',cancel);reader.releaseLock()}
 if(!size)fail('录音为空，请先说话再识别');
 if(size%2)fail('请上传16位原始PCM录音');
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length}
 const magic=String.fromCharCode(...bytes.subarray(0,4));
 if(['RIFF','RIFX','OggS','fLaC'].includes(magic)||magic.startsWith('ID3')||(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3))fail('请上传原始PCM录音，不支持WAV或压缩音频');
 return bytes;
}
async function reserveStt(request,env){
 if(!env.DB)fail('语音识别额度控制暂不可用，请稍后重试',503);
 try{
  const me=await currentUser(request,env),user=me?.id;
  const address=standaloneAuth(env)?request.headers.get('X-Real-IP')||request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')||'shared':request.headers.get('CF-Connecting-IP')||request.headers.get('X-Forwarded-For')||'shared';
  const identity=user?'account:'+user:'guest:'+address;
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('stt|'+identity))),byte=>byte.toString(16).padStart(2,'0')).join('');
  // A fixed UTC hour gives shared limits across processes without a new table.
  const hour=new Date().toISOString().slice(0,13);
  for(const [scope,limit]of [['stt:client:'+hash,user?10:3],['stt:global',100]]){
   const result=await env.DB.prepare('INSERT INTO model_usage (usage_key, calls, updated_at) VALUES (?, 1, ?) ON CONFLICT(usage_key) DO UPDATE SET calls = calls + 1, updated_at = excluded.updated_at WHERE calls < ?').bind(hour+':'+scope,Date.now(),limit).run();
   if(result.meta?.changes!==1)fail(scope==='stt:global'?'本小时语音识别总额度已用完，请下一小时再试':'本小时语音识别次数已用完，请下一小时再试',429);
  }
 }catch(error){if(error.status)throw error;fail('语音识别额度控制暂不可用，请稍后重试',503)}
}
async function sttSignedURL(config){
 const host='iat-api.xfyun.cn',path='/v2/iat',date=new Date().toUTCString();
 const canonical=`host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const signature=sttBase64(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(canonical))));
 const authorization=btoa(`api_key="${config.key}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`);
 const url=new URL('wss://'+host+path);url.searchParams.set('authorization',authorization);url.searchParams.set('date',date);url.searchParams.set('host',host);return url;
}
async function callSttModel(request,config,audio){
 const url=await sttSignedURL(config);if(request.signal.aborted)fail('语音识别已取消',408);
 return await new Promise((resolve,reject)=>{
  let socket,settled=false,sendTimer,startedAt=0,offset=0,inputFinished=false,frameCount=0,wireSize=0,textSize=0;
  const results=new Map();
  const problem=(message=STT_UNAVAILABLE,status=502)=>{const error=Error(message);error.status=status;return error};
  const cleanup=()=>{clearTimeout(timeout);clearTimeout(connectTimeout);clearTimeout(sendTimer);request.signal.removeEventListener('abort',abort);if(socket){for(const [type,fn]of listeners)socket.removeEventListener(type,fn);try{if(socket.readyState<2)socket.close(1000)}catch{}}};
  const finish=(error,text)=>{if(settled)return;settled=true;cleanup();error?reject(error):resolve(text)};
  const abort=()=>finish(problem('语音识别已取消',408));
  // 60s audio is paced in real time; allow handshake and final-result overhead.
  const timeout=setTimeout(()=>finish(problem('语音识别响应超时，请稍后重试')),85000);
  const connectTimeout=setTimeout(()=>finish(problem('语音识别连接超时，请稍后重试')),8000);
  const send=payload=>{if(settled)return false;try{if(socket.bufferedAmount>256000)throw Error();socket.send(JSON.stringify(payload));return !settled}catch{finish(problem());return false}};
  const next=()=>{
   if(settled)return;if(request.signal.aborted)return abort();
   const first=offset===0,chunk=audio.subarray(offset,offset+1280);
   if(!send({...(first?{common:{app_id:config.appId},business:{language:'zh_cn',domain:'iat',accent:'mandarin',eos:10000}}:{}),data:{status:first?0:1,format:'audio/L16;rate=16000',encoding:'raw',audio:sttBase64(chunk)}}))return;
   offset+=chunk.length;
   if(offset===audio.length){inputFinished=true;send({data:{status:2}})}else{
    // Target the original audio clock rather than accumulating callback drift;
    // the 1,500th frame of a full 60s clip is due at 59,960ms, then EOS follows.
    sendTimer=setTimeout(next,Math.max(0,offset/32-(performance.now()-startedAt)));
   }
  };
  const open=()=>{if(settled)return;clearTimeout(connectTimeout);startedAt=performance.now();next()};
  const message=event=>{
   if(settled)return;
   try{
    if(typeof event.data!=='string'||event.data.length>65536||++frameCount>2048)throw Error();
    wireSize+=event.data.length;if(wireSize>2097152)throw Error();
    const frame=JSON.parse(event.data),data=frame.data;
    if(frame.code!==0||!data||![0,1,2].includes(data.status))throw Error();
    if(data.result!=null){
     const result=data.result;
     if(!Number.isInteger(result.sn)||result.sn<0||result.sn>4095||!Array.isArray(result.ws)||result.ws.length>2048||result.pgs!=null||result.rg!=null)throw Error();
     // No wpgs is requested: each sn is an append-only segment. Select only the
     // first word candidate; duplicate frames cannot duplicate the transcript.
     const text=result.ws.map(word=>{const value=word?.cw?.[0]?.w;if(typeof value!=='string'||value.length>1000)throw Error();return value}).join('');
     if(results.has(result.sn)){if(results.get(result.sn)!==text)throw Error()}else{textSize+=text.length;if(textSize>8000)throw Error();results.set(result.sn,text)}
    }
    if(data.status===2){
     // A VAD stop before the remaining recording is uploaded is not a complete
     // transcription. Tell the user to split the recording instead of losing it.
     if(!inputFinished)return finish(problem('录音出现较长停顿，识别提前结束，请分段录音后再试'));
     const ordered=[...results].sort((a,b)=>a[0]-b[0]),first=ordered[0]?.[0];
     if(ordered.length){if(first!==0&&first!==1)throw Error();for(let i=0;i<ordered.length;i++)if(ordered[i][0]!==first+i)throw Error()}
     const text=ordered.map(([,part])=>part).join('').replace(/[\u0000-\u001f\u007f]/g,'').trim();
     if(!text)return finish(problem('没有听清楚，请靠近麦克风重新说一句'));
     finish(null,text);
    }
   }catch{finish(problem())}
  };
  const error=()=>finish(problem()),close=()=>finish(problem());
  const listeners=[['open',open],['message',message],['error',error],['close',close]];
  request.signal.addEventListener('abort',abort,{once:true});
  try{socket=new WebSocket(String(url));for(const [type,fn]of listeners)socket.addEventListener(type,fn);if(request.signal.aborted)abort()}catch{finish(problem())}
 });
}
export async function sttEndpoint(request,env){
 if(request.method!=='POST')fail('方法不支持',405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)fail('语音识别请求来源不正确',403);
 const audio=await readSttPCM(request),config=sttConfig(env);
 if(typeof WebSocket!=='function')fail('当前服务器暂不支持语音识别，请联系维护者',503);
 if(request.signal.aborted)fail('语音识别已取消',408);
 await reserveStt(request,env);
 return json({text:await callSttModel(request,config,audio)});
}
