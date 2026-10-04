import {builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import {Game} from '../../src/sim/game/game';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {isEthereal,weaponCanTarget,spellDamageMultiplier,damageEligibility} from '../../src/sim/abilities/damagePolicy';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {spellFormOpacity} from '../../src/sim/abilities/forms';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.banish')!;
function fixture(patch={},settings={},extra:unknown[]=[]){
 const a=abilitySchema.parse({...base,onRelease:[{...base.onRelease[0],...patch},...extra]});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({combat:true,relationship:'enemy',targetHealth:500,distance:3,mana:500,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!,statuses=new SpellStatuses(f.game);
 const apply=(target=f.target)=>statuses.apply(f.caster,target,a,1,f.game.state.nextCast++,releaseEffects(a,1,'enemy')[0]);
 return {...f,a,c,t,apply,statuses};
}
function strike(f:ReturnType<typeof fixture>,a=f.c,b=f.t){const tick=f.game.state.tick;a.unit!.target=b.id;a.unit!.order={type:'attack',target:b.id,force:false};a.unit!.attack={profile:f.game.context.weaponDefinition(a),target:b.id,cycleTicks:40,started:tick,impact:tick,ends:tick+10,released:false};f.game.combat.resolve();}
function step(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
it('Banish prevents all non-spell damage but amplifies spells by 66 percent',()=>{
 const f=fixture();f.apply();expect(isEthereal(f.t,f.game.registry)).toBe(true);
 for(const damageType of Object.keys(f.game.registry.rules.damageTypes)){
  const r=f.game.combat.abilityHit({source:f.caster,target:f.target,damage:100,damageType});expect(r.damage).toBe(damageType==='spell'?166:0);
 }
 expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(500);expect(f.t.definition).toBe('unit.preview.target');
});
it('physical attack planning and forced attack releases cannot target the ethereal unit',()=>{
 const f=fixture();f.apply();strike(f);expect(f.t.hp).toBe(500);expect(f.c.unit!.attack).toBeUndefined();
 f.game.combat.plan();expect(f.c.unit!.target).toBeNull();
 f.c.unit!.order={type:'attack',target:f.target,force:true};f.game.combat.plan();expect(f.c.unit!.target).toBeNull();
 expect(weaponCanTarget(f.t,f.game.registry,'spell')).toBe(true);expect(weaponCanTarget(f.t,f.game.registry,'pierce')).toBe(false);
});
it('ethereal actors cannot release a weapon even with control immunity, but retain spellcasting and movement',()=>{
 const f=fixture();f.apply(f.caster);
 const ward=coreAbilities.abilities.find(a=>a.id==='ability.core.unstoppable')!;f.statuses.apply(f.caster,f.caster,ward,1,f.game.state.nextCast++,releaseEffects(ward,1,'ally')[0]);
 strike(f);expect(f.t.hp).toBe(500);expect(f.c.unit!.attack).toBeUndefined();
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();step(f,20);expect(isEthereal(f.t,f.game.registry)).toBe(true);
 const before=f.c.x;expect(f.game.command('player.1',{type:'move',actors:[f.caster],destination:{x:115,y:120}}).accepted).toBe(true);
 for(let i=0;i<40;i++)f.game.tick();expect(f.c.x).toBeLessThan(before);
});
it('a released arrow resolves against current ethereal protection after its shooter is removed',()=>{
 const f=fixture({}, {casterDefinition:'unit.ants.archer',distance:8});strike(f);
 const m=f.game.state.missiles[0];expect(m).toBeDefined();f.apply();f.c.hp=0;
 for(let i=0;i<=m.impact;i++)f.game.tick();expect(f.t.hp).toBe(500);expect(m.resolved).toBe(true);
});
it('shell splash cannot slow an ethereal target and blocked hits consume no shields',()=>{
 const f=fixture({}, {casterDefinition:'unit.ants.bombardier',distance:8});
 f.game.combat.shells.launch(f.c,f.t);const shell=f.game.state.shells[0];shell.slowPermille=500;shell.slowTicks=80;
 const shield=coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!;f.statuses.apply(f.caster,f.target,shield,1,f.game.state.nextCast++,releaseEffects(shield,1,'ally')[0]);
 const before=f.t.spellStatuses![0].shield;f.apply();f.game.state.tick=shell.impact;f.game.combat.resolve();
 expect(f.t.slows).toBeUndefined();expect(f.t.spellStatuses![0].shield).toBe(before);expect(f.t.hp).toBe(500);
});
it('strongest vulnerability and reduction combine once, before absorption',()=>{
 const f=fixture({ethereal:false,damageTakenPermille:{spell:2000}}, {},[{...base.onRelease[0],id:'reduction',ethereal:false,damageTakenPermille:{spell:500}}]);f.apply();
 const op=releaseEffects(f.a,1,'enemy')[0];if(op.op!=='status')throw Error('fixture');
 // Duplicate declarations (such as multiple aura sources) must never compound amplification.
 f.t.spellStatuses!.push({...f.t.spellStatuses![0],cast:f.game.state.nextCast++});expect(spellDamageMultiplier(f.t,f.game.registry,'spell')).toBe(2000);
 const shield=coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!;f.statuses.apply(f.caster,f.target,shield,1,f.game.state.nextCast++,releaseEffects(shield,1,'ally')[0]);
 const record=f.t.spellStatuses!.find(s=>s.shield)!;record.shield=50;
 expect(f.game.combat.abilityHit({source:f.caster,target:f.target,damage:40,damageType:'spell'}).damage).toBe(30);expect(record.shield).toBe(0);
 f.statuses.apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,releaseEffects(f.a,1,'enemy')[1]);
 expect(spellDamageMultiplier(f.t,f.game.registry,'spell')).toBe(1000);
 expect(f.game.combat.abilityHit({source:f.caster,target:f.target,damage:40,damageType:'spell'}).damage).toBe(40);
});
it('expiry, dispel, cosmetic opacity and damage policy restore together through saved replay',()=>{
 const f=fixture({amount:40});f.apply();expect(spellFormOpacity(f.t,f.game.registry)).toBe(.5);f.game.observation.update();expect(f.game.view('player.1').entities.find(e=>e.id===f.target)?.concealmentOpacity).toBe(.5);
 const g=fixture({amount:40});g.game.restore(f.game.snapshot());
 for(let i=0;i<45;i++){step(f,1);step(g,1);expect(g.game.checksum()).toBe(f.game.checksum());}
 expect(isEthereal(f.t,f.game.registry)).toBe(false);expect(spellFormOpacity(f.t,f.game.registry)).toBe(1);
 f.apply();expect(f.statuses.apply(f.caster,f.target,f.a,1,f.game.state.nextCast++,{op:'dispel',target:'target',amount:0,damageType:'spell',polarity:'negative'})).toBe(1);expect(isEthereal(f.t,f.game.registry)).toBe(false);
});
it('AI sees physical immunity and spell vulnerability from public status declarations',()=>{
 const f=fixture();f.apply();const caster={id:1,x:0,y:0,hp:500,maxHp:500,alive:true,targetable:true,unit:true},target={...caster,id:2,x:3,...damageEligibility(f.t,f.game.registry)};
 const a=abilitySchema.parse({...base,onRelease:[{op:'damage',target:'target',amount:100,damageType:'spell'}]}),relation=(e:{id:number})=>e.id===1?'ally' as const:'enemy' as const;
 expect(abilityAimScore(a,1,caster,target,[caster,target],relation,'enemy')).toBe(332);
 a.onRelease[0]={op:'damage',target:'target',amount:100,damageType:'melee'};expect(abilityAimScore(a,1,caster,target,[caster,target],relation,'enemy')).toBe(0);
});
it('rejects unbounded, negative, missing-rank and unknown damage multipliers',()=>{
 for(const damageTakenPermille of [{spell:-1},{spell:5001},{spell:{rankParameter:'missing'}},{}])expect(abilitySchema.safeParse({...base,onRelease:[{...base.onRelease[0],damageTakenPermille}]}).success).toBe(false);
 expect(()=>fixture({damageTakenPermille:{unknown:1500}})).toThrow(/unknown damage type/);
});
it('spell-type weapon attacks can acquire and hit ethereal units using ordinary impact mitigation',()=>{
 const source=structuredClone(builtinSource),archer=source.definitions.find((d:any)=>d.id==='unit.ants.archer') as {behaviors:{combat:{damageType:string}}};archer.behaviors.combat.damageType='spell';
 const game=new Game({...emptyUtcMap(),sandbox:true,entities:[{id:'caster',definition:'unit.ants.archer',owner:'player.1',position:{x:120,y:120},rotation:90},{id:'target',definition:'unit.ants.warrior',owner:'player.2',position:{x:128,y:120},rotation:270}]},[{player:0,kind:'human'},{player:1,kind:'human'}],new ContentRegistry(source),42);
 const c=game.entities.find(e=>e.placement==='caster')!,t=game.entities.find(e=>e.placement==='target')!,before=t.hp!;
 new SpellStatuses(game).apply(c.id,t.id,base,1,game.state.nextCast++,releaseEffects(base,1,'enemy')[0]);
 game.command('player.1',{type:'attack',actors:[c.id],target:t.id});game.combat.plan();expect(c.unit!.target).toBe(t.id);
 c.unit!.attack={profile:c.definition,target:t.id,cycleTicks:40,started:0,impact:0,ends:10,released:false};game.combat.resolve();
 const m=game.state.missiles[0];expect(m?.damageType).toBe('spell');game.state.tick=m.impact;game.combat.resolve();
 expect(t.hp).toBe(before-Math.round(m.damage*1.66));
});
it('hero recipients use the shorter authored duration without losing ethereal properties',()=>{
 const f=fixture(),hero=f.game.context.create({id:'hero',definition:'unit.ants.marshal',owner:'player.2',position:{x:130,y:120},rotation:270});
 expect(f.apply(hero.id)).toBe(160);expect(hero.spellStatuses![0].expires).toBe(160);expect(isEthereal(hero,f.game.registry)).toBe(true);
});
