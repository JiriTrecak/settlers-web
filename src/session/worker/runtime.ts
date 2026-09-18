import {World} from '../../sim/world/world';
import {Room} from '../../net/room';
import {Lockstep} from '../../net/lockstep';
import {MemoryChannel} from '../../net/memory';
import type {Channel} from '../../net/channel';
import type {Action,MatchConfig,ServerMsg} from '../../shared';
import type {UtcMap} from '../../shared/map/utcmap';
import {slotOwner} from '../../content/schema';
import {content} from '../../content/builtin';
import {PresentationView,matchSpeed} from '../session/presentationView';
import {ObserverIncome,observerStats} from '../../presentation/observerStats';
import {LOCAL_SAVE_FORMAT_VERSION,localSaveSchema,type LocalSave} from '../../shared/save/localSave';
import {restoreSavedWorld} from '../session/restoreSavedWorld';
import {captureCompany} from '../../sim/scenario/company';
import type {ChatMessage} from '../../shared/chat/chat';

export type RuntimeOptions={map:UtcMap;match:MatchConfig;player:number|null;remote:boolean};
export type RuntimeHooks={chat?:(message:ChatMessage)=>void;applied?:(action:Action,tick:number)=>void;learned?:()=>void};
/** Worker-owned authoritative match. This class deliberately has no DOM, RAF,
 * renderer or timer dependency; the worker scheduler supplies elapsed time. */
export class SimulationRuntime {
 world:World;
 match:MatchConfig;
 readonly me:number;
 readonly locksteps=new Map<number,Lockstep>();
 readonly channels:MemoryChannel[]=[];
 room:Room|null=null;
 acc=0;
 speed=1;
 paused=false;
 desynced=false;
 reveal:boolean;
 visionPlayer:number;
 private presentation=new PresentationView();
 private income=new ObserverIncome();
 private greeted=new Set<number>();
 private observerTick=-Infinity;
 private observer:ReturnType<typeof observerStats>|undefined;
 readonly timings:Record<string,number>={};
 profiling=false;
 private profileSamples:[string,number][]=[];
 private droppedSamples=0;
 constructor(readonly options:RuntimeOptions,private readonly remoteChannel?:Channel,private readonly hooks:RuntimeHooks={}){
  this.match=options.match;this.me=options.player??options.match.slots[0]!.player;
  this.visionPlayer=this.me;this.reveal=options.player===null;
  this.world=new World({map:options.map,slots:this.match.slots,seed:this.match.seed,company:this.match.company});
  if(options.remote){
   if(!remoteChannel||options.player===null)throw Error('Remote match requires a player channel');
   this.locksteps.set(this.me,new Lockstep({send:m=>remoteChannel.send(m),onMessage:fn=>remoteChannel.onMessage(m=>{if(m.type==='desync')this.desynced=true;fn(m);})},this.me,this.match.delay));
  }else this.bindLocal();
 }
 private bindLocal(){
  this.room=new Room(this.match);
  for(const slot of this.match.slots){const ch=new MemoryChannel(this.room,slot.player);this.channels.push(ch);this.locksteps.set(slot.player,new Lockstep(ch,slot.player,this.match.delay));}
 }
 get simulationSpeed(){return matchSpeed(this.speed,this.options.remote);}
 setPaused(value:boolean){if(this.options.remote)return;this.paused=value;this.acc=0;}
 send(action:Action){
  if(this.options.player===null||this.desynced)return false;
  this.locksteps.get(this.me)!.send(action);if(this.options.remote)this.pulseConfirm();return true;
 }
 pulseConfirm(){
  if(this.desynced)return;
  for(const peer of this.locksteps.values()){
   const through=this.world.clock.tickIndex+Math.max(1,peer.delay);
   if(peer.sent()<=through)peer.confirm(through);
  }
 }
 /** A scheduler may use maxTicks=1 to yield to incoming input between ticks. */
 advance(dtMs:number,maxTicks=8*this.simulationSpeed){
  if(this.desynced)return 0;
  if(this.options.remote)this.pulseConfirm();
  this.acc+=this.paused?0:Math.max(0,dtMs)*this.simulationSpeed;
  const step=this.world.clock.tickMs;let n=0;
  while(this.acc>=step&&n<maxTicks){
   const next=this.world.clock.tickIndex+1;
   if(!this.options.remote)for(const peer of this.locksteps.values())peer.confirm(next,next);
   const commit=this.locksteps.get(this.me)!.take(next);
   if(!commit){if(this.options.remote)this.acc=Math.min(this.acc,step);break;}
   for(const slot of commit.slots)for(const [seq,action] of slot.actions.entries())this.world.enqueue(action,next,{player:slot.player,seq});
   for(const [id,peer] of this.locksteps)if(id!==this.me)peer.take(next);
   this.acc-=step;
   const begin=performance.now();this.world.tick();this.timings.simulation=performance.now()-begin;
   if(this.profiling){
    const samples:[string,number][]=[['Worker · simulation',this.timings.simulation],
     ...Object.entries(this.world.settlement.timings).map(([name,ms]):[string,number]=>[`Sim · ${name}`,ms]),
     ...Object.entries(this.world.aiTimings).map(([name,ms]):[string,number]=>[`AI decision · ${name}`,ms])];
    const room=Math.max(0,4096-this.profileSamples.length);this.profileSamples.push(...samples.slice(0,room));this.droppedSamples+=Math.max(0,samples.length-room);
   }
   for(const slot of commit.slots)if(slot.player===this.me)for(const action of slot.actions)this.hooks.applied?.(action,next);
   for(const receipt of this.world.commandReceipts)if(receipt.player===this.me&&receipt.action.type==='learnAbility')this.hooks.learned?.();
   if(!this.options.remote)for(const slot of this.match.slots){
    if(slot.kind!=='ai'||this.greeted.has(slot.player))continue;
    const game=this.world.settlement,hall=game.context.get(game.state.objectives[slotOwner(slot.player)]),max=hall&&content.get(hall.definition).body?.maxHp;
    if((hall&&max&&hall.hp!==null&&hall.hp<=max*.15)||game.isDefeated(slotOwner(slot.player))){this.greeted.add(slot.player);this.hooks.chat?.({name:slot.name??`Player ${slot.player+1}`,player:slot.player,text:'gg'});}
   }
   if(this.options.player===null)this.income.record(next,this.world.settlement.economy.deliveries);
   if(this.options.remote&&next%this.match.checksumEvery===0)this.remoteChannel!.send({type:'hash',tick:next,checksum:this.world.checksum()});
   n++;
  }
  // Bound a local wake-up backlog; never discard committed remote turns.
  if(!this.options.remote)this.acc=Math.min(this.acc,step*8*this.simulationSpeed);
  return n;
 }
 visualView(){return this.presentation.project(this.world,this.visionPlayer,this.reveal);}
 selectionView(){return this.options.player===null?this.visualView().settlement:this.world.view(this.me).settlement;}
 project(){
  const begin=performance.now(),visual=this.visualView(),selection=this.options.player===null?visual:this.world.view(this.me);
  const scene=visual.settlement.mission?.scene,shot=scene?.camera;
  const targets=shot?this.world.settlement.entities.filter(e=>e.placement===shot.entity||e.placement===shot.lookAt).map(e=>({id:e.id,tag:e.placement,x:e.x,y:e.y})):[];
  if(this.options.player===null&&this.world.clock.tickIndex-this.observerTick>=40){this.observerTick=this.world.clock.tickIndex;this.observer=observerStats(this.world.settlement.state,this.match.slots,content,this.income);}
  this.timings.projection=performance.now()-begin;
  const profileSamples=this.profileSamples;this.profileSamples=[];
  return {visual,selection,targets,observer:this.observer,tick:this.world.clock.tickIndex,desynced:this.desynced,
   timings:{...this.timings},profileSamples,droppedSamples:this.droppedSamples,routing:{...this.world.settlement.spatial.routing}};
 }
 canBuild(definition:string,position:{x:number;y:number},actor?:number,rotation=0){return this.world.settlement.canBuild(slotOwner(this.me),definition,position,actor,rotation);}
 company(){return captureCompany(this.world.settlement);}
 status(){return {tick:this.world.clock.tickIndex,checksum:this.world.checksum(),settlement:this.world.view(this.me).settlement,desynced:this.desynced};}
 snapshotLocal():LocalSave{
  if(this.options.remote||!this.room)throw Error('Local saves require a singleplayer match');
  const local=this.locksteps.get(this.me)!;
  return {v:LOCAL_SAVE_FORMAT_VERSION,mode:this.options.map.mission?'campaign':'skirmish',player:this.options.player,
   match:structuredClone(this.match),remote:false,mapId:this.match.mapId,mapRevision:this.match.mapRevision,seed:this.match.seed,
   world:this.world.snapshot(),pipeline:{...this.room.snapshot(),commits:local.peek(),sentThrough:local.sent()},
   clients:[...this.locksteps].map(([player,peer])=>({player,sentThrough:peer.sent(),outbox:peer.outbox()}))};
 }
 restoreLocal(raw:unknown){
  if(this.options.remote)throw Error('Local load requires a singleplayer match');
  const save=localSaveSchema.parse(raw);
  if(save.mode!==(this.options.map.mission?'campaign':'skirmish'))throw Error('This save belongs to a different game mode.');
  if(save.player!==this.options.player||save.match.slots.length!==this.match.slots.length||save.match.slots.some((s,i)=>{const c=this.match.slots[i];return s.player!==c.player||s.kind!==c.kind||s.team!==c.team||s.name!==c.name;}))throw Error('Load this save with its original player setup.');
  if(save.mapId!==this.match.mapId||save.mapRevision!==this.match.mapRevision)throw Error('Open the same map and content revision before loading this save.');
  if(save.match.mapId!==save.mapId||save.match.mapRevision!==save.mapRevision||save.match.seed!==save.seed)throw Error('Saved match metadata does not match the scenario.');
  const restored=restoreSavedWorld(save,this.options.map);
  this.destroy();this.locksteps.clear();this.match=structuredClone(save.match);this.bindLocal();this.room!.resume(save.pipeline);
  for(const client of save.clients)this.locksteps.get(client.player)!.restore(save.pipeline.commits,client.sentThrough,client.outbox);
  this.world=restored;this.acc=0;this.presentation=new PresentationView();this.income.reset(restored.clock.tickIndex);this.observerTick=-Infinity;this.observer=undefined;this.greeted.clear();this.profileSamples=[];this.droppedSamples=0;
 }
 destroy(){for(const ch of this.channels)ch.destroy();this.channels.length=0;}
}
export type RuntimeFrame=ReturnType<SimulationRuntime['project']>;
export type RemoteReceiver=(message:ServerMsg)=>void;
