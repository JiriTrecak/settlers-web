import {expect,it} from 'vitest';
import {game} from './helpers';
import {commandCard} from '../../src/presentation/commands';
import {TICK_MS} from '../../src/shared/match/match';

it('projects authoritative ability cooldowns, clamps expired timers, and keeps enemy spell state private',()=>{
 const g=game([]),hero=g.entities.find(e=>e.owner==='player.1'&&e.abilities)!;
 hero.abilities!.ranks['faultline']=1;
 const ability='ability.marshal.faultline';
 const current=g.view('player.1').revision;
 hero.abilities!.cooldowns[ability]=current+82;g.tick();
 const read=()=>commandCard(g.view('player.1'),[hero.id],'player.1',g.context.registry).find(c=>c.ability===ability&&c.type==='castAbility')!;
 const card=read();
 expect(card.cooldown).toEqual({remainingTicks:81,totalTicks:360});
 expect(card.enabled).toBe(false);expect(card.reason).toBe(`Ready in ${Math.ceil(81*TICK_MS/1000)}s`);
 hero.abilities!.cooldowns[ability]=current;g.tick();
 expect(read().cooldown?.remainingTicks).toBe(0);expect(read().enabled).toBe(true);
 expect(commandCard(g.view('player.2'),[hero.id],'player.2',g.context.registry).some(c=>c.cooldown)).toBe(false);
 const unlearned=commandCard(g.view('player.1'),[hero.id],'player.1',g.context.registry).find(c=>c.ability==='ability.marshal.crownfall'&&c.type==='castAbility')!;
 expect(unlearned).toBeUndefined();
});
