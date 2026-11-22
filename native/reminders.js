export const testReminderId=1;
export const firstMedicineReminderId=100;

// An independent preference key leaves the existing organizer, measurements and backups compatible.
export const reminderPreferencesKey='voltyro-native-reminders.v1';

// Reserve space for the test reminder and stay below common device-wide caps for this app.
export const dailyReminderLimit=platform=>platform==='ios'?60:400;

function reminderId(key) {
  let hash=2166136261;
  for(const char of key)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  return firstMedicineReminderId+(hash>>>0)%2_000_000_000;
}

export function reminderPlan(medicines,selected,platform) {
  const active=medicines.filter(medicine=>medicine.state==='active'&&selected.has(medicine.id));
  const slots=active.flatMap(medicine=>medicine.slots.map(slot=>({medicine,slot,key:medicine.id+':'+slot.id})));
  slots.sort((a,b)=>a.slot.time.localeCompare(b.slot.time)||a.key.localeCompare(b.key));
  const ids=new Set();
  const notifications=slots.slice(0,dailyReminderLimit(platform)).map(({medicine,slot,key})=>{
    let id=reminderId(key);
    while(ids.has(id))id++;
    ids.add(id);
    const [hour,minute]=slot.time.split(':').map(Number);
    return {id,title:'Czas na lek',body:medicine.name+' · '+slot.time,
      schedule:{on:{hour,minute,second:0},allowWhileIdle:true},
      ...(platform==='android'?{channelId:'medicines'}:{})};
  });
  return {notifications,omitted:slots.length-notifications.length};
}

export function testReminder(now) {
  return {id:testReminderId,title:'VOLTYRO Leki PRO',body:'To jest test przypomnienia.',
    schedule:{at:new Date(now+120_000),allowWhileIdle:true}};
}

const signature=(item,zone)=>JSON.stringify([item.body,item.schedule.on,zone]);

export async function reconcileReminders(plugin,desired,previous,zone) {
  const {notifications}=await plugin.getPending();
  const pending=new Set(notifications.map(item=>item.id).filter(id=>id>=firstMedicineReminderId));
  const desiredById=new Map(desired.map(item=>[item.id,item]));
  const remove=[...pending].filter(id=>!desiredById.has(id)||previous[id]!==signature(desiredById.get(id),zone));
  if(remove.length)await plugin.cancel({notifications:remove.map(id=>({id}))});
  const removed=new Set(remove);
  const add=desired.filter(item=>!pending.has(item.id)||removed.has(item.id));
  if(add.length)await plugin.schedule({notifications:add});
  return Object.fromEntries(desired.map(item=>[item.id,signature(item,zone)]));
}
