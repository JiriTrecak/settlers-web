import {expect,it} from 'vitest';
import {game,placed} from './helpers';
import {fixed,precise} from '../../src/sim/game/motion';
import {localPath} from '../../src/sim/game/localPath';

function fixture(definition='unit.ants.warrior'){
 const placements=[placed('mover',definition,100,100),
  ...[[99,100],[101,100],[100,99],[100,101]].map(([x,y],i)=>placed('hold-'+i,'unit.ants.warrior',x,y))];
 const g=game(placements),mover=g.entities.find(e=>e.placement==='mover')!;
 const neighbors=g.entities.filter(e=>e.placement?.startsWith('hold-'));
 g.command('player.1',{type:'hold',actors:neighbors.map(e=>e.id)});
 g.command('player.1',{type:'move',actors:[mover.id],destination:{x:103,y:103}});
 return {g,mover,neighbors,placements};
}

it('escapes a coarse-grid enclosure through real clearance without moving Hold units',()=>{
 const {g,mover,neighbors}=fixture(),positions=neighbors.map(e=>({...fixed(e)}));
 let sawDetour=false;
 for(let tick=0;tick<160;tick++){
  const before={...mover.unit!.position??fixed(mover)};
  g.tick();sawDetour||=!!mover.unit!.detour;
  const after=mover.unit!.position??fixed(mover);
  expect(g.spatial.clearSegment(before,after)).toBe(true);
  expect(g.spatial.unitSegmentClear(before,after,mover.id)).toBe(true);
 }
 expect(sawDetour).toBe(true);
 expect(precise(mover)).toMatchObject({x:103,y:103});
 expect(mover.unit!.order).toBeNull();expect(mover.unit!.detour).toBeUndefined();
 expect(neighbors.map(e=>fixed(e))).toEqual(positions);
 expect(neighbors.every(e=>e.unit!.order?.type==='hold')).toBe(true);
});

it('saves the escape route and cancels it immediately on replacement input',()=>{
 const {g,mover,placements}=fixture();
 for(let n=0;n<40&&!mover.unit!.detour;n++)g.tick();
 expect(mover.unit!.detour).toBeDefined();
 const restored=game(placements);restored.restore(g.snapshot());
 for(let n=0;n<15;n++){g.tick();restored.tick();expect(restored.checksum()).toBe(g.checksum());}
 const before={...precise(mover)};
 g.command('player.1',{type:'stop',actors:[mover.id]});g.tick();
 expect(mover.unit!.detour).toBeUndefined();expect(mover.unit!.route).toEqual([]);
 expect(precise(mover)).toMatchObject(before);
});

it('rechecks an escape segment when another unit enters its path',()=>{
 const {g,mover}=fixture();
 for(let n=0;n<40&&!mover.unit!.detour;n++)g.tick();
 const p=precise(mover),q=mover.unit!.detour!.points[0];
 const length=Math.hypot(q.x/1000-p.x,q.y/1000-p.y);
 const blocker=g.context.create(placed('new-body','unit.ants.warrior',Math.round(p.x),Math.round(p.y)));
 blocker.unit!.position={x:Math.round((p.x+(q.x/1000-p.x)/length*.45)*1000),y:Math.round((p.y+(q.y/1000-p.y)/length*.45)*1000)};
 blocker.x=Math.floor((blocker.unit!.position.x+500)/1000);blocker.y=Math.floor((blocker.unit!.position.y+500)/1000);
 blocker.unit!.order={type:'hold'};
 for(let n=0;n<10&&mover.unit!.detour;n++)g.tick();
 expect(mover.unit!.detour).toBeUndefined();
 expect(Math.hypot(precise(mover).x-precise(blocker).x,precise(mover).y-precise(blocker).y)).toBeGreaterThanOrEqual(.399);
});

it('keeps local searches bounded and does not cross a closed terrain barrier',()=>{
 let probes=0;
 expect(localPath({x:100000,y:100000},{x:105000,y:100000},()=>{probes++;return true;})).toBeNull();
 expect(probes).toBe(0);
 const path=localPath({x:100000,y:100000},{x:103000,y:100000},(a,b)=>{
  probes++;return (a.x<101000)===(b.x<101000);
 });
 expect(path).toBeNull();expect(probes).toBeLessThan(2305);
});

it('does not squeeze through a narrow doorway occupied by a Hold unit',()=>{
 const g=game([placed('mover','unit.ants.warrior',100,100),placed('gate','unit.ants.warrior',105,100)]);
 const mover=g.entities.find(e=>e.placement==='mover')!,gate=g.entities.find(e=>e.placement==='gate')!;
 for(let y=0;y<256;y++)if(y!==100)g.spatial.terrain[y*256+105]=0;
 g.command('player.1',{type:'hold',actors:[gate.id]});
 g.command('player.1',{type:'move',actors:[mover.id],destination:{x:107,y:100}});
 for(let n=0;n<200;n++)g.tick();
 expect(precise(mover).x).toBeLessThan(105);expect(gate.x).toBe(105);expect(gate.y).toBe(100);
 g.command('player.1',{type:'move',actors:[gate.id],destination:{x:109,y:103}});
 for(let n=0;n<160;n++)g.tick();
 expect(precise(mover)).toMatchObject({x:107,y:100});
});

it('rejects corrupt saved local destinations',()=>{
 const {g,mover,placements}=fixture();
 for(let n=0;n<40&&!mover.unit!.detour;n++)g.tick();
 const saved=g.snapshot();
 saved.state.entities.find(e=>e.id===mover.id)!.unit!.detour!.points.at(-1)!.x++;
 expect(()=>game(placements).restore(saved)).toThrow('Invalid saved local detour');
});

it('finishes a hero pickup from inside a crowd and saves immediately after collecting',()=>{
 const {g,mover,placements}=fixture('unit.ants.marshal');
 const item=g.context.create({...placed('loot','item.heartseed',103,103),owner:'none'});
 g.command('player.1',{type:'pickup',actor:mover.id,target:item.id});
 let sawDetour=false;
 for(let n=0;n<160&&g.context.get(item.id);n++){g.tick();sawDetour||=!!mover.unit!.detour;}
 expect(sawDetour).toBe(true);expect(mover.equipment).toContain('item.heartseed');
 expect(mover.unit!.detour).toBeUndefined();
 const restored=game(placements);restored.restore(g.snapshot());expect(restored.checksum()).toBe(g.checksum());
});

it('a new spell cancels a local escape before turning toward its cast point',()=>{
 const {g,mover,placements}=fixture('unit.ants.marshal');
 for(let n=0;n<40&&!mover.unit!.detour;n++)g.tick();
 expect(mover.unit!.detour).toBeDefined();
 const spell='spell.marshal.faultline';g.spells.learn(mover,spell);
 const p=precise(mover);
 expect(g.spells.cast(mover,spell,{x:Math.round(p.x)+2,y:Math.round(p.y)})).toBeNull();
 expect(mover.unit!.detour).toBeUndefined();
 const restored=game(placements);restored.restore(g.snapshot());expect(restored.checksum()).toBe(g.checksum());
});

it('keeps self-spell visuals and saves at the hero’s precise position between cells',()=>{
 const {g,mover,placements}=fixture('unit.ants.marshal');
 const observer=g.context.create({...placed('observer','unit.ants.warrior',100,104),owner:'player.2'});
 g.command('player.2',{type:'hold',actors:[observer.id]});
 for(let n=0;n<40&&!mover.unit!.detour;n++)g.tick();
 const p=precise(mover),center={x:p.x,y:p.y};
 expect(Number.isInteger(p.x)).toBe(false);
 const spell='spell.marshal.rally';g.spells.learn(mover,spell);
 expect(g.spells.cast(mover,spell)).toBeNull();
 const cue=g.state.visuals.at(-1)!;
 expect(cue.origin).toEqual(center);expect(cue.target).toEqual(center);
 expect(cue.viewers).toContain('player.2');
 const restored=game(placements);restored.restore(g.snapshot());
 for(let n=0;n<25;n++){g.tick();restored.tick();expect(restored.checksum()).toBe(g.checksum());}
 expect(g.state.visuals.some(v=>v.ability===spell&&v.phase==='impact'&&v.target.x===center.x)).toBe(true);
});
