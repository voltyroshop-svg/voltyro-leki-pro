import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {reminderHours} from '../pwa-push.js';

test('synced schedule contains only unique hours for active medicines',()=>{
  const med=(state,...times)=>({name:'Never sent',dose:'Never sent',state,slots:times.map(time=>({time}))});
  assert.deepEqual(reminderHours([med('active','08:00','09:00'),med('paused','10:00'),
    med('archived','11:00'),med('active','08:00')]),['08:00','09:00']);
});

test('worker handles browser-delivered push payloads independently of an open window and rejects unexpected input',async()=>{
  const handlers={},notifications=[],windows=[];
  const registration={scope:'https://example.test/voltyro-leki-pro/',
    showNotification:async(title,options)=>notifications.push({title,options})};
  const self={registration,addEventListener:(event,handler)=>handlers[event]=handler,
    clients:{matchAll:async()=>[],openWindow:async url=>windows.push(url)}};
  runInNewContext(await readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL});
  const input=type=>({data:{json:()=>({type,tag:'test:1795413900000',text:'Never displayed'})},waitUntil:value=>value});
  handlers.push(input('untrusted'));
  assert.equal(notifications.length,0);
  handlers.push(input('test'));
  assert.equal(notifications[0].title,'Test przypomnienia');
  assert.equal(notifications[0].options.body,'To jest powiadomienie testowe.');
  let handled;
  handlers.notificationclick({notification:{close(){}},waitUntil:value=>{handled=value;}});
  await handled;
  assert.deepEqual(windows,[registration.scope]);
});
