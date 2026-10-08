import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const defaultTarget=process.env.TRAVEL_WORKER_ENTRY?dirname(dirname(resolve(process.env.TRAVEL_WORKER_ENTRY))):new URL('..',import.meta.url).pathname;
const target=resolve(process.argv[2]||defaultTarget);
const output=resolve(process.argv[3]||join(target,'competition-evidence','public-quota-results.json'));
const {default:worker}=await import(pathToFileURL(join(target,'worker/index.js')));
const migrations=(await readdir(join(target,'drizzle'))).filter(v=>v.endsWith('.sql')).sort();
const results=[];let outbound=0;
const originalFetch=globalThis.fetch;
const baseEnv={LLM_BASE_URL:'https://maas-api.cn-huabei-1.xf-yun.com/v2',LLM_MODEL:'spark-x2.5',LLM_API_KEY:'synthetic-test-token',LLM_PUBLIC_DEMO:'true',LLM_CLIENT_DAILY_LIMIT:'2',LLM_DAILY_LIMIT:'10'};
const responseAI=()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({fields:{city:'洛阳',days:2,mode:'driving',budget:500},unresolved:[]})}}]}));
function resetModel(){outbound=0;globalThis.fetch=async()=>{outbound++;return responseAI()}}
async function database(all=true){
  const sql=new DatabaseSync(':memory:');
  for(const name of all?migrations:migrations.slice(0,1))sql.exec(await readFile(join(target,'drizzle',name),'utf8'));
  const DB={prepare(query){const statement=sql.prepare(query);return {bind(...args){return {async first(){return statement.get(...args)||null},async run(){const value=statement.run(...args);return {meta:{changes:Number(value.changes)}}}}}}}};
  return {sql,DB};
}
async function call(env,headers={},body={text:'洛阳两天，自驾，预算500元'}){
  const response=await worker.fetch(new Request('https://fixture.test/api/intent',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(body)}),env);
  const data=await response.json();assert.equal(response.status,200);return data;
}
function globalCalls(sql){return Number(sql.prepare("SELECT coalesce(sum(calls),0) AS n FROM model_usage WHERE usage_key LIKE '%:global'").get().n)}
async function check(id,description,fn){resetModel();try{const observation=await fn();results.push({id,description,status:'passed',observation})}catch(error){results.push({id,description,status:'failed',error:error.message})}}
try{
await check('default-anonymous-no-spend','未开启公开演示时访客不能消耗模型额度',async()=>{
 const data=await call({...baseEnv,LLM_PUBLIC_DEMO:'false'});assert.equal(data.source,'rules');assert.equal(outbound,0);return {outbound,source:data.source};
});
await check('public-first-call-and-hashed-identity','开启演示并完成迁移后可调用，身份与密钥不明文入库',async()=>{
 const {sql,DB}=await database();const data=await call({...baseEnv,DB},{'oai-authenticated-user-id':'quota-user'});assert.equal(data.source,'ai');assert.equal(outbound,1);assert.equal(globalCalls(sql),1);
 const keys=sql.prepare('SELECT usage_key FROM model_usage').all().map(v=>v.usage_key);assert.equal(keys.length,2);assert(keys.every(v=>!v.includes('quota-user')&&!v.includes(baseEnv.LLM_API_KEY)&&!v.includes('192.0.2.1')));
 sql.close();return {outbound,rows:2,identitiesHashed:true};
});
await check('client-daily-cap','同一访问者第三次调用回退，不越过每日2次限制',async()=>{
 const {sql,DB}=await database();const env={...baseEnv,DB};const responses=[];for(let i=0;i<3;i++)responses.push(await call(env));
 assert.deepEqual(responses.map(v=>v.source),['ai','ai','rules']);assert.equal(outbound,2);assert.equal(globalCalls(sql),2);assert(responses[2].fallback.reason.includes('访问者'));
 assert(sql.prepare("SELECT calls FROM model_usage WHERE usage_key LIKE '%:client:%'").all().every(v=>v.calls<=2));sql.close();return {outbound,sources:responses.map(v=>v.source)};
});
await check('global-daily-cap','不同访问者合计不能越过每日3次全站限制',async()=>{
 const {sql,DB}=await database();const env={...baseEnv,DB,LLM_DAILY_LIMIT:'3'};const responses=[];for(let i=0;i<4;i++)responses.push(await call(env,{'CF-Connecting-IP':'192.0.2.'+(i+1)}));
 assert.equal(outbound,3);assert.equal(globalCalls(sql),3);assert.equal(responses.at(-1).source,'rules');assert(responses.at(-1).fallback.reason.includes('总额度'));sql.close();return {outbound,sources:responses.map(v=>v.source)};
});
await check('concurrent-client-cap','20个并发请求同一访问者，仅3次可发往模型',async()=>{
 const {sql,DB}=await database();const env={...baseEnv,DB,LLM_CLIENT_DAILY_LIMIT:'3',LLM_DAILY_LIMIT:'50'};
 const responses=await Promise.all(Array.from({length:20},()=>call(env)));assert.equal(outbound,3);assert.equal(responses.filter(v=>v.source==='ai').length,3);assert.equal(globalCalls(sql),3);
 assert(sql.prepare("SELECT calls FROM model_usage WHERE usage_key LIKE '%:client:%'").all().every(v=>v.calls<=3));sql.close();return {requests:20,outbound,rules:17};
});
await check('concurrent-global-cap','20个不同访问者并发，仅5次可发往模型',async()=>{
 const {sql,DB}=await database();const env={...baseEnv,DB,LLM_DAILY_LIMIT:'5'};
 const responses=await Promise.all(Array.from({length:20},(_,i)=>call(env,{'CF-Connecting-IP':'192.0.2.'+(i+1)})));assert.equal(outbound,5);assert.equal(responses.filter(v=>v.source==='ai').length,5);assert.equal(globalCalls(sql),5);
 sql.close();return {requests:20,outbound,rules:15};
});
await check('missing-db-fail-closed','公开演示缺DB时规则回退，禁止模型调用',async()=>{
 const data=await call(baseEnv);assert.equal(data.source,'rules');assert.equal(outbound,0);assert(data.fallback.reason.includes('额度控制'));return {outbound,reason:data.fallback.reason};
});
await check('broken-db-fail-closed','DB失效时规则回退，不发模型请求',async()=>{
 const DB={prepare(){throw Error('simulated unavailable database')}};const data=await call({...baseEnv,DB});assert.equal(data.source,'rules');assert.equal(outbound,0);assert(data.fallback.reason.includes('额度控制'));return {outbound,reason:data.fallback.reason};
});
await check('missing-second-migration-fail-closed','仅首迁移缺model_usage表时规则回退，不发模型请求',async()=>{
 const {sql,DB}=await database(false);const data=await call({...baseEnv,DB});assert.equal(data.source,'rules');assert.equal(outbound,0);assert(data.fallback.reason.includes('额度控制'));sql.close();return {outbound,reason:data.fallback.reason};
});
await check('foreign-origin-no-spend','外站Origin不能消耗演示额度',async()=>{
 const {sql,DB}=await database();const data=await call({...baseEnv,DB},{Origin:'https://other.example.test'});assert.equal(data.source,'rules');assert.equal(outbound,0);assert.equal(globalCalls(sql),0);assert(data.fallback.reason.includes('来源'));sql.close();return {outbound,reason:data.fallback.reason};
});
await check('rules-no-quota-charge','显式规则模式不占DB额度，不发模型请求',async()=>{
 const {sql,DB}=await database();const data=await call({...baseEnv,DB},{},{text:'洛阳两天，自驾，预算500元',engine:'rules'});assert.equal(data.source,'rules');assert.equal(outbound,0);assert.equal(globalCalls(sql),0);sql.close();return {outbound,globalCalls:0};
});
await check('failed-model-reservation-counts-once','模型失败仍计一次尝试，后续不会绕过访问者限制',async()=>{
 const {sql,DB}=await database();globalThis.fetch=async()=>{outbound++;throw Error('simulated timeout')};const env={...baseEnv,DB,LLM_CLIENT_DAILY_LIMIT:'1'};
 const first=await call(env),second=await call(env);assert.equal(first.source,'rules');assert.equal(second.source,'rules');assert.equal(outbound,1);assert.equal(globalCalls(sql),1);assert(second.fallback.reason.includes('访问者'));sql.close();return {outbound,reservedCalls:1,failuresCountAsAttempts:true};
});
await check('old-usage-cleanup','成功预约额度时清理超过7天的旧额度记录',async()=>{
 const {sql,DB}=await database();sql.prepare('INSERT INTO model_usage VALUES (?,?,?)').run('2000-01-01:global',99,Date.now()-8*86400000);
 const data=await call({...baseEnv,DB});assert.equal(data.source,'ai');assert.equal(sql.prepare('SELECT count(*) AS n FROM model_usage WHERE usage_key=?').get('2000-01-01:global').n,0);sql.close();return {oldUsageRemoved:true,outbound};
});
await check('date-key-isolation','昨日额度记录不阻塞今日请求，配额日期采用UTC',async()=>{
 const {sql,DB}=await database();const env={...baseEnv,DB,LLM_CLIENT_DAILY_LIMIT:'1',LLM_DAILY_LIMIT:'1'};assert.equal((await call(env)).source,'ai');
 const rows=sql.prepare('SELECT usage_key FROM model_usage').all();const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);for(const row of rows)sql.prepare('UPDATE model_usage SET usage_key=? WHERE usage_key=?').run(yesterday+row.usage_key.slice(10),row.usage_key);
 assert.equal((await call(env)).source,'ai');assert.equal(outbound,2);sql.close();return {outbound,dateZone:'UTC',previousDateIgnored:true};
});
}finally{globalThis.fetch=originalFetch}
const report={generatedAt:new Date().toISOString(),target,scope:'SQLite executes all project migrations in memory. Model calls are mocked; no real provider or real secret was used. Concurrency verifies SQL guard behavior under overlapping async local requests, not a production distributed load test.',workerSha256:createHash('sha256').update(await readFile(join(target,'worker/index.js'))).digest('hex'),migrations,total:results.length,passed:results.filter(v=>v.status==='passed').length,failed:results.filter(v=>v.status==='failed').length,results};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed,results:output}));for(const result of results.filter(v=>v.status==='failed'))console.log(result.id+': '+result.error);process.exitCode=report.failed?1:0;
