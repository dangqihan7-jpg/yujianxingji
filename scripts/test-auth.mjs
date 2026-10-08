import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readdir,readFile} from 'node:fs/promises';
import worker from '../worker/index.js';

// 独立部署身份认证：注册 / 登录 / 会话 / 登出 / 平台头隔离
const sql=new DatabaseSync(':memory:');
for(const name of (await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())
  sql.exec(await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'));
const DB={prepare(query){const statement=sql.prepare(query);return {bind(...args){return {async first(){return statement.get(...args)||null},async run(){const r=statement.run(...args);return {meta:{changes:Number(r.changes)}}}}}}}};

const standaloneEnv={DB,STANDALONE_AUTH:'true'};
const platformEnv={DB};
const post=(path,body,env,headers={})=>worker.fetch(new Request('https://auth.test'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)}),env);
const get=(path,env,headers={})=>worker.fetch(new Request('https://auth.test'+path,{headers}),env);
const data=async r=>({status:r.status,headers:r.headers,body:await r.json()});
const cookieOf=r=>{const set=r.headers.get('set-cookie');assert(set&&set.includes('travel_session='),'Set-Cookie 缺失');return set.split(';')[0]};

const cfg=await data(await get('/api/config',standaloneEnv));
assert.equal(cfg.body.authMode,'standalone');
const cfgPlatform=await data(await get('/api/config',platformEnv));
assert.equal(cfgPlatform.body.authMode,'platform');

// 未登录：me 与 draft 均为 401
assert.equal((await data(await get('/api/auth/me',standaloneEnv))).status,401);
assert.equal((await data(await get('/api/draft',standaloneEnv))).status,401);

// 注册校验
assert.equal((await data(await post('/api/auth/register',{username:'ab',password:'password123'},standaloneEnv))).status,400);
assert.equal((await data(await post('/api/auth/register',{username:'testuser',password:'short'},standaloneEnv))).status,400);
assert.equal((await data(await post('/api/auth/register',{username:'bad name!',password:'password123'},standaloneEnv))).status,400);

// 注册成功
const reg=await data(await post('/api/auth/register',{username:'旅者甲',password:'password123'},standaloneEnv));
assert.equal(reg.status,200);
assert.equal(reg.body.user.username,'旅者甲');
assert.ok(reg.body.user.id.startsWith('u_'));
const regCookie=cookieOf(reg);
assert(reg.headers.get('set-cookie').includes('HttpOnly'));

// 密码不是明文
const row=sql.prepare('SELECT password_hash FROM users WHERE username=?').get('旅者甲');
assert(row.password_hash.startsWith('pbkdf2$'));
assert(!row.password_hash.includes('password123'));

// 重复注册
assert.equal((await data(await post('/api/auth/register',{username:'旅者甲',password:'anotherpass1'},standaloneEnv))).status,409);

// 登录失败与成功
assert.equal((await data(await post('/api/auth/login',{username:'旅者甲',password:'wrongpass1'},standaloneEnv))).status,401);
assert.equal((await data(await post('/api/auth/login',{username:'nobody',password:'password123'},standaloneEnv))).status,401);
const login=await data(await post('/api/auth/login',{username:'旅者甲',password:'password123'},standaloneEnv));
assert.equal(login.status,200);
const loginCookie=cookieOf(login);

// 会话有效：me 与 draft
const me=await data(await get('/api/auth/me',standaloneEnv,{Cookie:loginCookie}));
assert.equal(me.status,200);
assert.equal(me.body.user.username,'旅者甲');
const draft={days:2,start:'09:00',stops:[]};
const saved=await data(await post('/api/draft',{draft,revision:0},standaloneEnv,{Cookie:loginCookie}));
assert.equal(saved.status,200);
const restored=await data(await get('/api/draft',standaloneEnv,{Cookie:loginCookie}));
assert.equal(restored.body.draft.days,2);

// 平台头在独立模式下必须被忽略：无 cookie 只有平台头 -> 401
const spoof=await data(await get('/api/draft',standaloneEnv,{'oai-authenticated-user-id':'mallory'}));
assert.equal(spoof.status,401);
const spoofMe=await data(await get('/api/auth/me',standaloneEnv,{'oai-authenticated-user-id':'mallory'}));
assert.equal(spoofMe.status,401);

// 登出后会话失效
const logout=await data(await post('/api/auth/logout',{},standaloneEnv,{Cookie:loginCookie}));
assert.equal(logout.status,200);
assert(logout.headers.get('set-cookie').includes('Max-Age=0'));
assert.equal((await data(await get('/api/auth/me',standaloneEnv,{Cookie:loginCookie}))).status,401);

// 平台模式：认证接口未启用，平台头仍有效
assert.equal((await data(await get('/api/auth/me',platformEnv))).status,404);
assert.equal((await data(await post('/api/auth/login',{username:'x',password:'y'},platformEnv))).status,404);
const platformDraft=await data(await get('/api/draft',platformEnv,{'oai-authenticated-user-id':'alice'}));
assert.equal(platformDraft.status,200);

console.log('Passed: standalone auth register/login/logout/session, password hashing, platform-header isolation, draft persistence per account.');
