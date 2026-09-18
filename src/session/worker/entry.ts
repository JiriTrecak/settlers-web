import {SimulationRuntime,type RemoteReceiver,type RuntimeOptions} from './runtime';
import {SnapshotEncoder} from './snapshots';
import type {Requests,WorkerInput,WorkerOutput} from './protocol';

const port=self as unknown as {postMessage(message:WorkerOutput,transfer?:Transferable[]):void;onmessage:((event:MessageEvent<WorkerInput>)=>void)|null};
let runtime:SimulationRuntime|undefined,receive:RemoteReceiver=()=>{},running=false,last=performance.now(),timer:ReturnType<typeof setTimeout>|undefined;
const encoder=new SnapshotEncoder();let inFlight=0,dirty=false,urgent=false,lastPublished=0;
const pendingCommands:{id:number;sentAt:number;key:string}[]=[];
const post=(message:WorkerOutput,transfer?:ArrayBuffer[])=>port.postMessage(message,transfer);
function publish(force=false){
 if(!runtime)return;dirty=true;urgent ||=force;
 if(inFlight||!urgent&&performance.now()-lastPublished<25)return;
 const frame=runtime.project(),start=performance.now(),encoded=encoder.encode(frame);
 encoded.packet.timings.encode=performance.now()-start;
 inFlight=encoded.packet.sequence;dirty=false;urgent=false;lastPublished=performance.now();post({type:'frame',packet:encoded.packet},encoded.transfer);
}
function schedule(){
 if(timer!==undefined)clearTimeout(timer);
 if(!running||!runtime)return;
 timer=setTimeout(pump,runtime.acc>=25?0:Math.max(1,(25-runtime.acc)/runtime.simulationSpeed));
}
function pump(){
 timer=undefined;if(!running||!runtime)return;
 try{const now=performance.now(),dt=now-last;last=now;const advanced=runtime.advance(dt,1);if(advanced||dirty)publish();schedule();}
 catch(error){running=false;post({type:'fatal',error:error instanceof Error?error.message:String(error)});}
}
function request(method:keyof Requests,params:unknown):unknown{
 if(method==='init'){
  if(runtime)throw Error('Simulation already initialized');
  const options=params as RuntimeOptions;
  runtime=new SimulationRuntime(options,{send:message=>post({type:'network',message}),onMessage:fn=>{receive=fn;}},{
   chat:message=>post({type:'chat',message}),learned:()=>post({type:'learned'}),
   applied:(action,tick)=>{const key=JSON.stringify(action),at=pendingCommands.findIndex(c=>c.key===key);if(at>=0){const c=pendingCommands.splice(at,1)[0]!;post({type:'applied',id:c.id,tick,sentAt:c.sentAt});}},
  });
  publish(true);return {resources:runtime.world.view().settlement.entities.filter(e=>!!e.resource)};
 }
 if(!runtime)throw Error('Simulation not initialized');
 switch(method){
  case 'start':running=true;last=performance.now();schedule();return;
  case 'pause':runtime.setPaused(params as boolean);last=performance.now();schedule();return;
  case 'configure':{
   const config=params as Requests['configure']['input'];
   runtime.speed=config.speed;runtime.profiling=config.profiling??false;
   if(!runtime.options.remote&&runtime.match.slots.some(s=>s.player===config.visionPlayer)){runtime.reveal=config.reveal;runtime.visionPlayer=config.visionPlayer;}
   publish(true);schedule();return;
  }
  case 'save':return runtime.snapshotLocal();
  case 'load':runtime.restoreLocal(params);pendingCommands.length=0;encoder.reset();last=performance.now();publish(true);return;
  case 'placement':{const p=params as Requests['placement']['input'];return runtime.canBuild(p.definition,p.position,p.actor,p.rotation);}
  case 'company':return runtime.company();
  case 'status':return runtime.status();
 }
}
port.onmessage=({data})=>{
 try{
  if(data.type==='request'){const value=request(data.method,data.params);post({type:'reply',id:data.id,value});}
  else if(data.type==='network')receive(data.message);
  else if(data.type==='ack'){if(data.sequence===inFlight){inFlight=0;if(dirty)publish();}}
  else if(data.type==='command'){
   if(runtime?.send(data.action)&&data.action.type!=='noop')pendingCommands.push({id:data.id,sentAt:data.sentAt,key:JSON.stringify(data.action)});
  }
 }catch(error){const message=error instanceof Error?error.message:String(error);post(data.type==='request'?{type:'reply',id:data.id,error:message}:{type:'fatal',error:message});}
};
