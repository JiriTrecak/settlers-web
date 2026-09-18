import {expect,it} from 'vitest';
import {SnapshotEncoder,SnapshotDecoder} from '../../src/session/worker/snapshots';
import {SimulationRuntime} from '../../src/session/worker/runtime';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {localMatch} from '../../src/shared/match/match';
import {placed} from '../game/helpers';

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
