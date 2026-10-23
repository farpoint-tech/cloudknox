import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults,validateConfig,classify,parseProcesses} from '../core.mjs';

test('threshold boundaries and unknown measurement fail closed',()=>{
  assert.equal(classify(50,0,defaults),'normal');
  assert.equal(classify(20,0,defaults),'warning');
  assert.equal(classify(10,0,defaults),'critical');
  assert.equal(classify(90,40,defaults),'critical');
  assert.equal(classify(null,0,defaults),'unknown');
  assert.equal(classify(90,null,defaults),'unknown');
});
test('strict validation rejects unsafe ranges, types, patterns and missing keys',()=>{
  assert.deepEqual(validateConfig(defaults),defaults);
  for(const patch of [{interval:0},{interval:'10'},{interval:1.5},{critical_free_percent:20},{warn_swapfiles:40},{targets:['']},{targets:['a\nbc']},{targets:['work','work']},{notifications:'true'},{extra:1},{targets:[' xxxxxx']}]) assert.throws(()=>validateConfig({...defaults,...patch}));
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
