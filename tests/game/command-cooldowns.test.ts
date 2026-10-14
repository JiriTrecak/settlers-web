import {expect,it} from 'vitest';
import {game} from './helpers';
import type {AbilityLibrary} from '../../src/content/abilities/schema';
import {commandCard} from '../../src/presentation/commands';
import {TICK_MS} from '../../src/shared/match/match';

it('projects authoritative ability cooldowns, clamps expired timers, and keeps enemy spell state private',()=>{
 const ability='ability.test.marshal-faultline',total=360;
 // Declare the full cooldown in the test so the projected total is the test's own value.
 const g=game([],draft=>{(draft.abilityLibrary as AbilityLibrary).abilities.find(a=>a.id===ability)!.cast.cooldown.ticks=total;});
 const hero=g.entities.find(e=>e.owner==='player.1'&&e.abilities)!;
 hero.abilities!.ranks['faultline']=1;
 const current=g.view('player.1').revision;
 hero.abilities!.cooldowns[ability]=current+82;g.tick();
 const read=()=>commandCard(g.view('player.1'),[hero.id],'player.1',g.context.registry).find(c=>c.ability===ability&&c.type==='castAbility')!;
 const card=read();
 expect(card.cooldown).toEqual({remainingTicks:81,totalTicks:total});
 expect(card.enabled).toBe(false);expect(card.reason).toBe(`Ready in ${Math.ceil(81*TICK_MS/1000)}s`);
 hero.abilities!.cooldowns[ability]=current;g.tick();
 expect(read().cooldown?.remainingTicks).toBe(0);expect(read().enabled).toBe(true);
 expect(commandCard(g.view('player.2'),[hero.id],'player.2',g.context.registry).some(c=>c.cooldown)).toBe(false);
 const unlearned=commandCard(g.view('player.1'),[hero.id],'player.1',g.context.registry).find(c=>c.ability==='ability.test.marshal-crownfall'&&c.type==='castAbility')!;
 expect(unlearned).toBeUndefined();
});
