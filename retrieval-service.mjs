const RETRIEVAL_TOPICS={
 culture:/文化|古都|博物馆/,
 nature:/山水|山|湖/,
 food:/美食|小吃|烩面/,
 immersive:/夜游|沉浸|演出/,
 family:/亲子|孩子/
};
const RETRIEVAL_SURVEY_TRIGGER=/花费|费用|在意|一般|多数|大家|攻略/;
// 来源：~/workspace/goals/xunfei-cup-preparation/files/问卷数据报告-2026-11-06.md。
// Q1–Q9 基数 231，Q11 基数 99。保留报告的原始统计口径。
const RETRIEVAL_SURVEY={
 kind:'survey',name:'出游问卷',city:'',source:'问卷 231 份',
 text:[
  'Q1–Q9 基数 231，Q11 基数 99。',
  'Q2 做攻略 2 小时以上 48.05%；Q3 花费没数 48.48%、路线顺路 47.62%、景点太多 42.42%。',
  'Q4 累/赶经常+偶尔 73.59%；Q6 感兴趣 86.58%、不感兴趣 8 人 3.46%。',
  'Q7 费用明细 57.14%、交通耗时 54.11%、安排理由 36.80%；Q8 多个方案任选 40.26%。',
  'Q9 宿舍组 45.45%、对象/一友 43.29%；Q11 便宜 42.42%、特色小吃 36.36%。'
 ].join('')
};

function retrievalReviewPlace(value,catalog){
 const name=typeof value==='string'?value.trim():'';
 if(!name)return null;
 return catalog.find(place=>place.name===name)
  ||catalog.find(place=>name.includes(place.name)||place.name.includes(name));
}

async function retrievalReviews(db,catalog,matchedIds){
 const reviews=new Map();
 if(!db||!matchedIds.size)return reviews;
 const {results}=await db.prepare('SELECT user_id, payload FROM trip_reviews ORDER BY updated_at DESC, user_id, trip_id').all();
 for(const row of results||[]){
  let review;
  try{review=JSON.parse(row.payload)}catch{continue}
  if(!review)continue;
  const worth=retrievalReviewPlace(review.worthMoreStop,catalog)?.id;
  const overtime=retrievalReviewPlace(review.overtimeStop,catalog)?.id;
  for(const id of new Set([worth,overtime])){
   if(!matchedIds.has(id))continue;
   if(!reviews.has(id))reviews.set(id,{users:new Set(),worth:new Set(),overtime:new Set(),costs:[]});
   const entry=reviews.get(id);
   entry.users.add(row.user_id);
   if(worth===id)entry.worth.add(row.user_id);
   if(overtime===id)entry.overtime.add(row.user_id);
   const cost=review.actualCost;
   if(entry.costs.length<5&&Number.isFinite(cost)&&cost>=0&&cost<=1000000)entry.costs.push(cost);
  }
 }
 return reviews;
}

function retrievalPlaceTopic(place,topic){
 if(place.interests?.includes(topic))return true;
 const summary=place.name+' '+(place.theme||'');
 return RETRIEVAL_TOPICS[topic].test(summary)
  ||(topic==='culture'&&/文博|博物院|历史|石窟|古城|寺/.test(summary))
  ||(topic==='nature'&&/自然|峡谷|湿地/.test(summary))
  ||(topic==='immersive'&&/戏剧|演艺/.test(summary))
  ||(topic==='food'&&place.category==='food');
}

export async function retrieveKnowledge({text,intent,catalog,db}){
 const query=String(text??'').trim().toLowerCase();
 const cities=new Set(catalog.map(place=>place.city).filter(city=>query.includes(city)||intent?.city===city));
 const directNames=new Set();
 const named=catalog.map(place=>{
  const names=[place.name,...(place.aliases||[])].map(name=>name.toLowerCase());
  const included=names.filter(name=>query.includes(name));
  for(const name of included)directNames.add(name);
  return {place,names,included};
 });
 // 已匹配的地名不再作为兴趣词，例如平顶山或云台山里的“山”。
 let keywords=query;
 for(const name of [...directNames,...cities].sort((a,b)=>b.length-a.length))keywords=keywords.replaceAll(name,' ');
 const topics=Object.entries(RETRIEVAL_TOPICS)
  .filter(([topic,pattern])=>pattern.test(keywords)||intent?.interests?.includes(topic))
  .map(([topic])=>topic);
 const candidates=named.map(({place,names,included})=>{
  const cityHit=cities.has(place.city);
  const topicHits=topics.filter(topic=>retrievalPlaceTopic(place,topic)).length;
  const partial=query.length>=2&&!cities.has(query)&&names.some(name=>name.includes(query));
  const nameRank=names.includes(query)?3:included.length?2:partial?1:0;
  return {place,nameRank,cityHit,topicHits};
 }).filter(hit=>hit.nameRank||hit.cityHit||(!cities.size&&hit.topicHits));
 const reviews=await retrievalReviews(db,catalog,new Set(candidates.map(hit=>hit.place.id)));
 candidates.sort((a,b)=>b.nameRank-a.nameRank||Number(b.cityHit)-Number(a.cityHit)
  ||b.topicHits-a.topicHits||Number(reviews.has(b.place.id))-Number(reviews.has(a.place.id)));

 const survey=RETRIEVAL_SURVEY_TRIGGER.test(query);
 const limit=survey?7:8;
 const found=[];
 for(const {place:{id,name,city,description,visitTip,reference}} of candidates){
  if(found.length===limit)break;
  found.push({kind:'place',name,city,text:[description,visitTip,reference&&'资料参考：'+reference].filter(Boolean).join('\n'),source:'地点资料'});
  const review=reviews.get(id);
  if(review&&found.length<limit){
   const costs=review.costs.length?'；实际行程总花费原始值（元）：'+JSON.stringify(review.costs):'';
   found.push({kind:'review',name,city,text:`值得多待 ${review.worth.size} 人；超时提及 ${review.overtime.size} 人${costs}`,source:`用户复盘 ${review.users.size} 人`});
  }
 }
 if(survey)found.push({...RETRIEVAL_SURVEY});
 return found;
}
