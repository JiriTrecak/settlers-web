import {expect,it,vi} from 'vitest';
import {SnapshotEncoder,SnapshotDecoder} from '../../src/session/worker/snapshots';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {localMatch} from '../../src/shared/match/match';
import {placed} from '../game/helpers';
import {ResourceScenery,resourceStamps} from '../../src/presentation/scenery';
import {resourceSceneryRevision} from '../../src/presentation/resourceSceneryRevision';
import {VisionMask} from '../../src/sim/game/visionMask';

function setup(){
 const map={...emptyUtcMap(),entities:[{...placed('tree','resource.forest.tree',32,32),owner:'none' as const}]};
 const match=localMatch({mapId:'test',mapRevision:'test',seed:1,slotCount:2,me:0});
 return new SimulationRuntime({map,match,player:0,remote:false});
}
it('encodes visibility receipts across coalescing, reversals, history expiry, ownership and floor changes',()=>{
 const runtime=setup(),encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder();
 const base=runtime.project(),mask=new VisionMask(new Uint8Array(256)),floor=new VisionMask(new Uint8Array(258));
 let revision=0,owner=0;
 const publish=(cells=mask.cells,floors=true)=>{
  const fog={owner,revision:++revision,cells,...(floors?{floors:{cells:floor.cells,decks:[{cell:7,height:4}]}}:{})};
  const view={...base.visual,settlement:{...base.visual.settlement,fog}};
  const frame={...base,visual:view,selection:view};
  const {packet,transfer}=encoder.encode(frame);
  const received=structuredClone(packet,{transfer});
  expect(decoder.decode(received)).toEqual(frame);
  expect(mask.cells.byteLength).toBe(256);expect(floor.cells.byteLength).toBe(258);
  return received;
 };
 const move=(x:number)=>mask.update([{id:1,x,y:0,radius:1}],s=>[s.x,s.x+1]);
 try{
  publish();move(3);publish();
  // Multiple simulation updates may happen before the worker publishes again.
  move(8);move(3);floor.update([{id:2,x:256,y:0,radius:0}],s=>[s.x]);
  const merged=publish();expect(merged.visual.fog!.cells).toHaveProperty('changes');
  for(let i=0;i<20;i++)move(30+i);publish();
  owner=1;expect(publish().visual.fog!.cells).toHaveProperty('full');
  publish(mask.cells,false);publish();
  // Unknown callers may mutate their arrays in place; the fallback must retain
  // a defensive baseline rather than trusting source identity.
  const external=mask.cells.slice();publish(external);external[150]=2;publish(external);
  encoder.reset();expect(publish().visual.fog!.cells).toHaveProperty('full');
 }finally{runtime.destroy();}
});
it('only copies navigation mesh input on demand and when static collision changes',()=>{
 const runtime=setup(),game=runtime.world.settlement,walk=vi.spyOn(game.spatial,'walkable');
 try{
  const request={grid:false,paths:false,revision:-1};
  expect(runtime.navigation(request).mesh).toBeUndefined();expect(walk).not.toHaveBeenCalled();
  const audit=runtime.world.checksum('full');
  const first=runtime.navigation({...request,mesh:true,meshRevision:-1}).mesh!;
  expect(first.walkable.length).toBe(game.spatial.size**2);
  expect(runtime.world.checksum('full')).toBe(audit);
  walk.mockClear();
  expect(runtime.navigation({...request,mesh:true,meshRevision:first.revision}).mesh).toBeUndefined();
  expect(walk).not.toHaveBeenCalled();
  game.context.remove(game.entities.find(e=>e.placement==='tree')!);
  expect(runtime.navigation({...request,mesh:true,meshRevision:first.revision}).mesh?.revision).not.toBe(first.revision);
 }finally{walk.mockRestore();runtime.destroy();}
});
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
  // Spawn/death changes the entity order packet, not resource painter order.
  const spawned={...actor,id:Math.max(...entities.map(e=>e.id))+1};
  entities=[spawned,...entities];
  const recruited=publish();expect(recruited.revision).toBe(first.revision);expect(recruited.stamps).toBe(first.stamps);
  entities=entities.filter(e=>e.id!==spawned.id);
  expect(publish().revision).toBe(first.revision);
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
  const copy={...tree,id:spawned.id+1};entities=[...entities,copy];publish();
  // An order packet can also reorder surviving resources; that must invalidate.
  entities=[copy,spawned,...entities.filter(e=>e.id!==copy.id)];
  const reordered=publish();expect(reordered.resources[0].id).toBe(copy.id);
  const beforeReset=added.revision;encoder.reset();expect(publish().revision).not.toBe(beforeReset);
 }finally{runtime.destroy();}
});

it('sends only changed entity fields and preserves prior decoded records',()=>{
 const runtime=setup(),encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder();
 const base=runtime.project(),actor=base.visual.settlement.entities.find(e=>e.unit)!;
 let entities=[actor];
 const publish=()=>{
  const view={...base.visual,settlement:{...base.visual.settlement,entities}};
  const frame={...base,visual:view,selection:view};
  const {packet,transfer}=encoder.encode(frame),received=structuredClone(packet,{transfer});
  const decoded=decoder.decode(received);expect(decoded).toEqual(frame);
  return {packet:received,entity:decoded.visual.settlement.entities[0]!};
 };
 try{
  const first=publish();expect(first.packet.visual.entities).toHaveLength(1);
  entities=structuredClone(entities);
  const idle=publish();expect(idle.packet.visual.entities).toHaveLength(0);expect(idle.packet.visual.patches).toHaveLength(0);
  expect(idle.entity).toBe(first.entity);
  entities=[{...entities[0]!,x:actor.x+.25,y:actor.y+.5}];
  const moved=publish();
  expect(moved.packet.visual.entities).toHaveLength(0);
  expect(moved.packet.visual.patches).toEqual([{id:actor.id,set:{x:actor.x+.25,y:actor.y+.5}}]);
  expect(first.entity.x).toBe(actor.x);expect(moved.entity).not.toBe(first.entity);
  expect(moved.entity.stats).toBe(first.entity.stats);
  entities=[{...entities[0]!,abilities:{mana:20,regeneration:0,ranks:{holy:1},cooldowns:{'ability.core.holy-light':12},pending:null},
   spellStatuses:[{owner:'player.1',ability:'ability.core.holy-light',status:'shield',source:actor.id,cast:1,rank:1,started:0,expires:200,nextTick:0,aura:false,shield:30}],
   equipment:['item.a',null],appearance:undefined}];
  const statuses=publish();
  expect(statuses.packet.visual.patches[0]!.set).toHaveProperty('appearance',undefined);
  expect(moved.entity).not.toHaveProperty('spellStatuses');
  entities=structuredClone(entities);entities[0]!.abilities!.cooldowns={};entities[0]!.spellStatuses![0]!.shield=12;entities[0]!.equipment!.reverse();
  const changed=publish();expect(changed.packet.visual.patches[0]!.set).toHaveProperty('spellStatuses');
  expect(statuses.entity.spellStatuses![0]!.shield).toBe(30);
  const {abilities:_abilities,spellStatuses:_statuses,equipment:_equipment,appearance:_appearance,...without}=entities[0]!;
  entities=[without];const removed=publish();
  expect(removed.packet.visual.patches[0]!.unset).toEqual(expect.arrayContaining(['abilities','spellStatuses','equipment','appearance']));
  expect(removed.entity).not.toHaveProperty('appearance');expect(removed.entity).not.toHaveProperty('abilities');
  encoder.reset();const reset=publish();expect(reset.packet.visual.entities).toHaveLength(1);expect(reset.packet.visual.patches).toHaveLength(0);
 }finally{runtime.destroy();}
});

it('keeps visual and private selection entity delta streams independent',()=>{
 const runtime=setup(),encoder=new SnapshotEncoder(),decoder=new SnapshotDecoder(),base=runtime.project();
 const actor=base.visual.settlement.entities.find(e=>e.unit)!;
 const visualEntity={...actor,hp:10},privateEntity={...actor,hp:40,inventory:{amber:50}};
 const publish=()=>{
  const visual={...base.visual,settlement:{...base.visual.settlement,entities:[visualEntity]}};
  const selection={...base.selection,settlement:{...base.selection.settlement,entities:[privateEntity]}};
  // Source records themselves are immutable; the two projections may differ for one ID.
  const frame=structuredClone({...base,visual,selection});
  const {packet,transfer}=encoder.encode(frame);expect(decoder.decode(structuredClone(packet,{transfer}))).toEqual(frame);
  return packet;
 };
 try{
  publish();visualEntity.hp=8;privateEntity.inventory.amber=23;
  const packet=publish();
  expect(packet.visual.patches).toEqual([{id:actor.id,set:{hp:8}}]);
  expect(packet.selection!.patches).toEqual([{id:actor.id,set:{inventory:{amber:23}}}]);
 }finally{runtime.destroy();}
});
