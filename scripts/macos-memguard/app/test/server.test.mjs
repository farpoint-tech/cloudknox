import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {defaults} from '../core.mjs';
import {get as httpGet} from 'node:http';
const fixture=async(file,args)=>{
  if(args.includes('kern.memorystatus_level'))return '50';
  if(args.includes('hw.memsize'))return String(32*1024**3);
  if(args.includes('vm.swapusage'))return 'vm.swapusage: total = 1024.00M used = 123.00M free = 901.00M';
  if(file==='/bin/ps')return `123 ${process.getuid()} 2048 /private/test/worker --token=SECRET`;
  throw Error('Unavailable');
};
async function setup(t,sampleCommand=fixture){
  const home=await mkdtemp(join(tmpdir(),'memguard-test-'));
  const app=await createApp({home,sampleCommand,testMode:true});
  t.after(async()=>{await app.close();await rm(home,{recursive:true,force:true});});
  const get=async(path)=>{const r=await fetch(app.url+path);return {status:r.status,data:await r.json()};};
  const token=(await get('/api/session')).data.token;
  const post=async(path,data,headers={})=>{const r=await fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:app.url,'X-Memguard-Token':token,...headers},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
  return {home,app,get,post};
}
test('live API returns metrics without raw command lines; export redacts identities',async t=>{
  const {get}=await setup(t);const {data}=await get('/api/status');
  assert.deepEqual((await get('/api/health')).data,{app:'tech.farpoint.memguard.dashboard',version:'1.2.0'});
  assert.equal(data.state,'normal');assert.equal(data.free,50);assert.equal(data.swapUsedBytes,123*1024**2);assert.equal(data.agent.state,'stopped');
  assert.ok(!JSON.stringify(data).includes('SECRET'));
  const exported=(await get('/api/export')).data;
  assert.equal(exported.processes[0].pid,undefined);assert.equal(exported.processes[0].name,undefined);assert.equal(exported.config.path,undefined);
});
test('CSRF token, origin, host, explicit consent and HTTP method are enforced',async t=>{
  const {app,post}=await setup(t);
  assert.equal((await post('/api/pause',{confirm:true,paused:true,expected:false},{'X-Memguard-Token':'wrong'})).status,403);
  assert.equal((await post('/api/pause',{confirm:true,paused:true,expected:false},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post('/api/pause',{paused:true,expected:false})).status,400);
  const hostStatus=await new Promise((resolve,reject)=>{httpGet(app.url+'/api/session',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});
  assert.equal(hostStatus,403);
  assert.equal((await fetch(app.url+'/api/session',{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await fetch(app.url+'/api/pause',{method:'DELETE'})).status,405);
});
test('config readback, backups, optimistic conflict and invalid settings',async t=>{
  const {get,post,home}=await setup(t);
  const initial=(await get('/api/status')).data.config;
  const next={...defaults,interval:15,targets:['/test/worker']};
  const saved=await post('/api/config',{confirm:true,revision:initial.revision,config:next});
  assert.equal(saved.status,200);assert.deepEqual(saved.data.config.value,next);
  assert.deepEqual(JSON.parse(await readFile(join(home,'Library/Application Support/MemGuard/config.json'),'utf8')),next);
  assert.equal((await post('/api/config',{confirm:true,revision:initial.revision,config:defaults})).status,409);
  assert.equal((await post('/api/config',{confirm:true,revision:saved.data.config.revision,config:{...next,interval:0}})).status,400);
  const final=await post('/api/config',{confirm:true,revision:saved.data.config.revision,config:defaults});
  assert.equal(final.status,200);
  const backups=(await readdir(join(home,'Library/Application Support/MemGuard'))).filter(p=>p.includes('.backup-'));
  assert.equal(backups.length,1);
  assert.deepEqual(JSON.parse(await readFile(join(home,'Library/Application Support/MemGuard',backups[0]),'utf8')),next);
});
test('pause changes are confirmed, conflict checked and read back',async t=>{
  const {get,post}=await setup(t);
  assert.equal((await post('/api/pause',{confirm:true,paused:true,expected:false})).data.paused,true);
  assert.equal((await get('/api/status')).data.paused,true);
  assert.equal((await post('/api/pause',{confirm:true,paused:false,expected:false})).status,409);
  assert.equal((await post('/api/pause',{confirm:true,paused:false,expected:true})).data.paused,false);
});
test('measurement failures and malformed config are never healthy',async t=>{
  const {get,home}=await setup(t,async()=>{throw Error('Unavailable');});
  const status=(await get('/api/status')).data;
  assert.equal(status.state,'unknown');assert.equal(status.free,null);assert.ok(status.errors.length>=4);
  await mkdir(join(home,'Library/Application Support/MemGuard'),{recursive:true});
  await writeFile(join(home,'Library/Application Support/MemGuard/config.json'),'{broken');
  assert.match((await get('/api/status')).data.config.error,/JSON|Expected/);
});
test('test server cannot start real processes and static files have CSP',async t=>{
  const {get,post,app}=await setup(t);
  const revision=(await get('/api/status')).data.config.revision;
  assert.equal((await post('/api/monitor',{confirm:true,action:'start',revision})).status,409);
  const res=await fetch(app.url);
  assert.match(res.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  assert.match(await res.text(),/Speicher im Blick/);
  assert.equal((await fetch(app.url+'/../server.mjs')).status,404);
});
