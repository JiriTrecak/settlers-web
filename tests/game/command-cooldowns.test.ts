import {expect,it} from 'vitest';
import {game} from './helpers';
import {commandCard} from '../../src/presentation/commands';
import {TICK_MS} from '../../src/shared/match/match';

it('projects authoritative ability cooldowns, clamps expired timers, and keeps enemy spell state private',()=>{
 const g=game([]),hero=g.entities.find(e=>e.owner==='player.1'&&e.spellcasting)!;
 const ability='spell.marshal.rally';
 expect(g.spells.learn(hero,ability)).toBeNull();
 const current=g.view('player.1').revision;
 hero.spellcasting!.cooldowns[ability]=current+82;g.tick();
 const read=()=>commandCard(g.view('player.1'),[hero.id],'player.1',g.context.registry).find(c=>c.ability===ability&&c.type==='cast')!;
 const card=read();
 expect(card.cooldown).toEqual({remainingTicks:81,totalTicks:g.context.registry.rules.spells[ability].ranks[0].cooldownTicks});
 expect(card.enabled).toBe(false);expect(card.reason).toBe(`Ready in ${Math.ceil(81*TICK_MS/1000)}s`);
 hero.spellcasting!.cooldowns[ability]=current;g.tick();
 expect(read().cooldown?.remainingTicks).toBe(0);expect(read().enabled).toBe(true);
 expect(commandCard(g.view('player.2'),[hero.id],'player.2',g.context.registry).some(c=>c.cooldown)).toBe(false);
 const unlearned=commandCard(g.view('player.1'),[hero.id],'player.1',g.context.registry).find(c=>c.ability==='spell.marshal.crownfall'&&c.type==='cast')!;
 expect(unlearned).toBeUndefined();
});
