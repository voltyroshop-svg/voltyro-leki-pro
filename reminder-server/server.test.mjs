import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createScheduler,localReminderSlot,openReminders,reminderHttp,validatePlan} from './server.mjs';

const subscription={endpoint:'https://web.push.apple.com/mock-device',
  keys:{p256dh:Buffer.alloc(65,1).toString('base64url'),auth:Buffer.alloc(16,1).toString('base64url')}};
const plan=(overrides={})=>({subscription,hours:['08:00'],zone:'Europe/Warsaw',...overrides});

test('accepts only trusted push endpoints, valid clock zones and schedule times',()=>{
  assert.deepEqual(validatePlan(plan({hours:['09:50','08:00','08:00']})).hours,['08:00','09:50']);
  for(const endpoint of ['http://web.push.apple.com/test','https://web.push.apple.com.evil.test/test','https://localhost/test'])
    assert.throws(()=>validatePlan(plan({subscription:{...subscription,endpoint}})),{status:400});
  assert.throws(()=>validatePlan(plan({zone:'Unknown/Place'})),{status:400});
  assert.throws(()=>validatePlan(plan({hours:['25:00']})),{status:400});
});

test('server does not send the repeated autumn hour twice and skips the missing spring hour',async t=>{
  const store=openReminders(':memory:');
  t.after(()=>store.close());
  const sent=[];
  let now=Date.parse('2026-10-25T00:30:00Z');
  store.save('a',plan({hours:['02:30']}),now-20*60_000);
  const tick=createScheduler({store,clock:()=>now,send:async(_sub,payload)=>sent.push(payload)});
  assert.equal(localReminderSlot(now,'Europe/Warsaw').time,'02:30');
  await Promise.all([tick(),tick()]);
  now+=60*60_000;
  assert.equal(localReminderSlot(now,'Europe/Warsaw').time,'02:30');
  await tick();
  assert.deepEqual(sent,[{type:'reminder',tag:'2026-10-25T02:30'}]);
  now=Date.parse('2027-03-28T01:30:00Z');
  store.save('a',plan({hours:['02:30']}),now-20*60_000);
  await tick();
  assert.equal(sent.length,1);
});

test('schedule change, persistent test, rate limit, restart and cancellation via HTTP',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'voltyro-reminders-'));
  let store=openReminders(join(dir,'reminders.sqlite'));
  const origin='https://voltyroshop-svg.github.io';
  let now=Date.parse('2026-11-23T06:57:00Z');
  const server=reminderHttp({store,origin,publicKey:'test-key',clock:()=>now});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.close();store.close();rmSync(dir,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const call=(path,method,data,custom={})=>fetch(base+path,{method,headers:{origin,Authorization:'Bearer '+'a'.repeat(64),
    'Content-Type':'application/json',...custom},...(data?{body:JSON.stringify(data)}:{})});
  assert.equal((await call('/config','GET',undefined,{origin:'https://other.invalid'})).status,403);
  assert.equal((await call('/config','GET')).headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await call('/device','PUT',plan(),{Authorization:''})).status,401);
  assert.equal((await call('/device','PUT',plan())).status,200);
  assert.equal((await call('/device','PUT',plan({hours:['08:10']}))).status,200);
  assert.equal((await call('/test','POST')).status,202);
  assert.equal((await call('/test','POST')).status,429);
  const sent=[];
  const send=async(_sub,payload)=>sent.push(payload);
  const first=createScheduler({store,clock:()=>now,send});
  now+=119_999;
  await first();
  assert.equal(sent.length,0);
  now+=1;
  await first();
  assert.equal(sent.length,1);
  assert.equal(sent[0].type,'test');
  now=Date.parse('2026-11-23T07:00:00Z');
  await first();
  assert.equal(sent.length,1);
  now=Date.parse('2026-11-23T07:10:00Z');
  await first();
  const reopened=openReminders(join(dir,'reminders.sqlite'));
  await createScheduler({store:reopened,clock:()=>now,send})();
  reopened.close();
  assert.equal(sent.filter(x=>x.type==='reminder').length,1);
  assert.equal((await call('/device','DELETE')).status,200);
  now+=24*60*60_000;
  await first();
  assert.equal(sent.length,2);
});

test('known-expired subscription is removed after a Web Push 410',async t=>{
  const store=openReminders(':memory:');
  t.after(()=>store.close());
  const now=Date.parse('2026-11-23T07:00:25Z');
  store.save('a',plan(),now-60000);
  await createScheduler({store,clock:()=>now,send:async()=>{throw Object.assign(Error(),{statusCode:410});}})();
  assert.equal(store.get('a'),undefined);
  assert.throws(()=>store.save('a',plan(),now+60_000),{status:410});
});
