import http from 'node:http';
import { readFile, writeFile, mkdir, rename, unlink, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { homedir, platform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { defaults, validateConfig, classify, command, parseProcesses, parsePreview } from './core.mjs';
import { dashboardIdentity, dashboardVersion } from './open-dashboard.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex');
const version = dashboardVersion;
const errorText = error => error.message.split('\n')[0];
export async function createApp({home=homedir(), port=0, sampleCommand=command, testMode=false}={}) {
  const userConfig = join(home,'Library/Application Support/MemGuard/config.json');
  const systemConfig = '/Library/Application Support/MemGuard/config.json';
  const logDir = join(home,'Library/Logs/MemGuard');
  const pauseFile = join(home,'.memguard-off');
  const token = randomBytes(32).toString('hex');
  let monitor=null, monitorError=null, busy=false, cache=null, sampling=null;
  const history=[];
  async function configuration() {
    const path = existsSync(userConfig) ? userConfig : (!testMode && existsSync(systemConfig) ? systemConfig : null);
    const raw = path ? await readFile(path,'utf8') : JSON.stringify(defaults,null,2)+'\n';
    return {value:validateConfig(JSON.parse(raw)), revision:hash(`${path}\n${raw}`), path:path || userConfig, writablePath:userConfig, inherited:path===systemConfig};
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
    const now=new Date().toISOString();
    history.push({time:now,free,swapUsedBytes}); if(history.length>180) history.shift();
    cache={version,time:now,state,free,totalBytes,swapUsedBytes,swapfiles,processes,config,paused:existsSync(pauseFile),agent:take(5,'Monitor'),monitorError,errors,history:[...history]};
    return cache;
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
          const {config,processes,...safe}=state;
          return send(res,200,{...safe,config:{...config.value,targets:config.value.targets.map(()=> '[redacted]')},processes:processes.map(({rssBytes,own,target})=>({rssBytes,own,target}))});
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
