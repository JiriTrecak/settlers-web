import {it,expect} from 'vitest';
import {abilitySchema,presentationSchema} from '../../src/content/abilities/schema';
import definition from '../../content/abilities/ability.core.blizzard/definition.json';
import presentation from '../../content/abilities/ability.core.blizzard/presentation.json';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {abilityOutline} from '../../src/render/settlement/abilityTarget';
const spell=abilitySchema.parse(definition),look=presentationSchema.parse(presentation);
function setup(relationship:'ally'|'enemy'='enemy'){
 const fixture=createAbilityEncounter(spell,look,encounterSettingsSchema.parse({relationship,targetCount:4,targetHealth:500}));
 const {game,caster}=fixture;
 return {...fixture,cast:(x=126,y=120)=>game.command('player.1',{type:'castAbility',actor:caster,binding:'preview',target:{kind:'point',position:{x,y}}})};
}
const advance=(game:ReturnType<typeof setup>['game'],tick:number)=>{while(game.state.tick<tick)game.tick();};
it('channels six delayed waves over a fixed area with mana committed once',()=>{
 const {game,caster,target,cast}=setup();expect(cast().accepted).toBe(true);
 const access=game.context.get(caster)!.abilities!,release=access.pending!.releaseTick;
 expect(access.mana).toBe(140);advance(game,release);expect(access.pending!.phase).toBe('channeling');
 expect(game.context.get(target)!.hp).toBe(500);advance(game,release+39);expect(game.context.get(target)!.hp).toBe(500);
 advance(game,release+40);expect(game.context.get(target)!.hp).toBe(470);
 advance(game,release+240+8);expect(access.pending).toBeNull();expect(access.mana).toBe(140);
 for(const e of game.entities.filter(e=>e.id!==caster))expect(e.hp).toBe(320);
 const events=game.abilities.drainEvents();expect(events.filter(e=>e.event==='wave')).toHaveLength(6);expect(events.filter(e=>e.event==='waveStarted')).toHaveLength(6);
 for(const wave of events.filter(e=>e.event==='wave'))expect(events.filter(e=>e.event==='damaged'&&e.tick===wave.tick)).toHaveLength(4);
 expect(access.cooldowns[spell.id]).toBe(release+400);
});
it('reselects victims every wave, protects allies and never follows a moving target',()=>{
 const {game,caster,target,cast}=setup();cast();const release=game.context.get(caster)!.abilities!.pending!.releaseTick;
 const t=game.context.get(target)!;t.x=140;game.context.get(caster+2)!.owner='player.1';
 advance(game,release+40);expect(t.hp).toBe(500);expect(game.context.get(caster+2)!.hp).toBe(500);
 t.x=126;advance(game,release+80);expect(t.hp).toBe(470);
 const ally=setup('ally');ally.cast();advance(ally.game,260);expect(ally.game.context.get(ally.target)!.hp).toBe(500);
});
it.each(['stop','move','stun','death']as const)('cancels future waves on %s without refunding released mana',cause=>{
 const {game,caster,target,cast}=setup();cast();const c=game.context.get(caster)!,release=c.abilities!.pending!.releaseTick;
 advance(game,release+40);
 if(cause==='stop')game.command('player.1',{type:'stop',actors:[caster]});
 if(cause==='move')game.command('player.1',{type:'move',actors:[caster],destination:{x:118,y:120}});
 if(cause==='stun')c.stunnedUntil=1000;
 if(cause==='death'){c.hp=0;game.onCombatDeath(c);}
 advance(game,release+250);expect(game.context.get(target)!.hp).toBe(470);expect(c.abilities!.mana).toBe(140);expect(c.abilities!.pending).toBeNull();
 expect(game.abilities.drainEvents().filter(e=>e.event==='wave')).toHaveLength(1);
});
it('refunds interrupted preparation and rejects invalid, hidden, distant and wrong-kind targets',()=>{
 const {game,caster,cast}=setup();expect(cast(256,120).accepted).toBe(false);expect(cast(200,200).accepted).toBe(false);
 expect(game.command('player.1',{type:'castAbility',actor:caster,binding:'preview',target:{kind:'unit',entity:caster}}).accepted).toBe(false);
 cast();game.command('player.1',{type:'stop',actors:[caster]});expect(game.context.get(caster)!.abilities!.mana).toBe(200);
});
it('preserves the next wave in a mid-channel save and deterministically replays all impacts',()=>{
 const a=setup(),b=setup();a.cast();advance(a.game,85);b.game.restore(a.game.snapshot());
 for(let tick=86;tick<=270;tick++){a.game.tick();b.game.tick();a.game.abilities.drainEvents();expect(b.game.checksum()).toBe(a.game.checksum());}
 expect(b.game.context.get(b.target)!.hp).toBe(320);
});
it('rejects forged channel clocks and validates finite authoring budgets',()=>{
 const {game,caster,cast}=setup();cast();advance(game,85);const saved=game.snapshot(),hash=game.checksum();
 saved.state.entities.find(e=>e.id===caster)!.abilities!.pending!.channel!.nextWaveTick+=1;
 expect(()=>game.restore(saved)).toThrow(/ability/);expect(game.checksum()).toBe(hash);
 const bad=structuredClone(spell);bad.ranks[0].waves=0;expect(abilitySchema.safeParse(bad).success).toBe(false);
 bad.ranks[0].waves=33;expect(abilitySchema.safeParse(bad).success).toBe(false);
});
it('uses the declared radius for the ground targeting indicator',()=>{
 const point={x:126,y:120};const outline=abilityOutline({spell,rank:1,origin:{x:120,y:120},point,valid:true});
 expect(outline).toHaveLength(48);for(const p of outline)expect(Math.hypot(p.x-point.x,p.y-point.y)).toBeCloseTo(5);
});
