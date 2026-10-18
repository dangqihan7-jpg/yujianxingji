// Local HTTP reproduction. Identity headers are trusted only on loopback here;
// production identity remains owned by the Sites dispatcher.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile,mkdir} from 'node:fs/promises';
import worker from '../worker/index.js';
import {sendWorkerResponse} from './http-response.mjs';
await mkdir(new URL('../.local/',import.meta.url),{recursive:true});
const db=new DatabaseSync(new URL('../.local/travel.sqlite',import.meta.url).pathname);
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
 if(db.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name))continue;
 db.exec('BEGIN');try{db.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));db.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
const DB={prepare(query){const statement=db.prepare(query);let args=[];const prepared={bind(...values){args=values;return prepared},async first(){return statement.get(...args)||null},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}};return prepared}};
const keys=['AMAP_JS_KEY','AMAP_SECURITY_JS_CODE','AMAP_WEB_SERVICE_KEY','LLM_API_KEY','LLM_BASE_URL','LLM_MODEL','LLM_MAX_TOKENS','LLM_PUBLIC_DEMO','LLM_DAILY_LIMIT','LLM_CLIENT_DAILY_LIMIT','STANDALONE_AUTH','XF_VISION_APIKEY','XF_VISION_MODEL','XF_VISION_BASE_URL','XF_TTI_APPID','XF_TTI_APIKEY','XF_TTI_APISECRET','POSTER_CLIENT_DAILY_LIMIT','POSTER_GUEST_DAILY_LIMIT','POSTER_DAILY_LIMIT'];
const env={DB,...Object.fromEntries(keys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]))};
const port=Number(process.env.TRAVEL_DEV_PORT)||8787;
http.createServer(async(req,res)=>{try{
 const connection=new AbortController();
 req.once('aborted',()=>connection.abort());
 res.once('close',()=>{if(!res.writableEnded)connection.abort()});
 const visionUpload=new URL(req.url,'http://localhost').pathname==='/api/vision';
 const bodyLimit=visionUpload?2000000:100000;
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>bodyLimit){res.writeHead(413,visionUpload?{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}:{});res.end(visionUpload?JSON.stringify({error:'图片内容过大，请选择更小的原始图片',code:'VISION_TOO_LARGE'}):'Request too large');return}chunks.push(chunk)}
 const method=req.method;
 // 反向代理（nginx）透传公网 Host/协议，使服务端 Origin 校验与 Secure cookie 生效；仅监听回环地址时信任该头。
 const fwdHost=req.headers['x-forwarded-host'],fwdProto=req.headers['x-forwarded-proto'];
 const host=typeof fwdHost==='string'&&fwdHost?fwdHost.split(',')[0].trim():(req.headers.host||('127.0.0.1:'+port));
 const proto=typeof fwdProto==='string'&&fwdProto?fwdProto.split(',')[0].trim():'http';
 const request=new Request(proto+'://'+host+req.url,{method,headers:req.headers,signal:connection.signal,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,env);await sendWorkerResponse(response,res,{head:method==='HEAD'});
}catch{if(res.destroyed)return;if(res.headersSent){res.destroy();return}res.writeHead(500);res.end('Local server error')}}).listen(port,'127.0.0.1',()=>console.log('Local demo: http://127.0.0.1:'+port+' (loopback only)'));
