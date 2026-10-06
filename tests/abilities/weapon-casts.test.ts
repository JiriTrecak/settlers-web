import {expect,it,vi} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {abilityAimScore} from '../../src/sim/abilities/ai';
import {SpellEditorService} from '../../tooling/spell-editor/server/service';
import type {PreviewState} from '../../tooling/spell-editor/shared/view';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.searing-arrows')!;
const prototype={...base,persistent:undefined,onRelease:[],weaponCast:{bonus:{rankParameter:'bonus'},weapon:'projectile',status:'chilled'},autocast:{intervalTicks:1,enabledByDefault:false},
 targeting:{...base.targeting,kind:'unit',relations:['enemy'],allowSelf:false,range:30},cast:{...base.cast,cost:{...base.cast.cost,amount:10}},
 statuses:[{op:'status',id:'chilled',target:'target',amount:200,heroDuration:60,polarity:'negative',dispel:true,modifiers:{moveSpeedPermille:-300,attackSpeedPermille:-300}}]};
function fixture(settings={},patch={}){
 const a=abilitySchema.parse({...prototype,...patch}),p=coreAbilities.presentations.find(p=>p.id===a.presentation)!,f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({combat:true,relationship:'enemy',casterDefinition:'unit.ants.archer',distance:10,targetHealth:500,mana:40,...settings}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;f.game.command('player.2',{type:'hold',actors:[f.target]});
 return {...f,a,p,c,t};
}
const cast=(f:ReturnType<typeof fixture>)=>f.game.command('player.1',{type:'castAbility',actor:f.caster,binding:'preview',target:{kind:'unit',entity:f.target}});
const auto=(f:ReturnType<typeof fixture>,enabled=true)=>f.game.command('player.1',{type:'abilityAutocast',actor:f.caster,binding:'preview',enabled});
function step(f:ReturnType<typeof fixture>,n=1,passive=false){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:passive});}
function until(f:ReturnType<typeof fixture>,predicate:()=>boolean,passive=false){for(let i=0;i<400&&!predicate();i++)step(f,1,passive);expect(predicate()).toBe(true);}
function shot(f:ReturnType<typeof fixture>,passive=false){until(f,()=>f.game.state.missiles.length>0,passive);return f.game.state.missiles[0];}
it('manual casts issue a normal weapon order, commit once at release, and apply marks on impact',()=>{
 const f=fixture();expect(cast(f).accepted).toBe(true);expect(f.c.abilities!.mana).toBe(40);expect(f.c.abilities!.pending).toBeNull();expect(f.c.abilities!.weaponOrder?.target).toBe(f.target);
 const id=f.c.abilities!.weaponOrder!.id,m=shot(f);expect(m.enhancement).toMatchObject({cast:id,bonus:10,status:'chilled'});expect(f.c.abilities!.mana).toBe(30);expect(f.c.abilities!.weaponOrder).toBeUndefined();expect(f.t.spellStatuses).toBeUndefined();
 while(f.game.state.tick<=m.impact)step(f);expect(f.t.spellStatuses?.[0].status).toBe('chilled');expect(f.t.hp).toBeLessThan(500);
 until(f,()=>f.game.state.nextMissile>m.id+1);expect(f.game.state.missiles.find(n=>n.id===m.id+1)?.enhancement).toBeUndefined();expect(f.c.abilities!.mana).toBe(30);
});
it('walks to ordinary weapon range without teleporting or introducing a second delivery system',()=>{
 const f=fixture({distance:28});expect(cast(f).accepted).toBe(true);const start=f.c.x,m=shot(f);expect(f.c.x).toBeGreaterThan(start);expect(m.enhancement?.ability).toBe(f.a.id);expect(f.game.state.spellDeliveries).toEqual([]);
});
it('movement and stop interrupt windup without mana or cooldown payment',()=>{
 for(const type of ['move','stop'] as const){const f=fixture();cast(f);until(f,()=>!!f.c.unit?.attack&&!f.c.unit.attack.released);
 const action=type==='move'?{type,actors:[f.caster],destination:{x:100,y:120}}:{type,actors:[f.caster]};expect(f.game.command('player.1',action).accepted).toBe(true);expect(f.c.abilities!.weaponOrder).toBeUndefined();expect(f.c.abilities!.mana).toBe(40);expect(f.c.abilities!.cooldowns[f.a.id]??0).toBe(0);
 expect(f.game.abilities.observedEvents().some(e=>e.event==='weaponOrderCancelled')).toBe(true);}
});
it('cancels invalidated manual shots without silently firing a downgraded shot',()=>{
 for(const mode of ['mana','silence','target','range','owner','profile'] as const){const f=fixture();cast(f);until(f,()=>!!f.c.unit?.attack&&!f.c.unit.attack.released);
 if(mode==='mana')f.c.abilities!.mana=0;
 if(mode==='silence'){const a=coreAbilities.abilities.find(a=>a.id==='ability.core.silence')!;for(const e of releaseEffects(a,1,'enemy'))new SpellStatuses(f.game).apply(f.target,f.caster,a,1,f.game.state.nextCast++,e);}
 if(mode==='target')f.game.context.remove(f.t);if(mode==='range'){f.t.x=180;f.t.y=180;f.t.unit!.position=null;}
 if(mode==='owner')f.c.owner='player.2';if(mode==='profile')f.c.abilities!.weaponOrder!.profile='unit.ants.warrior';
 step(f);expect(f.c.abilities!.weaponOrder).toBeUndefined();expect(f.game.state.missiles).toEqual([]);expect(f.c.abilities!.mana).toBe(mode==='mana'?0:40);}
});
it('does not erase a newer movement order when cancelling an obsolete weapon record',()=>{
 const f=fixture();cast(f);f.c.unit!.order={type:'move',destination:{x:100,y:120},attackMove:false};step(f);expect(f.c.abilities!.weaponOrder).toBeUndefined();expect(f.c.unit!.order?.type).toBe('move');
});
it('autocast decorates existing attacks, falls back when unaffordable, and never replaces a move order',()=>{
 const f=fixture({mana:10});expect(auto(f).accepted).toBe(true);const m=shot(f);expect(m.enhancement).toBeDefined();expect(f.c.abilities!.mana).toBe(0);
 until(f,()=>f.game.state.nextMissile>m.id+1);expect(f.game.state.missiles.find(n=>n.id===m.id+1)?.enhancement).toBeUndefined();
 const g=fixture();auto(g);g.game.command('player.1',{type:'move',actors:[g.caster],destination:{x:100,y:120}});step(g,10);expect(g.c.unit!.order?.type).toBe('move');expect(g.game.state.missiles).toEqual([]);expect(g.c.abilities!.weaponOrder).toBeUndefined();
});
it('paid releases survive autocast-off, source death and save/load in flight',()=>{
 const f=fixture();auto(f);const m=shot(f);auto(f,false);f.c.hp=0;f.game.onCombatDeath(f.c);const g=fixture();g.game.restore(f.game.snapshot());
 while(f.game.state.tick<=m.impact+1){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());}expect(f.t.spellStatuses?.[0].status).toBe('chilled');
});
it('uses ranked damage, hero duration and a release cooldown without charging ordinary fallback shots',()=>{
 const f=fixture({targetHero:true},{cast:{...prototype.cast,cooldown:{...base.cast.cooldown,ticks:400}}});f.c.abilities!.ranks.preview=3;auto(f);const m=shot(f);expect(m.enhancement?.bonus).toBe(30);expect(f.c.abilities!.cooldowns[f.a.id]).toBe(m.launched+400);
 while(f.game.state.tick<=m.impact)step(f);expect(f.t.spellStatuses![0].expires-f.t.spellStatuses![0].started).toBe(60);
 expect(cast(f).reason).toMatch(/cooling down/);until(f,()=>f.game.state.nextMissile>m.id+1);expect(f.c.abilities!.mana).toBe(30);
});
it('rejects wrong weapon, allies, unseen targets, spell immunity and unaffordable commands',()=>{
 for(const settings of [{casterDefinition:'unit.ants.warrior'},{casterDefinition:'unit.ants.bombardier'},{relationship:'ally'},{mana:9}])expect(cast(fixture(settings)).accepted).toBe(false);
 const f=fixture();vi.spyOn(f.game.observation,'visible').mockReturnValue(false);expect(cast(f).accepted).toBe(false);
 const g=fixture();const a=coreAbilities.abilities.find(a=>a.id==='ability.core.spell-ward')!;for(const e of releaseEffects(a,1,'ally'))new SpellStatuses(g.game).apply(g.target,g.target,a,1,g.game.state.nextCast++,e);expect(cast(g).accepted).toBe(false);
});
it('melee uses the same release and mark path; evasion spends mana but prevents marks',()=>{
 for(const evade of [false,true]){const f=fixture({casterDefinition:'unit.ants.warrior',distance:3},{weaponCast:{bonus:5,weapon:'melee',status:'chilled'}});if(evade)vi.spyOn(f.game.combat as any,'evaded').mockReturnValue(true);cast(f);until(f,()=>f.c.abilities!.mana<40);expect(f.c.abilities!.mana).toBe(30);expect(!!f.t.spellStatuses?.length).toBe(!evade);}
});
it('single-shot stationary previews move only the caster and resolve physical missiles without retaliation',()=>{
 const f=fixture({distance:18});cast(f);const original={x:f.t.x,y:f.t.y},m=shot(f,true);while(f.game.state.tick<=m.impact+100)step(f,1,true);
 expect(f.t.hp).toBeLessThan(500);expect(f.c.hp).toBe(500);expect({x:f.t.x,y:f.t.y}).toEqual(original);expect(f.game.state.nextMissile).toBe(2);
});
it('peers and resumed windup/flight states produce identical hashes',()=>{
 const f=fixture({distance:18}),g=fixture({distance:18});expect(cast(f).accepted).toBe(true);expect(cast(g).accepted).toBe(true);
 for(let i=0;i<180;i++){step(f);step(g);expect(g.game.checksum()).toBe(f.game.checksum());if(i===2||i===80)g.game.restore(f.game.snapshot());}
});
it('rejects corrupt saved weapon orders atomically and forbids contradictory definitions',()=>{
 const f=fixture();cast(f);const hash=f.game.checksum();for(const patch of [{rank:10},{ability:'ability.core.holy-light'},{id:f.game.state.nextCast},{target:f.game.state.nextId},{started:5},{profile:'building.ants.mound'},{binding:'missing'}]){const s=f.game.snapshot();Object.assign(s.state.entities.find(e=>e.id===f.caster)!.abilities!.weaponOrder!,patch);expect(()=>f.game.restore(s)).toThrow();expect(f.game.checksum()).toBe(hash);}
 for(const patch of [{onRelease:[{op:'heal',target:'target',amount:10}]},{cast:{...prototype.cast,prepareTicks:5}},{weaponCast:{bonus:0,weapon:'any'}},{weaponCast:{bonus:5,weapon:'any',status:'absent'}}])expect(abilitySchema.safeParse({...prototype,...patch}).success).toBe(false);
});
it('workbench scrubbing replays a manual shot with stationary targets',async()=>{
 const f=fixture(),s=new SpellEditorService('/tmp');await s.execute({op:'preview.load',document:{definition:f.a,presentation:{...f.p,effects:[],icon:undefined}},settings:{combat:false,relationship:'enemy',casterDefinition:'unit.ants.archer',distance:10,targetHealth:500}});
 await s.execute({op:'preview.cast'});await s.execute({op:'preview.seek',tick:80});const first=s.state() as PreviewState;expect(first.events.some(e=>e.event==='projectile')).toBe(true);expect(first.entities.find(e=>e.id===first.target)!.hp).toBeLessThan(500);
 await s.execute({op:'preview.seek',tick:0});await s.execute({op:'preview.seek',tick:80});expect((s.state() as PreviewState).checksum).toBe(first.checksum);
 const result=await s.execute({op:'preview.replay',from:'release',tick:3}) as {state:PreviewState};
 expect(result.state.tick).toBe(result.state.events.find(e=>e.event==='released')!.tick+3);
});
it('published Frost Arrows resolves all three ranked slows and expires exactly once',()=>{
 const published=coreAbilities.abilities.find(a=>a.id==='ability.core.frost-arrows')!;
 for(let rank=1;rank<=3;rank++){
  const f=fixture({},published);f.c.abilities!.ranks.preview=rank;expect(cast(f).accepted).toBe(true);const m=shot(f,true);
  expect(m.enhancement?.bonus).toBe(rank*5);while(f.game.state.tick<=m.impact)step(f,1,true);
  const status=f.t.spellStatuses![0],expected=-(rank*200+100);expect(f.game.context.stats(f.t).moveSpeedPermille).toBe(1000+expected);
  while(f.game.state.tick<status.expires)step(f,1,true);expect(f.game.context.get(f.target)!.spellStatuses?.length??0).toBe(0);
 }
});
it('AI values a visible hostile weapon cast without assuming hidden targets or allied utility',()=>{
 const f=fixture(),c={id:f.caster,x:120,y:120,hp:500,maxHp:500,alive:true,targetable:true,unit:true},t={...c,id:f.target,x:130},relation=(e:typeof c)=>e.id===c.id?'ally' as const:'enemy' as const;
 expect(abilityAimScore(f.a,1,c,t,[c,t],relation,'enemy')).toBe(20);
 expect(abilityAimScore(f.a,1,c,t,[c],relation,'enemy')).toBe(0);
 expect(abilityAimScore(f.a,1,c,c,[c,t],relation,'enemy')).toBe(0);
 expect(abilityAimScore(f.a,1,c,t,[c,t],relation,'enemy',()=>true)).toBe(10);
});
