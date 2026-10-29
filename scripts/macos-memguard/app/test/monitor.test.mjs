import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,mkdir,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaults} from '../core.mjs';
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
  await assert.rejects(run(['run']),/Monitor lock exists/);
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
