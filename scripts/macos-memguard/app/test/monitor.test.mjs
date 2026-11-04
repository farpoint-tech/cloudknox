import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,mkdir,readdir,stat,utimes} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {defaults,parseHeartbeat,assessMonitor,targetsDigest} from '../core.mjs';
const exec=promisify(execFile);
const script=fileURLToPath(new URL('../../src/memguard',import.meta.url));
async function setup(t,patch={}){
  const root=await mkdtemp(join(tmpdir(),'memguard-shell-'));
  const config=join(root,'config.json');await writeFile(config,JSON.stringify({...defaults,notifications:false,terminate_grace_seconds:1,...patch}));
  const env={...process.env,MEMGUARD_CONFIG:config,MEMGUARD_LOG_DIR:join(root,'logs'),MEMGUARD_PAUSE_FILE:join(root,'pause'),MEMGUARD_FAKE_FREE:'5'};
  delete env.MEMGUARD_TARGETS;
  t.after(()=>rm(root,{recursive:true,force:true}));
  return {root,config,env,run:args=>exec('/bin/zsh',[script,...args],{env,timeout:10000})};
}
async function dummy(t){
  const marker='mg-test-'+Math.random().toString(36).slice(2);
  const child=spawn('/bin/sleep',['60'],{argv0:marker,stdio:'ignore'});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill();await exited;});
  await new Promise(resolve=>setTimeout(resolve,80));
  return {marker,child,exited};
}
test('monitor terminates only its explicitly selected disposable dummy',async t=>{
  const target=await dummy(t),other=await dummy(t);
  const {run,root}=await setup(t,{targets:[target.marker]});
  await run(['once']);
  assert.equal((await target.exited).signal,'SIGTERM');
  assert.equal(other.child.signalCode,null);
  assert.match(await readFile(join(root,'logs/memguard.log'),'utf8'),/CRITICAL/);
});
test('pause prevents signals even under critical pressure',async t=>{
  const target=await dummy(t);const {run,env}=await setup(t,{targets:[target.marker]});
  await writeFile(env.MEMGUARD_PAUSE_FILE,'');await run(['once']);
  assert.equal(target.child.signalCode,null);assert.equal(target.child.exitCode,null);
});
test('failed measurement never causes termination',async t=>{
  const target=await dummy(t);const {run,env,root}=await setup(t,{targets:[target.marker]});
  env.MEMGUARD_FAKE_FREE='unavailable';await run(['once']);
  assert.equal(target.child.signalCode,null);assert.match(await readFile(join(root,'logs/memguard.log'),'utf8'),/measurement unavailable/);
});
test('malformed and out-of-range configurations stop before action',async t=>{
  const {run,config}=await setup(t,{interval:0});
  await assert.rejects(run(['once']),/thresholds out of range/);
  await writeFile(config,'{broken');await assert.rejects(run(['once']),/Invalid configuration/);
});
test('SIGKILL is suppressed if the process identity changes after TERM',async t=>{
  const {root,env}=await setup(t);
  const source=(await readFile(script,'utf8')).split('\ncase "${1:-status}"')[0];
  const harness=join(root,'identity-test.zsh');
  await writeFile(harness,source+String.raw`
load_cfg || exit 1
NOTIFY=false
GRACE=1
TARGETS=(test-target)
measure() { FREE=5; SWAPFILES=0; }
find_targets() { printf '765432\ttest-target\n'; }
top_apps() { print test; }
safe_target() { return 0; }
identity() { if [[ -f "$MEMGUARD_LOG_DIR/termed" ]]; then print changed; else print original; fi; }
kill() { mkdir -p "$MEMGUARD_LOG_DIR"; print -r -- "$*" >> "$MEMGUARD_LOG_DIR/signals"; [[ "$1" == -TERM ]] && touch "$MEMGUARD_LOG_DIR/termed"; return 0; }
step
`);
  await exec('/bin/zsh',[harness],{env,timeout:10000});
  const signals=await readFile(join(root,'logs/signals'),'utf8');
  assert.match(signals,/-TERM 765432/);assert.doesNotMatch(signals,/-KILL/);
});
test('second monitor refuses an existing lock',async t=>{
  const {root,run}=await setup(t);
  await mkdir(join(root,'logs/monitor.lock'),{recursive:true});
  // A fresh lock without an owner is still refused; the message names the reason.
  await assert.rejects(run(['run']),/being created by another instance/);
});

for(const scenario of ['persistent','recovered','paused']) {
  test(`escalation rechecks pressure and pause: ${scenario}`,async t=>{
    const {root,env}=await setup(t);
    const source=(await readFile(script,'utf8')).split('\ncase "${1:-status}"')[0];
    const harness=join(root,'escalation.zsh');
    const injected=scenario==='recovered'?'FREE=90':scenario==='paused'?'touch "$PAUSE_FILE"':'FREE=5';
    await writeFile(harness,source+String.raw`
load_cfg || exit 1
NOTIFY=false
GRACE=1
TARGETS=(test-target)
measure() { FREE=5; SWAPFILES=0; if [[ -f "$MEMGUARD_LOG_DIR/termed" ]]; then `+injected+String.raw`; fi; }
find_targets() { printf '765432\ttest-target\n'; }
top_apps() { print test; }
safe_target() { return 0; }
identity() { print unchanged; }
kill() { mkdir -p "$MEMGUARD_LOG_DIR"; print -r -- "$*" >> "$MEMGUARD_LOG_DIR/signals"; [[ "$1" == -TERM ]] && touch "$MEMGUARD_LOG_DIR/termed"; return 0; }
step
`);
    await exec('/bin/zsh',[harness],{env,timeout:10000});
    const signals=await readFile(join(root,'logs/signals'),'utf8');
    assert.match(signals,/-TERM 765432/);
    if(scenario==='persistent') assert.match(signals,/-KILL 765432/);
    else assert.doesNotMatch(signals,/-KILL/);
  });
}

test('monitor rejects its own process and ancestors even for matching targets',async t=>{
  const {root,env}=await setup(t);
  const source=(await readFile(script,'utf8')).split('\ncase "${1:-status}"')[0];
  const harness=join(root,'ancestor.zsh');
  await writeFile(harness,source+'\nTARGETS=(zsh node)\nif safe_target "$$"; then exit 21; fi\nif safe_target "$PPID"; then exit 22; fi\nprint protected\n');
  const {stdout}=await exec('/bin/zsh',[harness],{env,timeout:10000});assert.match(stdout,/protected/);
});

test('notification payloads are unique private data, not interpolated AppleScript',async t=>{
  const {root,env}=await setup(t);
  const app=join(root,'MemGuard.app');await mkdir(app);
  const capture=join(root,'captured.plist');
  const source=(await readFile(script,'utf8')).split('\ncase "${1:-status}"')[0];
  const harness=join(root,'notification.zsh');
  await writeFile(harness,source+'\nNOTIFY=true\ndeliver_notification() { cp "$2" "$MEMGUARD_CAPTURE"; }\nnotify "$MEMGUARD_TEST_TITLE" "$MEMGUARD_TEST_BODY"\nnotify "$MEMGUARD_TEST_TITLE" "$MEMGUARD_TEST_BODY"\n');
  const title='MemGuard "quoted"';
  const body='Quotes " and \\ backslash; $(touch SHOULD_NOT_EXIST)\nUnicode: Größe.';
  await exec('/bin/zsh',[harness],{env:{...env,MEMGUARD_NOTIFICATION_APP:app,MEMGUARD_CAPTURE:capture,MEMGUARD_TEST_TITLE:title,MEMGUARD_TEST_BODY:body},timeout:10000});
  assert.equal((await exec('/usr/bin/plutil',['-extract','title','raw','-o','-',capture])).stdout.trimEnd(),title);
  assert.equal((await exec('/usr/bin/plutil',['-extract','body','raw','-o','-',capture])).stdout.trimEnd(),body);
  const notificationDir=join(root,'logs/notifications');const payloads=await readdir(notificationDir);
  assert.equal(payloads.length,2);assert.notEqual(payloads[0],payloads[1]);
  assert.equal((await stat(notificationDir)).mode&0o777,0o700);
  for(const payload of payloads) assert.equal((await stat(join(notificationDir,payload))).mode&0o777,0o600);
});
// MG-04: preview lists every match with its decision and never sends a signal.
const previewRows=out=>out.stdout.trim().split('\n').filter(Boolean).map(l=>{const [status,pid,name,pattern]=l.split('\t');return {status,pid:Number(pid),name,pattern};});
test('preview lists a broad pattern match per process and sends no signal',async t=>{
  const a=await dummy(t),b=await dummy(t);
  const prefix='mg-test-';
  const {run,config}=await setup(t,{targets:[prefix]});
  const rows=previewRows(await run(['preview',config,'1']));
  for(const d of [a,b]){const row=rows.find(r=>r.pid===d.child.pid);assert.ok(row,'dummy listed');assert.equal(row.status,'match');assert.equal(row.pattern,prefix);}
  assert.equal(a.child.signalCode,null);assert.equal(b.child.signalCode,null);
  assert.equal(a.child.exitCode,null);assert.equal(b.child.exitCode,null);
});
test('preview without any match prints nothing and succeeds',async t=>{
  const {run,config}=await setup(t,{targets:['zz-no-such-process-'+Math.random().toString(36).slice(2)]});
  const out=await run(['preview',config,'1']);
  assert.equal(out.stdout.trim(),'');
});
test('preview excludes the running monitor and its ancestors',async t=>{
  const marker='mg-test-'+Math.random().toString(36).slice(2);
  const parent=spawn('/bin/sh',['-c','/bin/sleep 60; :'],{argv0:marker,stdio:'ignore'});
  const exited=new Promise(resolve=>parent.once('exit',resolve));
  t.after(async()=>{if(parent.exitCode===null&&parent.signalCode===null)parent.kill();await exited;});
  await new Promise(resolve=>setTimeout(resolve,150));
  const child=(await exec('/usr/bin/pgrep',['-P',String(parent.pid)])).stdout.trim().split('\n')[0];
  const {run,config}=await setup(t,{targets:[marker]});
  const rows=previewRows(await run(['preview',config,child]));
  assert.equal(rows.find(r=>r.pid===parent.pid)?.status,'ancestor');
  assert.equal(parent.signalCode,null);
  const free=previewRows(await run(['preview',config,'1']));
  assert.equal(free.find(r=>r.pid===parent.pid)?.status,'match','without a monitor the same process would be signalled');
});
test('preview reports a process that vanished between listing and evaluation',async t=>{
  const target=await dummy(t);
  const {config,env,root}=await setup(t,{targets:[target.marker]});
  const ready=join(root,'listed');
  const pending=exec('/bin/zsh',[script,'preview',config,'1'],{env:{...env,MEMGUARD_TEST_PREVIEW_DELAY:'5',MEMGUARD_TEST_PREVIEW_READY:ready},timeout:20000});
  // Kill the dummy only after the preview has listed it; no timing guess.
  for(let i=0;i<300;i++){try{await stat(ready);break;}catch{await new Promise(resolve=>setTimeout(resolve,50));}}
  await stat(ready);
  target.child.kill();await target.exited;
  const rows=previewRows(await pending);
  assert.deepEqual(rows.map(r=>[r.pid,r.status]),[[target.child.pid,'gone']]);
});
test('signal path and preview share one decision: memguard commands stay excluded',async t=>{
  const {run,config}=await setup(t,{targets:['memguard']});
  const rows=previewRows(await run(['preview',config,'1']));
  assert.ok(rows.every(r=>r.status!=='match'),'no process whose command contains memguard may be a match');
});
// Single-instance lock lifecycle. A stale lock must never keep the protection off.
const until=async(check,ms=15000)=>{const end=Date.now()+ms;for(;;){const v=await check();if(v)return v;if(Date.now()>end)throw Error('timeout waiting for condition');await new Promise(resolve=>setTimeout(resolve,50));}};
const present=async path=>{try{await stat(path);return true;}catch{return false;}};
async function startMonitor(t,env,extra={}){
  const child=spawn('/bin/zsh',[script,'run'],{env:{...env,MEMGUARD_FAKE_FREE:'100',...extra},stdio:['ignore','ignore','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
  const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})));
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await exited;});
  return {child,exited,stderr:()=>stderr};
}
const lockPid=async root=>Number((await readFile(join(root,'logs/monitor.lock/pid'),'utf8')).trim());
const monitorReady=async(root,child)=>until(async()=>{try{return await lockPid(root)===child.pid;}catch{return false;}});
test('monitor removes its lock on a normal stop and starts again',async t=>{
  const {root,env}=await setup(t,{interval:2});
  const first=await startMonitor(t,env);await monitorReady(root,first.child);
  first.child.kill('SIGTERM');await first.exited;
  assert.equal(await present(join(root,'logs/monitor.lock')),false,'lock removed by the EXIT trap');
  assert.ok(!first.stderr().includes('not set'),first.stderr());
  const second=await startMonitor(t,env);await monitorReady(root,second.child);
  assert.equal(second.child.exitCode,null,'second start is running');
  second.child.kill('SIGTERM');await second.exited;
});
test('a lock left by a killed monitor is taken over',async t=>{
  const {root,env}=await setup(t,{interval:2});
  const first=await startMonitor(t,env);await monitorReady(root,first.child);
  first.child.kill('SIGKILL');await first.exited;
  assert.equal(await present(join(root,'logs/monitor.lock')),true,'SIGKILL cannot clean up, as after a crash or reboot');
  const second=await startMonitor(t,env);await monitorReady(root,second.child);
  assert.match(second.stderr(),/stale monitor lock/);
  assert.equal(second.child.exitCode,null);
  second.child.kill('SIGTERM');await second.exited;
});
test('a second instance does not start while a monitor is running',async t=>{
  const {root,env}=await setup(t,{interval:2});
  const first=await startMonitor(t,env);await monitorReady(root,first.child);
  const second=await startMonitor(t,env);const result=await second.exited;
  assert.equal(result.code,1);assert.match(second.stderr(),/already running/);
  assert.equal(first.child.exitCode,null,'first monitor keeps running');assert.equal(await lockPid(root),first.child.pid);
  first.child.kill('SIGTERM');await first.exited;
});
test('a lock without an owner PID is respected while fresh and replaced when old',async t=>{
  const {root,env}=await setup(t,{interval:2});
  const lock=join(root,'logs/monitor.lock');await mkdir(lock,{recursive:true});
  const fresh=await startMonitor(t,env);const refused=await fresh.exited;
  assert.equal(refused.code,1);assert.match(fresh.stderr(),/being created/);assert.equal(await present(lock),true,'fresh lock untouched');
  const old=new Date(Date.now()-60000);await utimes(lock,old,old);
  const taken=await startMonitor(t,env);await monitorReady(root,taken.child);
  assert.match(taken.stderr(),/stale monitor lock/);
  taken.child.kill('SIGTERM');await taken.exited;
});
test('a lock whose PID now belongs to another program is stale',async t=>{
  const {root,env}=await setup(t,{interval:2});
  const other=await dummy(t);
  const lock=join(root,'logs/monitor.lock');await mkdir(lock,{recursive:true});await writeFile(join(lock,'pid'),String(other.child.pid));
  const monitor=await startMonitor(t,env);await monitorReady(root,monitor.child);
  assert.match(monitor.stderr(),/stale monitor lock/);assert.equal(other.child.signalCode,null,'the unrelated program is never touched');
  monitor.child.kill('SIGTERM');await monitor.exited;
});

test('a stop request is not lost while the monitor is starting',async t=>{
  // A SIGTERM that lands while the shell forks a command substitution used to be run by that child
  // only, so the monitor kept running. Traced runs are slow enough to hit this window often:
  // against the old script 48 of 150 such stops were lost, so twelve rounds fail it almost surely.
  const {root,env}=await setup(t,{interval:2});
  for(let round=1;round<=12;round++){
    const child=spawn('/bin/zsh',['-x',script,'run'],{env:{...env,MEMGUARD_FAKE_FREE:'100'},stdio:['ignore','ignore','ignore']});
    const exited=new Promise(resolve=>child.once('exit',()=>resolve('exited')));
    t.after(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');});
    // Poll tightly: the window is a few milliseconds right after the lock appears.
    for(let tries=0;tries<5000;tries++){try{if(await lockPid(root)===child.pid)break;}catch{}await new Promise(resolve=>setTimeout(resolve,2));}
    child.kill('SIGTERM');
    const outcome=await Promise.race([exited,new Promise(resolve=>setTimeout(()=>resolve('still running'),6000))]);
    assert.equal(outcome,'exited',`round ${round}: SIGTERM right after the lock appeared was lost`);
  }
});

// MG-05: the zsh monitor writes the heartbeat, the Node code reads and judges it.
const sha=text=>createHash('sha256').update(text).digest('hex');
const readBeat=async root=>{try{const r=parseHeartbeat(await readFile(join(root,'logs/heartbeat.json'),'utf8'));return r.ok?r.value:null;}catch{return null;}};
const processArgs=async pid=>{try{return (await exec('/bin/ps',['-p',String(pid),'-o','args='])).stdout.trim();}catch{return null;}};
const scriptVersion=async()=>(await readFile(script,'utf8')).match(/^VERSION="([^"]+)"/m)[1];
test('monitor heartbeat carries version, PID, loaded revision and effective values, and disappears on stop',async t=>{
  const targets=['~/mg-heartbeat-test/'];
  const {root,env,config}=await setup(t,{interval:2,targets});
  const monitor=await startMonitor(t,env);
  const beat=await until(async()=>{const b=await readBeat(root);return b&&b.measurement==='ok'?b:null;});
  assert.equal(beat.version,await scriptVersion());assert.equal(beat.pid,monitor.child.pid);assert.equal(beat.measurement,'ok');assert.equal(beat.paused,false);
  assert.equal(beat.config.path,config);
  assert.equal(beat.config.revision,sha(`${config}\n${await readFile(config,'utf8')}`),'zsh and Node compute the same revision');
  assert.deepEqual(beat.effective,{interval:2,warnFreePercent:20,criticalFreePercent:10,warnSwapfiles:50,criticalSwapfiles:65,targetCount:1,targetsDigest:targetsDigest(targets,process.env.HOME)});
  assert.ok(beat.validForSeconds>=3*2,'declares a validity window longer than a few cycles');
  const verdict=assessMonitor({heartbeat:beat,nowSeconds:Math.floor(Date.now()/1000),processArgs:await processArgs(beat.pid)});
  assert.equal(verdict.state,'active',JSON.stringify(verdict));
  const first=beat.time;await until(async()=>(await readBeat(root))?.time>first);
  monitor.child.kill('SIGTERM');await monitor.exited;
  assert.equal(await present(join(root,'logs/heartbeat.json')),false,'a clean stop removes the heartbeat');
  assert.equal(await present(join(root,'logs/monitor.lock')),false);
});
test('monitor loads a changed configuration only at its next reload and reports exactly that',async t=>{
  const {root,env,config}=await setup(t,{interval:2});
  const edit=async patch=>{const next={...JSON.parse(await readFile(config,'utf8')),...patch};await writeFile(config,JSON.stringify(next));return next;};
  const slow=await startMonitor(t,env);
  const before=await until(()=>readBeat(root));
  await edit({warn_free_percent:25});
  const afterWrite=before.time;await until(async()=>(await readBeat(root))?.time>afterWrite);
  const still=await readBeat(root);
  assert.equal(still.config.revision,before.config.revision,'saved is not loaded: the monitor reloads every 30 cycles');
  assert.equal(still.effective.warnFreePercent,20);
  assert.notEqual(sha(`${config}\n${await readFile(config,'utf8')}`),still.config.revision,'the file on disk has moved on');
  slow.child.kill('SIGTERM');await slow.exited;
  const fast=await startMonitor(t,env,{MEMGUARD_TEST_RELOAD_EVERY:'1'});
  const start=await until(()=>readBeat(root));assert.equal(start.effective.warnFreePercent,25);
  await edit({warn_free_percent:30,critical_free_percent:5});
  const reloaded=await until(async()=>{const b=await readBeat(root);return b?.effective.warnFreePercent===30?b:null;});
  assert.equal(reloaded.effective.criticalFreePercent,5);
  assert.equal(reloaded.config.revision,sha(`${config}\n${await readFile(config,'utf8')}`));
  assert.ok(reloaded.config.loadedAt>=start.config.loadedAt);assert.notEqual(reloaded.config.revision,start.config.revision);
  fast.child.kill('SIGTERM');await fast.exited;
});
test('a killed monitor leaves a heartbeat that is not trusted',async t=>{
  const {root,env}=await setup(t,{interval:2});
  const monitor=await startMonitor(t,env);const beat=await until(()=>readBeat(root));
  monitor.child.kill('SIGKILL');await monitor.exited;
  const left=await readBeat(root);assert.ok(left,'SIGKILL cannot clean up');
  const verdict=assessMonitor({heartbeat:left,nowSeconds:left.time+1,processArgs:await processArgs(left.pid)});
  assert.equal(verdict.state,'stale');assert.match(verdict.problems.join(' '),/läuft nicht mehr/);
  const hung=assessMonitor({heartbeat:left,nowSeconds:left.time+left.validForSeconds+1,processArgs:'/bin/zsh /x/memguard run'});
  assert.equal(hung.state,'stale','a hung monitor that is still a process stops being trusted when it stops reporting');
});
test('monitor reports a failed measurement instead of looking healthy',async t=>{
  const {root,env}=await setup(t,{interval:2});
  const monitor=await startMonitor(t,env,{MEMGUARD_FAKE_FREE:'not-a-number'});
  const beat=await until(async()=>{const b=await readBeat(root);return b&&b.measurement==='failed'?b:null;});
  assert.equal(beat.measurement,'failed');
  monitor.child.kill('SIGTERM');await monitor.exited;
});
