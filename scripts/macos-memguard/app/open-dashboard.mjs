import { spawn } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const dashboardIdentity = 'tech.farpoint.memguard.dashboard';
export const dashboardVersion = '1.2.0';
export async function probeDashboard(url, fetcher=fetch) {
  try {
    const response=await fetcher(`${url}/api/health`,{signal:AbortSignal.timeout(750),redirect:'error'});
    if(!response.ok) return false;
    const body=await response.json();
    return body.app===dashboardIdentity && body.version===dashboardVersion;
  } catch { return false; }
}

async function startServer(port) {
  const logDir=join(homedir(),'Library/Logs/MemGuard');
  await mkdir(logDir,{recursive:true});
  const log=await open(join(logDir,'dashboard.log'),'a',0o600);
  try {
    const child=spawn(process.execPath,[join(dirname(fileURLToPath(import.meta.url)),'server.mjs')],{
      detached:true,stdio:['ignore',log.fd,log.fd],env:{...process.env,MEMGUARD_PORT:String(port)}
    });
    await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    child.unref();
  } finally { await log.close(); }
}

export async function openDashboard({port=8765,probe=probeDashboard,start=startServer,openBrowser=url=>new Promise((resolve,reject)=>{
  const child=spawn('/usr/bin/open',[url],{stdio:'ignore'});
  child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(`Browserstart fehlgeschlagen (${code}).`)));
}),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=30}={}) {
  if(!Number.isInteger(port)||port<1024||port>65535) throw Error('Dashboard-Port muss zwischen 1024 und 65535 liegen.');
  const url=`http://127.0.0.1:${port}`;
  if(!await probe(url)) {
    await start(port);
    let ready=false;
    for(let attempt=0;attempt<attempts;attempt++) {
      if(await probe(url)){ready=true;break;}
      await wait(200);
    }
    if(!ready) throw Error(`MemGuard wurde unter ${url} nicht bereit. Der Port kann belegt sein. Prüfen Sie ~/Library/Logs/MemGuard/dashboard.log. Es wurde keine fremde Webseite geöffnet.`);
  }
  await openBrowser(url);
  return url;
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {console.log(await openDashboard({port:Number(process.env.MEMGUARD_PORT||8765)}));}
  catch(error){console.error(error.message);process.exitCode=1;}
}
