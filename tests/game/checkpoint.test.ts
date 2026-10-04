import {expect,it,vi} from 'vitest';
import {CHECKPOINT_ACTORS,gameplayCheckpoint} from '../../src/sim/game/checkpoint';
import {CHECKSUM_EVERY} from '../../src/shared/match/match';
import {World} from '../../src/sim/world/world';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {game,placed,worker} from './helpers';

it('reads at most 32 indexed actors, covers a stable index and has no call-dependent cursor',()=>{
 const g=game(),template=worker(g),actors=Array.from({length:257},(_,i)=>({...template,id:i+1}));
 const seen=new Set<number>(),read:number[]=[];
 const index=new Proxy(actors,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))read.push(Number(key));return Reflect.get(target,key,receiver);}});
 for(let phase=0;phase<Math.ceil(actors.length/CHECKPOINT_ACTORS);phase++){
  g.state.tick=phase*CHECKSUM_EVERY;read.length=0;
  const hash=gameplayCheckpoint(g.state,index);
  expect(read.length).toBeLessThanOrEqual(CHECKPOINT_ACTORS);
  for(const i of read){expect(seen.has(i)).toBe(false);seen.add(i);}
  expect(gameplayCheckpoint(g.state,index)).toBe(hash);
 }
 expect(seen.size).toBe(actors.length);
});

it('reads maintained lengths instead of walking forest or internal spell arrays',()=>{
 const g=game(),original=g.state.entities,index=g.context.indexedBodies();
 expect(g.context.indexedBodies()).toBe(index);
 const lengthOnly=<T>(values:T[])=>new Proxy(values,{get(target,key){if(key==='length')return target.length;throw Error(`Unexpected payload read ${String(key)}`);}});
 g.state.entities=lengthOnly(original);g.state.spellInstances=lengthOnly(g.state.spellInstances);
 expect(()=>g.checksum()).not.toThrow();
});

it('detects core gameplay differences immediately when the small actor roster fits one sample',()=>{
 const g=game(),saved=g.snapshot(),baseline=g.checksum(),audit=g.checksum('full');
 expect(g.context.indexedBodies().length).toBeLessThanOrEqual(CHECKPOINT_ACTORS);
 const mutations=[
  ()=>{worker(g).hp!--;},
  ()=>{worker(g).unit!.position={x:worker(g).x*1000+1,y:worker(g).y*1000};},
  ()=>{worker(g).unit!.order={type:'move',destination:{x:210,y:210},attackMove:false};},
  ()=>{worker(g).inventory['item.wood']=5;},
  ()=>{g.state.random++;},
  ()=>{g.state.nextCast++;},
  ()=>{g.state.accounting.produced['item.wood']=3;},
 ];
 for(const change of mutations){change();expect(g.checksum()).not.toBe(baseline);expect(g.checksum('full')).not.toBe(audit);g.restore(saved);expect(g.checksum()).toBe(baseline);}
});

it('detects a persistent change on the actor’s next sample, not by scanning every actor',()=>{
 const g=game(),actors=Array.from({length:96},(_,i)=>({...worker(g),id:i+1}));
 const before=gameplayCheckpoint(g.state,actors);actors[1]!.hp!--;
 expect(gameplayCheckpoint(g.state,actors)).toBe(before);
 g.state.tick=CHECKSUM_EVERY;const changed=gameplayCheckpoint(g.state,actors);
 actors[1]!.hp!++;expect(gameplayCheckpoint(g.state,actors)).not.toBe(changed);
});

it('keeps stock fingerprints independent of key insertion order and includes large counter words',()=>{
 const g=game(),e=worker(g);e.inventory={'item.wood':2,'item.amber':5};
 const before=g.checksum();e.inventory={'item.amber':5,'item.wood':2};expect(g.checksum()).toBe(before);
 g.state.nextId+=4294967296;expect(g.checksum()).not.toBe(before);
});

it('deliberately omits forest and fog payloads; full audits still detect them',()=>{
 const g=game([{...placed('tree','resource.forest.tree',205,215),owner:'none'}]);
 const saved=g.snapshot(),signal=g.checksum(),full=g.checksum('full');
 g.entities.find(e=>e.definition==='resource.forest.tree')!.resource!.amount--;
 expect(g.checksum()).toBe(signal);expect(g.checksum('full')).not.toBe(full);
 g.restore(saved);const changed=structuredClone(saved);
 changed.knowledge[0]!.cells[1]=(changed.knowledge[0]!.cells[1]!+1)%3;g.restore(changed);
 expect(g.checksum()).toBe(signal);expect(g.checksum('full')).not.toBe(full);
});

it('does not build AI snapshots or observation hashes during routine checks; full mode remains explicit',()=>{
 const world=new World({map:emptyUtcMap(),slots:[{player:0,kind:'human'},{player:1,kind:'ai'}],seed:123});
 const observation=vi.spyOn(world.settlement.observation,'checksum');
 const saved=world.snapshot(),before=world.checksum(),full=world.checksum('full');observation.mockClear();
 expect(world.checksum()).toBe(before);expect(observation).not.toHaveBeenCalled();
 saved.ai[0]!.state.sequence++;world.restore(saved);
 expect(world.checksum()).toBe(before);expect(world.checksum('full')).not.toBe(full);
 const state=world.snapshot();world.restore(state);expect(world.checksum()).toBe(before);
});

it('uses the same samples after indexed actors are created, removed and restored',()=>{
 const g=game(Array.from({length:65},(_,i)=>placed(`body${i}`,'unit.ants.warrior',20+i%8*3,30+Math.floor(i/8)*3)));
 g.context.create(placed('extra','unit.ants.warrior',90,90));
 g.context.remove(g.entities.find(e=>e.placement==='body3')!);
 expect(g.context.indexedBodies()).toEqual(g.entities.filter(e=>e.hp!==null));
 for(let phase=0;phase<3;phase++){
  g.state.tick=phase*CHECKSUM_EVERY;
  const signal=g.checksum(),audit=g.checksum('full'),snapshot=g.snapshot();
  g.restore(snapshot);expect(g.checksum()).toBe(signal);expect(g.checksum('full')).toBe(audit);
 }
});
