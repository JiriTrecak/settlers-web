import {expect,it} from 'vitest';
import {SnapshotEncoder,SnapshotDecoder} from '../../src/session/worker/snapshots';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {localMatch} from '../../src/shared/match/match';
import {placed} from '../game/helpers';
import {ResourceScenery,resourceStamps} from '../../src/presentation/scenery';
import {resourceSceneryRevision} from '../../src/presentation/resourceSceneryRevision';

function setup(){
 const map={...emptyUtcMap(),entities:[{...placed('tree','resource.forest.tree',32,32),owner:'none' as const}]};
 const match=localMatch({mapId:'test',mapRevision:'test',seed:1,slotCount:2,me:0});
 return new SimulationRuntime({map,match,player:0,remote:false});
}
it('round trips transferable deltas, fog ownership changes, removals and restore',()=>{
 const runtime=setup(),encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder();
 const round=()=>{const frame=runtime.project(),{packet,transfer}=encoder.encode(frame);const received=structuredClone(packet,{transfer});expect(decoder.decode(received)).toEqual(frame);return received;};
 round();const save=runtime.snapshotLocal();runtime.advance(100);round();
 runtime.reveal=true;round();runtime.visionPlayer=1;runtime.reveal=false;round();
 runtime.world.settlement.context.remove(runtime.world.settlement.entities.find(e=>e.placement==='tree')!);runtime.world.settlement.observation.update();round();
 runtime.restoreLocal(save);encoder.reset();round();runtime.destroy();
});
it('does not retransmit static resources or unchanged fog and detects a missing delta',()=>{
 const runtime=setup();runtime.reveal=true;
 const encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder();
 const first=encoder.encode(runtime.project());decoder.decode(structuredClone(first.packet));
 const next=encoder.encode(runtime.project());
 expect(next.packet.visual.entities.some(e=>e.resource)).toBe(false);
 expect(next.packet.visual.fog).toBeUndefined();
 expect(()=>decoder.decode({...next.packet,sequence:next.packet.sequence+1})).toThrow(/Missing/);
 const decoded=decoder.decode(structuredClone(next.packet));expect(decoded.visual.settlement.entities.some(e=>e.resource)).toBe(true);
 runtime.destroy();
});

it('retains the resource projection through unit updates and refreshes removals, transformations and resets',()=>{
 const runtime=setup();runtime.reveal=true;
 const encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder(),scenery=new ResourceScenery();
 const frame=runtime.project();let entities=[...frame.visual.settlement.entities];
 const publish=()=>{
  const view={...frame.visual,settlement:{...frame.visual.settlement,entities}};
  const {packet}=encoder.encode({...frame,visual:view,selection:view});
  const all=decoder.decode(structuredClone(packet)).visual.settlement.entities;
  expect(scenery.project(all)).toEqual(resourceStamps(all));
  return {revision:resourceSceneryRevision(all),resources:all.filter(e=>!!e.resource),stamps:scenery.project(all)};
 };
 try{
  const first=publish(),actor=entities.find(e=>e.unit)!,tree=entities.find(e=>e.definition==='resource.forest.tree')!;
  expect(tree).toBeDefined();
  for(let tick=0;tick<8;tick++){
   entities=entities.map(e=>e.id===actor.id?{...e,x:e.x+.1}:e);
   const next=publish();expect(next.revision).toBe(first.revision);expect(next.stamps).toBe(first.stamps);
  }
  entities=entities.map(e=>e.id===tree.id?{...e,resource:{...e.resource!,amount:e.resource!.amount-1}}:e);
  const gathered=publish();expect(gathered.revision).toBe(first.revision);expect(gathered.stamps).toBe(first.stamps);
  // A resource move changes scenery even though entity membership is unchanged.
  entities=entities.map(e=>e.id===tree.id?{...e,x:e.x+1}:e);
  const moved=publish();expect(moved.revision).not.toBe(first.revision);expect(moved.stamps).not.toEqual(first.stamps);
  // Removing resource capability must invalidate the old projection too.
  entities=entities.map(e=>{if(e.id!==tree.id)return e;const {resource:_,...other}=e;return other;});
  const transformed=publish();expect(transformed.resources!.some(e=>e.id===tree.id)).toBe(false);
  entities=entities.filter(e=>e.id!==tree.id);publish();
  entities=[tree,...entities];const added=publish();expect(added.resources![0].id).toBe(tree.id);
  const beforeReset=added.revision;encoder.reset();expect(publish().revision).not.toBe(beforeReset);
 }finally{runtime.destroy();}
});
