import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
export const defaults = Object.freeze({language:'en', notifications:true, interval:10, warn_free_percent:20, critical_free_percent:10, warn_swapfiles:50, critical_swapfiles:65, warn_repeat_seconds:600, terminate_grace_seconds:8, targets:[]});
export function validateConfig(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Konfiguration muss ein Objekt sein.');
  const keys = Object.keys(defaults);
  if (Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !(k in value))) throw Error('Unbekannte oder fehlende Konfigurationsfelder.');
  for (const [key, min, max] of [['interval',2,300],['warn_free_percent',1,100],['critical_free_percent',0,99],['warn_swapfiles',1,999],['critical_swapfiles',2,1000],['warn_repeat_seconds',30,86400],['terminate_grace_seconds',1,60]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw Error(`${key}: ganze Zahl zwischen ${min} und ${max} erforderlich.`);
  }
  if (value.critical_free_percent >= value.warn_free_percent || value.warn_swapfiles >= value.critical_swapfiles) throw Error('Warnschwelle muss vor der kritischen Schwelle liegen.');
  if (!['de','en'].includes(value.language) || typeof value.notifications !== 'boolean') throw Error('Sprache oder Mitteilungen ungültig.');
  if (!Array.isArray(value.targets) || value.targets.length > 50 || value.targets.some(t => typeof t !== 'string' || t.trim() !== t || t.length < 4 || t.length > 300 || /[\x00-\x1f\x7f]/.test(t))) throw Error('Maximal 50 Ziele mit je 4–300 Zeichen; keine Steuerzeichen.');
  if (new Set(value.targets).size !== value.targets.length) throw Error('Doppelte Ziele entfernen.');
  return structuredClone(value);
}
export function classify(free, swapfiles, config) {
  if (free === null || swapfiles === null) return 'unknown';
  if (free <= config.critical_free_percent || swapfiles >= config.critical_swapfiles) return 'critical';
  if (free <= config.warn_free_percent || swapfiles >= config.warn_swapfiles) return 'warning';
  return 'normal';
}
export async function command(file, args, {timeout=4000}={}) {
  const {stdout} = await exec(file, args, {timeout, maxBuffer:4*1024*1024, env:{...process.env,LC_ALL:'C'}});
  return stdout.trim();
}
export function parseProcesses(raw, targets, uid, home = homedir()) {
  return raw.split('\n').flatMap(line => {
    // Accepts "pid uid rss %cpu nice args" and the older "pid uid rss args".
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(?:(\d+(?:\.\d+)?)\s+(-?\d+)\s+)?(.+)$/);
    if (!match) return [];
    const [,pid,owner,rss,cpu,nice,cmd] = match;
    // Only return the executable name; full arguments may contain secrets.
    const app = cmd.match(/\/([^/]+)\.app\//)?.[1];
    const name = app || cmd.split(/\s/)[0].split('/').pop();
    return [{pid:Number(pid), own:Number(owner)===uid, rssBytes:Number(rss)*1024, name,
      cpuPercent:cpu===undefined ? null : Number(cpu), nice:nice===undefined ? null : Number(nice),
      target:Number(owner)===uid && !cmd.includes('memguard') && targets.some(t => cmd.includes(t.replaceAll('~',home)))}];
  }).sort((a,b)=>b.rssBytes-a.rssBytes);
}

// Parses "status<TAB>pid<TAB>name<TAB>pattern" lines from `memguard preview`.
export const previewStatuses = Object.freeze(['match','ancestor','self','memguard','owner','gone','pid1','nomatch','invalid']);
export function parsePreview(raw) {
  return raw.split('\n').flatMap(line => {
    const [status,pid,name,pattern] = line.split('\t');
    if (!previewStatuses.includes(status) || !/^\d+$/.test(pid ?? '')) return [];
    return [{status, pid:Number(pid), name:name ?? '', pattern:pattern ?? ''}];
  });
}

// ---- Monitor heartbeat (MG-05) ----
// The monitor reports its own state. "The service is loaded" is not protection:
// only a fresh heartbeat from a process that is really a memguard monitor counts.
export const monitorProcessPattern = /(^|[ /])memguard run( |$)/;
const whole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
export function parseHeartbeat(raw) {
  const bad = reason => ({ok:false, problem:`Heartbeat ungültig: ${reason}.`});
  if (typeof raw !== 'string' || raw.length > 8192) return bad('zu groß');
  let d; try { d = JSON.parse(raw); } catch { return {ok:false, problem:'Heartbeat ist kein gültiges JSON.'}; }
  if (!d || typeof d !== 'object' || d.app !== 'tech.farpoint.memguard.monitor') return bad('Absender');
  if (typeof d.version !== 'string' || !/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(d.version)) return bad('Version');
  if (!whole(d.pid,2,4194304) || !whole(d.startedAt,1,4e9) || !whole(d.time,1,4e9) || !whole(d.validForSeconds,1,3600)) return bad('Zahlenfelder');
  if (typeof d.paused !== 'boolean' || !['ok','failed','unknown'].includes(d.measurement)) return bad('Status');
  const c = d.config, e = d.effective;
  if (!c || typeof c.path !== 'string' || c.path.length > 1024 || !/^([0-9a-f]{64}|none|unstable)$/.test(c.revision) || !whole(c.loadedAt,0,4e9)) return bad('Konfigurationsangaben');
  if (!e || !whole(e.interval,1,1e6) || !whole(e.warnFreePercent,0,100) || !whole(e.criticalFreePercent,0,100) || !whole(e.warnSwapfiles,0,1e6) || !whole(e.criticalSwapfiles,0,1e6) || !whole(e.targetCount,0,1000) || !/^[0-9a-f]{64}$/.test(e.targetsDigest)) return bad('wirksame Werte');
  return {ok:true, value:{version:d.version, pid:d.pid, startedAt:d.startedAt, time:d.time, validForSeconds:d.validForSeconds, paused:d.paused, measurement:d.measurement,
    config:{path:c.path, revision:c.revision, loadedAt:c.loadedAt},
    effective:{interval:e.interval, warnFreePercent:e.warnFreePercent, criticalFreePercent:e.criticalFreePercent, warnSwapfiles:e.warnSwapfiles, criticalSwapfiles:e.criticalSwapfiles, targetCount:e.targetCount, targetsDigest:e.targetsDigest}}};
}
// state: none | invalid | stale | active. Only "active" may be shown as protection.
// processArgs: the command line of the reported PID, or null when no such process exists.
export function assessMonitor({heartbeat, parseProblem=null, nowSeconds, processArgs=null}) {
  if (parseProblem) return {state:'invalid', problems:[parseProblem]};
  if (!heartbeat) return {state:'none', problems:[]};
  const ageSeconds = nowSeconds - heartbeat.time;
  const info = {version:heartbeat.version, pid:heartbeat.pid, startedAt:heartbeat.startedAt, time:heartbeat.time, ageSeconds, validForSeconds:heartbeat.validForSeconds, measurement:heartbeat.measurement, paused:heartbeat.paused};
  if (ageSeconds < -60 || heartbeat.startedAt > heartbeat.time) return {...info, state:'invalid', problems:['Der Zeitstempel der Rückmeldung ist nicht plausibel.']};
  const problems = [];
  if (ageSeconds > heartbeat.validForSeconds) problems.push(`Die letzte Rückmeldung ist ${ageSeconds} s alt, gültig sind ${heartbeat.validForSeconds} s.`);
  if (processArgs === null) problems.push('Der gemeldete Prozess läuft nicht mehr.');
  else if (!monitorProcessPattern.test(processArgs)) problems.push('Die gemeldete PID gehört nicht zu einem MemGuard-Monitor.');
  return {...info, state:problems.length ? 'stale' : 'active', problems};
}
export const targetsDigest = (targets, home) => createHash('sha256').update(targets.map(t => t.replaceAll('~', home)).join('\n') + '\n').digest('hex');
// Three separate claims about the same configuration, each with its own proof:
//   saved    the file on disk is valid (read back by this server)
//   loaded   a fresh monitor reports exactly this revision of this file
//   verified loaded, and the values the monitor uses equal the saved values, and its last measurement worked
export function configLevels({config, monitor, heartbeat, home}) {
  const no = reason => ({ok:false, reason});
  if (config.error) return {saved:no('Die gespeicherte Konfiguration ist ungültig.'), loaded:no('Ohne gültige Konfiguration nicht prüfbar.'), verified:no('Ohne gültige Konfiguration nicht prüfbar.')};
  const saved = {ok:true, revision:config.revision};
  if (monitor.state !== 'active') {
    const reason = monitor.state === 'none' ? 'Kein Monitor meldet sich.' : monitor.state === 'invalid' ? 'Die Rückmeldung ist ungültig.' : 'Die Rückmeldung ist veraltet, ein Schutz ist nicht belegt.';
    return {saved, loaded:no(reason), verified:no(reason)};
  }
  const expected = config.exists ? config.revision : 'none';
  let loaded;
  if (heartbeat.config.revision === 'unstable') loaded = no('Die Datei änderte sich während des Ladens; der Monitor liest sie erneut.');
  else if (config.exists && heartbeat.config.path !== config.path) loaded = no('Der Monitor nutzt eine andere Konfigurationsdatei.');
  else if (heartbeat.config.revision !== expected) loaded = no('Der Monitor arbeitet noch mit einer älteren Fassung. Er lädt Änderungen nach 30 Prüfzyklen neu.');
  else loaded = {ok:true, loadedAt:heartbeat.config.loadedAt};
  if (!loaded.ok) return {saved, loaded, verified:no('Erst nach dem Laden prüfbar.')};
  const v = config.value, e = heartbeat.effective, differs = [];
  if (e.interval !== v.interval) differs.push('Prüfintervall');
  if (e.warnFreePercent !== v.warn_free_percent || e.criticalFreePercent !== v.critical_free_percent) differs.push('Schwellen für freien Speicher');
  if (e.warnSwapfiles !== v.warn_swapfiles || e.criticalSwapfiles !== v.critical_swapfiles) differs.push('Schwellen für Swap-Dateien');
  if (e.targetCount !== v.targets.length || e.targetsDigest !== targetsDigest(v.targets, home)) differs.push('Zielmuster');
  if (differs.length) return {saved, loaded, verified:no(`Die Werte im Monitor weichen ab: ${differs.join(', ')}.`)};
  if (heartbeat.measurement !== 'ok') return {saved, loaded, verified:no(heartbeat.measurement === 'failed' ? 'Die letzte Messung des Monitors ist fehlgeschlagen.' : 'Der Monitor hat noch nicht gemessen.')};
  return {saved, loaded, verified:{ok:true}};
}
