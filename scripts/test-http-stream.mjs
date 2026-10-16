import assert from 'node:assert/strict';
import http from 'node:http';
import {sendWorkerResponse} from './http-response.mjs';

let release,wasCancelled=false;
const encoder=new TextEncoder();
const server=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/json'){await sendWorkerResponse(Response.json({ok:true}),res);return}
  if(req.url==='/head'){await sendWorkerResponse(new Response('ignored',{status:201}),res,{head:true});return}
  const body=new ReadableStream({
   start(controller){
    controller.enqueue(encoder.encode('event: step\ndata: {"index":1,"total":5}\n\n'));
    release=()=>{controller.enqueue(encoder.encode('event: done\ndata: {"ok":true}\n\n'));controller.close()};
   },
   cancel(){wasCancelled=true}
  });
  await sendWorkerResponse(new Response(body,{headers:{'Content-Type':'text/event-stream','X-Accel-Buffering':'no','Cache-Control':'no-cache, no-transform'}}),res);
 }catch(error){if(error.code!=='ERR_STREAM_PREMATURE_CLOSE'&&error.code!=='ECONNRESET')throw error}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try{
 const response=await fetch(base+'/stream',{signal:AbortSignal.timeout(5000)});
 assert.match(response.headers.get('Content-Type'),/text\/event-stream/);assert.equal(response.headers.get('X-Accel-Buffering'),'no');
 const reader=response.body.getReader();
 const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/event: step/);
 // The HTTP client has the first event while the final event is still gated.
 let resolved=false;const next=reader.read().then(value=>{resolved=true;return value});
 await new Promise(resolve=>setImmediate(resolve));assert(!resolved,'Node must flush the step without waiting for done');
 release();const final=await next;assert.match(new TextDecoder().decode(final.value),/event: done/);
 assert((await reader.read()).done);
 const abort=new AbortController();const cancelled=await fetch(base+'/cancel',{signal:abort.signal});
 const cancelledReader=cancelled.body.getReader();await cancelledReader.read();abort.abort();
 await assert.rejects(()=>cancelledReader.read());
 for(let i=0;i<50&&!wasCancelled;i++)await new Promise(resolve=>setTimeout(resolve,10));
 assert(wasCancelled,'Disconnect must cancel the Worker response body');
 assert.deepEqual(await (await fetch(base+'/json')).json(),{ok:true});
 const head=await fetch(base+'/head',{method:'HEAD'});assert.equal(head.status,201);assert.equal(await head.text(),'');
 console.log('Passed: real Node HTTP incremental flush before done, stream headers, disconnect cancellation, JSON and HEAD compatibility. No model or map calls.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
