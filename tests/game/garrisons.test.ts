import {expect,it} from 'vitest';
import {game,placed,run} from './helpers';
import {precise} from '../../src/sim/game/motion';
import {commandCard} from '../../src/presentation/commands';

const owner='player.1' as const;
const placements=()=>[placed('tower','building.ants.tower',180,180),placed('a','unit.ants.archer',180,185),placed('b','unit.ants.archer',184,185),placed('w','unit.ants.warrior',186,180)];
function setup(){const g=game(placements());return {g,t:g.entities.find(e=>e.placement==='tower')!,a:g.entities.find(e=>e.placement==='a')!,b:g.entities.find(e=>e.placement==='b')!,w:g.entities.find(e=>e.placement==='w')!};}

it('reserves one lookout, walks to it, and rejects non-archers and foreign owners',()=>{
 const {g,t,a,b,w}=setup();
 expect(g.command(owner,{type:'garrison',actors:[w.id],target:t.id}).accepted).toBe(false);
 expect(g.command('player.2',{type:'garrison',actors:[a.id],target:t.id}).accepted).toBe(false);
 expect(g.command(owner,{type:'garrison',actors:[a.id,b.id],target:t.id}).actors).toEqual([a.id]);
 expect(g.command(owner,{type:'garrison',actors:[b.id],target:t.id}).accepted).toBe(false);
 expect(a.unit!.garrison).toBeUndefined();run(g,140);
 expect(a.unit!.garrison).toEqual({building:t.id,height:4.9});expect(precise(a)).toEqual(precise(t));
 const button=commandCard(g.view(owner),[t.id],owner,g.registry).find(c=>c.type==='unload');
 expect(button?.immediate).toEqual({type:'unload',actor:t.id});expect(button?.enabled).toBe(true);
 expect(b.unit!.garrison).toBeUndefined();expect(a.unit!.contained).toBeNull();expect(a.unit!.route).toEqual([]);
});

it('fires from the elevated origin without chasing, and survives deterministic save/load',()=>{
 const {g,t,a}=setup();g.command(owner,{type:'garrison',actors:[a.id],target:t.id});run(g,140);
 const enemy=g.context.create({...placed('enemy','unit.ants.warrior',187,180),owner:'player.2'});g.command('player.2',{type:'hold',actors:[enemy.id]});g.observation.update();
 const hp=enemy.hp!;let shot=false;
 for(let i=0;i<120;i++){g.tick();if(g.state.missiles.some(m=>m.source===a.id)){shot=true;expect(g.state.missiles.find(m=>m.source===a.id)!.origin.elevation).toBe(4.9);}}
 expect(shot).toBe(true);expect(enemy.hp!).toBeLessThan(hp);expect(precise(a)).toEqual(precise(t));
 expect(g.command('player.2',{type:'attack',actors:[enemy.id],target:a.id}).accepted).toBe(false);
 const twin=game(placements());twin.restore(g.snapshot());run(g,80);run(twin,80);expect(twin.snapshot()).toEqual(g.snapshot());
 const bad=g.snapshot();bad.state.entities.find(e=>e.id===a.id)!.unit!.garrison!.height=8;expect(()=>twin.restore(bad)).toThrow('lookout');
});

it('leaves immediately on Move; unload and tower destruction preserve the same living archer',()=>{
 const {g,t,a}=setup();const enter=()=>{expect(g.command(owner,{type:'garrison',actors:[a.id],target:t.id}).accepted).toBe(true);run(g,180);expect(a.unit!.garrison).toBeDefined();};
 enter();const hp=a.hp;
 expect(g.command(owner,{type:'move',actors:[a.id],destination:{x:180,y:187}}).accepted).toBe(true);
 expect(a.unit!.garrison).toBeUndefined();run(g,150);expect(precise(a).y).toBeCloseTo(187);enter();
 expect(g.command(owner,{type:'unload',actor:t.id}).accepted).toBe(true);expect(a.unit!.garrison).toBeUndefined();expect(a.hp).toBe(hp);enter();
 g.economy.remove(t);expect(a.unit!.garrison).toBeUndefined();expect(g.context.get(a.id)).toBe(a);expect(a.hp).toBe(hp);expect(g.spatial.walkable(g.spatial.cell(a))).toBe(true);
});

it('cancelling approach frees the reservation and queued entry activates after Move',()=>{
 const {g,t,a,b}=setup();g.command(owner,{type:'garrison',actors:[a.id],target:t.id});g.command(owner,{type:'stop',actors:[a.id]});
 expect(g.command(owner,{type:'garrison',actors:[b.id],target:t.id}).accepted).toBe(true);g.command(owner,{type:'stop',actors:[b.id]});
 g.command(owner,{type:'move',actors:[a.id],destination:{x:181,y:186}});
 expect(g.command(owner,{type:'garrison',actors:[a.id],target:t.id,append:true}).accepted).toBe(true);
 run(g,240);expect(a.unit!.garrison?.building).toBe(t.id);
});
