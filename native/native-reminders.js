import {Capacitor} from '@capacitor/core';
import {App} from '@capacitor/app';
import {LocalNotifications as notifications} from '@capacitor/local-notifications';
import {Filesystem,Directory,Encoding} from '@capacitor/filesystem';
import {Share} from '@capacitor/share';
import {readOrganizer} from '../data.js';
import {reminderPreferencesKey,reminderPlan,testReminder,testReminderId,reconcileReminders} from './reminders.js';

const platform=Capacitor.getPlatform();
if(Capacitor.isNativePlatform()) {
  setupReminders();
  document.addEventListener('voltyro:export-backup',event=>{
    event.preventDefault();
    void shareBackup(event.detail).catch(()=>{
      const notice=document.getElementById('notice');
      notice.hidden=false;
      notice.textContent='Nie udało się udostępnić kopii. Spróbuj ponownie.';
    });
  });
}
async function shareBackup({json,name}) {
  const {uri}=await Filesystem.writeFile({path:name,data:json,directory:Directory.Cache,encoding:Encoding.UTF8});
  await Share.share({title:'Kopia VOLTYRO Leki PRO',files:[uri]});
}

function setupReminders() {
  const panel=document.createElement('section');
  panel.className='panel native-reminders';
  panel.setAttribute('aria-labelledby','native-reminders-title');
  panel.innerHTML=`<h2 id="native-reminders-title">Przypomnienia o lekach</h2>
    <p>Włącz przypomnienie przy leku. Telefon przypomni o godzinach ustawionych w jego planie.</p>
    <div data-reminder-medicines></div><div class="measurement-actions">
      <button type="button" data-reminder-test>Test za 2 minuty</button>
      <button type="button" data-reminder-exact hidden>Ustaw dokładne alarmy w Androidzie</button>
    </div><p data-reminder-status role="status" aria-live="polite"></p>`;
  document.getElementById('manage-medicines').after(panel);
  document.querySelector('.settings form p').textContent=
    'Godziny rano i wieczorem dotyczą starszych wpisów. Przypomnienia ustawisz dla poszczególnych leków.';
  const list=panel.querySelector('[data-reminder-medicines]');
  const status=panel.querySelector('[data-reminder-status]');
  const test=panel.querySelector('[data-reminder-test]');
  const exact=panel.querySelector('[data-reminder-exact]');
  const selected=new Set();
  let signatures={};
  let usable=true;
  let busy=false;
  let queued=false;
  let exactState='unknown';

  try {
    const stored=JSON.parse(localStorage.getItem(reminderPreferencesKey)??'{}');
    if(!stored||typeof stored!=='object'||stored.selected&&!Array.isArray(stored.selected))
      throw Error('Invalid reminder preferences');
    for(const id of stored.selected??[])if(typeof id==='string')selected.add(id);
    if(stored.signatures&&typeof stored.signatures==='object')signatures=stored.signatures;
  } catch {usable=false;}

  function writePreferences() {
    localStorage.setItem(reminderPreferencesKey,JSON.stringify({selected:[...selected],signatures}));
  }

  function medicines() {return readOrganizer(localStorage).medicines;}

  function render(rows) {
    const focused=document.activeElement?.dataset?.medicineId;
    list.replaceChildren();
    for(const medicine of rows.filter(item=>item.state!=='archived')) {
      const card=document.createElement('div');
      card.className='medicine-card';
      const name=document.createElement('h3');
      name.textContent=medicine.name;
      const hours=document.createElement('p');
      hours.textContent=medicine.state==='paused'?'Lek wstrzymany':medicine.slots.map(slot=>slot.time).join(' · ');
      const control=document.createElement('button');
      control.type='button';
      control.dataset.medicineId=medicine.id;
      const enabled=selected.has(medicine.id);
      control.textContent=enabled?'Przypomnienia włączone':'Włącz przypomnienia';
      control.setAttribute('aria-pressed',String(enabled));
      control.setAttribute('aria-label',control.textContent+' · '+medicine.name);
      control.disabled=!usable||(!enabled&&medicine.state!=='active');
      control.onclick=async()=>{
        control.disabled=true;
        try {
          if(enabled)selected.delete(medicine.id);
          else {
            if(!await permission(true)){control.disabled=false;return;}
            selected.add(medicine.id);
          }
          try {writePreferences();}
          catch(error) {
            if(enabled)selected.add(medicine.id);
            else selected.delete(medicine.id);
            throw error;
          }
          render(medicines());
          void sync();
        } catch {status.textContent='Nie udało się zmienić przypomnienia.';control.disabled=false;}
      };
      card.append(name,hours,control);
      list.append(card);
    }
    if(!list.children.length)list.textContent='Dodaj lek i godziny, aby włączyć przypomnienia.';
    if(focused)[...list.querySelectorAll('button')].find(button=>button.dataset.medicineId===focused)?.focus({preventScroll:true});
  }

  async function permission(prompt=false) {
    let {display}=await notifications.checkPermissions();
    if(prompt&&display!=='granted'&&display!=='denied')({display}=await notifications.requestPermissions());
    if(display==='granted')return true;
    if(prompt||selected.size)status.textContent='Powiadomienia są wyłączone. Możesz zezwolić na nie w ustawieniach telefonu.';
    return false;
  }

  async function updateAndroid() {
    if(platform!=='android')return;
    await notifications.createChannel({id:'medicines',name:'Przypomnienia o lekach',importance:4,visibility:0});
    ({exact_alarm:exactState}=await notifications.checkExactNotificationSetting());
    exact.hidden=exactState==='granted';
  }

  async function sync() {
    if(busy){queued=true;return;}
    busy=true;
    try {
      if(!usable)throw Error('Reminder preferences unavailable');
      const rows=medicines();
      render(rows);
      const allowed=await permission();
      if(allowed)await updateAndroid();
      const {notifications:planned,omitted}=reminderPlan(rows,selected,platform);
      const zone=Intl.DateTimeFormat().resolvedOptions().timeZone+':'+new Date().getTimezoneOffset()+':'+exactState;
      const next=await reconcileReminders(notifications,allowed?planned:[],signatures,zone);
      if(JSON.stringify(next)!==JSON.stringify(signatures)) {
        signatures=next;
        writePreferences();
      }
      if(allowed&&selected.size)status.textContent='Zaplanowane godziny: '+planned.length+
        (omitted?' · Poza limitem telefonu: '+omitted+'.':'')+
        (!exact.hidden?' · Android może opóźnić przypomnienia.':'');
      else if(allowed)status.textContent='';
    } catch {status.textContent='Nie udało się zsynchronizować przypomnień. Otwórz aplikację ponownie.';}
    finally {
      busy=false;
      if(queued){queued=false;void sync();}
    }
  }

  exact.onclick=()=>notifications.changeExactNotificationSetting().catch(()=>{
    status.textContent='Otwórz ustawienia alarmów w Androidzie.';
  });
  test.onclick=async()=>{
    test.disabled=true;
    try {
      if(!await permission(true))return;
      await updateAndroid();
      const item=testReminder(Date.now());
      if(platform==='android')item.channelId='medicines';
      await notifications.cancel({notifications:[{id:testReminderId}]});
      await notifications.schedule({notifications:[item]});
      status.textContent='Test zaplanowany za 2 minuty.'+(!exact.hidden?' Android może go opóźnić.':'');
    } catch {status.textContent='Nie udało się ustawić testu.';}
    finally {test.disabled=false;}
  };
  document.addEventListener('voltyro:organizer-changed',()=>void sync());
  void App.addListener('appStateChange',({isActive})=>{if(isActive)void sync();});
  void sync();
}
