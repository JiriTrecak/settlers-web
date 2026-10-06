/** Independent player simulations through the real Room/Lockstep protocol.
 * Transport delays are synthetic ordered delivery, not measured Internet latency.
 * --checkpoint restores a local save including its transport pipeline.
 * --resume restores a simulation benchmark snapshot with a fresh transport at
 * that tick. Both use normal World validation; neither modifies the input.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {deepStrictEqual} from 'node:assert';
import {World} from '../../src/sim/world/world';
import {benchmarkContent} from './content-fixture';
import {Room,Lockstep} from '../../src/net';
import type {Channel} from '../../src/net/channel';
import {localMatch,type ClientMsg,type ServerMsg,type MatchConfig} from '../../src/shared';
import {parseUtcMap} from '../../src/shared/map/utcmap';
import {localSaveSchema} from '../../src/shared/save/localSave';
import {restoreSavedWorld} from '../../src/session/session/restoreSavedWorld';
import {fingerprint} from '../../src/content/registry';

const args=process.argv.slice(2);
const option=(name:string,fallback:string)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1]??fallback;};
const mapId=option('--map','amberwake-basin'),ticks=Number(option('--ticks','800'));
const map=parseUtcMap(JSON.parse(readFileSync(`assets/maps/skirmish/${mapId}.utcmap`,'utf8')));
if(!map||!Number.isSafeInteger(ticks)||ticks<400)throw Error('Choose a valid map and at least 400 ticks');
const checkpoint=option('--checkpoint','');
const resume=option('--resume','');
if(checkpoint&&resume)throw Error('Choose either --checkpoint or --resume');
const snapshot=resume?JSON.parse(readFileSync(resume,'utf8')):undefined;
const save=checkpoint?localSaveSchema.parse(JSON.parse(readFileSync(checkpoint,'utf8'))):undefined;
if(save&&save.mapId!==mapId)throw Error('Checkpoint belongs to another map');
const {registry}=benchmarkContent(option('--content',''),option('--save-content',''));
const sourceGame=(save?.world as {game?:{content:string;map:string}}|undefined)?.game??snapshot?.game;
if(sourceGame&&(sourceGame.content!==registry.fingerprint||sourceGame.map!==fingerprint(map)))
 throw Error(`Checkpoint identity mismatch: content ${sourceGame.content} / ${registry.fingerprint}, map ${sourceGame.map} / ${fingerprint(map)}`);
const playerCount=Number(option('--peers',String(map.playerStarts.length)));
if(!Number.isSafeInteger(playerCount)||playerCount<2||playerCount>map.playerStarts.length)throw Error('Peer count must fit the map player starts');
const config:MatchConfig=save?.match??{...localMatch({mapId,mapRevision:'benchmark',seed:731942,slotCount:playerCount,me:0,delay:4}),slots:snapshot?.slots??Array.from({length:playerCount},(_,player)=>({player,kind:'ai' as const,team:player}))};
if(config.slots.length!==playerCount)throw Error('Checkpoint player count differs from requested peers');
const begin=performance.now();
const worlds=Array.from({length:playerCount},()=>{
 if(save)return restoreSavedWorld(save,map,registry);
 const world=new World({map,slots:config.slots,seed:config.seed,registry});
 if(snapshot)world.restore(snapshot);
 return world;
});
const start=worlds[0]!.clock.tickIndex,end=start+ticks,room=new Room(config);
if(save)room.resume(save.pipeline);
else if(snapshot)room.resume({committed:start,through:config.slots.map(s=>({player:s.player,through:start})),held:[]});
let beat=0,delivered=0,injectedStalls=0;
type Delivery={at:number;run:()=>void};
const deliveries:Delivery[]=[];
class DelayedChannel implements Channel {
 private receive:((message:ServerMsg)=>void)|undefined;
 private upstream=0;
 private downstream=0;
 readonly unsubscribe:()=>void;
 constructor(readonly player:number,readonly index:number){
  this.unsubscribe=room.subscribe(message=>{
   // FIFO per connection, including the simulated stalled connection.
   const delay=1+(beat+index)%4;
   this.downstream=Math.max(this.downstream,beat+delay);
   const copy=structuredClone(message);
   deliveries.push({at:this.downstream,run:()=>this.receive?.(copy)});
  });
 }
 onMessage(fn:(message:ServerMsg)=>void){this.receive=fn;}
 send(message:ClientMsg){
  if(message.type!=='turn')return;
  const stall=this.index===playerCount-1&&beat>=200&&injectedStalls===0?32:0;
  if(stall)injectedStalls++;
  this.upstream=Math.max(this.upstream,beat+1+(beat+this.index)%3+stall);
  const copy=structuredClone(message);
  deliveries.push({at:this.upstream,run:()=>room.confirm(this.player,copy.through,copy.bundles)});
 }
}
const channels=config.slots.map((s,i)=>new DelayedChannel(s.player,i));
const peers=channels.map(c=>new Lockstep(c,c.player,config.delay));
if(save)for(const peer of peers){const client=save.clients.find(c=>c.player===peer.player)!;peer.restore(save.pipeline.commits,client.sentThrough,client.outbox);}
else if(snapshot)for(const peer of peers)peer.restore([],start);
const samples:number[][]=peers.map(()=>[]),stalls=peers.map(()=>0);
const checks=new Map<number,Map<number,number>>();
const verify=(index:number)=>{
 const world=worlds[index]!,tick=world.clock.tickIndex;
 if(tick!==start&&tick!==end&&(tick-start)%100!==0)return;
 // This is an offline correctness harness, not the deliberately lightweight
 // runtime checkpoint. Check complete state at every comparison boundary.
 const values=checks.get(tick)??new Map<number,number>();values.set(index,world.checksum('full'));checks.set(tick,values);
 if(new Set(values.values()).size!==1)throw Error(`Desync at tick ${tick}: ${JSON.stringify([...values])}`);
};
worlds.forEach((_,i)=>verify(i));
const initializeMs=performance.now()-begin;
while(worlds.some(w=>w.clock.tickIndex<end)){
 if(++beat>ticks*20)throw Error('Lockstep failed to make progress');
 for(let i=0;i<deliveries.length;){const next=deliveries[i]!;if(next.at>beat){i++;continue;}deliveries.splice(i,1);next.run();delivered++;}
 for(let i=0;i<peers.length;i++){
  const peer=peers[i]!,world=worlds[i]!;
  // Identical transport API to a client: never tick without its next commit.
  peer.confirm(Math.min(end,world.clock.tickIndex+config.delay));
  if(world.clock.tickIndex>=end)continue;
  const commit=peer.take(world.clock.tickIndex+1);
  if(!commit){stalls[i]++;continue;}
  for(const slot of commit.slots)slot.actions.forEach((action,seq)=>world.enqueue(action,commit.tick,{player:slot.player,seq}));
  const t=performance.now();world.tick();const ms=performance.now()-t;
  if(world.clock.tickIndex>=start+200)samples[i]!.push(ms);
  verify(i);
 }
}
channels.forEach(c=>c.unsubscribe());
if([...checks.values()].some(v=>v.size!==playerCount))throw Error('A replica did not reach a checksum checkpoint');
if(injectedStalls!==1)throw Error('The transport stall was not exercised');
const fullAudits=worlds.map(w=>w.checksum('full'));
if(new Set(fullAudits).size!==1)throw Error(`Full end-state audit diverged: ${fullAudits.join(', ')}`);
const reference=worlds[0]!.snapshot();
for(const world of worlds.slice(1))deepStrictEqual(world.snapshot(),reference);
const stats=(v:number[])=>{const sorted=[...v].sort((a,b)=>a-b);return {mean:v.reduce((a,b)=>a+b,0)/v.length,p95:sorted[Math.floor(v.length*.95)],p99:sorted[Math.floor(v.length*.99)],max:sorted.at(-1)};};
const report={map:mapId,mapSize:map.size,mapFingerprint:fingerprint(map),contentFingerprint:worlds[0]!.settlement.registry.fingerprint,slots:config.slots,source:save?'local-save':snapshot?'simulation-snapshot':'fresh',startTick:start,endTick:end,initializeMs,wallMs:performance.now()-begin,
 transport:'Synthetic ordered per-direction delivery, 1–4 beats; one 32-beat upstream stall. Not a network or FPS benchmark.',
 beats:beat,delivered,injectedStalls,waitingBeats:stalls,checks:[...checks].map(([tick,values])=>({tick,checksum:[...values.values()][0],replicas:values.size})),
 checkpointHash:'full',fullStateEqual:true,fullAuditChecksum:fullAudits[0],units:worlds.map(w=>w.settlement.context.liveUnits().length),simulationMs:samples.map(stats)};
const output=option('--output','/tmp/canopy-multiplayer.json');writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
