import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';

function setup(kind:'projectile'|'chain'|'line'='projectile',airSource=false){
 const base=coreAbilities.abilities.find(a=>a.id==='ability.core.'+(kind==='chain'?'chain-lightning':kind==='line'?'shockwave':'storm-bolt'))!;
 const a=abilitySchema.parse({...base,cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:0}},...(kind==='projectile'?{delivery:{...base.delivery,speed:4}}:{})});
 const p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetCount:kind==='chain'?3:1,targetSpacing:2,targetLocomotion:'air',casterLocomotion:airSource?'air':'ground',distance:8,targetHealth:500}));
 return {...f,a};
}
const tick=(f:ReturnType<typeof setup>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
function cast(f:ReturnType<typeof setup>){
 const t=f.game.context.get(f.target!)!;
 expect(f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:f.a.targeting.kind==='point'?{kind:'point',position:{x:t.x,y:t.y}}:{kind:'unit',entity:f.target!}}).accepted).toBe(true);
 tick(f,2);
}
it('saves ascending delivery height and replays it after the source disappears',()=>{
 const a=setup(),b=setup();cast(a);tick(a,10);
 const view=a.game.abilities.observedDeliveries()[0];expect(view.position.height).toBeGreaterThan(0);expect(view.position.height).toBeLessThan(6);expect(view.direction.height).toBeGreaterThan(0);
 a.game.context.remove(a.game.context.get(a.caster)!);b.game.restore(a.game.snapshot());
 for(let i=0;i<100;i++){tick(a);tick(b);expect(b.game.checksum()).toBe(a.game.checksum());expect(b.game.abilities.observedDeliveries()).toEqual(a.game.abilities.observedDeliveries());}
 expect(a.game.context.get(a.target!)!.hp).toBe(400);
 const impact=a.game.abilities.drainEvents().find(e=>e.event==='impact')!;expect(impact.point.height).toBe(6);
});
it('steers the visual height toward a target that lands while the shot is travelling',()=>{
 const f=setup();cast(f);tick(f,20);const before=f.game.state.spellDeliveries[0].position.height;
 const web=coreAbilities.abilities.find(a=>a.id==='ability.core.web')!;
 for(const op of releaseEffects(web,1,'enemy'))new SpellStatuses(f.game).apply(f.caster,f.target!,web,1,f.game.state.nextCast++,op);
 expect(f.game.spatial.airborne(f.game.context.get(f.target!)!)).toBe(false);tick(f);
 const shot=f.game.abilities.observedDeliveries()[0];expect(shot.position.height).toBeLessThan(before);expect(shot.direction.height).toBeLessThan(0);
 tick(f,100);expect(f.game.abilities.drainEvents().find(e=>e.event==='impact')!.point.height).toBe(0);
});
it('snapshots each chain link at its own source and target height',()=>{
 const f=setup('chain');cast(f);tick(f,50);
 const events=f.game.abilities.drainEvents().filter(e=>e.event==='impact');expect(events).toHaveLength(3);
 expect(events[0].origin.height).toBe(0);expect(events[0].point.height).toBe(6);
 expect(events[1].origin).toEqual(events[0].point);expect(events[2].origin).toEqual(events[1].point);
});
it('keeps point-directed wave endpoints on ground when launched from the air',()=>{
 const f=setup('line',true);cast(f);
 const shot=f.game.state.spellDeliveries[0];expect(shot.origin.height).toBe(6);expect(shot.point.height).toBe(0);expect(shot.position.height).toBeLessThan(6);
});
it('rejects missing or nonfinite saved delivery heights without changing live state',()=>{
 const f=setup();cast(f);const hash=f.game.checksum();
 for(const value of [undefined,NaN,Infinity]){const snapshot=f.game.snapshot();Object.assign(snapshot.state.spellDeliveries[0].position,{height:value});expect(()=>f.game.restore(snapshot)).toThrow();expect(f.game.checksum()).toBe(hash);}
});
