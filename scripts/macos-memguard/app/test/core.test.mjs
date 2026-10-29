import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validateConfig,classify,parseProcesses,parsePreview} from '../core.mjs';

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
