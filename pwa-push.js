import {reminderApi} from './push-config.js';

const tokenKey='voltyro-leki-push-device';

export function reminderHours(medicines) {
  return [...new Set(medicines.filter(row=>row.state==='active')
    .flatMap(row=>row.slots.map(slot=>slot.time)))].sort();
}

export function setupPwaPush({medicines}) {
  const panel=document.getElementById('webReminders');
  const toggle=document.getElementById('enableWebPush');
  const test=document.getElementById('testWebPush');
  const disable=document.getElementById('disableWebPush');
  const state=document.getElementById('webPushState');
  const result=document.getElementById('webPushResult');
  panel.hidden=false;
  let registration,config,connecting=false,chain=Promise.resolve(),synced='';
  const standalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
  const apple=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  const supported=()=>Boolean(registration?.pushManager&&'Notification' in window&&(!apple||standalone()));
  const token=()=>{try {return localStorage.getItem(tokenKey);} catch {return null;}};
  const request=async(path,method='GET',data)=>{
    const device=token();
    const response=await fetch(new URL(path,reminderApi.replace(/\/?$/,'/')),{method,cache:'no-store',signal:AbortSignal.timeout(12_000),
      headers:{...(device?{Authorization:'Bearer '+device}:{}),...(data?{'Content-Type':'application/json'}:{})},
      ...(data?{body:JSON.stringify(data)}:{})});
    const json=await response.json();
    if(!response.ok)throw Error(json.error??'Serwer przypomnień jest niedostępny.');
    return json;
  };
  function draw() {
    const permission='Notification' in window?Notification.permission:'unavailable';
    state.textContent=!reminderApi?'Serwer przypomnień nie jest jeszcze podłączony.':
      apple&&!standalone()?'Otwórz aplikację z ikony na ekranie początkowym iPhone’a.':
      !supported()?'Powiadomienia systemowe są niedostępne w tej przeglądarce.':
      permission==='denied'?'Zgoda zablokowana w ustawieniach iPhone’a.':
      permission==='granted'?'Zgoda systemowa przyznana.':'Zgoda systemowa jeszcze nieprzyznana.';
    toggle.disabled=connecting||!config||!supported()||permission==='denied';
    toggle.textContent=permission==='granted'?'Połącz powiadomienia':'Włącz powiadomienia';
    toggle.hidden=Boolean(synced);
    disable.hidden=!token();
    disable.disabled=connecting||!config;
    test.disabled=connecting||!synced;
  }
  function sync(force=false) {
    chain=chain.catch(()=>{}).then(async()=>{
      if(!config||!token()||!supported())return;
      if(Notification.permission!=='granted') {
        await request('device','DELETE');
        synced='';
        return;
      }
      const subscription=await registration.pushManager.getSubscription();
      if(!subscription){await request('device','DELETE');synced='';return;}
      const plan={subscription:subscription.toJSON(),hours:reminderHours(medicines()),
        zone:Intl.DateTimeFormat().resolvedOptions().timeZone};
      const signature=JSON.stringify(plan);
      if(!force&&signature===synced)return;
      await request('device','PUT',plan);
      synced=signature;
      result.textContent='Harmonogram zapisany na serwerze: '+plan.hours.length+' godz.';
    }).catch(error=>{
      synced='';
      result.textContent='Harmonogram może być nieaktualny. '+error.message;
      throw error;
    }).finally(draw);
    return chain;
  }
  toggle.onclick=async()=>{
    if(!config||!supported()||connecting)return;
    connecting=true;
    draw();
    try {
      if(Notification.permission!=='granted') {
        const permission=await Notification.requestPermission();
        result.textContent=permission==='granted'?'Wybierz „Połącz powiadomienia”, aby zapisać harmonogram.':'Nie przyznano zgody na powiadomienia.';
        return;
      }
      const key=Uint8Array.from(atob(config.publicKey.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
      // Call subscribe in the button handler so iOS retains the user activation.
      const subscription=await registration.pushManager.subscribe({applicationServerKey:key,userVisibleOnly:true});
      if(!subscription)throw Error('Brak subskrypcji urządzenia.');
      if(!token())localStorage.setItem(tokenKey,Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join(''));
      await sync(true);
    } catch(error){result.textContent=error.message;}
    finally {connecting=false;draw();}
  };
  disable.onclick=async()=>{
    connecting=true;
    draw();
    try {
      await chain.catch(()=>{});
      await request('device','DELETE');
      localStorage.removeItem(tokenKey);
      synced='';
      result.textContent='Przypomnienia wyłączone.';
      const subscription=await registration?.pushManager?.getSubscription();
      await subscription?.unsubscribe();
    } catch {result.textContent='Nie udało się potwierdzić zmiany. Spróbuj ponownie przez internet.';}
    finally {connecting=false;draw();}
  };
  test.onclick=async()=>{
    connecting=true;
    draw();
    try {
      await sync(true);
      if(!synced)throw Error('Połącz powiadomienia ponownie.');
      await request('test','POST');
      result.textContent='Serwer zaplanował test za 2 minuty. Możesz zamknąć aplikację.';
    } catch(error){result.textContent=error.message;}
    finally {connecting=false;draw();}
  };
  const refresh=async()=>{
    if(!reminderApi||document.hidden||connecting)return;
    try {
      registration??=await navigator.serviceWorker.ready;
      if(!supported())return;
      config??=await request('config');
      await sync();
    } catch {result.textContent='Brak połączenia z serwerem przypomnień.';}
    finally {draw();}
  };
  addEventListener('online',()=>void refresh());
  document.addEventListener('visibilitychange',()=>void refresh());
  document.addEventListener('voltyro:reminder-plan',()=>{if(!connecting)void sync().catch(()=>{});});
  draw();
  if('serviceWorker' in navigator)void refresh();
}
