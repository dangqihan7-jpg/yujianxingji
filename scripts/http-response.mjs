import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

// Preserve streaming responses and propagate socket closure back to the Worker.
export async function sendWorkerResponse(response,res,{head=false}={}){
 res.writeHead(response.status,Object.fromEntries(response.headers));
 res.flushHeaders();
 if(head||!response.body){await response.body?.cancel();res.end();return}
 await pipeline(Readable.fromWeb(response.body),res);
}
