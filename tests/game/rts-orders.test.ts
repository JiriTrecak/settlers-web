import {expect,it} from 'vitest';
import {game,placed,run} from './helpers';
import {precise} from '../../src/sim/game/motion';
import {heading} from '../../src/sim/game/facing';
import {actionSchema} from '../../src/shared/types/types';
const owner='player.1' as const;
const pos=(e:Parameters<typeof precise>[0])=>({x:precise(e).x,y:precise(e).y});
it('Hold stands still for distant enemies, attacks within range, and yields immediately to Move',()=>{
 const g=game([placed('guard','unit.ants.archer',180,180),{...placed('enemy','unit.ants.warrior',194,180),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='guard')!,b=g.entities.find(e=>e.placement==='enemy')!;
 g.command('player.2',{type:'hold',actors:[b.id]});expect(g.command(owner,{type:'hold',actors:[a.id]}).accepted).toBe(true);
 const p=pos(a);run(g,80);expect(pos(a)).toEqual(p);expect(a.unit!.route).toEqual([]);
 b.x=184;b.y=180;b.unit!.position=null;b.unit!.segment=null;a.rotation=heading(a,b);g.observation.update();const hp=b.hp!;
 run(g,100);expect(b.hp!).toBeLessThan(hp);expect(pos(a)).toEqual(p);
 g.command(owner,{type:'move',actors:[a.id],destination:{x:175,y:180}});expect(a.unit!.order?.type).toBe('move');run(g,120);expect(precise(a).x).toBeLessThan(p.x);
});
it('patrol alternates endpoints and survives save/restore deterministically',()=>{
 const g=game([placed('patrol','unit.ants.warrior',170,170)]),a=g.entities.find(e=>e.placement==='patrol')!;
 expect(g.command(owner,{type:'patrol',actors:[a.id],destination:{x:174,y:170}}).accepted).toBe(true);
 let reached=false,returned=false;for(let i=0;i<800;i++){g.tick();if(precise(a).x>173.5)reached=true;if(reached&&precise(a).x<170.5)returned=true;}
 expect(reached).toBe(true);expect(returned).toBe(true);expect(a.unit!.order?.type).toBe('patrol');
 const twin=game([placed('patrol','unit.ants.warrior',170,170)]);twin.restore(g.snapshot());run(g,80);run(twin,80);expect(twin.snapshot()).toEqual(g.snapshot());
});
it('follow tracks a friendly leader and rejects foreign and self targets',()=>{
 const g=game([placed('a','unit.ants.warrior',170,170),placed('b','unit.ants.warrior',176,170),{...placed('enemy','unit.ants.warrior',180,176),owner:'player.2'}]);
 const a=g.entities.find(e=>e.placement==='a')!,b=g.entities.find(e=>e.placement==='b')!,enemy=g.entities.find(e=>e.placement==='enemy')!;
 expect(g.command(owner,{type:'follow',actors:[a.id],target:enemy.id}).accepted).toBe(false);
 expect(g.command(owner,{type:'follow',actors:[a.id],target:a.id}).accepted).toBe(false);
 expect(g.command(owner,{type:'follow',actors:[a.id],target:b.id}).accepted).toBe(true);
 g.command(owner,{type:'move',actors:[b.id],destination:{x:185,y:170}});run(g,240);expect(precise(a).x).toBeGreaterThan(175);expect(a.unit!.order?.type).toBe('follow');
 g.command(owner,{type:'stop',actors:[a.id]});expect(a.unit!.order).toBeNull();
});
it('queues Hold after Move, keeps workers held, and enforces owner authority',()=>{
 const g=game([placed('worker','unit.ants.settler',170,170)]),a=g.entities.find(e=>e.placement==='worker')!;
 expect(g.command('player.2',{type:'hold',actors:[a.id]}).accepted).toBe(false);
 g.command(owner,{type:'move',actors:[a.id],destination:{x:172,y:170}});g.command(owner,{type:'hold',actors:[a.id],append:true});
 expect(a.unit!.orderQueue).toEqual([{type:'hold'}]);run(g,220);expect(a.unit!.order?.type).toBe('hold');const p=pos(a);run(g,600);expect(pos(a)).toEqual(p);
});
it('rejects malformed and out-of-map patrol commands without changing current orders',()=>{
 const g=game([placed('a','unit.ants.warrior',170,170)]),a=g.entities.find(e=>e.placement==='a')!;
 expect(actionSchema.safeParse({type:'follow',actors:[a.id],target:-2}).success).toBe(false);
 g.command(owner,{type:'hold',actors:[a.id]});expect(g.command(owner,{type:'patrol',actors:[a.id],destination:{x:511,y:511}}).accepted).toBe(false);expect(a.unit!.order?.type).toBe('hold');
});
