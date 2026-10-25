'use strict';
const $=selector=>document.querySelector(selector);
let state=null,token=null,dirty=false,configLoaded=false,pending=null,inFlight=false,tab='overview',configRevision=null;
const titles={overview:'Speicher im Blick.',processes:'Prozesse im Überblick.',settings:'Überwachung konfigurieren.',logs:'Ereignisse nachvollziehen.'};
const labels={normal:'Speicher im Normalbereich',warning:'Speicher wird knapp',critical:'Speicher kritisch',unknown:'Messung unvollständig'};
const copy={normal:'Die gemessenen Werte liegen innerhalb Ihrer konfigurierten Schwellen.',warning:'Eine Warnschwelle ist erreicht. Prüfen Sie die größten Prozesse und laufenden Aufgaben.',critical:'Eine kritische Schwelle ist erreicht. Ein aktiver, nicht pausierter Monitor darf konfigurierte Ziele beenden.',unknown:'Mindestens eine erforderliche Messung oder die Konfiguration fehlt. Daraus lässt sich kein gesunder Zustand ableiten.'};
function statusColor(level){return getComputedStyle(document.documentElement).getPropertyValue(`--state-${level}`).trim();}
document.addEventListener('memguard:themechange',()=>{if(state)render();});
function text(selector,value){$(selector).textContent=value;}
function bytes(value){return value===null||value===undefined?'—':value>=1024**3?(value/1024**3).toFixed(1)+' GiB':(value/1024**2).toFixed(0)+' MiB';}
function error(message){text('#error',message);$('#error').hidden=false;}
function success(message){text('#toast',message);$('#toast').hidden=false;setTimeout(()=>{$('#toast').hidden=true;},8000);}
async function api(path,data){
  const response=await fetch(path,{method:data?'POST':'GET',cache:'no-store',headers:data?{'Content-Type':'application/json','X-Memguard-Token':token}:{},body:data?JSON.stringify({...data,confirm:true}):undefined,signal:AbortSignal.timeout(12000)});
  const result=await response.json();if(!response.ok) throw Error(result.error||`HTTP ${response.status}`);return result;
}
function showTab(next){tab=next;document.querySelectorAll('.tab').forEach(el=>{el.hidden=el.id!==next;});document.querySelectorAll('nav [data-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.tab===next);el.setAttribute('aria-current',el.dataset.tab===next?'page':'false');});text('#page-title',titles[next]);if(next==='logs') loadLog();}
document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>showTab(el.dataset.tab)));
const columns=[
  {key:'name',label:'Prozess',cls:'process-name',first:'asc',get:p=>p.name.toLowerCase(),show:p=>p.name},
  {key:'pid',label:'PID',cls:'process-pid num',first:'asc',get:p=>p.pid,show:p=>`PID ${p.pid}`},
  {key:'kind',label:'Typ',cls:'process-kind',first:'desc',title:'Ziel vor Eigener vor System',get:p=>p.target?2:p.own?1:0},
  {key:'rssBytes',label:'Speicher',cls:'process-memory num',first:'desc',get:p=>p.rssBytes,show:p=>bytes(p.rssBytes)},
  {key:'share',label:'RAM %',cls:'process-share num',first:'desc',title:'Anteil am gesamten Arbeitsspeicher',get:p=>state?.totalBytes?p.rssBytes/state.totalBytes:null,show:p=>state?.totalBytes?`${(p.rssBytes/state.totalBytes*100).toFixed(1)} %`:'—'},
  {key:'cpuPercent',label:'CPU %',cls:'process-cpu num',first:'desc',title:'Ein Kern entspricht 100 %',get:p=>p.cpuPercent,show:p=>p.cpuPercent===null||p.cpuPercent===undefined?'—':`${p.cpuPercent.toFixed(1)} %`},
  {key:'nice',label:'Priorität',cls:'process-nice num',first:'asc',title:'Nice-Wert: niedrigere Zahl bedeutet höhere Priorität',get:p=>p.nice,show:p=>p.nice===null||p.nice===undefined?'—':String(p.nice)}
];
const sortState={'#top-processes':{key:'rssBytes',dir:'desc'},'#all-processes':{key:'rssBytes',dir:'desc'}};
function sortList(list,{key,dir}){
  const col=columns.find(c=>c.key===key);const factor=dir==='asc'?1:-1;
  return [...list].sort((a,b)=>{const x=col.get(a),y=col.get(b);const xn=x===null||x===undefined,yn=y===null||y===undefined;
    if(xn||yn)return xn===yn?b.rssBytes-a.rssBytes:xn?1:-1;
    if(x<y)return -factor;if(x>y)return factor;return b.rssBytes-a.rssBytes;});
}
function setSort(container,key){
  const current=sortState[container];const col=columns.find(c=>c.key===key);
  sortState[container]=current.key===key?{key,dir:current.dir==='asc'?'desc':'asc'}:{key,dir:col.first};
  renderLists();
  $(`${container} [data-sort="${key}"]`)?.focus();
}
function renderProcesses(container,list){
  const root=$(container);root.replaceChildren();root.setAttribute('role','table');
  if(!list.length){const p=document.createElement('p');p.className='empty';p.textContent=state?.errors.some(e=>e.startsWith('Prozesse'))?'Prozessmessung nicht verfügbar.':'Keine passenden Prozesse.';root.append(p);return;}
  const sort=sortState[container];
  const head=document.createElement('div');head.className='process-row process-head';head.setAttribute('role','row');
  const spacer=document.createElement('span');spacer.className='process-icon-space';spacer.setAttribute('role','columnheader');spacer.setAttribute('aria-label','Symbol');head.append(spacer);
  for(const col of columns){
    const cell=document.createElement('span');cell.className=col.cls;cell.setAttribute('role','columnheader');
    cell.setAttribute('aria-sort',sort.key===col.key?(sort.dir==='asc'?'ascending':'descending'):'none');
    const button=document.createElement('button');button.type='button';button.className='sort-button';button.dataset.sort=col.key;
    button.textContent=col.label+(sort.key===col.key?(sort.dir==='asc'?' ▲':' ▼'):'');
    button.title=`Nach ${col.label} sortieren${col.title?` · ${col.title}`:''}`;
    button.addEventListener('click',()=>setSort(container,col.key));cell.append(button);head.append(cell);
  }
  root.append(head);
  for(const process of sortList(list,sort)){
    const row=document.createElement('div');row.className='process-row';row.setAttribute('role','row');
    const icon=document.createElement('span');icon.className='process-icon';icon.setAttribute('role','cell');icon.textContent=process.name.slice(0,1).toUpperCase();row.append(icon);
    for(const col of columns){
      const el=document.createElement('span');el.setAttribute('role','cell');
      if(col.key==='kind'){el.className=`process-kind`;const badge=document.createElement('span');badge.className=`badge${process.target?' target':''}`;badge.textContent=process.target?'Ziel':process.own?'Eigener':'System';el.append(badge);}
      else{el.className=col.cls;el.textContent=col.show(process);}
      row.append(el);
    }root.append(row);
  }
}
function renderLists(){if(!state)return;renderProcesses('#top-processes',state.processes.slice(0,5));filterProcesses();}
function filterProcesses(){if(!state)return;const query=$('#search').value.toLowerCase();renderProcesses('#all-processes',state.processes.filter(p=>p.name.toLowerCase().includes(query)||String(p.pid).includes(query)));}
$('#search').addEventListener('input',filterProcesses);
function fillConfig(){
  if(!state||state.config.error)return;
  const form=$('#config-form');for(const [key,value] of Object.entries(state.config.value)){const field=form.elements.namedItem(key);if(!field)continue;if(key==='targets')field.value=value.join('\n');else if(typeof value==='boolean')field.checked=value;else field.value=value;}
  configRevision=state.config.revision;configLoaded=true;dirty=false;text('#dirty-state','Keine Änderungen');
  text('#config-path',`Quelle: ${state.config.path}${state.config.inherited?' · Beim Speichern entsteht eine benutzerspezifische Konfiguration.':''}`);
}
function render(){
  const level=state.state;
  const color=statusColor(level);
  text('#connection','● Live · lokal');text('#health',labels[level]);text('#health-copy',copy[level]);$('#state-dot').style.background=color;
  text('#free',state.free===null?'—':`${state.free}%`);$('#gauge-value').style.stroke=color;$('#gauge-value').style.strokeDashoffset=421*(1-(state.free??0)/100);
  text('#ram',bytes(state.totalBytes));text('#swap',bytes(state.swapUsedBytes));text('#swap-files',`${state.swapfiles??'—'} Swap-Dateien`);text('#target-count',state.config.value.targets.length);text('#target-matches',`${state.processes.filter(p=>p.target).length} Treffer in den Top 100`);
  const running=state.agent?.state==='running',external=state.agent?.source==='launchagent';
  text('#monitor-status',running?'Aktiv':state.agent?.source?'Geladen':'Inaktiv');text('#monitor-source',external?'Installierter LaunchAgent':state.agent?.source==='app'?'Durch diese App gestartet':'Nur Anzeige · kein Schutz aktiv');
  text('#monitor-pill',running?'Monitor läuft':'Monitor nicht aktiv');text('#pause-pill',state.paused?'Prozessbeendigung pausiert':'Prozessbeendigung nicht pausiert');
  const pause=$('#pause');pause.disabled=false;pause.textContent=state.paused?'Pause aufheben':'Beenden pausieren';
  const monitor=$('#monitor');monitor.disabled=external||state.agent?.source==='unknown'||!!state.config.error;monitor.textContent=state.agent?.source==='unknown'?'Status unbekannt':external?'Extern verwaltet':running?'Monitor stoppen':'Monitor starten';
  text('#agent-note',external?'Der installierte Dienst wird hier nicht ersetzt. Seine Version ist nicht verifiziert. Die neue Version muss separat installiert werden.':'Ein hier gestarteter Monitor endet mit dem Server. Ein geschlossener Browser-Tab stoppt ihn nicht.');
  const points=state.history;let segments=[],current=[];
  points.forEach((p,i)=>{if(p.free===null){if(current.length)segments.push(current);current=[];}else current.push(`${points.length===1?0:i/(points.length-1)*640},${145-p.free*1.4}`);});if(current.length)segments.push(current);
  const svg=$('#chart');svg.querySelectorAll('.series').forEach(el=>el.remove());$('#chart-line').setAttribute('points','');
  for(const points of segments){const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.classList.add('series');line.setAttribute('points',points.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',color);line.setAttribute('stroke-width','2.5');svg.append(line);}
  renderLists();if(!configLoaded||!dirty)fillConfig();
  text('#updated',`Messung: ${new Date(state.time).toLocaleTimeString('de-DE')}`);
  const errors=[...state.errors,...(state.monitorError?[state.monitorError]:[]),...(state.agent?.error?[state.agent.error]:[])];$('#error').hidden=!errors.length;if(errors.length)error(errors.join(' · '));
}
async function refresh(){if(inFlight)return;inFlight=true;try{state=await api('/api/status');render();}catch(e){text('#connection','● Verbindung unterbrochen');error(`Keine aktuellen Daten: ${e.message}. Angezeigte Messwerte können veraltet sein.`);$('#pause').disabled=true;$('#monitor').disabled=true;}finally{inFlight=false;}}
async function loadLog(){try{text('#log-output',(await api('/api/log')).text);}catch(e){error(e.message);}}
$('#refresh-log').addEventListener('click',loadLog);
function confirm(title,description,details,action){pending=action;text('#confirm-title',title);text('#confirm-description',description);text('#confirm-details',details);$('#confirm-dialog').showModal();}
$('#cancel').addEventListener('click',()=>{$('#confirm-dialog').close();pending=null;});
$('#confirm-dialog').addEventListener('cancel',()=>{pending=null;});
$('#confirm').addEventListener('click',async()=>{if(!pending)return;$('#confirm').disabled=true;const action=pending;pending=null;try{await action();$('#confirm-dialog').close();await refresh();}catch(e){$('#confirm-dialog').close();error(e.message);}finally{$('#confirm').disabled=false;}});
$('#pause').addEventListener('click',()=>{if(!state)return;const expected=state.paused;const paused=!expected;confirm(paused?'Prozessbeendigung pausieren?':'Prozessbeendigung wieder zulassen?',paused?'Messungen laufen weiter. Der Monitor soll keine Prozesse mehr beenden.':'Bei kritischen Messwerten kann der Monitor passende Ziele beenden. Ungespeicherte Arbeit kann verloren gehen.',`Objekt: ~/.memguard-off\nBetroffene Objekte: 1\nIst: ${expected?'pausiert':'nicht pausiert'}\nSoll: ${paused?'pausiert':'nicht pausiert'}`,async()=>{const result=await api('/api/pause',{paused,expected});success(`Rückprüfung: ${result.paused?'pausiert':'Pause aufgehoben'}.`);});});
$('#monitor').addEventListener('click',()=>{if(!state)return;const action=state.agent?.source==='app'?'stop':'start';const revision=state.config.revision;confirm(action==='start'?'Monitor starten?':'Monitor stoppen?',action==='start'?'Der Monitor verwendet die unten gezeigten Zielmuster. Bei kritischen Werten sind SIGTERM und danach SIGKILL möglich.':'Nur der von dieser App gestartete Monitor wird beendet.',`Objekt: MemGuard ${state.version}\nBetroffene Objekte: 1 Monitor\nAktion: ${action}\nZiele:\n${state.config.value.targets.join('\n')||'(keine — nur warnen)'}\nPause: ${state.paused?'aktiv':'inaktiv'}`,async()=>{const result=await api('/api/monitor',{action,revision});success(result.message);});});
$('#config-form').addEventListener('input',()=>{dirty=true;text('#dirty-state','Ungespeicherte Änderungen');});
$('#reload-config').addEventListener('click',()=>{if(dirty)confirm('Eingaben verwerfen?','Die gespeicherte Konfiguration wird erneut in das Formular geladen.','Nur ungespeicherte Formulareingaben sind betroffen.',async()=>{fillConfig();});else fillConfig();});
$('#config-form').addEventListener('submit',event=>{
  event.preventDefault();if(!state||state.config.error){error('Konfiguration nicht verfügbar.');return;}
  const form=event.currentTarget;const config={};for(const [key,value] of Object.entries(state.config.value)){const field=form.elements.namedItem(key);config[key]=key==='targets'?field.value.split('\n').map(v=>v.trim()).filter(Boolean):typeof value==='number'?Number(field.value):typeof value==='boolean'?field.checked:field.value;}
  const details=`Objekt: ${state.config.writablePath||state.config.path}\nBetroffene Objekte: 1 Konfigurationsdatei\n\nIST:\n${JSON.stringify(state.config.value,null,2)}\n\nSOLL:\n${JSON.stringify(config,null,2)}`;
  const revision=configRevision;confirm('Konfiguration speichern?','Die bestehende Benutzerkonfiguration wird gesichert. Ein laufender Monitor liest Änderungen spätestens nach 30 Prüfzyklen ein. Bis dahin gelten die bisherigen Werte.',details,async()=>{await api('/api/config',{config,revision});dirty=false;configLoaded=false;success('Gespeichert und vollständig zurückgelesen. Die Übernahme durch den laufenden Monitor ist damit noch nicht bestätigt.');});
});
$('#export').addEventListener('click',async()=>{try{const data=await api('/api/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='memguard-diagnose.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error(e.message);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
(async()=>{try{token=(await api('/api/session')).token;await refresh();setInterval(refresh,5000);}catch(e){error(`Start fehlgeschlagen: ${e.message}`);}})();
