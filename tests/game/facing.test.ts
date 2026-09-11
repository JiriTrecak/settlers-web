import {expect,it,vi} from 'vitest';
import {game,placed} from './helpers';
import {precise} from '../../src/sim/game/motion';
import {heading,turnDifference,turnToward} from '../../src/sim/game/facing';
it('turns toward the real next leg when a retry route starts with reached or repeated anchors',()=>{
 const g=game([placed('soldier','unit.ants.warrior',100,100)]),e=g.entities.find(e=>e.placement==='soldier')!;
 g.command(e.owner,{type:'move',actors:[e.id],destination:{x:110,y:100}});
 g.tick();e.rotation=0;
 const start=g.spatial.cell(e);
 e.unit!.route.unshift(start,start);
 g.tick();
 expect(e.rotation).toBe(18);
 expect(precise(e)).toMatchObject({x:100,y:100});
 expect(e.unit!.lastMovedTick).toBeUndefined();
 expect(e.unit!.route).toEqual([g.spatial.cell({x:110,y:100})]);
 const restored=game([placed('soldier','unit.ants.warrior',100,100)]);restored.restore(g.snapshot());
 for(let i=0;i<4;i++){g.tick();restored.tick();}
 expect(e.rotation).toBe(90);expect(precise(e).x).toBeGreaterThan(100);
 expect(restored.checksum()).toBe(g.checksum());
});
it('reacts on the first order tick by turning, and only travels after facing the route',()=>{
 const g=game([placed('soldier','unit.ants.warrior',100,100)]),e=g.entities.find(e=>e.placement==='soldier')!;
 g.command('player.1',{type:'move',actors:[e.id],destination:{x:110,y:100}});g.tick();
 expect(e.rotation).toBe(18);expect(precise(e).x).toBe(100);
 for(let n=0;n<4;n++)g.tick();
 expect(e.rotation).toBe(90);expect(precise(e).x).toBeGreaterThan(100);
 const before=precise(e).x;
 g.command('player.1',{type:'move',actors:[e.id],destination:{x:90,y:100}});g.tick();
 expect(e.rotation).toBe(108);expect(precise(e).x).toBe(before);
});
it('uses the short turn across north and preserves facing through saves',()=>{
 const g=game([placed('soldier','unit.ants.warrior',100,100)]),e=g.entities.find(e=>e.placement==='soldier')!;
 e.rotation=350;turnToward(e,{x:100,y:110},6);expect(e.rotation).toBe(356);
 turnToward(e,{x:100,y:110},6);expect(e.rotation).toBe(0);
 expect(turnDifference(5,355)).toBe(-10);
 const restored=game([placed('soldier','unit.ants.warrior',100,100)]);restored.restore(g.snapshot());expect(restored.checksum()).toBe(g.checksum());
});
it('starts the attack windup only after facing the victim',()=>{
 const g=game([placed('a','unit.ants.warrior',100,100),{...placed('b','unit.ants.warrior',101,100),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='a')!,b=g.entities.find(e=>e.placement==='b')!;
 g.command('player.1',{type:'attack',actors:[a.id],target:b.id});g.tick();
 expect(a.rotation).toBe(18);expect(a.unit!.attack).toBeUndefined();
 for(let n=0;n<4;n++)g.tick();
 expect(a.unit!.attack?.started).toBe(5);expect(b.hp).toBe(300);
});
it('turns before a directional cast starts rather than snapping on the cast command',()=>{
 const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!;
 const id='spell.marshal.faultline';expect(g.spells.learn(hero,id)).toBeNull();
 const point={x:hero.x+2,y:hero.y};hero.rotation=270;
 expect(g.spells.cast(hero,id,point)).toBeNull();
 expect(hero.rotation).toBe(270);expect(hero.spellcasting!.pending!.startTick).toBe(10);
 const casting=()=>g.view('player.1').entities.find(e=>e.id===hero.id)!.unit!.casting;
 expect(casting()).toBeUndefined();
 for(let i=0;i<10;i++)g.tick();
 expect(Math.abs(turnDifference(hero.rotation,heading(hero,point)))).toBeLessThan(1);
 expect(casting()).toEqual({ability:id,startTick:10,resolveTick:hero.spellcasting!.pending!.resolveTick});
});

it('a replacement move cancels a turning cast immediately and refunds an unreleased spell',()=>{
 const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!,id='spell.marshal.faultline';
 g.spells.learn(hero,id);hero.rotation=270;const mana=hero.spellcasting!.mana;
 g.spells.cast(hero,id,{x:hero.x+2,y:hero.y});
 expect(hero.spellcasting!.pending).not.toBeNull();
 g.command(hero.owner,{type:'move',actors:[hero.id],destination:{x:hero.x,y:hero.y+2}});
 expect(hero.spellcasting!.pending).toBeNull();expect(hero.spellcasting!.mana).toBe(mana);expect(hero.spellcasting!.cooldowns[id]).toBeUndefined();
 g.tick();expect(hero.unit!.route.length).toBeGreaterThan(0);
});
it('an appended move waits for the spell instead of cancelling it',()=>{
 const g=game(),hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!,id='spell.marshal.faultline';
 g.spells.learn(hero,id);g.spells.cast(hero,id,{x:hero.x+2,y:hero.y});
 g.command(hero.owner,{type:'move',actors:[hero.id],destination:{x:hero.x,y:hero.y+2},append:true});
 expect(hero.spellcasting!.pending).not.toBeNull();expect(hero.unit!.orderQueue).toHaveLength(1);
});

it('reports locomotion only on ticks that travel, not while turning or blocked',()=>{
 const g=game([placed('soldier','unit.ants.warrior',100,100)]),e=g.entities.find(e=>e.placement==='soldier')!;
 const moving=()=>g.view('player.1').entities.find(v=>v.id===e.id)!.unit!.moving;
 g.command('player.1',{type:'move',actors:[e.id],destination:{x:110,y:100}});
 g.tick();expect(moving()).toBe(false);
 for(let i=0;i<4;i++)g.tick();expect(moving()).toBe(true);
 // Another body prevents travel after routing: a retained path is not locomotion.
 vi.spyOn(g.spatial,'unitSegmentClear').mockReturnValue(false);e.unit!.retryAt=100;g.state.tick++;g.context.move();g.observation.update();expect(e.unit!.route.length).toBeGreaterThan(0);expect(moving()).toBe(false);
});
