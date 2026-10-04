import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses,spellControl} from '../../src/sim/abilities/statuses';
import {CONTROL_KINDS,controlImmunities} from '../../src/sim/abilities/controlPolicy';
import {itemFlag} from '../../src/sim/game/itemModifiers';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {isStunned} from '../../src/sim/game/effects';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.unstoppable')!;
const mixed={op:'status',target:'target',id:'poisonRoot',amount:160,polarity:'negative',dispel:true,modifiers:{rooted:true,armor:-5,moveSpeedPermille:-400,attackSpeedPermille:-400},disarm:true,periodic:{intervalTicks:40,damage:10,damageType:'spell'}};
function fixture(ward={},ops:unknown[]=[mixed]){
 const a=abilitySchema.parse({...base,onRelease:[{...base.onRelease[0],...ward},...ops]});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'ally',targetHealth:500,distance:6,mana:200}));
 const statuses=new SpellStatuses(f.game),c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;
 const apply=(index=0,target=f.target)=>statuses.apply(f.caster,target,a,1,f.game.state.nextCast++,releaseEffects(a,1,'ally')[index]);
 return {...f,a,c,t,apply,statuses};
}
it('prevents each incoming control component without granting spell damage immunity',()=>{
 const controls=[{stun:true},{modifiers:{rooted:true}},{silence:true},{disarm:true},{itemBlocked:true},{modifiers:{moveSpeedPermille:-500}},{modifiers:{attackSpeedPermille:-500}}];
 const f=fixture({},controls.map((p,i)=>({op:'status',target:'target',id:'control'+i,amount:80,polarity:'negative',dispel:true,modifiers:{},...p})));
 expect(f.apply()).toBe(160);for(let i=1;i<=controls.length;i++)expect(f.apply(i)).toBe(0);
 expect(f.t.spellStatuses).toHaveLength(1);expect(controlImmunities(f.t,f.game.registry).size).toBe(7);
 const result=f.game.combat.abilityHit({source:f.caster,target:f.target,damage:30,damageType:'spell'});expect(result.damage).toBe(30);
});
it('retains damage and armor penalties but permanently prevents incoming control portions',()=>{
 const f=fixture({amount:20});f.apply();expect(f.apply(1)).toBe(160);
 expect(f.t.spellStatuses![1].blockedControls).toEqual(expect.arrayContaining(['root','disarm','moveSlow','attackSlow']));
 for(let i=0;i<41;i++)f.game.tick();
 expect(f.t.spellStatuses).toHaveLength(1);expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(false);expect(spellControl(f.t,f.game.registry,'disarm')).toBe(false);
 expect(f.game.context.stats(f.t).armor).toBe((f.game.context.def(f.t).body?.armor??0)-5);
 expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000);expect(f.t.hp).toBe(490);
});
it('suppresses existing controls while immunity lasts, preserving timers and periodic damage',()=>{
 const f=fixture({amount:50});f.apply(1);const expires=f.t.spellStatuses![0].expires;
 expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(true);f.apply();
 expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(false);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000);
 for(let i=0;i<51;i++)f.game.tick();
 expect(f.t.hp).toBe(490);expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(true);expect(spellControl(f.t,f.game.registry,'disarm')).toBe(true);
 expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(600);expect(f.t.spellStatuses![0].expires).toBe(expires);
});
it('selective root immunity preserves silence and positive speed in a mixed application',()=>{
 const op={...mixed,periodic:undefined,disarm:undefined,silence:true,modifiers:{rooted:true,moveSpeedPermille:200}};
 const f=fixture({controlImmunity:['root']},[op]);f.apply();f.apply(1);
 expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(false);expect(spellControl(f.t,f.game.registry,'silence')).toBe(true);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1200);
});
it('prevented stun does not interrupt preparation or clear a weapon windup',()=>{
 const f=fixture({},[{op:'status',target:'target',id:'stun',amount:80,polarity:'negative',dispel:true,modifiers:{},stun:true}]);f.apply(0,f.caster);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();const pending=f.c.abilities!.pending!.id;
 expect(f.apply(1,f.caster)).toBe(0);expect(f.c.abilities!.pending?.id).toBe(pending);expect(isStunned(f.c,f.game.registry)).toBe(false);
});
it('dispelling only the positive ward immediately restores older controls, not prevented ones',()=>{
 const f=fixture();f.apply(1);f.apply();
 const dispel={op:'dispel' as const,target:'target' as const,amount:0,damageType:'spell',polarity:'positive' as const};
 expect(f.statuses.apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,dispel)).toBe(1);
 expect(itemFlag(f.t,f.game.registry,'rooted')).toBe(true);expect(f.t.spellStatuses![0].status).toBe('poisonRoot');
 const g=fixture();g.apply();g.apply(1);g.statuses.apply(g.caster,g.target,g.a,1,g.game.state.nextCast++,dispel);
 expect(itemFlag(g.t,g.game.registry,'rooted')).toBe(false);
});
it('saved prevention masks and expiry replay identically, rejecting masks unrelated to their declaration',()=>{
 const f=fixture({amount:20});f.apply();f.apply(1);const g=fixture({amount:20});g.game.restore(f.game.snapshot());
 for(let i=0;i<180;i++){f.game.tick();g.game.tick();expect(g.game.checksum()).toBe(f.game.checksum());}
 expect(f.t.spellStatuses).toBeUndefined();
 const invalid=fixture();invalid.apply();invalid.apply(1);const save=invalid.game.snapshot();save.state.entities.find(e=>e.id===invalid.target)!.spellStatuses![1].blockedControls=['silence'];
 const before=invalid.game.checksum();expect(()=>invalid.game.restore(save)).toThrow(/spell lifecycle/);expect(invalid.game.checksum()).toBe(before);
});
it('legacy broad immunity grants use the same component rules and suppress existing shell slows',()=>{
 const f=fixture({controlImmunity:undefined,modifiers:{controlImmune:true}});f.t.slows=[{permille:400,expires:80}];f.t.stunnedUntil=80;f.apply();f.apply(1);
 expect(isStunned(f.t,f.game.registry)).toBe(false);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000);expect(f.t.spellStatuses![1].blockedControls).toContain('moveSlow');
 for(let i=0;i<41;i++)f.game.tick();expect(f.t.hp).toBe(490);
});
it('the actual movement system can move an already rooted target while the ward suppresses roots',()=>{
 const f=fixture();f.apply(1);expect(f.game.command('player.1',{type:'move',actors:[f.target],destination:{x:140,y:120}}).accepted).toBe(true);
 for(let i=0;i<10;i++)f.game.tick();const x=f.t.x;expect(x).toBe(126);f.apply();
 for(let i=0;i<30;i++)f.game.tick();expect(f.t.x).toBeGreaterThan(x);
});
it('AI skips fully prevented control programs but still values a damaging mixed debuff',()=>{
 const f=fixture(),caster={id:1,x:0,y:0,hp:500,maxHp:500,alive:true,targetable:true,unit:true},target={...caster,id:2,x:3,controlImmunity:[...CONTROL_KINDS]};
 const silence=coreAbilities.abilities.find(a=>a.id==='ability.core.silence')!,relation=(e:{id:number})=>e.id===1?'ally' as const:'enemy' as const;
 expect(abilityAimScore(silence,1,caster,target,[caster,target],relation,'enemy')).toBe(0);
 const poison=abilitySchema.parse({...f.a,targeting:{...f.a.targeting,relations:['enemy']},onRelease:[mixed]});
 expect(abilityAimScore(poison,1,caster,target,[caster,target],relation,'enemy')).toBeGreaterThan(0);
});
it('rejects unknown or duplicate immunity kinds',()=>{
 for(const controlImmunity of [['fear'],['root','root'],[]])expect(abilitySchema.safeParse({...base,onRelease:[{...base.onRelease[0],controlImmunity}]}).success).toBe(false);
});
it('a fully prevented status does not emit a misleading applied visual or leave a marker',()=>{
 const f=fixture({},[{op:'status',target:'target',id:'stun',amount:80,polarity:'negative',dispel:true,modifiers:{},stun:true}]);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();for(let i=0;i<20;i++)f.game.tick();
 expect(f.t.spellStatuses?.map(s=>s.status)).toEqual(['controlWard']);
 expect(f.game.abilities.observedEvents().filter(e=>e.event==='statusApplied').map(e=>e.statusId)).toEqual(['controlWard']);
});
