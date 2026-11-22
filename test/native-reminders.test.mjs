import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyReminderLimit,reminderPlan,testReminder,testReminderId,reconcileReminders} from '../native/reminders.js';
import {newRecordId} from '../data.js';

const medicine=(id,times,state='active')=>({id,state,name:'Próbny lek '+id,
  slots:times.map((time,index)=>({id:'slot-'+index,time}))});

test('plans multiple daily local-clock reminders for opted-in active medicines',()=>{
  const medicines=[medicine('a',['08:00','21:30']),medicine('b',['09:15']),medicine('c',['17:00'],'paused'),
    medicine('d',['21:00'],'archived'),medicine('e',['12:00'])];
  const selected=new Set(['a','b','c','d']);
  const {notifications,omitted}=reminderPlan(medicines,selected,'ios');
  assert.deepEqual(notifications.map(item=>item.schedule.on),
    [{hour:8,minute:0,second:0},{hour:9,minute:15,second:0},{hour:21,minute:30,second:0}]);
  assert.ok(notifications.every(item=>item.schedule.at===undefined&&item.schedule.allowWhileIdle));
  assert.equal(omitted,0);
  assert.equal(new Set(notifications.map(item=>item.id)).size,3);
  assert.deepEqual(reminderPlan([...medicines].reverse(),selected,'ios').notifications,notifications);
});

test('platform caps reserve room for a single independent test in two minutes',()=>{
  const medicines=Array.from({length:70},(_,index)=>medicine(String(index),['08:00']));
  const selected=new Set(medicines.map(row=>row.id));
  assert.equal(dailyReminderLimit('ios'),60);
  assert.equal(reminderPlan(medicines,selected,'ios').omitted,10);
  const android=reminderPlan(medicines,selected,'android');
  assert.equal(android.notifications.length,70);
  assert.ok(android.notifications.every(item=>item.channelId==='medicines'));
  const time=Date.UTC(2026,10,22);
  assert.equal(testReminder(time).schedule.at.getTime()-time,120_000);
  assert.ok(android.notifications.every(item=>item.id!==testReminderId));
});

function stub() {
  const pending=new Map([[testReminderId,testReminder(0)]]);
  const calls=[];
  return {pending,calls,
    async getPending(){return {notifications:[...pending.values()]};},
    async cancel({notifications}){calls.push('cancel');for(const {id} of notifications)pending.delete(id);},
    async schedule({notifications}){calls.push('schedule');for(const item of notifications)pending.set(item.id,item);},
  };
}

test('reconciliation avoids duplicates after restart and cancels old hours before changing them',async()=>{
  const plugin=stub();
  const chosen=new Set(['a']);
  const plan=(times,state)=>reminderPlan([medicine('a',times,state)],chosen,'android').notifications;
  const zone='Europe/Warsaw:-60';
  let previous=await reconcileReminders(plugin,plan(['08:00','12:00']),{},zone);
  assert.deepEqual(plugin.calls,['schedule']);
  previous=await reconcileReminders(plugin,plan(['08:00','12:00']),JSON.parse(JSON.stringify(previous)),zone);
  assert.deepEqual(plugin.calls,['schedule']);
  previous=await reconcileReminders(plugin,plan(['09:30']),previous,zone);
  assert.deepEqual(plugin.calls,['schedule','cancel','schedule']);
  assert.equal(plugin.pending.size,2);
  assert.match([...plugin.pending.values()][1].body,/09:30$/);
  previous=await reconcileReminders(plugin,plan(['09:30']),previous,'Europe/Warsaw:-120');
  assert.deepEqual(plugin.calls.slice(-2),['cancel','schedule']);
  previous=await reconcileReminders(plugin,plan(['09:30'],'paused'),previous,zone);
  assert.deepEqual(previous,{});
  assert.deepEqual([...plugin.pending.keys()],[testReminderId]);
  previous=await reconcileReminders(plugin,plan(['09:30']),previous,zone);
  previous=await reconcileReminders(plugin,[],previous,zone);
  assert.deepEqual([...plugin.pending.keys()],[testReminderId]);
});

test('a missing OS alarm is restored without rescheduling its neighbors',async()=>{
  const plugin=stub();
  const desired=reminderPlan([medicine('a',['08:00','12:00'])],new Set(['a']),'ios').notifications;
  const previous=await reconcileReminders(plugin,desired,{},'zone');
  plugin.pending.delete(desired[0].id);
  await reconcileReminders(plugin,desired,previous,'zone');
  assert.deepEqual(plugin.calls,['schedule','schedule']);
  assert.equal(plugin.pending.size,3);
});

test('secure randomness creates a compatible id where the native WebView lacks randomUUID',()=>{
  const id=newRecordId({getRandomValues:array=>array.fill(0xff)});
  assert.equal(id,'ffffffff-ffff-4fff-bfff-ffffffffffff');
});
