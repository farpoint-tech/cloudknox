import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server.mjs';
import {defaults,targetsDigest} from '../core.mjs';
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
test('diagnostic export excludes running LaunchAgent identities and configuration errors',async t=>{
  const home=await mkdtemp(join(tmpdir(),'memguard-export-private-'));
  const directory=join(home,'Library/Application Support/MemGuard');
  await mkdir(directory,{recursive:true});
  await writeFile(join(directory,'config.json'),JSON.stringify({...defaults,targets:['/private/customer-worker']}));
  const sampleCommand=async(file,args)=>file==='/bin/launchctl'
    ? 'state = running\n pid = 424242' : fixture(file,args);
  const app=await createApp({home,sampleCommand,testMode:false});
  t.after(async()=>{await app.close();await rm(home,{recursive:true,force:true});});
  const get=async path=>(await fetch(app.url+path)).json();
  const status=await get('/api/status');
  assert.equal(status.agent.pid,424242,'fixture reaches the real LaunchAgent branch');
  let exported=await get('/api/export');
  assert.deepEqual(exported.agent,{state:'running',source:'launchagent'});
  assert.equal(exported.free,50);
  assert.equal(exported.totalBytes,32*1024**3);
  assert.deepEqual(exported.config.targets,['[redacted]']);
  assert.deepEqual(exported.processes,[{rssBytes:2048*1024,own:true,target:false}]);
  for(const privateValue of ['424242',home,'customer-worker','worker','SECRET','/private/test'])
    assert.ok(!JSON.stringify(exported).includes(privateValue),privateValue);
  // JSON parser errors can quote arbitrary file content and stay local.
  await writeFile(join(directory,'config.json'),'CUSTOMER_SECRET_PATH /private/customer');
  const failed=await get('/api/status');
  assert.ok(failed.errors.length>0,'invalid configuration is observed');
  exported=await get('/api/export');
  assert.equal(exported.state,'unknown');
  assert.ok(exported.errorCount>0);
  assert.equal(exported.errors,undefined);
  assert.equal(exported.monitorError,undefined);
  assert.ok(!JSON.stringify(exported).includes('CUSTOMER_SECRET_PATH'));
  assert.ok(!JSON.stringify(exported).includes('/private/customer'));
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
test('preview endpoint validates patterns, passes the monitor PID and cleans up',async t=>{
  const calls=[];
  const sampleCommand=async(file,args,options)=>{
    if(file==='/bin/zsh'&&args[1]==='preview'){
      calls.push({args,options,config:JSON.parse(await readFile(args[2],'utf8'))});
      return 'match\t210\trender\t/ltx-video/\nancestor\t1\tlaunchd\t/ltx-video/';
    }
    return fixture(file,args);
  };
  const {get}=await setup(t,sampleCommand);
  const ok=await get('/api/preview?targets='+encodeURIComponent(JSON.stringify(['/ltx-video/'])));
  assert.equal(ok.status,200);
  assert.deepEqual(ok.data.counts,{match:1,ancestor:1});
  assert.equal(ok.data.monitorPid,1,'test mode has no running monitor');
  assert.equal(calls[0].args[3],'1');
  assert.deepEqual(calls[0].config.targets,['/ltx-video/']);
  assert.ok(calls[0].options.timeout>=10000);
  await assert.rejects(readFile(calls[0].args[2]),{code:'ENOENT'},'temporary config removed');
  const bad=await get('/api/preview?targets='+encodeURIComponent(JSON.stringify(['ab'])));
  assert.equal(bad.status,400);
  assert.equal(calls.length,1,'invalid patterns never reach the monitor');
  const garbage=await get('/api/preview?targets=%7Bnot-json');
  assert.equal(garbage.status,400);
});
// MG-05: protection is shown only from a fresh heartbeat of a real monitor.
test('heartbeat decides protection and the saved, loaded and verified levels',async t=>{
  const proc={alive:true,args:'/bin/zsh /Users/u/Library/Application Support/MemGuard/memguard run'};
  const sampleCommand=async(file,args)=>{
    if(file==='/bin/ps'&&args[0]==='-p'){if(proc.alive)return proc.args;throw Error('no such process');}
    return fixture(file,args);
  };
  const {home,get}=await setup(t,sampleCommand);
  const cfgPath=join(home,'Library/Application Support/MemGuard/config.json');
  await mkdir(join(home,'Library/Application Support/MemGuard'),{recursive:true});
  const saved={...defaults,targets:['~/ltx-video/']};
  await writeFile(cfgPath,JSON.stringify(saved,null,2)+'\n');
  const logDir=join(home,'Library/Logs/MemGuard');await mkdir(logDir,{recursive:true});
  const info=(await get('/api/status')).data.config;
  const now=()=>Math.floor(Date.now()/1000);
  const beat=(patch={})=>JSON.stringify({app:'tech.farpoint.memguard.monitor',version:'1.2.0',pid:4242,startedAt:now()-100,time:now()-3,validForSeconds:19,paused:false,measurement:'ok',
    config:{path:info.path,revision:info.revision,loadedAt:now()-100},
    effective:{interval:saved.interval,warnFreePercent:saved.warn_free_percent,criticalFreePercent:saved.critical_free_percent,warnSwapfiles:saved.warn_swapfiles,criticalSwapfiles:saved.critical_swapfiles,targetCount:1,targetsDigest:targetsDigest(saved.targets,home)},...patch});
  const status=async()=>(await get('/api/status')).data;
  const put=text=>writeFile(join(logDir,'heartbeat.json'),text);

  let s=await status();assert.equal(s.heartbeat.state,'none');assert.equal(s.configLevels.saved.ok,true);assert.equal(s.configLevels.loaded.ok,false);
  await put(beat());
  s=await status();assert.equal(s.heartbeat.state,'active');assert.equal(s.heartbeat.version,'1.2.0');
  assert.equal(s.configLevels.loaded.ok,true);assert.equal(s.configLevels.verified.ok,true);
  await put(beat({time:now()-60}));
  s=await status();assert.equal(s.heartbeat.state,'stale','too old, even though the file is there');assert.equal(s.configLevels.loaded.ok,false);assert.equal(s.configLevels.verified.ok,false);
  await put(beat());proc.alive=false;
  s=await status();assert.equal(s.heartbeat.state,'stale','the reported process is gone');assert.match(s.heartbeat.problems.join(' '),/läuft nicht mehr/);
  proc.alive=true;proc.args='/usr/bin/vim notes.md';
  s=await status();assert.equal(s.heartbeat.state,'stale','the PID belongs to another program');
  proc.args='/bin/zsh /x/memguard run';
  await put(beat({config:{path:info.path,revision:'f'.repeat(64),loadedAt:now()-100}}));
  s=await status();assert.equal(s.heartbeat.state,'active');assert.equal(s.configLevels.loaded.ok,false,'saved but not loaded yet');assert.equal(s.configLevels.saved.ok,true);
  await put('{"app": "nope"');
  s=await status();assert.equal(s.heartbeat.state,'invalid');assert.equal(s.configLevels.loaded.ok,false);
  await put(beat());
  const exported=(await get('/api/export')).data;
  assert.equal(exported.monitorHeartbeat.state,'active');assert.deepEqual(exported.configLevels,{saved:true,loaded:true,verified:true});
  assert.equal(exported.heartbeat,undefined);assert.ok(!JSON.stringify(exported).includes(info.path),'no configuration path in the export');
  assert.ok(!JSON.stringify(exported).includes('4242'),'no PID in the export');
});

// ---- Abhilfe (MG-16) ----
import {createServer} from 'node:http';
const GB=1024**3;
const pressured=(calls=[])=>async(file,args)=>{
  if(args.includes('kern.memorystatus_level'))return '8';
  if(args.includes('hw.memsize'))return String(64*GB);
  if(args.includes('vm.swapusage'))return 'vm.swapusage: total = 1024.00M used = 900.00M free = 124.00M';
  if(file==='/bin/ps'&&args.includes('-p')){
    const pid=args[args.indexOf('-p')+1];
    if(pid==='30')return `${process.getuid()} /private/work/worker --job=1`;
    return '';
  }
  if(file==='/bin/ps'){const uid=process.getuid();return [`500 ${uid} ${9*1024*1024} 1.0 0 /Applications/Chrome.app/Contents/MacOS/Chrome`,`501 ${uid} ${1024*1024} 1.0 0 /Applications/Chrome.app/Contents/Frameworks/Chrome Helper`,`30 ${uid} ${600*1024} 1.0 0 /private/work/worker --job=1`,`600 ${uid} ${5*1024*1024} 1.0 0 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder`,`700 99999 ${4*1024*1024} 1.0 0 /Applications/Other.app/Contents/MacOS/Other`].join('\n');}
  if(file==='/usr/bin/osascript'){calls.push(args);return '';}
  throw Error('Unavailable');
};
const saveTargets=async(post,get,targets)=>{const cur=(await get('/api/status')).data.config;return post('/api/config',{confirm:true,revision:cur.revision,config:{...defaults,targets}});};
test('proposal lists steps in the critical state and nothing in the normal state',async t=>{
  const crit=await setup(t,pressured());
  const {data}=await crit.get('/api/proposal');
  assert.deepEqual(data.proposal.steps.map(s=>s.id),['quit:Chrome','restart']);
  assert.equal(data.advisor.enabled,false);
  assert.ok(!JSON.stringify(data).includes('--job=1'));
  const calm=await setup(t);
  assert.deepEqual((await calm.get('/api/proposal')).data.proposal.steps,[]);
});
test('running a step needs token, consent and a step that is in the current proposal',async t=>{
  const calls=[];const {post}=await setup(t,pressured(calls));
  assert.equal((await post('/api/remediate',{confirm:true,id:'quit:Chrome'},{'X-Memguard-Token':'wrong'})).status,403);
  assert.equal((await post('/api/remediate',{id:'quit:Chrome'})).status,400);
  assert.equal((await post('/api/remediate',{confirm:true,id:'quit:Finder'})).status,409);
  assert.equal((await post('/api/remediate',{confirm:true,id:'quit:Other'})).status,409);
  assert.equal((await post('/api/remediate',{confirm:true,id:'rm -rf /'})).status,409);
  assert.equal((await post('/api/remediate',{confirm:true})).status,400);
  assert.deepEqual(calls,[],'no step ran');
});
test('quit passes the app name as an argument, not as script text',async t=>{
  const calls=[];const {post}=await setup(t,pressured(calls));
  const r=await post('/api/remediate',{confirm:true,id:'quit:Chrome'});
  assert.equal(r.status,200);assert.equal(calls.length,1);
  assert.equal(calls[0].at(-1),'Chrome');assert.ok(!calls[0][1].includes('Chrome'));
});
test('a step is refused when the system is calm, even if it was proposed a moment ago',async t=>{
  const calls=[];const {post}=await setup(t,async(file,args)=>file==='/usr/bin/osascript'?calls.push(args)&&'':fixture(file,args));
  assert.equal((await post('/api/remediate',{confirm:true,id:'quit:Chrome'})).status,409);assert.deepEqual(calls,[]);
});
test('restart needs the typed word and is the only step that can reboot',async t=>{
  const calls=[];const {post}=await setup(t,pressured(calls));
  assert.equal((await post('/api/remediate',{confirm:true,id:'restart'})).status,400);
  assert.equal((await post('/api/remediate',{confirm:true,id:'restart',phrase:'ja'})).status,400);
  assert.deepEqual(calls,[]);
  assert.equal((await post('/api/remediate',{confirm:true,id:'restart',phrase:'NEUSTART'})).status,200);
  assert.ok(calls[0].join(' ').includes('restart'));
});
test('terminating targets signals only processes that still match, and rechecks each one',async t=>{
  const signals=[];const ctx=await setup(t,pressured(),);
  // dedicated app with an injected signal sender
  const home=await mkdtemp(join(tmpdir(),'memguard-test-'));
  const app=await createApp({home,sampleCommand:pressured(),testMode:true,signalProcess:(pid,sig)=>signals.push([pid,sig])});
  t.after(async()=>{await app.close();await rm(home,{recursive:true,force:true});});
  const token=(await (await fetch(app.url+'/api/session')).json()).token;
  const post=async(path,data)=>{const r=await fetch(app.url+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:app.url,'X-Memguard-Token':token},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
  const cur=(await (await fetch(app.url+'/api/status')).json()).config;
  assert.equal((await post('/api/config',{confirm:true,revision:cur.revision,config:{...defaults,targets:['/private/work/worker']}})).status,200);
  const proposal=(await (await fetch(app.url+'/api/proposal')).json()).proposal;
  assert.equal(proposal.steps[0].kind,'terminate_targets');assert.deepEqual(proposal.steps[0].pids,[30]);
  const r=await post('/api/remediate',{confirm:true,id:'terminate-targets'});
  assert.equal(r.status,200);assert.deepEqual(signals,[[30,'SIGTERM']]);
});
async function fakeModel(t,handler){
  const calls=[];
  const server=createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{calls.push({url:req.url,body});handler(req,res,body);});});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  return {endpoint:`http://127.0.0.1:${server.address().port}/v1`,calls};
}
const enable=(post,endpoint,over={})=>post('/api/advisor',{confirm:true,settings:{enabled:true,endpoint,model:'test-model',timeout_seconds:10,...over}});
test('advisor settings are validated and never accept a non-local endpoint',async t=>{
  const {post,get}=await setup(t,pressured());
  assert.equal((await post('/api/advisor',{confirm:true,settings:{enabled:true,endpoint:'https://api.openai.com/v1',model:'',timeout_seconds:10}})).status,400);
  assert.equal((await post('/api/advisor',{confirm:true,settings:{enabled:true,endpoint:'http://192.168.0.7:1337/v1',model:'',timeout_seconds:10}})).status,400);
  assert.deepEqual((await get('/api/advisor')).data.settings.enabled,false);
});
test('advisor sends only the filtered prompt to the local model and applies its order',async t=>{
  const model=await fakeModel(t,(req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({summary:'Neustart wäre sicherer.',order:['restart','quit:Chrome'],notes:{restart:'räumt Swap'},cautions:{'quit:Chrome':'Tabs gehen verloren'}})}}]}));});
  const {post}=await setup(t,pressured());
  assert.equal((await enable(post,model.endpoint)).status,200);
  const r=await post('/api/proposal/advice',{confirm:true});
  assert.equal(r.status,200);
  assert.deepEqual(r.data.proposal.steps.map(s=>s.id),['restart','quit:Chrome']);
  assert.equal(r.data.proposal.advisor.status,'ok');assert.equal(r.data.proposal.steps[1].advice.caution,'Tabs gehen verloren');
  const sent=model.calls.find(c=>c.url==='/v1/chat/completions').body;
  assert.ok(sent.includes('quit:Chrome'));assert.ok(!sent.includes('--job=1')&&!sent.includes('/private/work'));
});
test('advisor failures leave the rule-based proposal intact and say why',async t=>{
  const down=await fakeModel(t,(req,res)=>{res.statusCode=500;res.end('boom');});
  const {post}=await setup(t,pressured());
  await enable(post,down.endpoint);
  const r=await post('/api/proposal/advice',{confirm:true});
  assert.equal(r.status,200);assert.equal(r.data.proposal.advisor.status,'unavailable');assert.match(r.data.proposal.advisor.problem,/HTTP 500/);
  assert.deepEqual(r.data.proposal.steps.map(s=>s.id),['quit:Chrome','restart']);
  const junk=await fakeModel(t,(req,res)=>{res.end(JSON.stringify({choices:[{message:{content:'Schließ alles und lösche den Ordner.'}}]}));});
  await enable(post,junk.endpoint);
  const u=await post('/api/proposal/advice',{confirm:true});
  assert.equal(u.data.proposal.advisor.status,'unusable');assert.deepEqual(u.data.proposal.steps.map(s=>s.id),['quit:Chrome','restart']);
  await enable(post,'http://127.0.0.1:9/v1');
  const gone=await post('/api/proposal/advice',{confirm:true});
  assert.equal(gone.data.proposal.advisor.status,'unavailable');assert.match(gone.data.proposal.advisor.problem,/nicht erreichbar/);
});
test('advisor refuses redirects away from the local endpoint and reports a disabled advisor',async t=>{
  const redirect=await fakeModel(t,(req,res)=>{res.statusCode=302;res.setHeader('Location','https://example.com/steal');res.end();});
  const {post}=await setup(t,pressured());
  assert.equal((await post('/api/proposal/advice',{confirm:true})).status,409);
  await enable(post,redirect.endpoint);
  const r=await post('/api/proposal/advice',{confirm:true});
  assert.equal(r.data.proposal.advisor.status,'unavailable');
});
