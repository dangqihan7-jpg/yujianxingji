// Local HTTP reproduction. Identity headers are trusted only on loopback here;
// production identity remains owned by the Sites dispatcher.
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile,mkdir} from 'node:fs/promises';
import worker from '../worker/index.js';
await mkdir(new URL('../.local/',import.meta.url),{recursive:true});
const db=new DatabaseSync(new URL('../.local/travel.sqlite',import.meta.url).pathname);
db.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort()){
 if(db.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name))continue;
 db.exec('BEGIN');try{db.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));db.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}
}
const DB={prepare(query){const statement=db.prepare(query);let args=[];const prepared={bind(...values){args=values;return prepared},async first(){return statement.get(...args)||null},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}};return prepared}};
const keys=['AMAP_JS_KEY','AMAP_SECURITY_JS_CODE','AMAP_WEB_SERVICE_KEY','LLM_API_KEY','LLM_BASE_URL','LLM_MODEL','LLM_MAX_TOKENS','LLM_PUBLIC_DEMO','LLM_DAILY_LIMIT','LLM_CLIENT_DAILY_LIMIT','STANDALONE_AUTH'];
const env={DB,...Object.fromEntries(keys.filter(k=>process.env[k]).map(k=>[k,process.env[k]]))};
const port=Number(process.env.TRAVEL_DEV_PORT)||8787;
http.createServer(async(req,res)=>{try{
 const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>100000){res.writeHead(413);res.end('Request too large');return}chunks.push(chunk)}
 const method=req.method,request=new Request('http://127.0.0.1:'+port+req.url,{method,headers:req.headers,...(!['GET','HEAD'].includes(method)?{body:Buffer.concat(chunks)}:{})});
 const response=await worker.fetch(request,env);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
}catch{res.writeHead(500);res.end('Local server error')}}).listen(port,'127.0.0.1',()=>console.log('Local demo: http://127.0.0.1:'+port+' (loopback only)'));
