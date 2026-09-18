import {expect,it} from 'vitest';
import {Game} from '../../src/sim/game/game';
import {game,placed} from '../game/helpers';
it('picks up a permanent power-up with a full inventory and keeps bonuses across restore and levels',()=>{
 const g=game([placed('hero','unit.ants.marshal',60,60),{...placed('seed','item.briar-vigor-seed',61,60),owner:'none'}]);
 const hero=g.entities[0],seed=g.entities[1];hero.equipment!.fill('item.barkguard');const stats=g.context.stats(hero);
 expect(g.command('player.1',{type:'pickup',actor:hero.id,target:seed.id}).accepted).toBe(true);
 for(let i=0;i<80&&g.entities.some(e=>e.id===seed.id);i++)g.tick();
 expect(g.entities.some(e=>e.id===seed.id)).toBe(false);expect(hero.equipment).toEqual(Array(4).fill('item.barkguard'));
 expect(g.context.stats(hero).maxHp).toBe(stats.maxHp+25);expect(g.context.stats(hero).damage).toBe(stats.damage+1);
 const copy=new Game(g.map,g.slots,g.registry);copy.restore(g.snapshot());expect(copy.checksum()).toBe(g.checksum());
 hero.progression!.experience=100;expect(g.context.stats(hero).maxHp).toBe(800);expect(g.context.stats(hero).damage).toBe(35);
 hero.hp=0;expect(hero.progression!.bonuses).toMatchObject({maxHp:25,damage:1});
});
