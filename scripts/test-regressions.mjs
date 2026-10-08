import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const defaultTarget = process.env.TRAVEL_WORKER_ENTRY ? dirname(dirname(resolve(process.env.TRAVEL_WORKER_ENTRY))) : new URL('..',import.meta.url).pathname;
const target = resolve(process.argv[2] || defaultTarget);
const output = resolve(process.argv[3] || join(target, 'competition-evidence', 'regression-results.json'));
const source = await import(pathToFileURL(join(target, 'worker/index.js')));
const { default: worker, HTML, CATALOG, PRESETS, parseIntentRules, validateIntent, validateDecisionState, validateDraft, validatePlan, auditDecision } = source;
const cases = [];
async function check(id, description, operation) {
  const startedAt = new Date().toISOString();
  try { const observation = await operation(); cases.push({ id, description, status: 'passed', startedAt, observation: observation ?? null }); }
  catch (error) { cases.push({ id, description, status: 'failed', startedAt, error: error.message }); }
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function ruleText(text) { return parseIntentRules(text, CATALOG); }
const longmen = CATALOG.find(p => p.name === '龙门石窟');
const whiteHorse = CATALOG.find(p => p.name === '白马寺');
const museum = CATALOG.find(p => p.name === '洛阳博物馆');
assert(longmen && whiteHorse && museum, 'fixtures must exist');

await check('intent-negative-place', '不去龙门石窟不会成为必去地点，同时保留正向白马寺', () => {
  const result = ruleText('洛阳两天，不去龙门石窟，白马寺必去，预算500元');
  assert(!result.fields.requiredIds.includes(longmen.id));
  assert(result.fields.excludedIds?.includes(longmen.id));
  assert(result.fields.requiredIds.includes(whiteHorse.id));
  assert.equal(result.fields.budget, 500);
  return result;
});
await check('intent-negative-place-postfix', '后置否定龙门石窟不去了，不应成为必去', () => {
  const result=ruleText('洛阳两天，龙门石窟不去了，白马寺必去，预算500元');
  assert(!result.fields.requiredIds.includes(longmen.id));assert(result.fields.excludedIds?.includes(longmen.id));
  assert(result.fields.requiredIds.includes(whiteHorse.id));return result;
});
for (const text of ['不坐公交，选择自驾', '不要坐公交和地铁，选择自驾', '不坐公交也不步行，自驾']) {
  await check('intent-negative-mode-' + cases.length, text, () => {
    const result = ruleText('洛阳两天，' + text);
    assert.equal(result.fields.mode, 'driving');
    assert(result.fields.excludedModes?.includes('transit'));
    if (text.includes('步行')) assert(result.fields.excludedModes.includes('walking'));
    return result;
  });
}
await check('intent-negative-mode-only', '单独否定公交不应被解释为选择公交', () => {
  const result = ruleText('洛阳两天，不坐公交');
  assert.equal(result.fields.mode, null);
  assert(result.fields.excludedModes?.includes('transit'));
  return result;
});
await check('intent-unsupported-budget', '预算120000元不得截断为1200元，其他字段仍保留',()=>{
  const result=ruleText('洛阳两天，自驾，预算120000元，每天6小时');assert.equal(result.fields.budget,null);assert(result.unresolved.join(' ').includes('120000'));
  assert.equal(result.fields.city,'洛阳');assert.equal(result.fields.days,2);assert.equal(result.fields.mode,'driving');assert.equal(result.fields.maxHours,6);return result;
});
for (const [text, daysValue, hoursValue] of [
  ['洛阳12天，自驾，预算500元，每天16小时', '12', '16'],
  ['洛阳十二天，自驾，预算500元，每天十六小时', '十二', '十六'],
  ['洛阳周末12天，自驾，预算500元，每天16小时', '12', '16'],
  ['洛阳6天，自驾，预算500元，每天7小时', '6', '7'],
]) {
  await check('intent-full-unsupported-numbers-' + cases.length, text, () => {
    const result = ruleText(text);
    assert.equal(result.fields.days, null, 'unsupported explicit day count must not be truncated or default to a weekend');
    assert.equal(result.fields.maxHours, null, 'unsupported explicit hour cap must not be truncated');
    assert.equal(result.fields.city, '洛阳'); assert.equal(result.fields.mode, 'driving'); assert.equal(result.fields.budget, 500);
    const unresolved = result.unresolved.join(' ');
    assert(unresolved.includes(daysValue) || unresolved.includes(daysValue === '十二' ? '12' : daysValue));
    assert(unresolved.includes(hoursValue) || unresolved.includes(hoursValue === '十六' ? '16' : hoursValue));
    return result;
  });
}
for (const n of [1,2,3,4,5,7]) await check('intent-supported-days-' + n, n + '天完整识别', () => {
  const result = ruleText(`洛阳${n}天，自驾，预算500元，每天10小时`);
  assert.equal(result.fields.days, n); assert.equal(result.fields.maxHours, 10);
  return result.fields;
});

function browserFixture() {
  const nodes = new Map();
  const defaults = { '#days':'2', '#start':'09:00', '#city':'洛阳', '#travelmode':'transit', '#maxhours':'6', '#restmins':'30', '#studyrating':'4', '#baseline':'2', '#studyfeedback':'', '#studytask':'回归测试' };
  const get = selector => {
    if (!nodes.has(selector)) {
      const node={
      value: defaults[selector] ?? '', checked: false, disabled: false, dataset: {}, style: {}, innerHTML: '', textContent: '',
      classList: { toggle(){}, add(){}, remove(){} }, querySelectorAll(selector){
        const requested=selector.match(/^\[data-([a-z-]+)\](:checked)?$/);if(!requested)return [];
        const key=requested[1],camel=key.replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase());
        return [...this.innerHTML.matchAll(/<input\b([^>]+)>/g)].flatMap(([,attributes])=>{
          const value=attributes.match(new RegExp('data-'+key+'="([^"]*)"'));
          if(!value)return [];const identity=key+':'+value[1];
          if(!this.inputStates.has(identity))this.inputStates.set(identity,{checked:/\bchecked\b/.test(attributes),dataset:{[camel]:value[1]}});
          const child=this.inputStates.get(identity);return !requested[2]||child.checked?[child]:[];
        });
      }, addEventListener(){}, setAttribute(){},
      showModal(){this.open=true}, close(){this.open=false}, remove(){}, click(){return this.onclick?.()},
      _html:'',inputStates:new Map(),
      };
      Object.defineProperty(node,'innerHTML',{get(){return this._html},set(value){this._html=String(value);this.inputStates.clear();if(['#briefmode','#briefcity','#briefdays','#briefhours','#briefrest'].includes(selector)){
        const options=[...this._html.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)];const selected=options.find(o=>/\bselected\b/.test(o[1]))||options[0];this.value=selected?.[1].match(/value="([^"]*)"/)?.[1]||'';
      }}});
      nodes.set(selector,node);
    }
    return nodes.get(selector);
  };
  const context = {
    document: { body:{dataset:{view:'gallery'}}, querySelector:get, querySelectorAll:()=>[], createElement:()=>({click(){}}), head:{append(){}} },
    navigator:{}, location:{origin:'https://fixture.test'}, URL, Blob, Map, Set, console, setTimeout:()=>0, clearTimeout(){},
    fetch:(path, options={})=>worker.fetch(new Request('https://fixture.test'+path, options), {}),
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/, ''), context);
  const run = code => vm.runInContext(code, context);
  run("saveBooting=false;loadPreset('luoyang',true);renderTrip()");
  return { nodes, get, context, run };
}
function setBrief(fixture, values={}) {
  for (const [key, value] of Object.entries({briefcity:'洛阳',briefdays:'2',briefmode:'transit',briefhours:'6',briefrest:'30',briefbudget:'500',...values})) fixture.get('#'+key).value=value;
  fixture.get('#briefcross').checked=true;
}
await check('locked-day-dropdown-atomic', '天数2→1，固定第2天时拒绝整体更改且撤销栈不增加', () => {
  const b=browserFixture(); b.run('trip.find(s=>s.day===2).lockedDay=2;renderTrip()');
  const before=b.run('JSON.stringify(compactDraft())'), stack=b.run('undoStack.length');
  b.get('#days').value='1'; b.get('#days').onchange();
  assert.equal(b.run('JSON.stringify(compactDraft())'),before);
  assert.equal(b.run('undoStack.length'),stack);
  assert.equal(b.get('#days').value,'2');
  assert(/固定|锁定/.test(b.get('#notice').textContent));
  return {days:b.get('#days').value, notice:b.get('#notice').textContent};
});
await check('locked-day-brief-atomic', '需求确认天数2→1，固定第2天时拒绝整体更改', async () => {
  const b=browserFixture(); b.run('trip.find(s=>s.day===2).lockedDay=2;renderTrip()');
  await b.run('openBrief()'); setBrief(b,{briefdays:'1'});
  const before=b.run('JSON.stringify(compactDraft())'), stack=b.run('undoStack.length');
  await b.get('#applyconditions').onclick();
  assert.equal(b.run('JSON.stringify(compactDraft())'),before);
  assert.equal(b.run('undoStack.length'),stack);
  assert(/固定|锁定/.test(b.get('#notice').textContent));
  return {notice:b.get('#notice').textContent, lockedDay:b.run('trip.find(s=>s.lockedDay===2).lockedDay')};
});
await check('unlocked-day-reduction-valid', '未固定地点可缩短天数，最终草稿仍合法', () => {
  const b=browserFixture(); b.get('#days').value='1'; b.get('#days').onchange();
  const after=plain(b.run('compactDraft()'));
  assert.equal(after.days,1); assert(after.stops.every(s=>s.day===1)); validateDraft(after);
  return {days:after.days, stops:after.stops.length};
});
await check('candidate-excluded-place', '候选不重新加入明确排除地点，识别和预览均不改草稿', async () => {
  const b=browserFixture(), before=b.run('JSON.stringify(compactDraft())');
  await b.run("openBrief('洛阳两天，不去龙门石窟，白马寺必去，自驾，预算500元')");
  setBrief(b,{briefmode:'driving'});
  const intent=plain(b.run('readBrief()'));
  assert(intent.excludedIds?.includes(longmen.id));
  const candidates=plain(b.run('candidateStops(readBrief())'));
  assert(!candidates.some(s=>s.place.id===longmen.id)); assert(candidates.some(s=>s.place.id===whiteHorse.id));
  await b.run('buildCandidate()');
  assert.equal(b.run('JSON.stringify(compactDraft())'), before);
  assert(!b.get('#candidatepreview').innerHTML.includes('龙门石窟'));
  assert.equal(typeof b.get('#applycandidate').onclick,'function');
  return {candidateIds:candidates.map(s=>s.place.id), explicitApplyAvailable:true};
});
await check('negative-mode-brief-default', '当前公交草稿遇“不坐公交”，确认页不能再次默认公交', async () => {
  const b=browserFixture();await b.run("openBrief('洛阳两天，不坐公交')");
  const result=plain(b.run('briefResult'));
  const rendered=b.get('#briefbody').innerHTML;
  const modeField=rendered.match(/<select id="briefmode">([\s\S]*?)<\/select>/)?.[1]||'';
  assert(!/<option[^>]*value="transit"[^>]*selected/.test(modeField),'selected transport may not violate explicit exclusion');
  assert(result.fields.excludedModes?.includes('transit'));
  return {excludedModes:result.fields.excludedModes,selectedOptions:modeField};
});
await check('excluded-mode-dropdown-atomic', '地图交通下拉不能选择已排除方式，恢复原方式且不增加撤销栈',async()=>{
  const b=browserFixture();b.run("$('#travelmode').value='driving';decisionState.intent=validateIntent({...decisionState.intent,mode:'driving',excludedModes:['transit']});renderTrip()");
  const before=b.run('JSON.stringify(compactDraft())'),stack=b.run('undoStack.length');b.get('#travelmode').value='transit';await b.get('#travelmode').onchange();
  assert.equal(b.run('JSON.stringify(compactDraft())'),before);assert.equal(b.run('undoStack.length'),stack);assert.equal(b.get('#travelmode').value,'driving');
  assert(b.get('#notice').textContent.includes('排除'));validateDecisionState(plain(b.run('decisionState')),plain(b.run('trip')));
  return {mode:b.get('#travelmode').value,notice:b.get('#notice').textContent,draftUnchanged:true};
});
await check('editable-excluded-mode-remove','确认页可以取消交通排除，并重新开放该方式',async()=>{
  const b=browserFixture();await b.run("openBrief('洛阳两天，不坐公交，选择自驾')");setBrief(b,{briefmode:'driving'});
  const transit=b.get('#briefbody').querySelectorAll('[data-excluded-mode]').find(n=>n.dataset.excludedMode==='transit');assert(transit?.checked);transit.checked=false;b.get('#briefbody').onchange({target:transit});
  assert(b.get('#briefmode').innerHTML.includes('value="transit"'));const intent=plain(b.run('readBrief()'));assert(!intent.excludedModes.includes('transit'));assert.equal(intent.mode,'driving');return {excludedModes:intent.excludedModes,transitAvailable:true};
});
await check('editable-excluded-mode-add','确认页新增排除当前方式，允许下拉与readBrief同步',async()=>{
  const b=browserFixture();await b.run("openBrief('洛阳两天，自驾')");setBrief(b,{briefmode:'driving'});
  const driving=b.get('#briefbody').querySelectorAll('[data-excluded-mode]').find(n=>n.dataset.excludedMode==='driving');assert(driving);driving.checked=true;b.get('#briefbody').onchange({target:driving});
  assert(!b.get('#briefmode').innerHTML.includes('value="driving"'));assert.notEqual(b.get('#briefmode').value,'driving');const intent=plain(b.run('readBrief()'));assert(intent.excludedModes.includes('driving'));assert(!intent.excludedModes.includes(intent.mode));return {excludedModes:intent.excludedModes,selectedMode:intent.mode};
});
await check('editable-excluded-all-modes-blocked','确认页排除全部方式时明确阻止生成，不默认自驾',async()=>{
  const b=browserFixture();await b.run("openBrief('洛阳两天，自驾')");setBrief(b,{briefmode:'driving'});const before=b.run('JSON.stringify(compactDraft())');
  for(const checkbox of b.get('#briefbody').querySelectorAll('[data-excluded-mode]')){checkbox.checked=true;b.get('#briefbody').onchange({target:checkbox})}
  assert.equal(b.get('#briefmode').value,'');assert.throws(()=>b.run('readBrief()'),/至少.*出行方式/);
  await b.run('buildCandidate()');assert.equal(b.run('JSON.stringify(compactDraft())'),before);assert.notEqual(typeof b.get('#applycandidate').onclick,'function');assert(/至少.*出行方式/.test(b.get('#notice').textContent));
  return {draftUnchanged:true,candidateBlocked:true,notice:b.get('#notice').textContent};
});
await check('audit-excluded-constraints', '现有行程含排除地点和排除交通方式时分别报告冲突', () => {
  const draft={days:2,start:'09:00',mode:'transit',maxHours:6,restMinutes:30,stops:[{place:longmen,day:1,duration:60}],decision:{intent:{excludedIds:[longmen.id],excludedModes:['transit']}}};
  const report=auditDecision(draft);assert(report.conflicts>=2,'excluded place and excluded transport are independent conflicts');return report;
});
await check('validate-unknown-exclusion', '未知排除地点也不能写入有效条件状态', () => {
  assert.throws(()=>validateDecisionState({intent:{excludedIds:['invented-place']}}));return {unknownIdRejected:true};
});
await check('single-stop-rest-consistency', '单站120分钟+每日休息30分钟：检查与时间线统一', () => {
  const b=browserFixture(); b.run("trip=[{place:CATALOG.find(p=>p.name==='白马寺'),day:1,duration:120}];day=1;renderTrip()");
  const draft=plain(b.run('compactDraft()')); const report=auditDecision(draft);
  assert.equal(report.daily[0].knownMinutes,150);
  assert(/休息预留\s*30\s*分钟/.test(b.get('#trip').innerHTML));
  assert(/休息/.test(b.get('#trafficreview').innerHTML));
  assert(b.get('#trafficreview').innerHTML.includes('2.5 小时'));
  return {knownMinutes:report.daily[0].knownMinutes,timeline:b.get('#trip').innerHTML};
});
await check('empty-day-no-rest', '空日不虚构休息时长', () => {
  const b=browserFixture(); b.run('trip=[];day=1;renderTrip()');
  const report=auditDecision(plain(b.run('compactDraft()')));
  assert.equal(report.daily[0].knownMinutes,0); assert(!b.get('#trip').innerHTML.includes('休息预留')); assert.equal(b.get('#trafficreview').innerHTML,'');
  return {knownMinutes:0};
});

const fixtureEnv={LLM_BASE_URL:'https://spark-api-open.xf-yun.com/v1',LLM_MODEL:'synthetic-model',LLM_API_KEY:'synthetic-test-token'};
const originalFetch=globalThis.fetch;
const fixtureDraft={days:2,start:'09:00',mode:'transit',maxHours:6,restMinutes:30,stops:PRESETS.find(p=>p.id==='luoyang').stops.map(([id,day,duration])=>({place:CATALOG.find(p=>p.id===id),day,duration})),decision:{intent:validateIntent({city:'洛阳',days:2,mode:'transit'})}};
const mockTypes={
  network:async()=>{throw Error('simulated network failure')},
  quota429:async()=>new Response(JSON.stringify({error:'simulated quota'}),{status:429}),
  nonJson:async()=>new Response('upstream returned non-json'),
  null:async()=>modelResponse(null),
  array:async()=>modelResponse([]),
  string:async()=>modelResponse('bad-format'),
  invalidPlace:async()=>modelResponse({fields:{city:'洛阳',days:2,requiredIds:['invented-place']},stops:[{id:'invented-place',day:1}]}),
  missingFields:async()=>modelResponse({}),
  fieldsNull:async()=>modelResponse({fields:null}),
  fieldsArray:async()=>modelResponse({fields:[]}),
  fieldsString:async()=>modelResponse({fields:'bad-format'}),
};
function modelResponse(parsed) {return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(parsed)}}]}));}
function post(path, body, env=fixtureEnv) {return worker.fetch(new Request('https://fixture.test'+path,{method:'POST',headers:{'oai-authenticated-user-id':'fixture-user','Content-Type':'application/json'},body:JSON.stringify(body)}),env);}
try {
  await check('model-cannot-erase-explicit-negation', '模拟合法目录但违反明确否定的模型输出，仍保留用户排除边界',async()=>{
    globalThis.fetch=async()=>modelResponse({fields:{city:'洛阳',days:2,mode:'transit',budget:500,requiredIds:[longmen.id],excludedIds:[],excludedModes:[]},unresolved:[]});
    const response=await post('/api/intent',{text:'洛阳两天，不去龙门石窟，不坐公交，选择自驾，预算500元'});
    assert.equal(response.status,200);const data=await response.json();
    assert(!data.fields.requiredIds.includes(longmen.id));assert(data.fields.excludedIds?.includes(longmen.id));
    assert(data.fields.excludedModes?.includes('transit'));assert.equal(data.fields.mode,'driving');
    return {simulation:true,source:data.source,fields:data.fields};
  });
  await check('model-cannot-truncate-explicit-unsupported-numbers', '模拟模型把12天/16小时截断为支持值，最终仍将完整原值列为待确认',async()=>{
    globalThis.fetch=async()=>modelResponse({fields:{city:'洛阳',days:2,maxHours:6,mode:'driving',budget:500},unresolved:[]});
    const response=await post('/api/intent',{text:'洛阳12天，自驾，预算500元，每天16小时'});
    assert.equal(response.status,200);const data=await response.json();
    assert.equal(data.fields.days,null);assert.equal(data.fields.maxHours,null);
    assert.equal(data.fields.city,'洛阳');assert.equal(data.fields.mode,'driving');assert.equal(data.fields.budget,500);
    assert(data.unresolved.join(' ').includes('12'));assert(data.unresolved.join(' ').includes('16'));
    return {simulation:true,source:data.source,fields:data.fields,unresolved:data.unresolved};
  });
  await check('model-cannot-truncate-unsupported-budget','模拟模型预算120000→1200，最终预算为空且完整原值待确认',async()=>{
    globalThis.fetch=async()=>modelResponse({fields:{city:'洛阳',days:2,mode:'driving',budget:1200},unresolved:[]});
    const response=await post('/api/intent',{text:'洛阳两天，自驾，预算120000元'});assert.equal(response.status,200);const data=await response.json();assert.equal(data.fields.budget,null);assert(data.unresolved.join(' ').includes('120000'));
    assert.equal(data.fields.city,'洛阳');assert.equal(data.fields.days,2);assert.equal(data.fields.mode,'driving');return {simulation:true,source:data.source,fields:data.fields,unresolved:data.unresolved};
  });
  for (const [type, mock] of Object.entries(mockTypes)) {
    for (const endpoint of ['intent','plan']) {
      await check('model-failure-'+endpoint+'-'+type, `模拟${type}；${endpoint}失败应明确返回规则回退或可操作的错误`, async()=>{
        globalThis.fetch=mock;
        const body=endpoint==='intent'?{text:'洛阳两天，自驾，预算500元'}:fixtureDraft;
        const before=JSON.stringify(body), response=await post('/api/'+endpoint,body), data=await response.json();
        assert.equal(JSON.stringify(body),before);
        assert.equal(response.status,200,'model failures must return an available rule fallback');
        assert.equal(data.source,'rules','malformed model output must not be labelled as successful AI');
        assert.equal(typeof data.fallback?.reason,'string','fallback reason must be disclosed');
        assert(data.fallback.reason.length);
        if(endpoint==='intent'){assert.equal(data.fields.city,'洛阳');assert.equal(data.fields.budget,500);} else validatePlan(data.stops,fixtureDraft);
        return {simulation:true,httpStatus:response.status,source:data.source??null,error:data.error??null,ruleEndpointAvailable:true};
      });
    }
    await check('model-failure-ui-'+type, `模拟${type}；前端给出规则候选且明确载入之前草稿不变`, async()=>{
      globalThis.fetch=mock;
      const b=browserFixture(),before=b.run('JSON.stringify(compactDraft())');
      b.context.fetch=(path,options={})=>worker.fetch(new Request('https://fixture.test'+path,{...options,headers:{...options.headers,'oai-authenticated-user-id':'fixture-user'}}),fixtureEnv);
      await b.run("openBrief('洛阳两天，自驾，预算500元')"); setBrief(b,{briefmode:'driving'});
      assert.equal(b.run('JSON.stringify(compactDraft())'),before);
      assert.equal(b.run('briefResult.source'),'rules');
      assert(b.run('briefResult.fallback.reason.length')>0);
      await b.run('buildCandidate()');
      assert.equal(b.run('JSON.stringify(compactDraft())'),before);
      assert.equal(typeof b.get('#applycandidate').onclick,'function');
      assert(/规则/.test(b.get('#candidatepreview').innerHTML));
      return {simulation:true,draftUnchanged:true,source:'rules',explicitApplyAvailable:true};
    });
  }
} finally {globalThis.fetch=originalFetch;}

const hashes={};for(const name of ['decision-core.mjs','decision.js','app.html','server.mjs','worker/index.js'])hashes[name]=createHash('sha256').update(await readFile(join(target,name))).digest('hex');
const report={generatedAt:new Date().toISOString(),target,scope:'Isolated local regression tests. Model failures use synthetic mocked responses; no real provider request or secret was used.',sourceHashes:hashes,total:cases.length,passed:cases.filter(c=>c.status==='passed').length,failed:cases.filter(c=>c.status==='failed').length,cases};
await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,passed:report.passed,failed:report.failed,results:output}));
for(const result of cases.filter(c=>c.status==='failed'))console.log(result.id+': '+result.error);
process.exitCode=report.failed?1:0;
