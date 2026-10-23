import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import worker from '../worker/index.js';

// Every model response is mocked. Isolated SQLite runs the real migrations;
// no production account, API credential, or live model is used by this suite.
const migrationNames=(await readdir(new URL('../drizzle/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort();
const migrations=await Promise.all(migrationNames.map(name=>readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')));
const opened=[];
const config={LLM_API_KEY:'ask-unit-test-only',LLM_BASE_URL:'https://maas-api.cn-huabei-1.xf-yun.com/v2',LLM_MODEL:'spark-x2.5-1.7b'};
const expectedURL=config.LLM_BASE_URL+'/chat/completions';
const answer='第一天安排了 2 个景点，分别是龙门石窟和白马寺。第二天安排了洛邑古城。你可以在当前行程中查看各站安排。';
const trip=()=>({places:['龙门石窟','白马寺','洛邑古城'],days:2,schedule:[{day:1,stops:[{id:'hn-longmen',name:'龙门石窟',city:'洛阳',category:'scenic',duration:180,travelMinutes:null},{id:'hn-baima',name:'白马寺',city:'洛阳',category:'scenic',duration:90,travelMinutes:45}]},{day:2,stops:[{id:'hn-luoyi',name:'洛邑古城',city:'洛阳',category:'scenic',duration:120,travelMinutes:null}]}]});
const body=(question='第一天有几个景点')=>({question,trip:trip()});
let checks=0,calls=[];
function database(){
 const sql=new DatabaseSync(':memory:');opened.push(sql);
 for(const migration of migrations)sql.exec(migration);
 const DB={prepare(query){const statement=sql.prepare(query);let args=[];const prepared={bind(...values){args=values;return prepared},async first(){return statement.get(...args)||null},async run(){return {meta:{changes:Number(statement.run(...args).changes)}}}};return prepared}};
 return {sql,DB};
}
const envOf=DB=>({...config,DB});
const usage=sql=>sql.prepare('SELECT usage_key,calls FROM model_usage ORDER BY usage_key').all().map(row=>({...row}));
const request=(env,options={})=>worker.fetch(new Request('https://ask.test/api/ask',options),env);
const post=(env,input=body(),headers={},signal)=>request(env,{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers},body:JSON.stringify(input),...(signal?{signal}:{})});
const resultResponse=(text=answer)=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:text}}]}),{headers:{'Content-Type':'application/json'}});
let upstream=()=>resultResponse();
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),expectedURL,'问答只能调用所配置的聊天模型，不能进入智能体、地图、海报或识图接口');
 calls.push({url:String(url),options});return upstream(url,options);
};
async function check(name,fn){calls=[];upstream=()=>resultResponse();await fn();checks++;console.log('Ask: '+name)}
async function success(response){
 assert.equal(response.status,200,await response.clone().text());
 assert.match(response.headers.get('Content-Type'),/application\/json/);
 const data=await response.json();assert.deepEqual(Object.keys(data),['answer']);assert.equal(typeof data.answer,'string');assert(data.answer.trim());
 assert(!JSON.stringify(data).includes(config.LLM_API_KEY));return data.answer;
}
async function jsonError(response,status,pattern){
 assert.equal(response.status,status,await response.clone().text());assert.match(response.headers.get('Content-Type'),/application\/json/);
 const data=await response.json();assert.equal(typeof data.error,'string');assert.match(data.error,pattern);assert(!JSON.stringify(data).includes(config.LLM_API_KEY));return data;
}
function seedUser(sql,id='ask-user'){
 const now=Date.now();sql.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id,'问答旅客-'+id,'test-only-password-hash',now);
 const token='session-'+id;sql.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(token,id,now,now+60000);return token;
}
try{
await check('normal two-day question uses one direct X2.5 call and public, complete day context',async()=>{
 const {sql,DB}=database(),response=await post(envOf(DB)),text=await success(response);assert.match(text,/第\s*[1一]\s*天.{0,8}2\s*个景点/);assert(text.includes('龙门石窟'));assert(text.includes('白马寺'));assert(!/[39]\s*个景点/.test(text));assert.equal(calls.length,1);
 const {options}=calls[0],payload=JSON.parse(options.body);assert.equal(options.headers.Authorization,'Bearer '+config.LLM_API_KEY);assert.equal(options.redirect,'error');assert.equal(payload.model,config.LLM_MODEL);assert.equal(payload.stream,false);
 assert.deepEqual(payload.thinking,{type:'disabled'});assert(Number(payload.max_completion_tokens??payload.max_tokens)<=1200,'轻量问答应限制输出长度');
 assert.deepEqual(payload.messages.map(message=>message.role),['system','user']);
 assert.match(payload.messages[0].content,/河南周末游行程助手/);assert.match(payload.messages[0].content,/3\s*[-–—至到~～]\s*5|三.{0,3}五/);assert.match(payload.messages[0].content,/不知道|不确定|未知/);assert.match(payload.messages[0].content,/官方信息为准/);
 const user=payload.messages[1].content;for(const text of ['第一天有几个景点','龙门石窟','白马寺','洛邑古城','洛阳'])assert(user.includes(text));assert.match(user,/scenicCount["\s:：]*2/,'景点数必须由程序根据当前分日行程计算');
 const rows=usage(sql);assert.equal(rows.length,2);assert(rows.every(row=>row.calls===1&&row.usage_key.includes(':ask:')));assert(!JSON.stringify(rows).includes('192.0.2.1'));
});
await check('planning and Q&A share Spark wire options, with private context stripped and absent budget explicit',async()=>{
 const {DB}=database(),input=body('第二天会不会太赶？');input.trip.budget=800;input.trip.mode='driving';input.trip.start='09:00';
 upstream=()=>resultResponse('第二天只安排洛邑古城，停留120分钟，站内步行情况行程里没有这项。可按体力调整，不会自动改动你的行程。');
 const text=await success(await post(envOf(DB),input));assert(text.includes('洛邑古城'));assert(Array.from(text).length<=300);
 const payload=JSON.parse(calls[0].options.body),context=JSON.parse(payload.messages[1].content).trip;
 assert.equal(payload.temperature,0.2);assert.equal(payload.max_tokens,1000);assert.equal(payload.max_completion_tokens,undefined);assert.equal(payload.response_format,undefined);
 assert.equal(context.budget,800);assert.equal(context.mode,'driving');assert.equal(context.start,'09:00');assert.equal(context.facts[0].visitMinutes,270);assert.equal(context.facts[0].travelMinutes,45);
 assert.match(payload.messages[0].content,/300字/);assert.match(payload.messages[0].content,/行程里没有这项/);assert.match(payload.messages[0].content,/未核实、供参考/);
 input.trip.budget=undefined;input.trip.schedule[0].stops[1].travelMinutes=null;
 await success(await post(envOf(DB),input));const missing=JSON.parse(JSON.parse(calls[1].options.body).messages[1].content).trip;assert.equal(missing.budget,null);assert.equal(missing.facts[0].travelMinutes,null);
});
await check('other configured X2.5 variants retain planner thinking behavior',async()=>{
 const {DB}=database();await success(await post({...envOf(DB),LLM_MODEL:'spark-x2.5'},body('第二天会不会太赶？')));
 const payload=JSON.parse(calls[0].options.body);assert.equal(payload.model,'spark-x2.5');assert.equal(payload.thinking,undefined);
});
await check('timeout during upstream fetch returns friendly 502 and counts one attempt',async()=>{
 const {sql,DB}=database();upstream=()=>{throw new DOMException('mock upstream timeout','TimeoutError')};
 await jsonError(await post(envOf(DB),body('第二天会不会太赶？')),502,/问答.*暂时不可用/);assert.equal(calls.length,1);assert(usage(sql).every(row=>row.calls===1));
});
await check('long model prose and policy fallback remain within 300 Unicode characters',async()=>{
 const {DB}=database();upstream=()=>resultResponse('建议按当前行程安排游览并根据体力休息'.repeat(70)+'。');
 const text=await success(await post(envOf(DB),body('第二天会不会太赶？')));assert(Array.from(text).length<=300);
});
await check('request is read-only and strips account, secret and saved-draft metadata before prompting',async()=>{
 const {sql,DB}=database(),token=seedUser(sql),saved=JSON.stringify({days:2,start:'09:00',stops:[],privateNote:'DRAFT_PRIVATE_SENTINEL'});
 sql.prepare('INSERT INTO travel_drafts VALUES (?,?,?)').run('ask-user',saved,123);sql.prepare('INSERT INTO shares VALUES (?,?,?,?)').run('oldshare',JSON.stringify(trip()),1,9999999999999);
 const input=body();input.user={email:'ACCOUNT_PRIVATE_SENTINEL'};input.apiKey='TOP_PRIVATE_SENTINEL';input.trip.user={id:'ACCOUNT_PRIVATE_SENTINEL'};input.trip.session='SESSION_PRIVATE_SENTINEL';input.trip.decision={rawText:'PROMPT_PRIVATE_SENTINEL'};
 input.trip.schedule[0].stops[0].user={email:'STOP_PRIVATE_SENTINEL'};input.trip.schedule[0].stops[0].password='PASSWORD_PRIVATE_SENTINEL';
 const beforeUsers=sql.prepare('SELECT * FROM users').all(),beforeSessions=sql.prepare('SELECT * FROM sessions').all(),beforeShares=sql.prepare('SELECT * FROM shares').all();
 await success(await post({...envOf(DB),STANDALONE_AUTH:'true'},input,{Cookie:'travel_session='+token,'X-Real-IP':'192.0.2.9'}));
 const prompt=JSON.parse(calls[0].options.body).messages.map(message=>message.content).join('\n');assert(!/PRIVATE_SENTINEL/.test(prompt));assert(!prompt.includes(config.LLM_API_KEY));
 assert.deepEqual(sql.prepare('SELECT * FROM travel_drafts').all().map(row=>({...row})),[{user_id:'ask-user',payload:saved,updated_at:123}]);assert.deepEqual(sql.prepare('SELECT * FROM users').all(),beforeUsers);assert.deepEqual(sql.prepare('SELECT * FROM sessions').all(),beforeSessions);assert.deepEqual(sql.prepare('SELECT * FROM shares').all(),beforeShares);
 assert(!JSON.stringify(usage(sql)).includes('ask-user'));assert.equal(calls.length,1);
});
await check('compact saved-draft shape is accepted as public day context without mutable draft metadata',async()=>{
 const {DB}=database(),input=body();input.trip={days:2,start:'09:00',mode:'transit',stops:trip().schedule.flatMap(block=>block.stops.map(stop=>({day:block.day,duration:stop.duration,place:{id:stop.id,name:stop.name,city:stop.city,category:stop.category,location:[112.1,34.1],source:'curated',privateMemo:'DRAFT_PRIVATE_SENTINEL'}}))),revision:88};
 await success(await post(envOf(DB),input));const context=JSON.parse(JSON.parse(calls[0].options.body).messages[1].content).trip;assert.equal(context.days,2);assert.equal(context.schedule.length,2);assert.equal(context.facts[0].scenicCount,2);assert.equal(context.start,'09:00');assert.equal(context.mode,'transit');assert(!JSON.stringify(context).includes('PRIVATE_SENTINEL'));assert(!JSON.stringify(context).includes('location'));assert(!Object.hasOwn(context,'revision'));
});
await check('empty/invalid questions, missing trip and invalid JSON reject before model or quota',async()=>{
 const {sql,DB}=database(),env=envOf(DB);
 for(const input of [null,[],{},body(''),body('   '),body(7),{question:'第一天有几个景点'}, {question:'第一天有几个景点',trip:null},{question:'第一天有几个景点',trip:[]}])await jsonError(await post(env,input),400,/问题|问答|行程|格式/);
 await jsonError(await request(env,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}),400,/JSON|格式|请求/);
 assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
});
await check('off-topic weather question is politely redirected without model call or usage',async()=>{
 const {sql,DB}=database(),text=await success(await post(envOf(DB),body('今天天气怎么样')));assert.match(text,/行程/);assert.match(text,/只能|仅|相关|回到|围绕/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
});
await check('unconfigured service is explicit and does not use another model key or quota',async()=>{
 for(const part of [{},{LLM_API_KEY:config.LLM_API_KEY},{LLM_API_KEY:config.LLM_API_KEY,LLM_BASE_URL:config.LLM_BASE_URL},{LLM_BASE_URL:config.LLM_BASE_URL,LLM_MODEL:config.LLM_MODEL}]){
  const {sql,DB}=database();await jsonError(await post({...part,DB,XF_VISION_APIKEY:'do-not-use-vision-key',XF_TTI_API_KEY:'do-not-use-poster-key'}),503,/问答|模型|配置/);assert.deepEqual(usage(sql),[]);
 }assert.equal(calls.length,0);
});
await check('unsafe model addresses and unsupported model names are rejected before credentials or quota leave the service',async()=>{
 const invalid=[{LLM_BASE_URL:'http://maas-api.cn-huabei-1.xf-yun.com/v2'},{LLM_BASE_URL:'https://attacker.test/v2'},{LLM_BASE_URL:'https://name:password@maas-api.cn-huabei-1.xf-yun.com/v2'},{LLM_BASE_URL:'https://maas-api.cn-huabei-1.xf-yun.com/v2?token=test'},{LLM_MODEL:'unsupported-model'},{LLM_API_KEY:'bad\r\nkey'}];
 for(const part of invalid){const {sql,DB}=database();await jsonError(await post({...envOf(DB),...part}),503,/配置/);assert.deepEqual(usage(sql),[])}assert.equal(calls.length,0);
});
await check('foreign origin and unsupported methods cannot call model or consume usage',async()=>{
 const {sql,DB}=database(),env=envOf(DB);await jsonError(await post(env,body(),{Origin:'https://other.test'}),403,/来源/);
 for(const method of ['GET','PUT','DELETE'])await jsonError(await request(env,{method}),405,/方法/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
});
await check('ticket, opening-hours and reservation answers always carry official-information fallback',async()=>{
 for(const question of ['龙门石窟门票多少钱','白马寺几点营业','龙门石窟需要提前预约吗？']){
  const {DB}=database();upstream=()=>resultResponse('当前行程没有已核实的票价、开放时间或预约信息。我不知道该景点的最新政策。建议出发前查看景区官方渠道。');
  const text=await success(await post(envOf(DB),body(question)));assert.match(text,/请以官方信息为准/);assert.equal((text.match(/请以官方信息为准/g)||[]).length,1,'兜底句不应重复堆叠');
 }
});
await check('unsupported model price claims cannot become invented ticket guidance',async()=>{
 const {DB}=database();upstream=()=>resultResponse('龙门石窟门票大约为 90 至 120 元。白马寺一般是 35 元。具体价格请出发前确认。');
 const text=await success(await post(envOf(DB),body('这个景点门票多少钱')));assert.match(text,/请以官方信息为准/);assert(!/90|120|35/.test(text),'当前行程没有核实的票价，不能发布模型凭空给出的区间');assert.match(text,/未.*(确认|核实)|不知道|不确定|没有/);
});
await check('unsolicited prices cannot bypass grounding when the question has no ticket or policy keyword',async()=>{
 for(const content of ['成人九十元，学生四十五元。当天来回很方便。','成人90元。当天来回很方便。','成人￥90。当天来回很方便。','成人¥90。当天来回很方便。','成人90块。当天来回很方便。','成人90人民币。当天来回很方便。','成人CNY 90。当天来回很方便。','成人90 RMB。当天来回很方便。']){
  const {DB}=database();upstream=()=>resultResponse(content);const text=await success(await post(envOf(DB),body('这些景点好玩吗')));
  assert(!/九十元|四十五元|90|CNY|RMB|￥|¥/.test(text),content);assert.match(text,/不知道|没有.*核实|未.*核实/);assert(text.endsWith('请以官方信息为准。'));assert.equal((text.match(/请以官方信息为准/g)||[]).length,1);
 }
});
await check('incorrect model counts are corrected from real day/category facts',async()=>{
 const {DB}=database();upstream=()=>resultResponse('第一天安排了9个景点。你可以挨个游览。请按计划出行。');
 const text=await success(await post(envOf(DB)));assert.match(text,/2\s*个景点/);assert(!/9\s*个景点/.test(text));assert(text.includes('龙门石窟'));assert(text.includes('白马寺'));
 const input=body();input.trip.places.push('测试面馆');input.trip.schedule[0].stops.push({name:'测试面馆',city:'洛阳',category:'food',duration:60,travelMinutes:15});
 const next=await success(await post(envOf(DB),input));assert.match(next,/2\s*个景点/);assert(!/3\s*个景点/.test(next),'景点数量不能把餐饮站点计入');
 upstream=()=>resultResponse('第一天有9个景点。第二天有2个景点。请安排好游览时间。');
 const crossed=await success(await post(envOf(DB)));assert.match(crossed,/第\s*[1一]\s*天.{0,8}2\s*个景点/);assert(!/9\s*个景点/.test(crossed));assert(!/第二天有2个景点/.test(crossed),'不能用另一天的数字通过当前日期的数量核验');
 upstream=()=>resultResponse('第一天有1个景点。第二天有8个景点。可以慢慢游览。');
 const second=await success(await post(envOf(DB),body('第二天有几个景点')));assert.match(second,/第\s*[2二]\s*天.{0,8}1\s*个景点/);assert(second.includes('洛邑古城'));assert(!/8\s*个景点/.test(second));
});
await check('questions about a nonexistent third day do not invent an extra itinerary',async()=>{
 const {DB}=database();upstream=()=>resultResponse('第三天有3个景点。你可以继续去白马寺。全程安排轻松。');
 const text=await success(await post(envOf(DB),body('第三天有几个景点')));assert.match(text,/只有\s*2\s*天/);assert.match(text,/没有第\s*3\s*天/);assert(!/3\s*个景点/.test(text));assert.equal(calls.length,1);
});
await check('unsupported opening times and reservation assertions cannot become confirmed policies',async()=>{
 for(const content of ['龙门石窟的开放时间为08:00。门票需要提前3天预约。可以按此安排。','白马寺上午8点开门。无需预约。请准时入园。','预约请提前两天办理。营业时间每日9点到17点。出行请按此准备。','门票一百二十。学生半价。出示证件即可。','门票打八折。营业每日9点到17点。请尽早入园。']){
  const {DB}=database();upstream=()=>resultResponse(content);const text=await success(await post(envOf(DB),body('白马寺几点开门，需要预约吗')));assert(!/08:00|8点|3天|无需预约|提前两天|9点|17点|一百二十|学生半价|打八折/.test(text));assert.match(text,/不知道|未.*核实|没有/);assert(text.endsWith('请以官方信息为准。'));
 }
});
await check('ticket synonyms and unsolicited daily opening windows cannot bypass official grounding',async()=>{
 for(const [question,content] of [['龙门石窟需要买票吗','需要提前两天订票。现场不售票，须在线购票。建议带好证件。'],['第一站介绍一下','龙门石窟每日08:00至17:30。建议上午去游览。可以看主要洞窟。']]){
  const {DB}=database();upstream=()=>resultResponse(content);const text=await success(await post(envOf(DB),body(question)));
  assert(!/提前两天|现场不售票|在线购票|08:00|17:30/.test(text));assert.match(text,/不知道|没有.*核实/);assert(text.endsWith('请以官方信息为准。'));
 }
});
await check('departure time is quoted as the user setting, never as a verified opening time',async()=>{
 const {DB}=database(),input=body('每天几点出发');input.trip.start='09:30';upstream=()=>resultResponse('每天应当06:00出发。所有景区同时开门。请早点到达。');
 const text=await success(await post(envOf(DB),input));assert(text.includes('09:30'));assert(!text.includes('06:00'));assert.match(text,/设置|选择/);assert.match(text,/不代表景区营业时间/);assert(text.endsWith('请以官方信息为准。'));
 const unknown=await success(await post(envOf(DB),body('每天几点出发')));assert.match(unknown,/没有提供|不知道/);assert(!unknown.includes('06:00'));assert(!unknown.includes('09:30'));
});
await check('answers stay concise at three to five sentences and a policy fallback remains the final sentence',async()=>{
 for(const content of ['第一天有2个景点。','第一天有2个景点。还有分日安排。也可以查看地点。请留意交通。可以调整节奏。最后请准备出发。']){
  const {DB}=database();upstream=()=>resultResponse(content);const text=await success(await post(envOf(DB))),sentences=(text.match(/[^。！？!?]+[。！？!?]?/g)||[]).filter(part=>part.trim());assert(sentences.length>=3&&sentences.length<=5,text);
 }
 const {DB}=database();upstream=()=>resultResponse('我不知道最新门票价格。');const policy=await success(await post(envOf(DB),body('龙门石窟门票多少钱')));assert(policy.endsWith('请以官方信息为准。'));assert((policy.match(/[^。！？!?]+[。！？!?]?/g)||[]).length>=3);
});
await check('bounding a long grounded answer preserves the full official-information sentence at the end',async()=>{
 const {DB}=database(),input=body('第一天有几个景点，门票需要核实吗');input.trip={days:2,places:[],schedule:[{day:1,stops:[]},{day:2,stops:[]}]};
 for(let index=0;index<15;index++){
  const name='测试景点'+String(index+1).padStart(2,'0')+'风'.repeat(140);input.trip.places.push(name);input.trip.schedule[0].stops.push({name,city:'洛阳',category:'scenic',duration:15,travelMinutes:null});
 }
 const text=await success(await post(envOf(DB),input));assert.match(text,/第\s*1\s*天有15个景点/);assert(text.length<=1800);assert(text.endsWith('请以官方信息为准。'));assert.equal((text.match(/请以官方信息为准/g)||[]).length,1);
});
await check('anonymous daily quota permits ten model calls, then the eleventh returns 429 without extra global usage',async()=>{
 const {sql,DB}=database(),env=envOf(DB);for(let i=0;i<10;i++)await success(await post(env));const before=usage(sql);await jsonError(await post(env),429,/今日|次数|额度/);assert.equal(calls.length,10);assert.deepEqual(usage(sql),before);
});
await check('authenticated standalone session gets thirty; spoofed forwarding/account headers remain anonymous',async()=>{
 const {sql,DB}=database(),token=seedUser(sql),env={...envOf(DB),STANDALONE_AUTH:'true'};
 for(let i=0;i<30;i++)await success(await post(env,body(),{Cookie:'travel_session='+token,'X-Real-IP':'192.0.2.10'}));await jsonError(await post(env,body(),{Cookie:'travel_session='+token,'X-Real-IP':'192.0.2.11'}),429,/今日|次数|额度/);
 for(let i=0;i<10;i++)await success(await post(env,body(),{'X-Real-IP':'192.0.2.2','CF-Connecting-IP':'spoof-'+i,'X-Forwarded-For':'spoof-'+i,'oai-authenticated-user-id':'spoof-'+i}));
 await jsonError(await post(env,body(),{'X-Real-IP':'192.0.2.2','CF-Connecting-IP':'new-spoof','X-Forwarded-For':'new-spoof','oai-authenticated-user-id':'new-spoof'}),429,/今日|次数|额度/);assert.equal(calls.length,40);
});
await check('global cap is two hundred and ask remains isolated from planning, poster, share and vision quotas',async()=>{
 const {sql,DB}=database(),env=envOf(DB),today=new Date().toISOString().slice(0,10),now=Date.now();
 const otherScopes=['global','poster:global','share:global','vision:global'];for(const scope of otherScopes)sql.prepare('INSERT INTO model_usage VALUES (?,?,?)').run(today+':'+scope,999,now);
 for(let i=0;i<200;i++)await success(await post(env,body(),{'CF-Connecting-IP':'192.0.2.'+(i+1)}));
 await jsonError(await post(env,body(),{'CF-Connecting-IP':'198.51.100.1'}),429,/总额度|全局|额度/);assert.equal(calls.length,200);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':ask:global').calls,200);
 for(const scope of otherScopes)assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':'+scope).calls,999);
});
await check('same-client concurrent requests cannot exceed ten model attempts',async()=>{
 const {DB}=database(),responses=await Promise.all(Array.from({length:25},()=>post(envOf(DB))));assert.equal(responses.filter(response=>response.status===200).length,10);assert.equal(responses.filter(response=>response.status===429).length,15);assert.equal(calls.length,10);
});
await check('concurrent distinct clients cannot overrun the shared daily global cap',async()=>{
 const {sql,DB}=database(),today=new Date().toISOString().slice(0,10);sql.prepare('INSERT INTO model_usage VALUES (?,?,?)').run(today+':ask:global',195,Date.now());
 const responses=await Promise.all(Array.from({length:25},(_,index)=>post(envOf(DB),body(),{'CF-Connecting-IP':'198.51.100.'+(index+1)})));assert.equal(responses.filter(response=>response.status===200).length,5);assert.equal(responses.filter(response=>response.status===429).length,20);assert.equal(calls.length,5);assert.equal(sql.prepare('SELECT calls FROM model_usage WHERE usage_key=?').get(today+':ask:global').calls,200);
});
await check('missing or broken storage fails closed before model invocation',async()=>{
 for(const env of [{...config},{...config,DB:{prepare(){throw Error('DB_PRIVATE_SENTINEL')}}}]){
  const data=await jsonError(await post(env),503,/额度|暂不可用/);assert(!JSON.stringify(data).includes('DB_PRIVATE_SENTINEL'));
 }assert.equal(calls.length,0);
});
await check('upstream failures stay friendly, do not retry and never leak credential or raw response',async()=>{
 const privateText='UPSTREAM_PRIVATE_SENTINEL';
 for(const mode of [401,429,'network','bad-json','empty','truncated','tool-call','too-long-answer','too-large']){
  const {sql,DB}=database(),before=calls.length;upstream=()=>{
   if(mode==='network')throw Error(privateText+' '+config.LLM_API_KEY);if(mode==='bad-json')return new Response(privateText);if(mode==='empty')return resultResponse('');
   if(mode==='truncated')return new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:answer}}]}));if(mode==='tool-call')return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:answer,tool_calls:[{id:'not-a-tool-enabled-endpoint'}]}}]}));if(mode==='too-long-answer')return resultResponse('长'.repeat(1801));if(mode==='too-large')return new Response('x'.repeat(70000));return new Response(privateText+' '+config.LLM_API_KEY,{status:mode});
  };
  const data=await jsonError(await post(envOf(DB)),502,/问答|模型|暂时|稍后|重试/);assert(!JSON.stringify(data).includes(privateText));assert.equal(calls.length-before,1,'每次问答最多发起一次模型请求');assert(usage(sql).every(row=>row.calls===1),'真实模型尝试失败也计入额度');
 }
});
await check('pre-cancelled request avoids quota/network, and cancellation during model call returns no answer',async()=>{
 const {sql,DB}=database(),controller=new AbortController();controller.abort();await jsonError(await post(envOf(DB),body(),{},controller.signal),408,/取消/);assert.equal(calls.length,0);assert.deepEqual(usage(sql),[]);
 const next=database(),during=new AbortController();upstream=()=>{during.abort();return resultResponse()};await jsonError(await post(envOf(next.DB),body(),{},during.signal),408,/取消/);assert.equal(calls.length,1);
});
}finally{globalThis.fetch=originalFetch;for(const sql of opened)sql.close()}
console.log('Passed: '+checks+' ask checks (mock X2.5, real SQLite, public read-only context, honest answers, independent quotas, cancellation and friendly errors).');
