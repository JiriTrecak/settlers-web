import {afterEach,expect,it,vi} from 'vitest';
import {Worker} from 'node:worker_threads';
import {SimulationClient} from '../../src/session/worker/client';
import type {WorkerInput,WorkerOutput} from '../../src/session/worker/protocol';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {localMatch} from '../../src/shared/match/match';
import {Session} from '../../src/session/session/session';
import {Room,type Channel} from '../../src/net';
import type {MatchConfig,ServerMsg} from '../../src/shared';

const clients:SimulationClient[]=[];
afterEach(()=>{for(const c of clients)c.stop();clients.length=0;vi.unstubAllGlobals();});
function fixture(remote?:{player:number;match:MatchConfig;channel:Channel}){
 const worker=new Worker(new URL('./fixtures/simulation-worker.cjs',import.meta.url));
 let held:WorkerInput[]|null=null,frames=0;
 const port={postMessage(message:WorkerInput){if(held&&message.type==='ack')held.push(message);else worker.postMessage(message);},terminate(){void worker.terminate();},onmessage:null as ((e:MessageEvent<WorkerOutput>)=>void)|null,onerror:null as ((e:ErrorEvent)=>void)|null,onmessageerror:null as ((e:MessageEvent)=>void)|null};
 worker.on('message',data=>{if(data.type==='frame')frames++;if(!data.type.startsWith('test-'))port.onmessage?.({data} as MessageEvent<WorkerOutput>);});
 worker.on('error',error=>port.onerror?.({message:error instanceof Error?error.message:String(error)} as ErrorEvent));
 const hooks={frame:vi.fn(),chat:vi.fn(),learned:vi.fn(),error:vi.fn(),sample:vi.fn()},client=new SimulationClient(hooks,remote?.channel,port);clients.push(client);
 const map=emptyUtcMap(),match=remote?.match??localMatch({mapId:'test',mapRevision:'test',seed:1,slotCount:2,me:0});
 return {client,worker,hooks,init:()=>client.request('init',{map,match,player:remote?.player??0,remote:!!remote}),hold(){held=[];},release(){const messages=held??[];held=null;for(const m of messages)worker.postMessage(m);},frames:()=>frames};
}
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

it('caps ordinary snapshot publication at 40 Hz even at accelerated match speed',async()=>{
 const f=fixture();await f.init();await f.client.request('configure',{speed:4,reveal:false,visionPlayer:0});
 const before=f.frames(),start=performance.now();await f.client.request('start',undefined);await delay(400);
 const elapsed=performance.now()-start;
 expect(f.frames()-before).toBeGreaterThan(1);
 expect(f.frames()-before).toBeLessThanOrEqual(Math.ceil(elapsed/25)+1);
 expect(f.hooks.error).not.toHaveBeenCalled();
},15000);

it('ticks without a renderer, bounds in-flight snapshots and restores while a frame is awaiting acknowledgment',async()=>{
 const f=fixture();await f.init();expect(f.client.latest?.tick).toBe(0);
 await f.client.request('start',undefined);await delay(150);
 const before=(await f.client.request('status',undefined)).tick;expect(before).toBeGreaterThan(1);
 f.hold();await delay(80);const frames=f.frames(),save=await f.client.request('save',undefined);
 await delay(100);expect(f.frames()).toBe(frames);
 expect((await f.client.request('status',undefined)).tick).toBeGreaterThan(before);
 await f.client.request('pause',true);
 let completed=false;const loaded=f.client.load(save).then(()=>{completed=true;});await delay(30);expect(completed).toBe(false);
 f.release();await loaded;expect(f.client.latest!.tick).toBe((save.world as {tick:number}).tick);
 const a=await f.client.request('status',undefined);await delay(40);expect(await f.client.request('status',undefined)).toEqual(a);
 expect(f.hooks.error).not.toHaveBeenCalled();
},15000);

it('runs two actual workers through lockstep with matching hashes and P2 commands',async()=>{
 const match=localMatch({mapId:'test',mapRevision:'test',seed:1,slotCount:2,me:0,delay:2});match.slots.forEach(s=>s.kind='human');
 const room=new Room(match),hashes=[new Map<number,number>(),new Map<number,number>()];
 const peers=[0,1].map(player=>{
  let receive:(message:ServerMsg)=>void=()=>{};
  room.subscribe(message=>receive(structuredClone(message)));
  return fixture({player,match,channel:{onMessage:fn=>{receive=fn;},send:message=>{
   if(message.type==='turn')room.confirm(player,message.through,message.bundles);
   if(message.type==='hash')hashes[player].set(message.tick,message.checksum);
  }}});
 });
 await Promise.all(peers.map(p=>p.init()));await Promise.all(peers.map(p=>p.client.request('start',undefined)));
 const actor=peers[1].client.latest!.selection.settlement.entities.find(e=>e.owner==='player.2'&&e.definition==='unit.ants.warrior')!;
 peers[1].client.send({type:'move',actors:[actor.id],destination:{x:actor.x-3,y:actor.y-2}});
 await delay(650);
 const common=[...hashes[0].keys()].filter(tick=>hashes[1].has(tick));expect(common.length).toBeGreaterThanOrEqual(2);
 for(const tick of common)expect(hashes[0].get(tick)).toBe(hashes[1].get(tick));
 expect(peers[1].hooks.sample.mock.calls.some(c=>c[0]==='Command to simulation tick')).toBe(true);
 for(const p of peers)expect(p.hooks.error).not.toHaveBeenCalled();
},15000);

it('keeps the parent event loop responsive during a worker stall and applies the newest movement order last',async()=>{
 const f=fixture();await f.init();await f.client.request('start',undefined);
 const actor=f.client.latest!.selection.settlement.entities.find(e=>e.owner==='player.1'&&e.definition==='unit.ants.warrior')!;
 let beats=0;const timer=setInterval(()=>beats++,5);
 try{
  const done=new Promise<void>(resolve=>f.worker.on('message',m=>{if(m.type==='test-stall-ended')resolve();}));
  f.worker.postMessage({type:'test-stall',ms:120});await done;expect(beats).toBeGreaterThan(5);
 }finally{clearInterval(timer);}
 const a={x:actor.x+2,y:actor.y+2},b={x:actor.x+3,y:actor.y+1};
 f.client.send({type:'move',actors:[actor.id],destination:a});f.client.send({type:'move',actors:[actor.id],destination:b});
 await delay(150);await f.client.request('pause',true);
 const status=await f.client.request('status',undefined),unit=status.settlement.entities.find(e=>e.id===actor.id)!;
 expect(unit.control?.order).toMatchObject({type:'move',destination:b});
 expect(f.hooks.sample.mock.calls.filter(c=>c[0]==='Command to simulation tick')).toHaveLength(2);
 expect(f.hooks.error).not.toHaveBeenCalled();
},15000);

it('main-thread commands show feedback immediately and restore resets camera and controls after the worker completes',async()=>{
 const f=fixture();await f.init();const feedback=vi.fn(),camera=vi.fn(),controls=vi.fn(),reset=vi.fn();
 const session=Object.assign(Object.create(Session.prototype),{worker:f.client,me:0,config:{player:0},desynced:false,renderer:{gameCommandFeedback:feedback,unitCamera:camera},economyHud:{restoreControls:controls},input:{reset},unitCameraMode:'first-person',cinematicFocus:{x:10,z:10}});
 expect(session.send({type:'move',actors:[1],destination:{x:40,y:40}})).toBe(true);expect(feedback).toHaveBeenCalledOnce();
 session.setMenuPaused(true);expect(reset).toHaveBeenCalledOnce();
 const save=await f.client.request('save',undefined);await session.restoreLocal({...save,controlGroups:[[1]]});
 expect(session.unitCameraMode).toBe('rts');expect(session.cinematicFocus).toBeNull();expect(camera).toHaveBeenCalledWith(null);expect(controls).toHaveBeenCalledWith([[1]]);
},15000);
