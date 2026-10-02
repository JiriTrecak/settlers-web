import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import path from 'node:path';
import type {Credentials} from './credentials';

/** Supervised local Eve service. It gets only a revocable editor capability, not the OpenAI key. */
export class AgentRuntime {
 private child?:ChildProcess;private starting?:Promise<string>;private host='';private failure='';private generation=0;
 readonly clients=new Map<string,string>();
 constructor(private root:string,private capability:string,private credentials:Credentials){}
 async ensure(){if(this.child&&this.host)return this.host;if(this.starting)return this.starting;const pending=this.start(this.generation).finally(()=>{if(this.starting===pending)this.starting=undefined;});this.starting=pending;return pending;}
 private async start(generation:number){
  const port=await new Promise<number>((resolve,reject)=>{const server=createServer();server.on('error',reject);server.listen(0,'127.0.0.1',()=>{const port=(server.address() as {port:number}).port;server.close(()=>resolve(port));});});
  const settings=await this.credentials.status();
  if(generation!==this.generation)throw Error('Agent startup was cancelled.');
  const env:NodeJS.ProcessEnv={};for(const name of ['PATH','HOME','USERPROFILE','TMPDIR','TEMP','SystemRoot'])if(process.env[name])env[name]=process.env[name];
  Object.assign(env,{CANOPY_AGENT_TOKEN:this.capability,CANOPY_AGENT_MODEL:settings.model,EVE_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1',NO_COLOR:'1'});
  this.failure='';
  const node=path.join(this.root,'node_modules/node/bin/node'+(process.platform==='win32'?'.exe':''));
  const child=this.child=spawn(node,[path.join(this.root,'node_modules/eve/bin/eve.js'),'dev','--no-ui','--host','127.0.0.1','--port',String(port)],{cwd:path.join(this.root,'tooling/spell-editor/agent-app'),env,stdio:['ignore','pipe','pipe']});
  const capture=(data:Buffer)=>{this.failure=(this.failure+data.toString().replaceAll(this.capability,'[redacted]')).slice(-5000);};child.stdout?.on('data',capture);child.stderr?.on('data',capture);
  child.on('error',()=>{this.failure='Could not start Eve. Run npm install to install the bundled Node 24 runtime.';});child.on('exit',()=>{if(this.child===child){this.child=undefined;this.host='';}});
  const host='http://127.0.0.1:'+port;
  for(let attempt=0;attempt<240;attempt++){
   if(generation!==this.generation||this.child!==child)throw Error('Agent startup was cancelled.');
   if(child.exitCode!==null)throw Error('Eve could not start: '+this.failure);
   try{const response=await fetch(host+'/eve/v1/health',{signal:AbortSignal.timeout(1000)});if(response.ok){this.host=host;return host;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,500));
  }
  this.stop();throw Error('Eve startup timed out: '+this.failure);
 }
 stop(){this.generation++;this.child?.kill('SIGTERM');this.child=undefined;this.starting=undefined;this.host='';this.clients.clear();}
}
