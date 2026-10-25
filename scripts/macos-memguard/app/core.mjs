import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
const exec = promisify(execFile);
export const defaults = Object.freeze({language:'en', notifications:true, interval:10, warn_free_percent:20, critical_free_percent:10, warn_swapfiles:20, critical_swapfiles:40, warn_repeat_seconds:600, terminate_grace_seconds:8, targets:[]});
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
export async function command(file, args) {
  const {stdout} = await exec(file, args, {timeout:4000, maxBuffer:4*1024*1024, env:{...process.env,LC_ALL:'C'}});
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
