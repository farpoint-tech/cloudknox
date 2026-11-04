'use strict';
const $=selector=>document.querySelector(selector);
let state=null,token=null,dirty=false,configLoaded=false,pending=null,inFlight=false,tab='overview',configRevision=null,proposal=null,advised=null,advisorInfo={enabled:false,configured:false},phraseRequired=null,advisorLoaded=false,advisorDirty=false;
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
function showTab(next){tab=next;document.querySelectorAll('.tab').forEach(el=>{el.hidden=el.id!==next;});document.querySelectorAll('nav [data-tab]').forEach(el=>{el.classList.toggle('active',el.dataset.tab===next);el.setAttribute('aria-current',el.dataset.tab===next?'page':'false');});text('#page-title',titles[next]);if(next==='logs') loadLog();if(next==='settings'&&!advisorLoaded) loadAdvisor();}
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
function ago(seconds){if(seconds===null||seconds===undefined)return '—';if(seconds<90)return `${Math.max(0,Math.round(seconds))} s`;if(seconds<5400)return `${Math.round(seconds/60)} min`;return `${Math.round(seconds/3600)} h`;}
function renderLevels(){
  const root=$('#config-levels');root.replaceChildren();const levels=state.configLevels;if(!levels)return;
  const rows=[
    ['Gespeichert',levels.saved,levels.saved.ok?`Revision ${levels.saved.revision.slice(0,8)}`:levels.saved.reason],
    ['Vom Monitor geladen',levels.loaded,levels.loaded.ok?`Geladen um ${new Date(levels.loaded.loadedAt*1000).toLocaleTimeString('de-DE')}`:levels.loaded.reason],
    ['Wirksam geprüft',levels.verified,levels.verified.ok?(state.heartbeat?.paused?'Werte stimmen. Pausiert: es wird nichts beendet.':'Werte stimmen, letzte Messung erfolgreich.'):levels.verified.reason]
  ];
  for(const [label,level,detail] of rows){
    const li=document.createElement('li');li.className=level.ok?'level-ok':'level-open';
    const mark=document.createElement('strong');mark.textContent=level.ok?'Ja':'Nicht belegt';
    const name=document.createElement('span');name.className='level-name';name.textContent=label;
    const note=document.createElement('span');note.className='level-note';note.textContent=detail;
    li.append(mark,name,note);root.append(li);
  }
}
function render(){
  const level=state.state;
  const color=statusColor(level);
  text('#connection','● Live · lokal');text('#health',labels[level]);text('#health-copy',copy[level]);$('#state-dot').style.background=color;
  text('#free',state.free===null?'—':`${state.free}%`);$('#gauge-value').style.stroke=color;$('#gauge-value').style.strokeDashoffset=421*(1-(state.free??0)/100);
  text('#ram',bytes(state.totalBytes));text('#swap',bytes(state.swapUsedBytes));text('#swap-files',`${state.swapfiles??'—'} Swap-Dateien`);text('#target-count',state.config.value.targets.length);text('#target-matches',`${state.processes.filter(p=>p.target).length} Treffer in den Top 100`);
  const running=state.agent?.state==='running',external=state.agent?.source==='launchagent';
  const hb=state.heartbeat||{state:'none',problems:[]},live=hb.state==='active';
  const origin=external?'Installierter Dienst':state.agent?.source==='app'?'Durch diese App gestartet':'Monitor';
  let monitorStatus,monitorSource,monitorPill;
  if(live){monitorStatus='Aktiv';monitorSource=`${origin} · Version ${hb.version} · Rückmeldung vor ${ago(hb.ageSeconds)}`;monitorPill='Monitor läuft';}
  else if(hb.state==='stale'){monitorStatus='Keine Rückmeldung';monitorSource=`Letzte Rückmeldung vor ${ago(hb.ageSeconds)}. ${hb.problems[0]} Schutz nicht belegt.`;monitorPill='Monitor ohne Rückmeldung';}
  else if(hb.state==='invalid'){monitorStatus='Rückmeldung ungültig';monitorSource=`${hb.problems[0]} Schutz nicht belegt.`;monitorPill='Monitor ohne Rückmeldung';}
  else if(running){monitorStatus='Ohne Rückmeldung';monitorSource=`${origin} ist geladen, meldet sich aber nicht. Ältere Version (vor 1.2.0) oder gerade gestartet. Schutz nicht belegt.`;monitorPill='Monitor ohne Rückmeldung';}
  else{monitorStatus='Inaktiv';monitorSource='Nur Anzeige · kein Schutz aktiv';monitorPill='Monitor nicht aktiv';}
  text('#monitor-status',monitorStatus);text('#monitor-source',monitorSource);
  text('#monitor-pill',monitorPill);text('#pause-pill',state.paused?'Prozessbeendigung pausiert':'Prozessbeendigung nicht pausiert');
  const pause=$('#pause');pause.disabled=false;pause.textContent=state.paused?'Pause aufheben':'Beenden pausieren';
  const monitor=$('#monitor');monitor.disabled=external||state.agent?.source==='unknown'||!!state.config.error;monitor.textContent=state.agent?.source==='unknown'?'Status unbekannt':external?'Extern verwaltet':running?'Monitor stoppen':'Monitor starten';
  text('#agent-note',external?(live?`Der installierte Dienst meldet Version ${hb.version}. Er wird hier nicht ersetzt.`:'Der installierte Dienst wird hier nicht ersetzt. Seine Version ist nicht verifiziert, weil er sich nicht meldet. Die neue Version muss separat installiert werden.'):'Ein hier gestarteter Monitor endet mit dem Server. Ein geschlossener Browser-Tab stoppt ihn nicht.');
  const points=state.history;let segments=[],current=[];
  points.forEach((p,i)=>{if(p.free===null){if(current.length)segments.push(current);current=[];}else current.push(`${points.length===1?0:i/(points.length-1)*640},${145-p.free*1.4}`);});if(current.length)segments.push(current);
  const svg=$('#chart');svg.querySelectorAll('.series').forEach(el=>el.remove());$('#chart-line').setAttribute('points','');
  for(const points of segments){const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.classList.add('series');line.setAttribute('points',points.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke',color);line.setAttribute('stroke-width','2.5');svg.append(line);}
  renderLists();renderLevels();if(!configLoaded||!dirty)fillConfig();
  text('#updated',`Messung: ${new Date(state.time).toLocaleTimeString('de-DE')}`);
  const errors=[...state.errors,...(state.monitorError?[state.monitorError]:[]),...(state.agent?.error?[state.agent.error]:[])];$('#error').hidden=!errors.length;if(errors.length)error(errors.join(' · '));
}
async function refresh(){if(inFlight)return;inFlight=true;try{state=await api('/api/status');render();await loadProposal();}catch(e){text('#connection','● Verbindung unterbrochen');error(`Keine aktuellen Daten: ${e.message}. Angezeigte Messwerte können veraltet sein.`);$('#pause').disabled=true;$('#monitor').disabled=true;}finally{inFlight=false;}}
async function loadLog(){try{text('#log-output',(await api('/api/log')).text);}catch(e){error(e.message);}}
$('#refresh-log').addEventListener('click',loadLog);
function confirm(title,description,details,action,phrase=null){pending=action;phraseRequired=phrase;text('#confirm-title',title);text('#confirm-description',description);text('#confirm-details',details);$('#phrase-row').hidden=!phrase;$('#confirm-phrase').value='';if(phrase)text('#phrase-word',phrase);$('#confirm').disabled=Boolean(phrase);$('#confirm-dialog').showModal();}
$('#confirm-phrase').addEventListener('input',()=>{$('#confirm').disabled=Boolean(phraseRequired)&&$('#confirm-phrase').value!==phraseRequired;});
$('#cancel').addEventListener('click',()=>{$('#confirm-dialog').close();pending=null;});
$('#confirm-dialog').addEventListener('cancel',()=>{pending=null;});
$('#confirm').addEventListener('click',async()=>{if(!pending)return;$('#confirm').disabled=true;const action=pending;pending=null;try{await action();$('#confirm-dialog').close();await refresh();}catch(e){$('#confirm-dialog').close();error(e.message);}finally{$('#confirm').disabled=false;}});
$('#pause').addEventListener('click',()=>{if(!state)return;const expected=state.paused;const paused=!expected;confirm(paused?'Prozessbeendigung pausieren?':'Prozessbeendigung wieder zulassen?',paused?'Messungen laufen weiter. Der Monitor soll keine Prozesse mehr beenden.':'Bei kritischen Messwerten kann der Monitor passende Ziele beenden. Ungespeicherte Arbeit kann verloren gehen.',`Objekt: ~/.memguard-off\nBetroffene Objekte: 1\nIst: ${expected?'pausiert':'nicht pausiert'}\nSoll: ${paused?'pausiert':'nicht pausiert'}`,async()=>{const result=await api('/api/pause',{paused,expected});success(`Rückprüfung: ${result.paused?'pausiert':'Pause aufgehoben'}.`);});});
$('#monitor').addEventListener('click',()=>{if(!state)return;const action=state.agent?.source==='app'?'stop':'start';const revision=state.config.revision;confirm(action==='start'?'Monitor starten?':'Monitor stoppen?',action==='start'?'Der Monitor verwendet die unten gezeigten Zielmuster. Bei kritischen Werten sind SIGTERM und danach SIGKILL möglich.':'Nur der von dieser App gestartete Monitor wird beendet.',`Objekt: MemGuard ${state.version}\nBetroffene Objekte: 1 Monitor\nAktion: ${action}\nZiele:\n${state.config.value.targets.join('\n')||'(keine — nur warnen)'}\nPause: ${state.paused?'aktiv':'inaktiv'}`,async()=>{const result=await api('/api/monitor',{action,revision});success(result.message);});});
$('#config-form').addEventListener('input',()=>{dirty=true;text('#dirty-state','Ungespeicherte Änderungen');});
const previewLabels={match:'Würde beendet',ancestor:'Ausgeschlossen: Elternprozess des Monitors',self:'Ausgeschlossen: Vorschau selbst',memguard:'Ausgeschlossen: MemGuard',owner:'Ausgeschlossen: anderer Benutzer',gone:'Inzwischen beendet',pid1:'Ausgeschlossen: PID 1',nomatch:'Kein Treffer mehr',invalid:'Ungültige PID'};
async function previewTargets(){
  const field=$('#config-form').elements.namedItem('targets');
  const targets=field.value.split('\n').map(v=>v.trim()).filter(Boolean);
  const button=$('#preview-targets');button.disabled=true;text('#preview-summary','Prüfe Treffer …');
  try{
    const result=await api(`/api/preview?targets=${encodeURIComponent(JSON.stringify(targets))}`);
    const match=result.counts.match??0,total=result.rows.length,excluded=total-match;
    const scope=result.monitorPid>1?`Elternprozesse des laufenden Monitors (PID ${result.monitorPid}) sind ausgeschlossen.`:'Kein Monitor läuft: nur PID 1 ist als Elternprozess ausgeschlossen.';
    text('#preview-summary',targets.length?`${match} würden bei kritischem Speicher beendet, ${excluded} ausgeschlossen. ${scope} Es wurde kein Signal gesendet.`:'Keine Zielmuster: MemGuard würde nur warnen.');
    const root=$('#preview-result');root.replaceChildren();root.hidden=!total;
    if(!total)return;
    const table=document.createElement('table');table.className='preview-table';
    const head=table.createTHead().insertRow();for(const label of ['Entscheidung','PID','Prozess','Muster']){const th=document.createElement('th');th.scope='col';th.textContent=label;head.append(th);}
    const body=table.createTBody();
    const order={match:0};
    for(const row of [...result.rows].sort((a,b)=>(order[a.status]??1)-(order[b.status]??1)||a.name.localeCompare(b.name))){
      const tr=body.insertRow();tr.className=row.status==='match'?'preview-match':'preview-excluded';
      for(const value of [previewLabels[row.status]??row.status,String(row.pid),row.name,row.pattern]){const td=tr.insertCell();td.textContent=value;}
    }
    root.append(table);
  }catch(e){text('#preview-summary','');error(`Treffer-Vorschau fehlgeschlagen: ${e.message}`);}
  finally{button.disabled=false;}
}
$('#preview-targets').addEventListener('click',previewTargets);
$('#reload-config').addEventListener('click',()=>{if(dirty)confirm('Eingaben verwerfen?','Die gespeicherte Konfiguration wird erneut in das Formular geladen.','Nur ungespeicherte Formulareingaben sind betroffen.',async()=>{fillConfig();});else fillConfig();});
$('#config-form').addEventListener('submit',event=>{
  event.preventDefault();if(!state||state.config.error){error('Konfiguration nicht verfügbar.');return;}
  const form=event.currentTarget;const config={};for(const [key,value] of Object.entries(state.config.value)){const field=form.elements.namedItem(key);config[key]=key==='targets'?field.value.split('\n').map(v=>v.trim()).filter(Boolean):typeof value==='number'?Number(field.value):typeof value==='boolean'?field.checked:field.value;}
  const details=`Objekt: ${state.config.writablePath||state.config.path}\nBetroffene Objekte: 1 Konfigurationsdatei\n\nIST:\n${JSON.stringify(state.config.value,null,2)}\n\nSOLL:\n${JSON.stringify(config,null,2)}`;
  const revision=configRevision;confirm('Konfiguration speichern?','Die bestehende Benutzerkonfiguration wird gesichert. Ein laufender Monitor liest Änderungen spätestens nach 30 Prüfzyklen ein. Bis dahin gelten die bisherigen Werte.',details,async()=>{await api('/api/config',{config,revision});dirty=false;configLoaded=false;success('Gespeichert und vollständig zurückgelesen. Die Übernahme durch den laufenden Monitor ist damit noch nicht bestätigt.');});
});
$('#export').addEventListener('click',async()=>{try{const data=await api('/api/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='memguard-diagnose.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){error(e.message);}});

// ---- Abhilfe (MG-16) ----
const riskText={low:'geringes Risiko',medium:'mittleres Risiko',high:'hohes Risiko'};
const stepIds=p=>p.steps.map(s=>s.id).sort().join('|');
async function loadProposal(){
  if(!state||state.state==='normal'||state.state==='unknown'){proposal=null;advised=null;renderRemedy();return;}
  try{const data=await api('/api/proposal');proposal=data.proposal;advisorInfo=data.advisor;}catch(e){proposal=null;}
  if(advised&&(!proposal||stepIds(advised)!==stepIds(proposal)))advised=null;
  renderRemedy();
}
function element(tag,className,content){const el=document.createElement(tag);if(className)el.className=className;if(content!==undefined)el.textContent=content;return el;}
function renderRemedy(){
  const shown=advised||proposal,panel=$('#remedy');
  if(!shown){panel.hidden=true;return;}
  panel.hidden=false;
  $('#remedy-advice').hidden=!advisorInfo.enabled||!shown.steps.length;
  text('#remedy-note',shown.notes.join(' '));
  const list=$('#remedy-steps');list.replaceChildren();
  for(const step of shown.steps){
    const item=element('li','remedy-step'),body=element('div'),title=element('h4',null,step.title);
    title.append(element('span',`remedy-risk remedy-risk-${step.risk}`,riskText[step.risk]));
    body.append(title,element('p',null,step.why));
    if(step.advice?.note)body.append(element('p','remedy-advice',`KI: ${step.advice.note}`));
    if(step.advice?.caution)body.append(element('p','remedy-caution',`KI rät ab: ${step.advice.caution}`));
    const actions=element('div','remedy-actions');
    const run=element('button','button primary',step.kind==='restart_mac'?'Neustart vorbereiten':step.kind==='terminate_targets'?'Jetzt beenden':'Sauber beenden');run.type='button';
    run.addEventListener('click',()=>runStep(step));actions.append(run);
    if(step.suggestedPattern){const adopt=element('button','button secondary','Als Ziel vormerken');adopt.type='button';adopt.addEventListener('click',()=>adoptTarget(step));actions.append(adopt);}
    item.append(body,actions);list.append(item);
  }
  const info=shown.advisor;
  text('#remedy-advisor',!info?(advisorInfo.enabled?'Lokale KI aktiviert: „Mit lokaler KI prüfen“ holt eine zweite Meinung.':'Regelbasierter Vorschlag. Eine lokale KI lässt sich unter Einstellungen zuschalten.')
    :info.status==='ok'?`Lokale KI${info.model?` (${info.model})`:''}: ${info.summary||'Reihenfolge geprüft.'}`
    :info.status==='skipped'?info.summary
    :`Lokale KI nicht verwendet: ${info.problem} Der regelbasierte Vorschlag gilt unverändert.`);
}
function runStep(step){
  const detail=step.kind==='quit_app'?`App: ${step.name}\nAktion: Beenden per AppleScript (die App fragt bei offenen Änderungen nach)`
    :step.kind==='terminate_targets'?`Prozesse: ${step.pids.join(', ')}\nAktion: SIGTERM, nur für Prozesse, die noch zu Ihren Zielmustern passen`
    :'Aktion: macOS-Neustart anfordern. Alle Apps werden zum Beenden aufgefordert.';
  confirm(`${step.title}?`,step.why,`${detail}\nRisiko: ${riskText[step.risk]}`,async()=>{
    const result=await api('/api/remediate',{id:step.id,phrase:step.kind==='restart_mac'?'NEUSTART':undefined});success(result.message);
  },step.kind==='restart_mac'?'NEUSTART':null);
}
function adoptTarget(step){
  const field=$('#config-form').elements.namedItem('targets'),lines=field.value.split('\n').map(v=>v.trim()).filter(Boolean);
  if(!lines.includes(step.suggestedPattern))lines.push(step.suggestedPattern);
  field.value=lines.join('\n');dirty=true;text('#dirty-state','Ungespeicherte Änderungen');showTab('settings');
  success(`Muster ${step.suggestedPattern} eingetragen. Mit „Treffer prüfen“ ansehen, dann speichern: Ab da beendet der Monitor ${step.name} bei kritischem Stand selbst.`);
}
$('#remedy-advice').addEventListener('click',async()=>{
  const button=$('#remedy-advice');button.disabled=true;text('#remedy-advisor','Lokale KI wird befragt …');
  try{const data=await api('/api/proposal/advice',{});advised=data.proposal.advisor?.status==='ok'?data.proposal:null;if(!advised)proposal=data.proposal;renderRemedy();}
  catch(e){error(e.message);}finally{button.disabled=false;}
});
async function loadAdvisor(){
  try{const {settings}=await api('/api/advisor');const form=$('#advisor-form');for(const [key,value] of Object.entries(settings)){const field=form.elements.namedItem(key);if(!field)continue;if(typeof value==='boolean')field.checked=value;else field.value=value;}advisorLoaded=true;advisorDirty=false;text('#advisor-state',settings.enabled?'Aktiviert':'Deaktiviert');}
  catch(e){error(e.message);}
}
$('#advisor-form').addEventListener('input',()=>{advisorDirty=true;text('#advisor-state','Ungespeicherte Änderungen');});
$('#advisor-form').addEventListener('submit',event=>{
  event.preventDefault();const form=event.currentTarget;
  const settings={enabled:form.elements.namedItem('enabled').checked,endpoint:form.elements.namedItem('endpoint').value.trim(),model:form.elements.namedItem('model').value.trim(),timeout_seconds:Number(form.elements.namedItem('timeout_seconds').value)};
  confirm('KI-Einstellungen speichern?','Die Einstellungen bleiben auf diesem Mac. Bei Aktivierung gehen Programmnamen und Größen an den eingetragenen lokalen Endpunkt.',`Objekt: advisor.json im MemGuard-Ordner\nBetroffene Objekte: 1 Datei\n\nSOLL:\n${JSON.stringify(settings,null,2)}`,async()=>{await api('/api/advisor',{settings});advisorLoaded=false;await loadAdvisor();success('KI-Einstellungen gespeichert und zurückgelesen.');});
});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
(async()=>{try{token=(await api('/api/session')).token;await refresh();setInterval(refresh,5000);}catch(e){error(`Start fehlgeschlagen: ${e.message}`);}})();
