import {dayKey,timeKey,newRecordId} from './data.js';
import {measurementsKey,emptyMeasurements,parseMeasurements,readMeasurement,glucoseIn,glucoseContexts,chartRows,wellbeingLabels,medicationTimingLabels} from './measurements-data.js';

const element = (tag,text) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (label,callback) => {
  const node = element('button',label);
  node.type = 'button';
  node.onclick = callback;
  return node;
};
const displayValue = (value,digits=2) => new Intl.NumberFormat('pl-PL',{maximumFractionDigits:digits}).format(value);
const displayDate = value => value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4)+' · '+value.slice(11);
const metadata=['at','note','wellbeing','medicationTiming'];
const readings={pressure:['systolic','diastolic','pulse'],glucose:['value']};
const fields={pressure:[...readings.pressure,...metadata],glucose:[...readings.glucose,'unit','context',...metadata]};
const parseReading=raw=>{
  const value=raw.trim().replace(',','.');
  return /^\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)?Number(value):NaN;
};
const titles = {pressure:'Ciśnienie i puls',glucose:'Poziom cukru'};

export function loadMeasurements(storage=localStorage) {
  const saved = storage.getItem(measurementsKey);
  return saved === null ? emptyMeasurements() : parseMeasurements(JSON.parse(saved));
}

function plot(parent,rows,series,name,unit,days,now) {
  const figure = element('figure');
  const caption = element('figcaption',name+' ('+unit+')');
  figure.append(caption);
  const datasets = series.map(([label,key,color])=>({label,color,values:rows.map(row=>key(row))}));
  const values = datasets.flatMap(data=>data.values);
  const range = values.reduce(([lo,hi],value)=>[Math.min(lo,value),Math.max(hi,value)],[Infinity,-Infinity]);
  const [low,high] = range[0]===range[1]?[Math.max(0,range[0]-1),range[1]+1]:range;
  const begin = Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()-days+1);
  const span = days*86_400_000;
  const x = row => 80+475*(Date.parse(row.at+':00Z')-begin)/span;
  const y = value => 172-144*(value-low)/(high-low);
  const svgNode = (tag,props,text) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg',tag);
    for (const [key,value] of Object.entries(props)) node.setAttribute(key,String(value));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = svgNode('svg',{viewBox:'0 0 570 207',role:'img','aria-label':name+', '+days+' dni. Dokładne wartości w historii poniżej.'});
  for (const value of [low,low+(high-low)/2,high]) {
    svg.append(svgNode('line',{x1:80,y1:y(value),x2:555,y2:y(value),stroke:'#657590'}),
      svgNode('text',{x:74,y:y(value)+5,'text-anchor':'end',fill:'currentColor'},displayValue(value)));
  }
  const dateLabel = stamp=>new Intl.DateTimeFormat('pl-PL',{day:'numeric',month:'numeric',timeZone:'UTC'}).format(stamp);
  svg.append(svgNode('text',{x:80,y:198,fill:'currentColor'},dateLabel(begin)),
    svgNode('text',{x:555,y:198,'text-anchor':'end',fill:'currentColor'},dateLabel(begin+span-1)));
  for (const {label,color,values:points} of datasets) {
    if (points.length>1) svg.append(svgNode('polyline',{
      points:points.map((value,i)=>x(rows[i])+','+y(value)).join(' '),fill:'none',stroke:color,'stroke-width':2,
    }));
    for (const [i,value] of points.entries()) {
      const mark = svgNode('circle',{cx:x(rows[i]),cy:y(value),r:3,fill:color});
      mark.append(svgNode('title',{},label+' · '+displayDate(rows[i].at)+' · '+displayValue(value)+' '+unit));
      svg.append(mark);
    }
  }
  const legend = element('div');
  legend.className = 'measurement-legend';
  for (const {label,color} of datasets) {
    const item = element('span',label);
    item.style.borderInlineStart = '4px solid '+color;
    legend.append(item);
  }
  figure.append(svg,legend);
  parent.append(figure);
}

// Ranges control the wheel only. Manual entry uses the existing measurement validation.
const wheelRanges={
  systolic:{max:300,start:120,scale:1},
  diastolic:{max:200,start:80,scale:1},
  pulse:{max:250,start:70,scale:1},
  'mg/dl':{max:600,start:100,scale:1},
  'mmol/l':{max:350,start:5.5,scale:10},
};
const readingText=value=>String(value).replace('.',',');

function setupReadingPicker() {
  const dialog=document.getElementById('reading-picker');
  const title=dialog.querySelector('h2');
  const wheel=dialog.querySelector('.reading-wheel');
  const frame=wheel.parentElement;
  const help=document.getElementById('reading-picker-help');
  const manual=document.getElementById('reading-manual');
  const manualLabel=document.getElementById('reading-manual-label');
  const error=document.getElementById('reading-picker-error');
  const toggle=dialog.querySelector('[data-picker-manual]');
  let options,selected,scale,apply,trigger,whole;

  function select(index,scroll=false) {
    index=Math.min(options.length-1,Math.max(0,index));
    if(selected!==index) {
      options[selected]?.setAttribute('aria-selected','false');
      selected=index;
      options[selected].setAttribute('aria-selected','true');
      wheel.setAttribute('aria-activedescendant',options[selected].id);
    }
    if(scroll)wheel.scrollTop=options[selected].offsetTop-options[0].offsetTop;
  }

  function syncScroll() {
    if(!dialog.open||frame.hidden)return;
    select(Math.round(wheel.scrollTop/options[0].getBoundingClientRect().height));
  }

  function showManual(show) {
    frame.hidden=help.hidden=show;
    manualLabel.hidden=!show;
    toggle.textContent=show?'Wróć do wybieraka':'Wpisz ręcznie';
    error.hidden=true;
    if(show)manual.focus();
    else {
      select(selected,true);
      wheel.focus();
    }
  }

  wheel.addEventListener('scroll',syncScroll);
  wheel.onclick=event=>{
    const row=event.target.closest('[data-index]');
    if(row)select(Number(row.dataset.index),true);
  };
  wheel.onkeydown=event=>{
    const shifts={ArrowUp:-1,ArrowDown:1,PageUp:-10,PageDown:10};
    if(!Object.hasOwn(shifts,event.key))return;
    event.preventDefault();
    select(selected+shifts[event.key],true);
  };
  toggle.onclick=()=>showManual(manualLabel.hidden);
  dialog.querySelector('[data-picker-cancel]').onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>trigger?.focus({preventScroll:true}));
  const done=dialog.querySelector('[data-picker-done]');
  done.onclick=()=>{
    syncScroll();
    const value=manualLabel.hidden?(selected+1)/scale:parseReading(manual.value);
    if(!Number.isFinite(value)||value<=0||whole&&!Number.isSafeInteger(value)) {
      error.textContent=whole?'Wpisz dodatnią liczbę całkowitą.':'Wpisz dodatnią liczbę.';
      error.hidden=false;
      manual.focus();
      return;
    }
    apply(readingText(value));
    dialog.close();
  };
  manual.onkeydown=event=>{
    if(event.key==='Enter'){event.preventDefault();done.click();}
  };

  return ({name,unit,current,recent,button,onChoose})=>{
    const range=wheelRanges[unit||name];
    whole=name!=='value';
    scale=range.scale;
    apply=onChoose;
    trigger=button;
    title.textContent=document.getElementById('label-'+name).textContent+(unit?' · '+unit:'');
    manual.inputMode=whole?'numeric':'decimal';
    manual.value=current;
    options=Array.from({length:range.max},(_,index)=>{
      const row=element('div',readingText((index+1)/scale));
      row.id='reading-option-'+index;
      row.dataset.index=index;
      row.setAttribute('role','option');
      row.setAttribute('aria-selected','false');
      return row;
    });
    wheel.replaceChildren(...options);
    selected=undefined;
    const seed=parseReading(current)||recent||range.start;
    select(Math.round(seed*scale)-1);
    frame.hidden=help.hidden=false;
    manualLabel.hidden=error.hidden=true;
    toggle.textContent='Wpisz ręcznie';
    dialog.showModal();
    select(selected,true);
    wheel.focus({preventScroll:true});
  };
}

export function setupMeasurements({announce,confirm}) {
  const views = Object.fromEntries(Object.keys(fields).map(type=>[type,document.getElementById(type)]));
  const forms = Object.fromEntries(Object.keys(fields).map(type=>[type,views[type].querySelector('form')]));
  const ranges = {pressure:7,glucose:7};
  let chartUnit = 'mg/dl';
  let active = 'medicines';
  const editing = {};
  const openPicker=setupReadingPicker();

  function setReading(form,name,value) {
    form.elements[name].value=value;
    form.querySelector('[data-reading="'+name+'"]').textContent=value||'Wybierz';
  }


  function reset(type,entry) {
    const form = forms[type];
    const now = new Date();
    form.reset();
    editing[type] = entry?.id;
    for (const field of fields[type]) if (entry) form.elements[field].value = field==='value' ?
      String(entry[field]).replace('.',',') : entry[field]??'';
    for(const name of readings[type])setReading(form,name,entry?readingText(entry[name]):'');
    if (!entry) form.elements.at.value = dayKey(now)+'T'+timeKey(now);
    form.querySelector('[data-cancel]').hidden = !entry;
    form.querySelector('[type=submit]').textContent = entry ? 'Zapisz zmiany' : 'Zapisz pomiar';
  }

  function refresh() {
    if (active==='medicines') return;
    const type = active;
    const results = views[type].querySelector('[data-measure-results]');
    results.replaceChildren();
    let rows;
    try { rows = loadMeasurements()[type]; }
    catch { results.append(element('p','Nie udało się odczytać pomiarów z pamięci urządzenia.')); return; }
    const trend = element('h3','Wykres');
    const controls = element('div');
    controls.className = 'measurement-actions';
    for (const days of [7,30]) {
      const option = button(days+' dni',()=>{ranges[type]=days;refresh();
        results.querySelector('[data-range="'+days+'"]').focus();});
      option.dataset.range=days;
      option.setAttribute('aria-pressed',String(ranges[type]===days));
      controls.append(option);
    }
    if (type==='glucose') {
      const units = element('select');
      units.setAttribute('aria-label','Jednostka wykresu');
      units.append(new Option('mg/dl'),new Option('mmol/l'));
      units.value=chartUnit;
      units.onchange=()=>{chartUnit=units.value;refresh();results.querySelector('select').focus();};
      controls.append(units);
    }
    results.append(trend,controls);
    const now = new Date(), points = chartRows(rows,ranges[type],now);
    if (!points.length) results.append(element('p','Brak pomiarów w tym okresie.'));
    else if (type==='glucose') plot(results,points,[['Cukier',r=>glucoseIn(r.value,r.unit,chartUnit),'#d7beff']],
      'Poziom cukru',chartUnit,ranges[type],now);
    else {
      plot(results,points,[['Skurczowe',r=>r.systolic,'#69e2a8'],['Rozkurczowe',r=>r.diastolic,'#d7beff']],
        'Ciśnienie','mmHg',ranges[type],now);
      plot(results,points,[['Puls',r=>r.pulse,'#ffda85']],'Puls','uderz./min',ranges[type],now);
    }
    results.append(element('h3','Historia pomiarów'));
    if (!rows.length) results.append(element('p','Brak zapisanych pomiarów.'));
    for (const item of rows.sort((a,b)=>b.at.localeCompare(a.at))) {
      const card = element('article');
      card.className='medicine-card measurement-record';
      const value=type==='pressure'?item.systolic+' / '+item.diastolic+' mmHg · '+item.pulse+' uderz./min':
        String(item.value).replace('.',',')+' '+item.unit;
      card.append(element('strong',value),element('p',displayDate(item.at)));
      if (type==='glucose') {
        const other=item.unit==='mg/dl'?'mmol/l':'mg/dl';
        card.append(element('p',glucoseContexts[item.context]+' · ≈ '+displayValue(glucoseIn(item.value,item.unit,other),other==='mg/dl'?1:2)+' '+other));
      }
      const context=[wellbeingLabels[item.wellbeing],medicationTimingLabels[item.medicationTiming]].filter(Boolean);
      if(context.length)card.append(element('p',context.join(' · ')));
      if(item.note)card.append(element('p',item.note));
      const actions=element('div');
      actions.className='measurement-actions';
      actions.append(button('Edytuj',()=>{
        reset(type,item);
        forms[type].elements.at.focus();
        forms[type].scrollIntoView({block:'nearest'});
      }),button('Usuń',()=>confirm('Usunąć pomiar?',[titles[type]+' · '+displayDate(item.at)],()=>{
        mutate(type,rows=>rows.filter(row=>row.id!==item.id));
        if(editing[type]===item.id)reset(type);
      },'Usuń pomiar')));
      card.append(actions);
      results.append(card);
    }
  }

  function mutate(type,change) {
    try {
      const data=loadMeasurements();
      data[type]=change(data[type]);
      localStorage.setItem(measurementsKey,JSON.stringify(data));
    } catch {
      announce('Nie udało się zapisać zmiany pomiaru na urządzeniu.');
      return false;
    }
    refresh();
    return true;
  }

  for (const [type,form] of Object.entries(forms)) {
    reset(type);
    form.querySelector('[data-cancel]').onclick=()=>reset(type);
    for(const control of form.querySelectorAll('[data-reading]')) {
      control.onclick=()=>{
        const name=control.dataset.reading;
        const unit=type==='glucose'?form.elements.unit.value:null;
        let recent;
        try {
          const previous=loadMeasurements()[type].reduce((latest,row)=>
            !latest||row.at>=latest.at?row:latest,null);
          if(previous)recent=unit?glucoseIn(previous.value,previous.unit,unit):previous[name];
        } catch {}
        openPicker({name,unit,current:form.elements[name].value,recent,button:control,
          onChoose:value=>setReading(form,name,value)});
      };
    }
    if(type==='glucose')form.elements.unit.onchange=()=>setReading(form,'value','');
    form.onsubmit=event=>{
      event.preventDefault();
      const raw=Object.fromEntries(new FormData(form));
      const missing=readings[type].find(name=>!raw[name]);
      if(missing) {
        announce('Wybierz wartość pomiaru.');
        form.querySelector('[data-reading="'+missing+'"]').focus();
        return;
      }
      for(const key of readings[type])raw[key]=parseReading(raw[key]);
      try {
        const id=editing[type];
        const item=readMeasurement(type,{...raw,id:id??newRecordId()});
        if (mutate(type,rows=>{
          if (id&&!rows.some(row=>row.id===id)) throw Error('Brak edytowanego pomiaru.');
          return [...rows.filter(row=>row.id!==item.id),item];
        })) {
          reset(type);
          announce('Zapisano pomiar.');
        }
      } catch(error) { announce(error.message); }
    };
  }

  const tabs = [...document.querySelectorAll('[data-health-tab]')];
  for (const tab of tabs) tab.onclick=()=>{
    const prior=active;
    active=tab.dataset.healthTab;
    if(active!=='medicines'&&prior!==active&&!forms[active].dataset.opened) {
      reset(active);
      forms[active].dataset.opened='true';
    }
    for (const control of tabs) {
      const selected=control===tab;
      control.setAttribute('aria-pressed',String(selected));
      document.getElementById(control.dataset.healthTab).hidden=!selected;
    }
    refresh();
  };
  window.visualViewport?.addEventListener('resize',()=>{
    const field=document.activeElement;
    if(!field?.matches('.measurement-panel :is(input,textarea,select), #reading-manual'))return;
    const viewport=window.visualViewport;
    if(field.getBoundingClientRect().bottom>viewport.offsetTop+viewport.height-16) {
      field.scrollIntoView({block:'center'});
    }
  });
  window.addEventListener('storage',event=>{
    if (event.key===measurementsKey||event.key===null) refresh();
  });
  return refresh;
}
