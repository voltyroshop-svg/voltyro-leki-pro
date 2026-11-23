import {createServer} from 'node:http';
import {createECDH,createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import webPush from 'web-push';

const minute=60_000;
const day=24*60*minute;
const maxDevices=500;
const maxHours=48;
const evaluationWindow=5*minute;
const validHour=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const basicHosts=new Set(['fcm.googleapis.com','updates.push.services.mozilla.com']);
const localClocks=new Map();

function validation(message,status=400) {
  return Object.assign(new Error(message),{status});
}

function clockFor(zone) {
  if(typeof zone!=='string'||zone.length>100||!/^[A-Za-z0-9_+/-]+$/.test(zone))
    throw validation('Nieprawidłowa strefa czasowa.');
  if(!localClocks.has(zone)) {
    try {
      const clock=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',
        hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
      if(localClocks.size>=maxDevices)localClocks.clear();
      localClocks.set(zone,clock);
    } catch {throw validation('Nieprawidłowa strefa czasowa.');}
  }
  return localClocks.get(zone);
}

export function localReminderSlot(timestamp,zone) {
  const fields=Object.fromEntries(clockFor(zone).formatToParts(timestamp).map(({type,value})=>[type,value]));
  return {date:fields.year+'-'+fields.month+'-'+fields.day,time:fields.hour+':'+fields.minute};
}

export function validatePlan(input) {
  if(!input||!Array.isArray(input.hours)||input.hours.length>maxHours||
      !input.hours.every(time=>typeof time==='string'&&validHour.test(time)))
    throw validation('Zapisz maksymalnie 48 różnych godzin przypomnień.');
  clockFor(input.zone);
  const endpoint=input.subscription?.endpoint;
  const keys=input.subscription?.keys;
  const keyValid=(key,length)=>typeof key==='string'&&/^[A-Za-z0-9_-]+$/.test(key)&&Buffer.from(key,'base64url').length===length;
  let url;
  try {url=typeof endpoint==='string'&&endpoint.length<=2048?new URL(endpoint):null;}
  catch {}
  if(!url||url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.pathname==='/'||
    !(basicHosts.has(url.hostname)||url.hostname.endsWith('.push.apple.com'))||
    !keyValid(keys?.p256dh,65)||!keyValid(keys?.auth,16))throw validation('Nieprawidłowa subskrypcja.');
  return {hours:[...new Set(input.hours)].sort(),zone:input.zone,
    subscription:{endpoint:url.href,keys:{p256dh:keys.p256dh,auth:keys.auth}}};
}

export function openReminders(filename) {
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, endpoint TEXT NOT NULL UNIQUE, subscription TEXT NOT NULL,
      zone TEXT NOT NULL, hours TEXT NOT NULL, changed INTEGER NOT NULL, seen INTEGER NOT NULL,
      test_due INTEGER, test_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS expired_endpoints (id TEXT PRIMARY KEY, expired INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS deliveries (
      device TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      slot TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(device,slot)
    );`);
  const endpointId=endpoint=>createHash('sha256').update(endpoint).digest('hex');
  return {
    get:id=>db.prepare('SELECT * FROM devices WHERE id=?').get(id),
    save(id,plan,now) {
      if(db.prepare('SELECT 1 FROM expired_endpoints WHERE id=?').get(endpointId(plan.subscription.endpoint)))
        throw validation('Subskrypcja wygasła. Wyłącz przypomnienia i połącz je ponownie.',410);
      try {
        const result=db.prepare(`INSERT INTO devices(id,endpoint,subscription,zone,hours,changed,seen)
          SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM devices WHERE id=?)
          OR (SELECT count(*) FROM devices)<?
          ON CONFLICT(id) DO UPDATE SET endpoint=excluded.endpoint,subscription=excluded.subscription,
            zone=excluded.zone,hours=excluded.hours,seen=excluded.seen,
            changed=CASE WHEN devices.zone<>excluded.zone OR devices.hours<>excluded.hours
                         OR devices.endpoint<>excluded.endpoint THEN excluded.changed ELSE devices.changed END,
            test_due=CASE WHEN devices.endpoint<>excluded.endpoint THEN NULL ELSE devices.test_due END`)
          .run(id,plan.subscription.endpoint,JSON.stringify(plan.subscription),plan.zone,JSON.stringify(plan.hours),now,now,id,maxDevices);
        if(!result.changes)throw validation('Serwer przypomnień osiągnął limit urządzeń.',503);
      } catch(error) {
        if(error.errcode===2067)throw validation('Subskrypcja jest już przypisana do innego zapisu.',409);
        throw error;
      }
    },
    remove:(id,endpoint)=>endpoint===undefined?db.prepare('DELETE FROM devices WHERE id=?').run(id):
      db.prepare('DELETE FROM devices WHERE id=? AND endpoint=?').run(id,endpoint),
    expire(id,endpoint,now) {
      db.prepare('INSERT OR REPLACE INTO expired_endpoints VALUES(?,?)').run(endpointId(endpoint),now);
      db.prepare('DELETE FROM devices WHERE id=? AND endpoint=?').run(id,endpoint);
    },
    test(id,now) {
      const result=db.prepare(`UPDATE devices SET test_due=?,test_at=? WHERE id=?
        AND (test_at IS NULL OR test_at<=?)`).run(now+2*minute,now,id,now-5*minute);
      if(!result.changes)throw validation('Możesz zaplanować jeden test na pięć minut.',429);
    },
    devices:()=>db.prepare('SELECT * FROM devices').all(),
    claim:(id,slot,now)=>Boolean(db.prepare('INSERT OR IGNORE INTO deliveries VALUES(?,?,?)').run(id,slot,now).changes),
    finishTest:(id,due)=>db.prepare('UPDATE devices SET test_due=NULL WHERE id=? AND test_due=?').run(id,due),
    prune(now) {
      db.prepare('DELETE FROM devices WHERE seen<?').run(now-90*day);
      db.prepare('DELETE FROM deliveries WHERE created<?').run(now-3*day);
      db.prepare('DELETE FROM expired_endpoints WHERE expired<?').run(now-7*day);
    },
    close:()=>db.close(),
  };
}

export function createScheduler({store,send,clock=Date.now,logger=console}) {
  let running=false,lastPrune=0;
  return async function tick() {
    if(running)return;
    running=true;
    try {
      const now=clock();
      if(now-lastPrune>=60*minute){store.prune(now);lastPrune=now;}
      const newest=Math.floor(now/minute)*minute;
      const devices=store.devices();
      for(let start=0;start<devices.length;start+=20) {
        await Promise.all(devices.slice(start,start+20).map(async record=>{
          const current=store.get(record.id);
          if(!current||current.endpoint!==record.endpoint||current.changed!==record.changed||current.seen<now-90*day)return;
          const hours=new Set(JSON.parse(current.hours));
          const alerts=[];
          for(let stamp=newest;hours.size&&stamp>now-evaluationWindow;stamp-=minute) {
            if(stamp<current.changed)break;
            const {date,time}=localReminderSlot(stamp,current.zone);
            if(hours.has(time))alerts.push({slot:date+'T'+time,type:'reminder'});
          }
          if(current.test_due!==null&&current.test_due<=now) {
            store.finishTest(record.id,current.test_due);
            if(now-current.test_due<evaluationWindow)alerts.push({slot:'test:'+current.test_due,type:'test'});
          }
          for(const {slot,type} of alerts) {
            const stillCurrent=store.get(record.id);
            if(!stillCurrent||stillCurrent.changed!==current.changed||stillCurrent.endpoint!==current.endpoint)return;
            if(!store.claim(record.id,slot,now))continue;
            try {
              await send(JSON.parse(current.subscription),{type,tag:slot});
            } catch(error) {
              if([404,410].includes(error.statusCode)){
                store.expire(record.id,current.endpoint,now);
                return;
              }
              // An ambiguous acknowledgement cannot be retried safely.
              logger.warn('Web Push failed',Number.isInteger(error.statusCode)?error.statusCode:'network');
            }
          }
        }));
      }
    } finally {running=false;}
  };
}

async function bodyOf(req) {
  if(!req.headers['content-type']?.startsWith('application/json'))
    throw validation('Oczekiwano JSON.',415);
  let size=0;
  const chunks=[];
  for await(const chunk of req) {
    size+=chunk.length;
    if(size>8192)throw validation('Żądanie jest za duże.',413);
    chunks.push(chunk);
  }
  try {return JSON.parse(Buffer.concat(chunks));}
  catch {throw validation('Nieprawidłowy JSON.');}
}

export function reminderHttp({store,origin,publicKey,clock=Date.now,logger=console}) {
  return createServer({headersTimeout:10_000,requestTimeout:15_000},async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Vary','Origin');
    const reply=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
    try {
      if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true});
      if(req.headers.origin!==origin)throw validation('Niedozwolone źródło żądania.',403);
      res.setHeader('Access-Control-Allow-Origin',origin);
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods','GET, PUT, POST, DELETE, OPTIONS');
      if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
      if(req.url==='/config'&&req.method==='GET')return reply(200,{publicKey,maxHours});
      const token=/^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization??'')?.[1];
      if(!token)throw validation('Brak identyfikatora urządzenia.',401);
      const id=createHash('sha256').update(token).digest('hex');
      if(req.url==='/device'&&req.method==='PUT'){
        store.save(id,validatePlan(await bodyOf(req)),clock());return reply(200,{saved:true});
      }
      if(req.url==='/device'&&req.method==='DELETE'){store.remove(id);return reply(200,{removed:true});}
      if(req.url==='/test'&&req.method==='POST'){
        if(!store.get(id))throw validation('Włącz powiadomienia na tym urządzeniu.',404);
        store.test(id,clock());return reply(202,{scheduled:true,seconds:120});
      }
      throw validation('Nie znaleziono endpointu.',404);
    } catch(error) {
      if(!error.status)logger.warn('Reminders API storage error');
      reply(error.status??503,{error:error.status?error.message:'Serwer przypomnień jest chwilowo niedostępny.'});
    }
  });
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {APP_ORIGIN,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY,VAPID_SUBJECT,REMINDER_DB,PORT=3000}=process.env;
  if(!APP_ORIGIN||new URL(APP_ORIGIN).origin!==APP_ORIGIN||!APP_ORIGIN.startsWith('https:')||
      !VAPID_PUBLIC_KEY||!VAPID_PRIVATE_KEY||!VAPID_SUBJECT||!REMINDER_DB) {
    console.error('Ustaw APP_ORIGIN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT i REMINDER_DB.');
    process.exit(1);
  }
  const store=openReminders(REMINDER_DB);
  try {
    const key=createECDH('prime256v1');
    key.setPrivateKey(Buffer.from(VAPID_PRIVATE_KEY,'base64url'));
    if(key.getPublicKey().toString('base64url')!==VAPID_PUBLIC_KEY)throw Error();
    webPush.setVapidDetails(VAPID_SUBJECT,VAPID_PUBLIC_KEY,VAPID_PRIVATE_KEY);
  }
  catch {console.error('Nieprawidłowa konfiguracja VAPID.');process.exit(1);}
  const tick=createScheduler({store,send:(subscription,payload)=>
    webPush.sendNotification(subscription,JSON.stringify(payload),{TTL:300,urgency:'high',timeout:8000})});
  const run=()=>void tick().catch(()=>console.warn('Reminders scheduler storage error'));
  setInterval(run,10_000).unref();
  run();
  reminderHttp({store,origin:APP_ORIGIN,publicKey:VAPID_PUBLIC_KEY}).listen(Number(PORT),'0.0.0.0');
}
