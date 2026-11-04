import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validateConfig,classify,parseProcesses,parsePreview,parseHeartbeat,assessMonitor,configLevels,targetsDigest,buildProposal,advisorDefaults,parseAdvisorEndpoint,validateAdvisor,advisorMessages,parseAdvisorReply,applyAdvice,cleanLabel} from '../core.mjs';

test('threshold boundaries and unknown measurement fail closed',()=>{
  assert.equal(classify(50,0,defaults),'normal');
  assert.equal(classify(20,0,defaults),'warning');
  assert.equal(classify(10,0,defaults),'critical');
  assert.equal(classify(90,65,defaults),'critical');
  assert.equal(classify(90,50,defaults),'warning');
  // MG-12: 20-22 swap files are normal on a 64 GB Mac and must not warn on their own.
  assert.equal(classify(90,22,defaults),'normal');
  assert.equal(classify(null,0,defaults),'unknown');
  assert.equal(classify(90,null,defaults),'unknown');
});
test('strict validation rejects unsafe ranges, types, patterns and missing keys',()=>{
  assert.deepEqual(validateConfig(defaults),defaults);
  for(const patch of [{interval:0},{interval:'10'},{interval:1.5},{critical_free_percent:20},{warn_swapfiles:65},{targets:['']},{targets:['a\nbc']},{targets:['work','work']},{notifications:'true'},{extra:1},{targets:[' xxxxxx']}]) assert.throws(()=>validateConfig({...defaults,...patch}));
  assert.throws(()=>validateConfig({}));
  assert.throws(()=>validateConfig(null));
});
test('process parser handles spaces, RSS and target ownership without returning secrets',()=>{
  const result=parseProcesses('123 501 2048 /Applications/My App.app/Contents/MacOS/worker --secret=TOPSECRET\n124 0 9000 /bin/worker\n125 501 4096 /usr/bin/memguard worker\ninvalid', ['worker'],501);
  assert.equal(result[0].pid,124);
  assert.equal(result[0].target,false);
  assert.equal(result.find(p=>p.pid===125).target,false);
  assert.equal(result.find(p=>p.pid===123).name,'My App');
  assert.equal(result.find(p=>p.pid===123).rssBytes,2097152);
  assert.equal(result.find(p=>p.pid===123).target,true);
  assert.ok(!JSON.stringify(result).includes('TOPSECRET'));
});
test('process parser reads CPU and nice when present and stays compatible without them',()=>{
  const result=parseProcesses('300 501 4096 260.9 0 /Applications/Claude.app/Contents/MacOS/Claude\n301 501 2048 0.0 -1 /usr/sbin/coreaudiod\n302 501 1024 /bin/old-format worker',[],501);
  const claude=result.find(p=>p.pid===300),audio=result.find(p=>p.pid===301),old=result.find(p=>p.pid===302);
  assert.equal(claude.name,'Claude');assert.equal(claude.cpuPercent,260.9);assert.equal(claude.nice,0);
  assert.equal(audio.cpuPercent,0);assert.equal(audio.nice,-1);assert.equal(audio.name,'coreaudiod');
  assert.equal(old.cpuPercent,null);assert.equal(old.nice,null);assert.equal(old.name,'old-format');
  assert.deepEqual(result.map(p=>p.pid),[300,301,302]);
});
test('preview parser keeps known decisions and drops malformed lines',()=>{
  const rows=parsePreview('match\t210\trender\t/ltx\nancestor\t1\tlaunchd\t/x\nbogus\t5\tx\ty\nmatch\tnotapid\tx\ty\n\ngone\t77\tworker\t/ltx');
  assert.deepEqual(rows,[{status:'match',pid:210,name:'render',pattern:'/ltx'},{status:'ancestor',pid:1,name:'launchd',pattern:'/x'},{status:'gone',pid:77,name:'worker',pattern:'/ltx'}]);
});
// ---- MG-05: heartbeat, monitor assessment, configuration levels ----
const hex=c=>c.repeat(64);
const hbRaw=(patch={})=>JSON.stringify({app:'tech.farpoint.memguard.monitor',version:'1.2.0',pid:4242,startedAt:1000,time:2000,validForSeconds:19,paused:false,measurement:'ok',
  config:{path:'/c/config.json',revision:hex('a'),loadedAt:1500},
  effective:{interval:10,warnFreePercent:20,criticalFreePercent:10,warnSwapfiles:50,criticalSwapfiles:65,targetCount:1,targetsDigest:targetsDigest(['~/x/'],'/home/u')},...patch});
const heartbeat=(patch={})=>{const r=parseHeartbeat(hbRaw(patch));assert.equal(r.ok,true,r.problem);return r.value;};
test('heartbeat parser accepts the monitor format and drops unknown fields',()=>{
  const r=parseHeartbeat(hbRaw({evil:'x',config:{path:'/c/config.json',revision:hex('a'),loadedAt:1500,extra:1}}));
  assert.equal(r.ok,true);assert.equal(r.value.pid,4242);assert.ok(!('evil' in r.value));assert.ok(!('extra' in r.value.config));
});
test('heartbeat parser rejects foreign, malformed and oversized input',()=>{
  const patches=[{app:'someone.else'},{version:'1.2'},{pid:'4242'},{pid:1},{time:1.5},{validForSeconds:0},{paused:'no'},{measurement:'fine'},
    {config:{path:'/c',revision:'abc',loadedAt:1}},{config:{path:'x'.repeat(2000),revision:hex('a'),loadedAt:1}},{effective:{interval:10}},
    {effective:{interval:10,warnFreePercent:20,criticalFreePercent:10,warnSwapfiles:50,criticalSwapfiles:65,targetCount:1,targetsDigest:'nope'}}];
  for(const patch of patches) assert.equal(parseHeartbeat(hbRaw(patch)).ok,false,JSON.stringify(patch).slice(0,60));
  assert.equal(parseHeartbeat('{not json').ok,false);assert.equal(parseHeartbeat(null).ok,false);assert.equal(parseHeartbeat('x'.repeat(9000)).ok,false);
  for(const revision of [hex('b'),'none','unstable']) assert.equal(parseHeartbeat(hbRaw({config:{path:'/c',revision,loadedAt:1}})).ok,true,revision);
});
test('only a fresh heartbeat of a real memguard monitor counts as active',()=>{
  const args='/bin/zsh /Users/u/Library/Application Support/MemGuard/memguard run';
  const hb=heartbeat();
  const active=assessMonitor({heartbeat:hb,nowSeconds:2010,processArgs:args});
  assert.equal(active.state,'active');assert.equal(active.ageSeconds,10);assert.equal(active.version,'1.2.0');
  assert.equal(assessMonitor({heartbeat:hb,nowSeconds:2019,processArgs:args}).state,'active','exactly at the limit');
  const old=assessMonitor({heartbeat:hb,nowSeconds:2020,processArgs:args});assert.equal(old.state,'stale');assert.match(old.problems[0],/Rückmeldung/);
  const gone=assessMonitor({heartbeat:hb,nowSeconds:2005,processArgs:null});assert.equal(gone.state,'stale');assert.match(gone.problems.join(' '),/läuft nicht mehr/);
  for(const foreign of ['/usr/bin/vim notes.md','vim memguard running.md','/bin/zsh /x/memguard status','node server.mjs']) assert.equal(assessMonitor({heartbeat:hb,nowSeconds:2005,processArgs:foreign}).state,'stale',foreign);
  assert.equal(assessMonitor({heartbeat:hb,nowSeconds:1000,processArgs:args}).state,'invalid','timestamp far in the future');
  assert.equal(assessMonitor({heartbeat:heartbeat({startedAt:3000}),nowSeconds:3005,processArgs:args}).state,'invalid','started after it reported');
  assert.equal(assessMonitor({heartbeat:null,nowSeconds:2005}).state,'none');
  assert.equal(assessMonitor({heartbeat:null,parseProblem:'kaputt',nowSeconds:2005}).state,'invalid');
});
const savedConfig=(patch={})=>({revision:hex('a'),exists:true,path:'/c/config.json',value:{...defaults,targets:['~/x/']},...patch});
const activeMonitor=(hb=heartbeat())=>assessMonitor({heartbeat:hb,nowSeconds:2005,processArgs:'/bin/zsh /x/memguard run'});
const levels=(over={})=>{const hb=over.heartbeat??heartbeat();return configLevels({config:over.config??savedConfig(),monitor:over.monitor??activeMonitor(hb),heartbeat:hb,home:'/home/u'});};
test('configuration levels: saved, loaded and verified are separate claims',()=>{
  const all=levels();assert.equal(all.saved.ok,true);assert.equal(all.loaded.ok,true);assert.equal(all.verified.ok,true);assert.equal(all.loaded.loadedAt,1500);
  const none=levels({monitor:assessMonitor({heartbeat:null,nowSeconds:1}),heartbeat:null});
  assert.equal(none.saved.ok,true);assert.equal(none.loaded.ok,false);assert.equal(none.verified.ok,false);assert.match(none.loaded.reason,/Kein Monitor/);
  const stale=levels({monitor:assessMonitor({heartbeat:heartbeat(),nowSeconds:9999,processArgs:'/bin/zsh /x/memguard run'})});
  assert.equal(stale.loaded.ok,false);assert.match(stale.loaded.reason,/veraltet/);assert.equal(stale.verified.ok,false);
  const older=levels({config:savedConfig({revision:hex('b')})});
  assert.equal(older.saved.ok,true);assert.equal(older.loaded.ok,false);assert.match(older.loaded.reason,/älteren Fassung/);assert.equal(older.verified.ok,false);assert.match(older.verified.reason,/nach dem Laden/);
  assert.match(levels({config:savedConfig({path:'/other/config.json'})}).loaded.reason,/andere Konfigurationsdatei/);
  assert.match(levels({heartbeat:heartbeat({config:{path:'/c/config.json',revision:'unstable',loadedAt:1}})}).loaded.reason,/änderte sich/);
});
test('configuration levels: verified needs the same values and a working measurement',()=>{
  const patchEffective=patch=>heartbeat({effective:{interval:10,warnFreePercent:20,criticalFreePercent:10,warnSwapfiles:50,criticalSwapfiles:65,targetCount:1,targetsDigest:targetsDigest(['~/x/'],'/home/u'),...patch}});
  assert.match(levels({heartbeat:patchEffective({warnFreePercent:25})}).verified.reason,/freien Speicher/);
  assert.match(levels({heartbeat:patchEffective({criticalSwapfiles:40})}).verified.reason,/Swap-Dateien/);
  assert.match(levels({heartbeat:patchEffective({interval:30})}).verified.reason,/Prüfintervall/);
  assert.match(levels({heartbeat:patchEffective({targetCount:2})}).verified.reason,/Zielmuster/);
  assert.match(levels({heartbeat:patchEffective({targetsDigest:hex('c')})}).verified.reason,/Zielmuster/);
  assert.equal(levels({heartbeat:patchEffective({targetsDigest:targetsDigest(['~/x/'],'/other')})}).verified.ok,false,'a monitor with another home expands the same pattern to another path');
  assert.equal(levels({heartbeat:patchEffective({targetsDigest:targetsDigest(['/home/u/x/'],'/other')})}).verified.ok,true,'the same expanded path is the same target');
  const failed=levels({heartbeat:heartbeat({measurement:'failed'})});assert.equal(failed.loaded.ok,true);assert.equal(failed.verified.ok,false);assert.match(failed.verified.reason,/Messung/);
  assert.match(levels({heartbeat:heartbeat({measurement:'unknown'})}).verified.reason,/noch nicht gemessen/);
  assert.equal(levels({heartbeat:heartbeat({paused:true})}).verified.ok,true,'a pause is reported separately, it does not change what is configured');
});
test('configuration levels: no file means the monitor must report "none"; invalid config proves nothing',()=>{
  const defaultsHb=heartbeat({config:{path:'',revision:'none',loadedAt:1500},effective:{interval:10,warnFreePercent:20,criticalFreePercent:10,warnSwapfiles:50,criticalSwapfiles:65,targetCount:0,targetsDigest:targetsDigest([],'/home/u')}});
  const fileless=savedConfig({exists:false,revision:hex('f'),value:{...defaults}});
  assert.equal(levels({config:fileless,heartbeat:defaultsHb}).verified.ok,true);
  assert.equal(levels({config:fileless}).loaded.ok,false,'a monitor that read a file does not match "no file"');
  const broken=levels({config:{error:'kaputt',revision:null,exists:false,path:'/c',value:defaults}});
  assert.equal(broken.saved.ok,false);assert.equal(broken.loaded.ok,false);assert.equal(broken.verified.ok,false);
});

// ---- Abhilfe (MG-16) ----
const GB=1024**3;
const proc=(pid,name,gb,extra={})=>({pid,name,own:true,isApp:true,rssBytes:Math.round(gb*GB),target:false,...extra});
const sample=(state,processes,over={})=>({state,free:8,swapfiles:20,processes,config:defaults,...over});
test('normal and unknown states propose nothing, so nothing can be run in them',()=>{
  assert.deepEqual(buildProposal(sample('normal',[proc(1000,'Chrome',9)])).steps,[]);
  assert.deepEqual(buildProposal(sample('unknown',[proc(1000,'Chrome',9)])).steps,[]);
});
test('critical proposes the biggest own apps, least disruptive first, with the restart last',()=>{
  const p=buildProposal(sample('critical',[proc(10,'Chrome',9),proc(11,'Chrome',1),proc(12,'Slack',1.2),proc(13,'Tiny',0.1),proc(14,'Other',2,{own:false}),proc(15,'Finder',3)]));
  assert.deepEqual(p.steps.map(s=>s.id),['quit:Chrome','quit:Slack','restart']);
  assert.equal(p.steps[0].rssBytes,10*GB);assert.equal(p.steps[0].suggestedPattern,'/Chrome.app/');
  assert.equal(p.steps[2].risk,'high');
});
test('protected names, other users and the dashboard itself are never proposed',()=>{
  const p=buildProposal(sample('critical',[proc(1,'WindowServer',4),proc(2,'node',4),proc(3,'MemGuard',4),proc(4,'Secret',4,{own:false}),proc(5,'Own',4)]));
  assert.deepEqual(p.steps.map(s=>s.id),['quit:Own','restart']);
  const guarded=buildProposal({...sample('critical',[proc(5,'Own',4)]),protectedPids:[5]});
  assert.deepEqual(guarded.steps.map(s=>s.id),['restart']);
});
test('a pre-approved target step comes before a larger app of the same risk',()=>{
  const p=buildProposal(sample('critical',[proc(50,'worker',0.6,{target:true,isApp:false}),proc(51,'Chrome',9)]));
  assert.deepEqual(p.steps.map(s=>s.id),['terminate-targets','quit:Chrome','restart']);
});
test('configured targets get their own step; targets are not offered a second time as quit',()=>{
  const p=buildProposal(sample('critical',[proc(20,'worker',2,{target:true}),proc(21,'worker',2,{target:true}),proc(22,'Slack',1)]));
  assert.equal(p.steps[0].kind,'terminate_targets');assert.deepEqual(p.steps[0].pids,[20,21]);
  assert.ok(!p.steps.some(s=>s.id==='quit:worker'));assert.ok(p.steps.some(s=>s.id==='quit:Slack'));
});
test('swap files alone recommend a restart only from the warning threshold',()=>{
  assert.ok(!buildProposal(sample('warning',[],{swapfiles:49,free:60})).steps.some(s=>s.kind==='restart_mac'));
  assert.ok(buildProposal(sample('warning',[],{swapfiles:50,free:60})).steps.some(s=>s.kind==='restart_mac'));
  assert.ok(!buildProposal(sample('warning',[proc(1,'Slack',3)],{swapfiles:null,free:15})).steps.some(s=>s.kind==='restart_mac'));
});
test('a bare executable is never offered as an app to quit, however large',()=>{
  const p=buildProposal(sample('critical',[proc(40,'worker',4,{isApp:false}),proc(41,'Slack',2)]));
  assert.deepEqual(p.steps.map(s=>s.id),['quit:Slack','restart']);
  const uid=process.getuid(),parsed=parseProcesses(`7 ${uid} 1024 /usr/bin/thing --x\n8 ${uid} 1024 /Applications/Foo.app/Contents/MacOS/Foo`,[],uid);
  assert.deepEqual(Object.fromEntries(parsed.map(x=>[x.pid,x.isApp])),{7:false,8:true});
});
test('labels from foreign processes cannot carry markup or prompt text into steps',()=>{
  assert.equal(cleanLabel('Evil"; do shell script "x" <b>'),'Evil do shell script x b');
  const p=buildProposal(sample('critical',[proc(9,'<img onerror=1>',4)]));
  assert.ok(p.steps.every(s=>!/[<>"]/.test(s.id+s.title)));
});
test('advisor endpoint must be loopback; cloud hosts, credentials and odd forms are refused',()=>{
  for(const ok of ['http://127.0.0.1:1337/v1','http://localhost:11434/v1','http://[::1]:8080/v1','http://127.0.0.2/v1'])assert.doesNotThrow(()=>parseAdvisorEndpoint(ok),ok);
  for(const bad of ['https://api.openai.com/v1','http://192.168.1.5:1337/v1','http://127.0.0.1.evil.example/v1','http://127.0.0.999/v1','http://user:pw@127.0.0.1/v1','http://127.0.0.1/v1?key=1','ftp://127.0.0.1/v1','127.0.0.1','http://0.0.0.0:1337/v1','http://[::ffff:8.8.8.8]/v1'])assert.throws(()=>parseAdvisorEndpoint(bad),Error,bad);
});
test('advisor settings: disabled with no endpoint is valid; enabled needs a loopback endpoint',()=>{
  assert.doesNotThrow(()=>validateAdvisor({...advisorDefaults}));
  assert.throws(()=>validateAdvisor({...advisorDefaults,enabled:true}));
  assert.throws(()=>validateAdvisor({...advisorDefaults,enabled:true,endpoint:'https://api.example.com/v1'}));
  assert.doesNotThrow(()=>validateAdvisor({...advisorDefaults,enabled:true,endpoint:'http://127.0.0.1:1337/v1',model:'m',timeout_seconds:30}));
  assert.throws(()=>validateAdvisor({...advisorDefaults,extra:1}));
  assert.throws(()=>validateAdvisor({...advisorDefaults,timeout_seconds:2}));
});
test('the prompt carries names and sizes but no command lines or paths',()=>{
  const p=buildProposal(sample('critical',[proc(10,'Chrome',9,{cmd:'/Users/x/secret --token=SECRET'})]));
  const text=JSON.stringify(advisorMessages({free:8,swapfiles:20,totalBytes:64*GB,steps:p.steps}));
  assert.ok(text.includes('quit:Chrome'));assert.ok(!text.includes('SECRET')&&!text.includes('/Users/'));
});
test('advisor reply can only reorder and comment on existing steps',()=>{
  const p=buildProposal(sample('critical',[proc(10,'Chrome',9),proc(12,'Slack',2)]));
  const reply=parseAdvisorReply('```json\n'+JSON.stringify({summary:'Chrome zuerst.',order:['quit:Slack','quit:Chrome','rm -rf','quit:Slack'],notes:{'quit:Slack':'klein','delete:all':'x'},cautions:{restart:'noch nicht nötig'}})+'\n```',p.steps);
  assert.equal(reply.ok,true);assert.deepEqual(reply.order,['quit:Slack','quit:Chrome']);
  assert.deepEqual(Object.keys(reply.notes),['quit:Slack']);assert.deepEqual(Object.keys(reply.cautions),['restart']);
  const applied=applyAdvice(p,reply);
  assert.deepEqual(applied.steps.map(s=>s.id),['quit:Slack','quit:Chrome','restart']);
  assert.equal(applied.steps.length,p.steps.length,'nothing is added or removed');
  assert.equal(applied.steps[2].advice.caution,'noch nicht nötig');assert.equal(applied.advisor.status,'ok');
});
test('unusable advisor replies are reported, never guessed at',()=>{
  const p=buildProposal(sample('critical',[proc(10,'Chrome',9)]));
  for(const bad of ['','Ich empfehle Chrome.','[1,2]','{kaputt'])assert.equal(parseAdvisorReply(bad,p.steps).ok,false,bad);
  const empty=parseAdvisorReply('{"order":["nope"]}',p.steps);assert.equal(empty.ok,true);assert.deepEqual(empty.order,[]);
  assert.deepEqual(applyAdvice(p,empty).steps.map(s=>s.id),p.steps.map(s=>s.id));
});
