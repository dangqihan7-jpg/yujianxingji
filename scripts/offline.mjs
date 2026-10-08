import {readFile,writeFile} from 'node:fs/promises';
import worker,{HTML,CATALOG,validateDraft,rulePlan,validRouting} from '../worker/index.js';
const base=new URL('../',import.meta.url);
let html=HTML;
const demo=CATALOG;
const decisionCore=(await readFile(new URL('decision-core.mjs',base),'utf8')).replaceAll('export ','');
const shim=`<script>
(()=>{
const offlinePlaces=${JSON.stringify(demo)};
function fail(message){throw Error(message)}
${decisionCore}
const coordinates=${'v=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&Math.abs(v[0])<=180&&Math.abs(v[1])<=90'};
${validRouting.toString()}
${validateDraft.toString()}
${rulePlan.toString()}
window.fetch=async function(path,options){try{const u=new URL(path,'https://offline.test');let data;if(u.pathname==='/api/config')data={mapConfigured:false,placesConfigured:false,aiConfigured:false,mapKey:null};else if(u.pathname==='/api/places'){const city=u.searchParams.get('city'),q=u.searchParams.get('q')||'',cat=u.searchParams.get('category');data={city,source:'curated',places:offlinePlaces.filter(p=>(city==='河南'||city===p.city)&&(cat==='all'||cat===p.category)&&(!q||(p.name+p.address).includes(q)))}}else if(u.pathname==='/api/place'){data=offlinePlaces.find(p=>p.id===u.searchParams.get('id'));if(!data)throw Error('地点不存在')}else if(u.pathname==='/api/intent')data={source:'rules',...parseIntentRules(JSON.parse(options.body).text,offlinePlaces),note:'文字规则识别，未连接模型'};else if(u.pathname==='/api/validate')data=validateDraft(JSON.parse(options.body));else if(u.pathname==='/api/plan'){const raw=JSON.parse(options.body),draft={...validateDraft(raw),maxHours:[6,8,10].includes(raw.maxHours)?raw.maxHours:8,restMinutes:[0,30,60].includes(raw.restMinutes)?raw.restMinutes:30};if(!draft.stops.length)throw Error('请先加入地点');data={source:'rules',stops:rulePlan(draft),note:'按城市、相对位置和每日停留负荷分日，住宿放在每天末尾。交通和营业时间尚未纳入，应用后需重新核算交通。',tips:['交通、排队和休息时间需要另行预留。','营业时间和价格请在出行前确认。']}}else throw Error('离线版未连接此服务');return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})}catch(e){return new Response(JSON.stringify({error:e.message}),{status:400,headers:{'Content-Type':'application/json'}})}};
})();
</script>`;
html=html.replace('<script>',shim+'<script>');
for(const name of [...new Set(CATALOG.filter(p=>p.image).map(p=>p.image.split('/').at(-1).replace('.jpg','')))])html=html.replaceAll('/assets/'+name+'.jpg','data:image/jpeg;base64,'+(await readFile(new URL(name+'.jpg',base))).toString('base64'));
html=html.replace('/favicon.svg','data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 64 64%22%3E%3Crect width=%2264%22 height=%2264%22 rx=%2218%22 fill=%22%23103947%22/%3E%3Ctext x=%2212%22 y=%2245%22 font-size=%2240%22 fill=%22white%22%3E行%3C/text%3E%3C/svg%3E');
await writeFile(new URL('index-offline.html',base),html);
console.log('Offline demo created with embedded image and the same itinerary validation.');
