import test from 'node:test';
import assert from 'node:assert/strict';
import {openDashboard,probeDashboard,dashboardIdentity,dashboardVersion} from '../open-dashboard.mjs';
test('notification activation reuses an identified dashboard without a second server',async()=>{
  const opened=[];let starts=0;
  const url=await openDashboard({probe:async()=>true,start:async()=>starts++,openBrowser:async url=>opened.push(url)});
  assert.equal(starts,0);assert.deepEqual(opened,['http://127.0.0.1:8765']);assert.equal(url,opened[0]);
});
test('notification activation starts a stopped dashboard and waits before opening',async()=>{
  let probes=0,started=false;const opened=[];
  await openDashboard({port:9876,probe:async()=>++probes>2,start:async port=>{assert.equal(port,9876);started=true;},wait:async()=>{},openBrowser:async url=>{assert.ok(started);opened.push(url);}});
  assert.deepEqual(opened,['http://127.0.0.1:9876']);
});
test('unavailable or occupied port never opens an unrelated page',async()=>{
  let opened=false;
  await assert.rejects(openDashboard({probe:async()=>false,start:async()=>{},wait:async()=>{},attempts:2,openBrowser:async()=>{opened=true;}}),/nicht bereit/);
  assert.equal(opened,false);
});
test('health probe requires product identity, version, and HTTP success',async()=>{
  for(const body of [{app:'other',version:dashboardVersion},{app:dashboardIdentity,version:'old'}]) assert.equal(await probeDashboard('http://test',async()=>({ok:true,json:async()=>body})),false);
  assert.equal(await probeDashboard('http://test',async()=>({ok:true,json:async()=>({app:dashboardIdentity,version:dashboardVersion})})),true);
  assert.equal(await probeDashboard('http://test',async()=>{throw Error('refused');}),false);
});
