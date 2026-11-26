import assert from 'node:assert/strict';
import vm from 'node:vm';
import worker,{HTML,CATALOG,auditDecision} from '../worker/index.js';

const call=(path,body,env={})=>worker.fetch(new Request('https://ux.test'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),env);

// 1. AMap /_AMapService/v3/log/init returns executable JS (no MIME error), validates key, and preserves 404 allowlist.
{
 const env={AMAP_JS_KEY:'public-key',AMAP_SECURITY_JS_CODE:'secret-code'};
 const ok=await call('/_AMapService/v3/log/init?key=public-key&callback=AMap._cb_123',null,env);
 assert.equal(ok.status,200);
 assert.match(ok.headers.get('Content-Type')||'',/application\/javascript/);
 const js=await ok.text();
 assert(js.includes("typeof AMap._cb_123==='function'"),'Valid JSONP callback is safely invoked');

 const badCb=await call('/_AMapService/v3/log/init?key=public-key&callback=alert(1)',null,env);
 assert.equal(badCb.status,200);
 assert.equal(await badCb.text(),'/* ok */','Unsafe callback string must never be reflected');

 assert.equal((await call('/_AMapService/v3/log/init?key=wrong',null,env)).status,403);
 assert.equal((await call('/_AMapService/v3/other?key=public-key',null,env)).status,404);
}

// 2. Live /api/places ranking prioritizes local Henan food specialties and urban hotels near anchor.
{
 const env={AMAP_WEB_SERVICE_KEY:'web-key'};
 const originalFetch=globalThis.fetch;
 const calls=[];
 try{
  globalThis.fetch=async url=>{
   calls.push(new URL(String(url)));
   const types=calls.at(-1).searchParams.get('types');
   if(types==='050000'){
    return new Response(JSON.stringify({status:'1',pois:[
     {id:'F1',name:'PHO HOUSE粉店(熙地港店)',location:'113.73,34.77',typecode:'050000',biz_ext:{rating:'4.8'},photos:[{url:'https://img.test/pho.jpg'}]},
     {id:'F2',name:'萧记三鲜烩面美食城(郑汴路店)',location:'113.70,34.75',typecode:'050000',biz_ext:{rating:'4.6'},photos:[{url:'https://img.test/huimian.jpg'}]}
    ]}),{headers:{'Content-Type':'application/json'}});
   }
   return new Response(JSON.stringify({status:'1',pois:[
    {id:'S1',name:'鸿运宾馆(新密长途汽车站店)',location:'113.38,34.53',typecode:'100000',address:'新密长途汽车站旁',biz_ext:{rating:'4.9'},photos:[{url:'https://img.test/xinmi.jpg'}]},
    {id:'S2',name:'郑州绿地JW万豪酒店',location:'113.73,34.77',typecode:'100000',address:'郑东新区千玺广场',biz_ext:{rating:'4.7'},photos:[{url:'https://img.test/jw.jpg'}]}
   ]}),{headers:{'Content-Type':'application/json'}});
  };
  const foodRes=await (await call('/api/places?city=郑州&category=food',null,env)).json();
  assert.equal(calls[0].searchParams.get('keywords'),'烩面|胡辣汤','Empty food query should use city specialty keywords');
  assert.equal(foodRes.places[0].id,'F2','Local 烩面 should outrank unrelated foreign pho');

  const stayRes=await (await call('/api/places?city=郑州&category=stay&anchor=113.68,34.79',null,env)).json();
  assert.equal(calls[1].searchParams.get('keywords'),'酒店','Empty stay query should target hotels');
  assert.equal(stayRes.places[0].id,'S2','Downtown hotel near anchor should outrank rural Xinmi bus-station motel');
 }finally{globalThis.fetch=originalFetch}
}

// 3. Remote county scenic spots surface commute planningNotes on single-stop days.
{
 for(const id of ['hn-shaolin','hn-yuntai','hn-redflag','hn-yinji','hn-only-henan']){
  const place=CATALOG.find(p=>p.id===id);
  const report=auditDecision({days:1,maxHours:8,restMinutes:30,stops:[{place,day:1,duration:place.duration}]});
  assert.equal(report.status,'pending',id+' single-stop day must flag remote commute pending note');
  assert(report.daily[0].pending.length>=1,id+' should include a commute planningNote');
 }
}

// 4. Static HTML/CSS accessibility and lazy-loading invariants.
{
 assert(!HTML.includes('<h1>豫见行迹</h1>'),'Header brand must not duplicate <h1>');
 assert(HTML.includes('<span class="brand-title">豫见行迹</span>'),'Header brand keeps styled title span');
 assert(HTML.includes('<main id="main-content" class="app-main">'),'All views sit inside <main>');
 assert(HTML.includes('<footer class="site-footer">'),'Site provides a semantic <footer>');
 assert(HTML.includes('<dialog id="auth" aria-labelledby="authtitle" aria-modal="true">'),'Auth modal has aria-modal="true"');
 assert(!HTML.includes("compact:true,loading:'eager'"),'Preset cards must use lazy loading rather than eager');
}

// 5. Guest startup avoids 401 storms on /api/draft and /api/trips/*/review, deduplicates /api/popular,
//    validates auth client-side, avoids duplicate photo dates, and supports spots keyword search.
{
 const script=HTML.split('<script>')[1].split('</script>')[0].replace(/\ninit\(\);\s*$/,'');
 const nodes=new Map(),requests=[];
 const makeNode=sel=>({
  selector:sel,value:({'#days':'2','#start':'09:00','#city':'郑州','#travelmode':'driving','#maxhours':'8','#restmins':'30'})[sel]||'',
  textContent:'',innerHTML:'',hidden:false,disabled:false,open:false,dataset:{},style:{},attrs:{},
  classList:{toggle(){},add(){},remove(){},contains(){return false}},
  querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},
  setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},
  focus(){},showModal(){this.open=true},close(){this.open=false}
 });
 const get=sel=>{if(!nodes.has(sel))nodes.set(sel,makeNode(sel));return nodes.get(sel)};
 const body={dataset:{view:'gallery'}};
 const context={
  document:{body,hidden:false,getElementById:id=>get('#'+id),querySelector:get,querySelectorAll:()=>[],createElement:()=>({click(){}}),head:{append(){}},addEventListener(){}},
  navigator:{},location:{origin:'https://ux.test'},URL,Map,Set,Blob,Response,AbortController,console,
  setTimeout:()=>0,clearTimeout(){},matchMedia:()=>({matches:false,addEventListener(){}}),
  fetch:async(path,options={})=>{
   requests.push({path,method:options.method||'GET'});
   if(path==='/api/config')return new Response(JSON.stringify({authMode:'standalone',persistenceConfigured:true,mapConfigured:false,placesConfigured:false,aiConfigured:true}),{status:200});
   if(path==='/api/auth/me')return new Response(JSON.stringify({error:'尚未登录'}),{status:401});
   if(typeof path==='string'&&path.startsWith('/api/popular'))return new Response(JSON.stringify({items:[]}),{status:200});
   return new Response(JSON.stringify({error:'unexpected '+path}),{status:500});
  }
 };
 context.window=context;vm.createContext(context);vm.runInContext(script,context);
 await vm.runInContext('init()',context);
 assert.equal(requests.filter(r=>r.path==='/api/draft').length,0,'Unauthenticated guest must not request /api/draft');
 assert.equal(requests.filter(r=>r.path.includes('/review')).length,0,'Unauthenticated guest on homepage must not request /review');
 assert.equal(requests.filter(r=>r.path.startsWith('/api/popular')).length,1,'Boot sequence must deduplicate /api/popular');

 // Client-side auth validation blocks empty submit before network roundtrip.
 get('#authuser').value='';get('#authpass').value='';
 await vm.runInContext('submitAuth({preventDefault(){}})',context);
 assert.equal(requests.filter(r=>r.path.startsWith('/api/auth/login')).length,0,'Invalid auth submit must be caught client-side');
 assert.equal(get('#authuser').attrs['aria-invalid'],'true');

 // Duplicate photo date prevention on Henan Museum credit.
 const creditHtml=vm.runInContext("spotsCreditHTML(CATALOG.find(p=>p.id==='hn-henan-museum'))",context);
 assert.equal((creditHtml.match(/拍摄于 2024-11-20/g)||[]).length,1,'Photo date must not repeat when credit already includes it');

 // Spots keyword search filters places cleanly.
 vm.runInContext("spotsQuery='少林'",context);
 const found=Array.from(vm.runInContext('spotsVisiblePlaces().map(p=>p.id)',context));
 assert.deepEqual(found,['hn-shaolin'],'Spots search should match 嵩山少林寺 by keyword/alias');

 // Food gap hint renders for Zhengzhou food interest.
 const hint=vm.runInContext("foodGapHintHTML({city:'郑州',interests:['food']},[{place:CATALOG.find(p=>p.id==='hn-henan-museum')}])",context);
 assert(hint.includes('烩面、胡辣汤')&&hint.includes('data-jump-food="郑州"'),'Food gap hint should surface Zhengzhou local specialties and map jump');
}

console.log('Passed: AMap log/init MIME fix, live POI ranking, remote commute notes, guest 401 elimination, popular dedupe, client auth validation, spots search, photo date dedupe, and a11y/lazy invariants.');
