import http from 'node:http';
import { readFile, writeFile, mkdir, rename, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { homedir, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { defaults, validateConfig, classify, command, parseProcesses, parsePreview, parseHeartbeat, assessMonitor, configLevels, buildProposal, advisorDefaults, parseAdvisorEndpoint, validateAdvisor, advisorMessages, parseAdvisorReply, applyAdvice } from './core.mjs';
import { dashboardIdentity, dashboardVersion } from './open-dashboard.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const version = dashboardVersion;
const errorText = error => error.message.split('\n')[0];
export async function createApp({home=homedir(), port=0, sampleCommand=command, testMode=false, signalProcess=process.kill, fetchImpl=fetch}={}) {
  const userConfig = join(home,'Library/Application Support/MemGuard/config.json');
  const systemConfig = '/Library/Application Support/MemGuard/config.json';
  const logDir = join(home,'Library/Logs/MemGuard');
  const pauseFile = join(home,'.memguard-off');
  const advisorFile = join(home,'Library/Application Support/MemGuard/advisor.json');
  const token = randomBytes(32).toString('hex');
  let monitor=null, monitorError=null, busy=false, cache=null, sampling=null;
  const history=[];
  async function configuration() {
    const path = existsSync(userConfig) ? userConfig : (!testMode && existsSync(systemConfig) ? systemConfig : null);
    const raw = path ? await readFile(path,'utf8') : JSON.stringify(defaults,null,2)+'\n';
    return {value:validateConfig(JSON.parse(raw)), revision:hash(`${path}\n${raw}`), exists:Boolean(path), path:path || userConfig, writablePath:userConfig, inherited:path===systemConfig};
  }
  async function agentStatus() {
    if (monitor) return {state:'running',source:'app',pid:monitor.pid,version};
    if (testMode) return {state:'stopped',source:null};
    try {
      const output=await sampleCommand('/bin/launchctl',['print',`gui/${process.getuid()}/tech.farpoint.memguard`]);
      const state=output.match(/\bstate = ([^\n]+)/)?.[1]?.trim() || 'unknown';
      return {state,source:'launchagent',pid:Number(output.match(/\bpid = (\d+)/)?.[1]) || null};
    } catch(error) {
      if(/Could not find service|Could not find specified service/.test(error.stderr || '')) return {state:'stopped',source:null};
      return {state:'unknown',source:'unknown',error:'LaunchAgent-Status nicht lesbar; Start gesperrt.'};
    }
  }
  // What the monitor reports about itself. A loaded service is not protection:
  // only a fresh heartbeat from a process that is really a memguard monitor is.
  async function monitorReport() {
    const file = join(logDir,'heartbeat.json');
    let raw, heartbeat = null, parseProblem = null, processArgs = null;
    try {
      const info = await stat(file);
      if (info.size > 8192) parseProblem = 'Heartbeat ungültig: zu groß.';
      else raw = await readFile(file,'utf8');
    } catch(error) { if (error.code !== 'ENOENT') parseProblem = 'Heartbeat-Datei nicht lesbar.'; }
    if (raw !== undefined) { const parsed = parseHeartbeat(raw); if (parsed.ok) heartbeat = parsed.value; else parseProblem = parsed.problem; }
    if (heartbeat) { try { processArgs = await sampleCommand('/bin/ps',['-p',String(heartbeat.pid),'-o','args=']); } catch { processArgs = null; } }
    return {heartbeat, monitor:assessMonitor({heartbeat, parseProblem, nowSeconds:Math.floor(Date.now()/1000), processArgs})};
  }
  async function sample() {
    const errors=[];
    let config;
    try { config=await configuration(); }
    catch(error) { config={value:defaults,revision:null,path:userConfig,error:errorText(error)}; errors.push(`Konfiguration ungültig: ${errorText(error)}`); }
    const result=await Promise.allSettled([
      sampleCommand('/usr/sbin/sysctl',['-n','kern.memorystatus_level']),
      sampleCommand('/usr/sbin/sysctl',['-n','hw.memsize']),
      sampleCommand('/usr/sbin/sysctl',['vm.swapusage']),
      sampleCommand('/bin/ps',['-Axo','pid=,uid=,rss=,%cpu=,nice=,args=']),
      testMode ? Promise.resolve([]) : readdir('/System/Volumes/VM'),
      agentStatus()
    ]);
    const take=(i,label) => { if(result[i].status==='fulfilled') return result[i].value; errors.push(`${label} nicht verfügbar`); return null; };
    const freeRaw=take(0,'Speicherindikator'), totalRaw=take(1,'RAM'), swapRaw=take(2,'Swap'), processesRaw=take(3,'Prozesse'), files=take(4,'Swap-Dateien');
    const free=freeRaw!==null && /^\d+$/.test(freeRaw) && Number(freeRaw)<=100 ? Number(freeRaw) : null;
    const totalBytes=totalRaw!==null && /^\d+$/.test(totalRaw) ? Number(totalRaw) : null;
    const swapMatch=swapRaw?.match(/used\s*=\s*([\d.]+)([MG])/);
    const swapUsedBytes=swapMatch ? Number(swapMatch[1])*(swapMatch[2]==='G'?1024**3:1024**2):null;
    const swapfiles=files===null ? null : files.filter(f=>/^swapfile\d+$/.test(f)).length;
    if(free===null && freeRaw!==null) errors.push('Speicherindikator unlesbar');
    const processes=processesRaw===null ? [] : parseProcesses(processesRaw,config.value.targets,process.getuid(),home).slice(0,100);
    const state=config.error ? 'unknown' : classify(free,swapfiles,config.value);
    const report=await monitorReport();
    const levels=configLevels({config,monitor:report.monitor,heartbeat:report.heartbeat,home});
    const now=new Date().toISOString();
    history.push({time:now,free,swapUsedBytes}); if(history.length>180) history.shift();
    cache={version,time:now,state,free,totalBytes,swapUsedBytes,swapfiles,processes,config,paused:existsSync(pauseFile),agent:take(5,'Monitor'),heartbeat:report.monitor,configLevels:levels,monitorError,errors,history:[...history]};
    return cache;
  }

  // ---- Abhilfe (MG-16) ----
  async function advisorSettings() {
    try { return validateAdvisor(JSON.parse(await readFile(advisorFile,'utf8'))); }
    catch(error) { if(error.code==='ENOENT') return {...advisorDefaults}; throw Error(`KI-Einstellungen ungültig: ${errorText(error)}`); }
  }
  async function currentProposal() {
    const state=await getSample();
    const agentPid=state.agent?.pid;
    const protectedPids=[process.pid,process.ppid,...(Number.isInteger(agentPid)?[agentPid]:[])];
    return {state,proposal:buildProposal({state:state.state,free:state.free,swapfiles:state.swapfiles,processes:state.processes,config:state.config.value,protectedPids})};
  }
  // Talks to a model on this Mac only. The endpoint is checked again here, redirects are refused,
  // and only the filtered prompt from core.mjs is sent.
  async function askAdvisor(settings,messages) {
    const root=parseAdvisorEndpoint(settings.endpoint).href.replace(/\/+$/,'');
    const signal=AbortSignal.timeout(settings.timeout_seconds*1000);
    const readText=async response=>{const text=await response.text();if(text.length>262144) throw Error('Die Antwort der lokalen KI ist zu groß.');return text;};
    const call=async(url,init)=>{
      let response;
      try { response=await fetchImpl(url,{...init,redirect:'error',signal}); }
      catch(error) { throw Error(error.name==='TimeoutError' ? `Die lokale KI antwortete nicht innerhalb von ${settings.timeout_seconds} s.` : 'Die lokale KI ist nicht erreichbar. Läuft der Dienst unter dem eingetragenen Endpunkt?'); }
      if(!response.ok) throw Error(`Die lokale KI antwortete mit HTTP ${response.status}.`);
      return readText(response);
    };
    let model=settings.model;
    if(!model) {
      const listed=JSON.parse(await call(`${root}/models`,{method:'GET'}));
      model=listed?.data?.[0]?.id;
      if(typeof model!=='string' || !model) throw Error('Die lokale KI meldet kein Modell. Modellnamen in den Einstellungen eintragen.');
    }
    const reply=JSON.parse(await call(`${root}/chat/completions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages,temperature:0,max_tokens:800,stream:false})}));
    const content=reply?.choices?.[0]?.message?.content;
    if(typeof content!=='string') throw Error('Die Antwort der lokalen KI hatte nicht die erwartete Form.');
    return {model,content};
  }
  async function stillOwnTarget(pid,targets) {
    // Last look before a signal: still my process, still matching a configured pattern, never MemGuard itself.
    let line; try { line=await sampleCommand('/bin/ps',['-p',String(pid),'-o','uid=,args=']); } catch { return false; }
    const match=line.trim().match(/^(\d+)\s+(.+)$/);
    return Boolean(match) && Number(match[1])===process.getuid() && !match[2].includes('memguard') && targets.some(t=>match[2].includes(t.replaceAll('~',home)));
  }
  function getSample() {
    if(!sampling) sampling=sample().finally(()=>{sampling=null;});
    return sampling;
  }
  async function logTail() {
    const path=join(logDir,'memguard.log');
    try {
      const info=await stat(path);
      if(info.size>2*1024*1024) return 'Log größer als 2 MB. Lokal öffnen: '+path;
      return (await readFile(path,'utf8')).split('\n').slice(-60).join('\n');
    } catch(error) { if(error.code==='ENOENT') return 'Noch keine Protokolle vorhanden.'; throw error; }
  }
  function send(res,status,value,type='application/json') {
    res.writeHead(status,{'Content-Type':type+(type.startsWith('font/')?'':'; charset=utf-8'),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    res.end(type==='application/json'?JSON.stringify(value):value);
  }
  async function body(req) {
    let text='';
    for await (const chunk of req) { text+=chunk; if(Buffer.byteLength(text)>32*1024) throw Error('Anfrage zu groß.'); }
    return JSON.parse(text);
  }
  const server=http.createServer(async(req,res)=>{
    try {
      const origin=`http://127.0.0.1:${server.address().port}`;
      if(req.headers.host!==`127.0.0.1:${server.address().port}`) return send(res,403,{error:'Host nicht erlaubt.'});
      if(req.headers.origin && req.headers.origin!==origin) return send(res,403,{error:'Origin nicht erlaubt.'});
      if(req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site'])) return send(res,403,{error:'Fremder Seitenaufruf gesperrt.'});
      const path=new URL(req.url,origin).pathname;
      if(req.method==='GET') {
        if(path==='/favicon.ico') { res.writeHead(204); return res.end(); }
        if(path==='/api/health') return send(res,200,{app:dashboardIdentity,version});
        const fonts=['raleway-latin-700-normal.woff2','raleway-latin-800-normal.woff2','ibm-plex-sans-latin-400-normal.woff2','ibm-plex-sans-latin-500-normal.woff2','ibm-plex-sans-latin-600-normal.woff2'];
        if(fonts.some(name=>path===`/fonts/${name}`)) return send(res,200,await readFile(join(here,'public',path.slice(1))),'font/woff2');
        const files={'/':'index.html','/app.js':'app.js','/theme.js':'theme.js','/style.css':'style.css'};
        if(path in files) return send(res,200,await readFile(join(here,'public',files[path])) ,path==='/'?'text/html':path.endsWith('js')?'text/javascript':'text/css');
        if(path==='/api/session') return send(res,200,{token,version});
        if(path==='/api/status') return send(res,200,await getSample());
        if(path==='/api/log') return send(res,200,{text:await logTail()});
        if(path==='/api/proposal') {
          const {proposal}=await currentProposal(); const settings=await advisorSettings();
          return send(res,200,{proposal,advisor:{enabled:settings.enabled,configured:Boolean(settings.endpoint)}});
        }
        if(path==='/api/advisor') return send(res,200,{settings:await advisorSettings()});
        if(path==='/api/preview') {
          // Read-only: lists what the monitor would signal for these patterns; sends no signal.
          let targets;
          try { targets=JSON.parse(new URL(req.url,origin).searchParams.get('targets') ?? '[]'); } catch { return send(res,400,{error:'Zielmuster unlesbar.'}); }
          let base; try { base=(await configuration()).value; } catch { base=defaults; } // invalid saved config: fall back to defaults, patterns are validated below
          let candidate;
          try { candidate=validateConfig({...base,targets}); } catch(error) { return send(res,400,{error:errorText(error)}); }
          const agent=await agentStatus();
          const monitorPid=agent.state==='running' && Number.isInteger(agent.pid) && agent.pid>1 ? agent.pid : 1;
          const temp=join(tmpdir(),`memguard-preview-${randomBytes(8).toString('hex')}.json`);
          let rows;
          try {
            await writeFile(temp,JSON.stringify(candidate),{mode:0o600,flag:'wx'});
            rows=parsePreview(await sampleCommand('/bin/zsh',[resolve(here,'../src/memguard'),'preview',temp,String(monitorPid)],{timeout:20000}));
          } finally { try { await unlink(temp); } catch(error) { if(error.code!=='ENOENT') throw error; } }
          // Respond only after the temporary configuration is gone.
          const counts={};for(const row of rows) counts[row.status]=(counts[row.status]??0)+1;
          return send(res,200,{monitorPid,monitorSource:agent.source ?? null,rows,counts});
        }
        if(path==='/api/export') {
          const state=await getSample();
          const {config:{value:config},processes,heartbeat,configLevels:levels}=state;
          // Shareable diagnostics use an allowlist at every level. Never spread
          // sampled state: future fields and free-text errors may identify users.
          return send(res,200,{
            version:state.version,time:state.time,state:state.state,free:state.free,
            totalBytes:state.totalBytes,swapUsedBytes:state.swapUsedBytes,swapfiles:state.swapfiles,
            paused:state.paused,errorCount:state.errors.length,monitorFailed:Boolean(state.monitorError),
            agent:{state:['running','stopped','waiting','unknown'].includes(state.agent?.state)?state.agent.state:'unknown',
              source:['app','launchagent','unknown'].includes(state.agent?.source)?state.agent.source:null},
            config:{language:config.language,notifications:config.notifications,interval:config.interval,
              warn_free_percent:config.warn_free_percent,critical_free_percent:config.critical_free_percent,
              warn_swapfiles:config.warn_swapfiles,critical_swapfiles:config.critical_swapfiles,
              warn_repeat_seconds:config.warn_repeat_seconds,terminate_grace_seconds:config.terminate_grace_seconds,
              targets:config.targets.map(()=> '[redacted]')},
            processes:processes.map(({rssBytes,own,target})=>({rssBytes,own,target})),
            monitorHeartbeat:{state:heartbeat.state,ageSeconds:heartbeat.ageSeconds??null,version:heartbeat.version??null},
            configLevels:{saved:levels.saved.ok,loaded:levels.loaded.ok,verified:levels.verified.ok},
            history:state.history.map(({time,free,swapUsedBytes})=>({time,free,swapUsedBytes}))
          });
        }
        return send(res,404,{error:'Nicht gefunden.'});
      }
      if(req.method!=='POST') return send(res,405,{error:'Methode nicht erlaubt.'});
      if(req.headers['x-memguard-token']!==token || req.headers.origin!==origin || req.headers['content-type']!=='application/json') return send(res,403,{error:'Bestätigung aus dieser lokalen Sitzung erforderlich.'});
      if(busy) return send(res,409,{error:'Eine Änderung läuft bereits.'});
      busy=true;
      try {
        const data=await body(req);
        if(data.confirm!==true) return send(res,400,{error:'Ausdrückliche Bestätigung fehlt.'});
        if(path==='/api/config') {
          const current=await configuration();
          if(data.revision!==current.revision) return send(res,409,{error:'Konfiguration wurde inzwischen geändert. Neu laden und erneut prüfen.'});
          const next=validateConfig(data.config);
          await mkdir(dirname(userConfig),{recursive:true});
          if(existsSync(userConfig)) await writeFile(`${userConfig}.backup-${randomBytes(6).toString('hex')}`,await readFile(userConfig),{mode:0o600,flag:'wx'});
          const temp=`${userConfig}.${randomBytes(8).toString('hex')}.tmp`;
          try { await writeFile(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'}); await rename(temp,userConfig); }
          finally { try { await unlink(temp); } catch(error) { if(error.code!=='ENOENT') throw error; } }
          const saved=await configuration();
          if(JSON.stringify(saved.value)!==JSON.stringify(next)) throw Error('Rückprüfung der Konfiguration fehlgeschlagen.');
          return send(res,200,{config:saved});
        }
        if(path==='/api/pause') {
          if(typeof data.paused!=='boolean') return send(res,400,{error:'Ungültiger Pause-Wert.'});
          if(data.expected!==existsSync(pauseFile)) return send(res,409,{error:'Pausenzustand hat sich geändert. Neu laden.'});
          if(data.paused) await writeFile(pauseFile,'',{mode:0o600});
          else { try { await unlink(pauseFile); } catch(error) { if(error.code!=='ENOENT') throw error; } }
          return send(res,200,{paused:existsSync(pauseFile)});
        }
        if(path==='/api/advisor') {
          const next=validateAdvisor(data.settings);
          await mkdir(dirname(advisorFile),{recursive:true});
          const temp=`${advisorFile}.${randomBytes(8).toString('hex')}.tmp`;
          try { await writeFile(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600,flag:'wx'}); await rename(temp,advisorFile); }
          finally { try { await unlink(temp); } catch(error) { if(error.code!=='ENOENT') throw error; } }
          const saved=await advisorSettings();
          if(JSON.stringify(saved)!==JSON.stringify(next)) throw Error('Rückprüfung der KI-Einstellungen fehlgeschlagen.');
          return send(res,200,{settings:saved});
        }
        if(path==='/api/proposal/advice') {
          // Optional second opinion from a model on this Mac. It can reorder and comment, nothing else.
          const settings=await advisorSettings();
          const {state,proposal}=await currentProposal();
          if(!settings.enabled) return send(res,409,{error:'Die lokale KI ist nicht aktiviert.',proposal});
          if(!proposal.steps.length) return send(res,200,{proposal:{...proposal,advisor:{status:'skipped',summary:'Keine Schritte zu bewerten.'}}});
          try {
            const answer=await askAdvisor(settings,advisorMessages({free:state.free,swapfiles:state.swapfiles,totalBytes:state.totalBytes,steps:proposal.steps}));
            const advice=parseAdvisorReply(answer.content,proposal.steps);
            if(!advice.ok) return send(res,200,{proposal:{...proposal,advisor:{status:'unusable',problem:advice.problem,model:answer.model}}});
            const applied=applyAdvice(proposal,advice);
            return send(res,200,{proposal:{...applied,advisor:{...applied.advisor,model:answer.model}}});
          } catch(error) { return send(res,200,{proposal:{...proposal,advisor:{status:'unavailable',problem:errorText(error)}}}); }
        }
        if(path==='/api/remediate') {
          // Runs one step of the proposal computed right now. A step that is not in it cannot be run.
          if(typeof data.id!=='string') return send(res,400,{error:'Schritt fehlt.'});
          const {state,proposal}=await currentProposal();
          const step=proposal.steps.find(s=>s.id===data.id);
          if(!step) return send(res,409,{error:'Dieser Schritt wird im aktuellen Stand nicht vorgeschlagen. Neu laden.'});
          if(step.kind==='quit_app') {
            await sampleCommand('/usr/bin/osascript',['-e','on run argv\ntell application (item 1 of argv) to quit\nend run',step.name],{timeout:15000});
            return send(res,200,{message:`${step.name}: Beenden angefordert. Die App kann nachfragen, ob Änderungen gesichert werden sollen.`});
          }
          if(step.kind==='terminate_targets') {
            const targets=state.config.value.targets;
            const sent=[],skipped=[];
            for(const pid of step.pids) {
              if(!(await stillOwnTarget(pid,targets))) { skipped.push(pid); continue; }
              try { signalProcess(pid,'SIGTERM'); sent.push(pid); } catch { skipped.push(pid); }
            }
            return send(res,200,{message:`SIGTERM an ${sent.length} Prozess${sent.length===1?'':'e'} gesendet${skipped.length?`, ${skipped.length} übersprungen (beendet oder nicht mehr passend)`:''}.`,sent,skipped});
          }
          if(step.kind==='restart_mac') {
            if(data.phrase!=='NEUSTART') return send(res,400,{error:'Zur Bestätigung NEUSTART eintippen.'});
            await sampleCommand('/usr/bin/osascript',['-e','tell application "System Events" to restart'],{timeout:15000});
            return send(res,200,{message:'Neustart angefordert. Apps mit ungesicherten Änderungen können ihn noch unterbrechen.'});
          }
          return send(res,409,{error:'Unbekannte Schrittart.'});
        }
        if(path==='/api/monitor') {
          if(data.action==='start') {
            const agent=await agentStatus();
            if(agent.source) return send(res,409,{error:'Ein Monitor ist bereits vorhanden. Kein zweiter Start.'});
            const config=await configuration();
            if(data.revision!==config.revision) return send(res,409,{error:'Konfiguration geändert. Erneut prüfen.'});
            if(testMode) return send(res,409,{error:'Prozessstart im Testmodus gesperrt.'});
            if(platform()!=='darwin') return send(res,409,{error:'Monitoring benötigt macOS.'});
            await mkdir(logDir,{recursive:true});
            const env={...process.env};
            for(const key of Object.keys(env)) if(key.startsWith('MEMGUARD_')) delete env[key];
            env.MEMGUARD_CONFIG=existsSync(config.path)?config.path:resolve(here,'../src/config.default.json');
            const nativeApp=resolve(here,'../../../..');
            if(nativeApp.endsWith('.app') && existsSync(nativeApp)) env.MEMGUARD_NOTIFICATION_APP=nativeApp;
            monitor=spawn('/bin/zsh',[resolve(here,'../src/memguard'),'run'],{env,stdio:['ignore','ignore','pipe']});
            monitorError=null;
            monitor.stderr.on('data',chunk=>{monitorError=String(chunk).slice(0,1000);});
            monitor.once('error',error=>{monitorError=errorText(error); monitor=null;});
            monitor.once('exit',code=>{if(code) monitorError ||= `Monitor beendet mit Code ${code}`; monitor=null;});
            return send(res,202,{message:'Start angefordert; Live-Status prüfen.'});
          }
          if(data.action==='stop' && monitor) { monitor.kill('SIGTERM'); return send(res,202,{message:'Stopp angefordert; Live-Status prüfen.'}); }
          return send(res,409,{error:'Nur ein durch diese App gestarteter Monitor kann hier gestoppt werden.'});
        }
        return send(res,404,{error:'Nicht gefunden.'});
      } finally { busy=false; }
    } catch(error) { send(res,400,{error:errorText(error)}); }
  });
  server.requestTimeout=10000; server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  return {server,url:`http://127.0.0.1:${server.address().port}`,close:async()=>{if(monitor) monitor.kill('SIGTERM');await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port=Number(process.env.MEMGUARD_PORT || 0);
  if(!Number.isInteger(port)||port<0||port>65535) throw Error('Ungültiger Port.');
  const app=await createApp({port});
  console.log(`MemGuard ${version} · ${app.url}`);
  if(process.argv.includes('--open')) spawn('/usr/bin/open',[app.url],{stdio:'ignore'}).on('error',e=>console.error(errorText(e)));
  for(const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{await app.close();process.exit(0);});
}
