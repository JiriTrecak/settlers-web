import {expect,it} from 'vitest';
import {game,placed,run} from './helpers';
it('preserves a half-cell building center in last-seen pursuit through save/load',()=>{
 const make=()=>game([placed('attacker','unit.ants.warrior',120,101),{...placed('enemy-hall','building.ants.fort',101.5,101.5),owner:'player.2'}]);
 const g=make(),actor=g.entities.find(e=>e.placement==='attacker')!,target=g.entities.find(e=>e.placement==='enemy-hall')!;
 expect(g.command('player.1',{type:'attack',actors:[actor.id],target:target.id}).accepted).toBe(true);g.tick();
 expect(actor.unit!.pursuit?.position).toEqual({x:101.5,y:101.5});
 const restored=make();restored.restore(g.snapshot());run(g,80);run(restored,80);expect(g.snapshot()).toEqual(restored.snapshot());
 const invalid=g.snapshot();invalid.state.entities.find(e=>e.id===actor.id)!.unit!.pursuit!.position.x=101.25;
 expect(()=>g.restore(invalid)).toThrow();
});
