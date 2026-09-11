import {expect,it,vi,afterEach} from 'vitest';
import {game,placed} from './helpers';
import {heading} from '../../src/sim/game/facing';
afterEach(()=>vi.restoreAllMocks());

function pursuit(explicit=false){
  const g=game([placed('actor','unit.ants.warrior',100,100),
    {...placed('far','unit.ants.warrior',104,100),owner:'player.2'}]);
  const actor=g.entities.find(e=>e.placement==='actor')!,far=g.entities.find(e=>e.placement==='far')!;
  actor.rotation=90;
  g.command('player.2',{type:'hold',actors:[far.id]});
  g.command('player.1',explicit?{type:'attack',actors:[actor.id],target:far.id}:
    {type:'move',actors:[actor.id],destination:{x:110,y:100},attackMove:true});
  g.tick();expect(actor.unit!.target).toBe(far.id);
  const near=g.context.create({...placed('near','unit.ants.warrior',100,101),owner:'player.2'});
  g.command('player.2',{type:'hold',actors:[near.id]});g.observation.update();
  return {g,actor,far,near};
}

it('engages an enemy in weapon range instead of pursuing a distant automatic target',()=>{
  const {g,actor,near}=pursuit();
  for(let i=0;i<8;i++)g.tick();
  expect(actor.unit!.target).toBe(near.id);
  expect(actor.unit!.pursuit?.target).toBe(near.id);
  expect(actor.unit!.route).toEqual([]);
  expect(actor.unit!.order?.type).toBe('move');
  for(let i=0;i<50;i++)g.tick();
  expect(near.hp).toBeLessThan(300);
});

it('keeps explicit focus fire even when another enemy is closer',()=>{
  const {g,actor,far}=pursuit(true);
  for(let i=0;i<8;i++){g.tick();expect(actor.unit!.target).toBe(far.id);}
  expect(actor.unit!.order).toMatchObject({type:'attack',target:far.id});
});

it('lets a replacement move order leave nearby enemies immediately',()=>{
  const {g,actor}=pursuit();
  g.command('player.1',{type:'move',actors:[actor.id],destination:{x:95,y:100}});
  for(let i=0;i<8;i++){g.tick();expect(actor.unit!.target).toBeNull();}
  expect(actor.unit!.order).toMatchObject({type:'move',attackMove:false});
  expect(actor.unit!.pursuit).toBeUndefined();
});

it('keeps an automatic target already in range instead of switching to a closer one',()=>{
  const {g,actor,far,near}=pursuit();
  far.x=101;far.y=100;far.unit!.position=null;
  near.unit!.position={x:100000,y:100600};
  g.observation.update();
  // Go beyond one full attack cycle so commitment alone cannot mask retargeting.
  for(let i=0;i<90;i++){g.tick();expect(actor.unit!.target).toBe(far.id);}
});

it('does not replace a target with a hidden nearby enemy',()=>{
  const {g,actor,far,near}=pursuit();
  const visible=g.observation.visible.bind(g.observation);
  vi.spyOn(g.observation,'visible').mockImplementation((owner,e)=>e.id!==near.id&&visible(owner,e));
  for(let i=0;i<8;i++){g.tick();expect(actor.unit!.target).toBe(far.id);}
});

it('retains a committed swing when its victim retreats and another enemy enters range',()=>{
  const g=game([placed('actor','unit.ants.warrior',100,100),
    {...placed('victim','unit.ants.warrior',101,100),owner:'player.2'}]);
  const actor=g.entities.find(e=>e.placement==='actor')!,victim=g.entities.find(e=>e.placement==='victim')!;
  actor.rotation=heading(actor,victim);
  g.command('player.2',{type:'hold',actors:[victim.id]});
  g.command('player.1',{type:'move',actors:[actor.id],destination:{x:110,y:100},attackMove:true});
  g.tick();const strike={...actor.unit!.attack!};expect(strike.target).toBe(victim.id);
  victim.x=105;victim.unit!.position=null;victim.unit!.segment=null;
  const near=g.context.create({...placed('near','unit.ants.warrior',100,101),owner:'player.2'});
  g.command('player.2',{type:'hold',actors:[near.id]});g.observation.update();
  while(g.state.tick<strike.ends-1){g.tick();expect(actor.unit!.target).toBe(victim.id);expect(actor.unit!.attack?.started).toBe(strike.started);}
});

it('replays automatic reacquisition identically',()=>{
  const {g}=pursuit(),restored=pursuit().g;restored.restore(g.snapshot());
  for(let i=0;i<160;i++){g.tick();restored.tick();expect(restored.checksum()).toBe(g.checksum());}
});
