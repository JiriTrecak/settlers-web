import {it,expect} from 'vitest';
import {game,placed} from './helpers';
import {commandCard,queueCard} from '../../src/presentation/commands';
function fixture(){const g=game([placed('shrine','building.ants.sanctuary',235,230),placed('backup','building.ants.sanctuary',249,230)]),hero=g.entities.find(e=>e.equipment&&e.owner==='player.1')!;hero.hp=0;g.economy.remove(hero);g.revival.retain(hero);g.tick();return {g,hero,shrine:g.entities.find(e=>e.placement==='shrine')!,backup:g.entities.find(e=>e.placement==='backup')!};}
it('exposes owner-only revival commands and cancellation, and prevents duplicate queues',()=>{
 const {g,hero,shrine,backup}=fixture();
 const command=commandCard(g.view('player.1'),[shrine.id],'player.1',g.registry).find(b=>b.type==='revive')!;
 expect(command.immediate).toEqual({type:'revive',actor:shrine.id,hero:hero.id});
 expect(g.command('player.2',command.immediate!).accepted).toBe(false);
 expect(g.command('player.1',command.immediate!).accepted).toBe(true);g.tick();
 expect(g.command('player.1',{type:'revive',actor:backup.id,hero:hero.id}).reason).toMatch(/already/);
 const queue=queueCard(g.view('player.1'),shrine.id,'player.1',g.registry);expect(queue).toHaveLength(1);
 expect(g.command('player.1',queue[0].cancel!).accepted).toBe(true);
 expect(hero.fallen).toBe(true);expect(g.command('player.1',{type:'revive',actor:backup.id,hero:hero.id}).accepted).toBe(true);
 const saved=g.snapshot();saved.state.entities.find(e=>e.id===shrine.id)!.revival!.queue=[{hero:hero.id,progress:0}];expect(()=>g.restore(saved)).toThrow(/Duplicate hero revival/);
});
it('keeps a fallen hero available if the sanctuary is destroyed mid-revival',()=>{
 const {g,hero,shrine,backup}=fixture();g.command('player.1',{type:'revive',actor:shrine.id,hero:hero.id});g.tick();g.economy.remove(shrine);
 expect(hero.fallen).toBe(true);expect(g.command('player.1',{type:'revive',actor:backup.id,hero:hero.id}).accepted).toBe(true);
 for(let i=0;i<400;i++)g.tick();expect(hero.fallen).toBeUndefined();expect(hero.hp).toBeGreaterThan(0);
});
