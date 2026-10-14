import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {game,placed} from '../game/helpers';
it('picks up a permanent power-up with a full inventory and keeps bonuses across restore and levels',()=>{
 const g=game([placed('hero','unit.test.marshal',60,60),{...placed('seed','item.test.briar-vigor-seed',61,60),owner:'none'}]);
 const hero=g.entities[0],seed=g.entities[1];hero.equipment!.fill('item.test.barkguard');const stats=g.context.stats(hero);
 const effect=g.registry.get('item.test.briar-vigor-seed').itemEffect as {permanent:{maxHp:number;damage:number}};
 const bonus=effect.permanent,levels=g.registry.get('unit.test.marshal').behaviors.progression!.levels;
 expect(bonus.maxHp).toBeGreaterThan(0);expect(bonus.damage).toBeGreaterThan(0);
 expect(g.command('player.1',{type:'pickup',actor:hero.id,target:seed.id}).accepted).toBe(true);
 for(let i=0;i<80&&g.entities.some(e=>e.id===seed.id);i++)g.tick();
 // Consumed on pickup without displacing any carried item.
 expect(g.entities.some(e=>e.id===seed.id)).toBe(false);expect(hero.equipment).toEqual(Array(4).fill('item.test.barkguard'));
 expect(g.context.stats(hero).maxHp).toBe(stats.maxHp+bonus.maxHp);expect(g.context.stats(hero).damage).toBe(stats.damage+bonus.damage);
 const copy=new Game(g.map,g.slots,g.registry);copy.restore(g.snapshot());expect(copy.checksum()).toBe(g.checksum());
 // The bonus stacks on top of the next level's base stats (carried equipment contribution unchanged).
 const equipment={maxHp:stats.maxHp-levels[0]!.maxHp,damage:stats.damage-levels[0]!.damage};
 hero.progression!.experience=levels[1]!.experience;
 expect(g.context.stats(hero).maxHp).toBe(levels[1]!.maxHp+equipment.maxHp+bonus.maxHp);
 expect(g.context.stats(hero).damage).toBe(levels[1]!.damage+equipment.damage+bonus.damage);
 hero.hp=0;expect(hero.progression!.bonuses).toMatchObject({maxHp:bonus.maxHp,damage:bonus.damage});
});
