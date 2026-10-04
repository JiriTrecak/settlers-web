import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.black-arrow')!;
function fixture(health=100,patch={},settings={},rank=1){
 const a=abilitySchema.parse({...base,...patch}),f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({combat:true,relationship:'enemy',casterDefinition:'unit.ants.archer',distance:10,targetHealth:health,mana:40,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;f.game.command('player.2',{type:'hold',actors:[f.target]});
 c.abilities!.ranks.preview=rank;expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();return {...f,a,c,t};
}
function shot(f:ReturnType<typeof fixture>){for(let i=0;i<200&&!f.game.state.missiles.length;i++)f.game.tick();expect(f.game.state.missiles).toHaveLength(1);f.c.unit!.cooldown=9999;return f.game.state.missiles[0];}
function step(f:ReturnType<typeof fixture>,n=1){for(let i=0;i<n;i++)f.game.tick();}
function land(f:ReturnType<typeof fixture>,m:ReturnType<typeof shot>){while(f.game.state.tick<=m.impact)step(f);}
function die(f:ReturnType<typeof fixture>,id=f.target){const e=f.game.context.get(id)!;e.hp=0;f.game.onCombatDeath(e);}
const spirits=(f:ReturnType<typeof fixture>)=>f.game.entities.filter(e=>e.summoned);
it('installs the mark only on damaging impact, before a lethal arrow resolves death',()=>{
 const f=fixture(5),m=shot(f);expect(f.t.spellStatuses).toBeUndefined();expect(f.c.abilities!.mana).toBe(34);
 expect(m.enhancement).toMatchObject({rank:1,status:'shadowMark',bonus:2,sourceContext:{source:f.caster,owner:'player.1'}});
 land(f,m);expect(f.game.context.get(f.target)).toBeUndefined();expect(spirits(f)).toHaveLength(1);expect(spirits(f)[0].owner).toBe('player.1');
 expect(f.game.abilities.observedEvents().some(e=>e.event==='statusApplied'&&e.statusId==='shadowMark')).toBe(true);expect(f.game.abilities.observedEvents().some(e=>e.event==='death')).toBe(true);
});
it('paid marks retain release rank and original ownership after toggle-off, source removal or conversion',()=>{
 for(const change of ['toggle','death','conversion']){const f=fixture(5,{},{},3),m=shot(f);
 if(change==='toggle')expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();else if(change==='death')die(f,f.caster);else f.c.owner='player.2';
 land(f,m);expect(spirits(f)[0]).toMatchObject({owner:'player.1',summoned:{source:f.caster}});expect(m.enhancement!.rank).toBe(3);}
});
it('a third-party kill within the mark summons for the archer; an expired or dispelled mark does not',()=>{
 for(const end of ['kill','expire','dispel']){const f=fixture(),m=shot(f);land(f,m);expect(f.t.spellStatuses?.some(s=>s.status==='shadowMark')).toBe(true);
 if(end==='expire')step(f,81);else if(end==='dispel')new SpellStatuses(f.game).apply(f.target,f.target,f.a,1,f.game.state.nextCast++,{op:'dispel',target:'target',amount:0,polarity:'negative',damageType:'spell'});
 die(f);step(f);expect(spirits(f).length).toBe(end==='kill'?1:0);}
});
it('overkill arrows cannot overwrite the mark installed by the lethal hit',()=>{
 const f=fixture(5),m=shot(f);const clone={...structuredClone(m),id:f.game.state.nextMissile++,source:f.target,owner:'player.2' as const,enhancement:{...structuredClone(m.enhancement!),cast:f.game.state.nextCast++,sourceContext:{...m.enhancement!.sourceContext!,source:f.target,owner:'player.2'}}};f.game.state.missiles.push(clone);
 land(f,m);expect(spirits(f)).toHaveLength(1);expect(spirits(f)[0].owner).toBe('player.1');
});
it('full absorption and target removal produce no mark',()=>{
 for(const prevent of ['shield','removed']){const f=fixture(),m=shot(f);
 if(prevent==='removed')die(f);else if(prevent==='shield'){const a=coreAbilities.abilities.find(a=>a.id==='ability.core.absorption-shield')!;for(const op of releaseEffects(a,1,'ally'))new SpellStatuses(f.game).apply(f.target,f.target,a,1,f.game.state.nextCast++,op);}
 land(f,m);expect(f.t.spellStatuses?.some(s=>s.status==='shadowMark')??false).toBe(false);expect(spirits(f)).toHaveLength(0);}
});
it('a zero-bonus marking policy still pays and applies the status',()=>{
 const op=structuredClone(base.onRelease[0]);if(op.op!=='status')throw Error();op.combatModifiers!.attackBonus!.amount=0;
 const f=fixture(100,{onRelease:[op]}),m=shot(f);expect(m.enhancement?.bonus).toBe(0);land(f,m);expect(f.t.spellStatuses?.some(s=>s.status==='shadowMark')).toBe(true);
});
it('save/load reproduces an arrow, subsequent mark and manifestation with a dead source',()=>{
 const f=fixture(5),m=shot(f);die(f,f.caster);const g=fixture(5);g.game.restore(f.game.snapshot());
 while(f.game.state.tick<=m.impact+2){step(f);step(g);expect(f.game.checksum()).toBe(g.game.checksum());}expect(spirits(f)).toHaveLength(1);
});
it('rejects corrupt saved mark policies and source context atomically',()=>{
 const f=fixture();shot(f);const hash=f.game.checksum();
 for(const patch of [{status:'unknown'},{rank:9},{bonus:777},{sourceContext:undefined}]){const save=f.game.snapshot();Object.assign(save.state.missiles[0].enhancement!,patch);expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);}
 const save=f.game.snapshot();save.state.missiles[0].enhancement!.sourceContext!.owner='player.2';expect(()=>f.game.restore(save)).toThrow();expect(f.game.checksum()).toBe(hash);
});
it('rejects absent, queried and instance-linked mark templates',()=>{
 const op=structuredClone(base.onRelease[0]);if(op.op!=='status')throw Error();op.combatModifiers!.attackBonus!.status='missing';expect(abilitySchema.safeParse({...base,onRelease:[op]}).success).toBe(false);
 for(const change of [{lifetime:'instance'},{target:'caster'},{query:{center:'target',radius:3,relations:['enemy']}}])expect(abilitySchema.safeParse({...base,statuses:[{...base.statuses![0],...change}]}).success).toBe(false);
});

it('evasion prevents the paid mark without refunding mana',()=>{
 const dodge={op:'status',target:'target',id:'avoid',amount:400,polarity:'positive',dispel:true,combatModifiers:{evasionPermille:1000}};
 const f=fixture(100,{statuses:[...base.statuses!,dodge]}),m=shot(f),op=f.a.statuses!.find(s=>s.id==='avoid')!;
 new SpellStatuses(f.game).apply(f.target,f.target,f.a,1,f.game.state.nextCast++,{...op,amount:400});land(f,m);
 expect(f.t.spellStatuses?.some(s=>s.status==='shadowMark')??false).toBe(false);expect(f.t.hp).toBe(100);expect(f.c.abilities!.mana).toBe(34);
});

it('hostile spell immunity or an allied conversion prevents the mark without cancelling ordinary weapon damage',()=>{
 for(const prevention of ['ward','converted']){const f=fixture(),m=shot(f);
 if(prevention==='converted')f.t.owner='player.1';else {const a=coreAbilities.abilities.find(a=>a.id==='ability.core.spell-ward')!;for(const op of releaseEffects(a,1,'ally'))new SpellStatuses(f.game).apply(f.target,f.target,a,1,f.game.state.nextCast++,op);}
 land(f,m);expect(f.t.hp).toBeLessThan(100);expect(f.t.spellStatuses?.some(s=>s.status==='shadowMark')??false).toBe(false);
 }
});
it('melee enhancements share the mark-before-death path',()=>{
 const op=structuredClone(base.onRelease[0]);if(op.op!=='status')throw Error();op.combatModifiers!.attackBonus!.weapon='melee';
 const f=fixture(5,{onRelease:[op]},{casterDefinition:'unit.ants.warrior',distance:3});
 for(let i=0;i<200&&!spirits(f).length;i++)f.game.tick();expect(spirits(f)).toHaveLength(1);expect(f.game.context.get(f.target)).toBeUndefined();
});
