import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {abilitySchema,releaseEffects,resolveEffect} from '../../src/content/abilities/schema';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {fixed,precise} from '../../src/sim/game/motion';
import {spellSource,sourceActor} from '../../src/sim/abilities/source';
const base=coreAbilities.abilities.find(a=>a.id==='ability.core.avatar')!;
const presentation=coreAbilities.presentations.find(p=>p.id===base.presentation)!;
function fixture(native=false){
 const a=abilitySchema.parse({...base,cast:{...base.cast,prepareTicks:0,recoverTicks:0,cost:{...base.cast.cost,amount:0}},onRelease:[{op:'status',id:'soaring',target:'caster',amount:20,polarity:'positive',dispel:true,form:{movement:{locomotion:'air',flightHeight:7}}}],statuses:[{op:'status',id:'grounded',target:'target',amount:5,polarity:'negative',dispel:true,form:{movement:{locomotion:'ground'}}}]});
 const f=createAbilityEncounter(a,presentation,encounterSettingsSchema.parse({relationship:'ally',distance:8,casterLocomotion:native?'air':'ground'}));return {...f,a,c:f.game.context.get(f.caster)!};
}
function takeoff(f:ReturnType<typeof fixture>){for(const op of releaseEffects(f.a,1,'ally'))expect(new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,op)).toBe(20);}
const ticks=(f:ReturnType<typeof fixture>,n=1)=>{for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});};
it('changes actual clearance, targeting, observation and source snapshots, then lands on expiry',()=>{
 const f=fixture();takeoff(f);expect(f.game.spatial.airborne(f.c)).toBe(true);expect(f.game.spatial.elevation(f.c)).toBe(7);expect(f.c.unit!.flight?.source?.status).toBe('soaring');
 const source=spellSource(f.game.context,f.c);expect(source.locomotion).toBe('air');
 f.game.observation.update();expect(f.game.view('player.1').entities.find(e=>e.id===f.c.id)?.unit?.flight?.height).toBe(7);
 ticks(f,21);expect(f.game.spatial.airborne(f.c)).toBe(false);expect(f.c.unit!.flight).toBeUndefined();expect(sourceActor(source,f.game.registry).locomotion).toBe('air');
});
it('safely relocates to nearby clear ground when reverting above a blocker',()=>{
 const f=fixture();takeoff(f);const s=f.game.spatial,old={x:f.c.x,y:f.c.y};s.occupied[s.cell(old)]=999;
 ticks(f,21);expect(s.airborne(f.c)).toBe(false);expect(precise(f.c)).not.toMatchObject(old);expect(s.unitWalkable(precise(f.c),f.c)).toBe(true);
});
it('keeps a blocked landing airborne and targetable, restoring deterministically until ground opens',()=>{
 const f=fixture();takeoff(f);const s=f.game.spatial;
 for(let y=116;y<=124;y++)for(let x=116;x<=124;x++)s.occupied[y*s.size+x]=999;
 ticks(f,21);expect(f.c.spellStatuses).toBeUndefined();expect(f.c.unit!.flight).toBeTruthy();expect(s.airborne(f.c)).toBe(true);
 const clone=fixture();clone.game.restore(f.game.snapshot());for(let y=116;y<=124;y++)for(let x=116;x<=124;x++)clone.game.spatial.occupied[y*s.size+x]=999;
 for(let i=0;i<10;i++){ticks(f);ticks(clone);expect(clone.game.checksum()).toBe(f.game.checksum());}
 s.occupied.fill(0);clone.game.spatial.occupied.fill(0);ticks(f);ticks(clone);expect(s.airborne(f.c)).toBe(false);expect(clone.game.checksum()).toBe(f.game.checksum());
});
it('grounds a native flyer and restores flight after that form expires',()=>{
 const f=fixture(true),op=resolveEffect(f.a.statuses![0],1,f.a.ranks[0]);
 expect(f.game.spatial.airborne(f.c)).toBe(true);expect(new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,op)).toBe(5);
 expect(f.game.spatial.airborne(f.c)).toBe(false);ticks(f,6);expect(f.game.spatial.airborne(f.c)).toBe(true);expect(f.c.unit!.flight?.source).toBeUndefined();
});
it('reveals an older flight form after a newer grounding form and restores its height',()=>{
 const f=fixture();takeoff(f);ticks(f);const op=resolveEffect(f.a.statuses![0],1,f.a.ranks[0]);new SpellStatuses(f.game).apply(f.caster,f.caster,f.a,1,f.game.state.nextCast++,op);
 expect(f.game.spatial.airborne(f.c)).toBe(false);ticks(f,6);expect(f.game.spatial.elevation(f.c)).toBe(7);
});
it('preserves movement intent through takeoff and rejects forged flight snapshots atomically',()=>{
 const f=fixture();f.c.unit!.order={type:'move',destination:{x:135,y:120},attackMove:false};f.game.spatial.route(f.c,{x:135,y:120});takeoff(f);expect(f.c.unit!.route.length).toBeGreaterThan(0);
 const save=f.game.snapshot(),before=f.game.checksum(),e=save.state.entities.find(e=>e.id===f.caster)!;e.unit!.flight!.height=29;
 expect(()=>f.game.restore(save)).toThrow(/flight/);expect(f.game.checksum()).toBe(before);
 const missing=f.game.snapshot();delete missing.state.entities.find(e=>e.id===f.caster)!.unit!.flight;expect(()=>f.game.restore(missing)).toThrow(/flight/);
 const stale=f.game.snapshot();stale.state.entities.find(e=>e.id===f.caster)!.unit!.flight!.source!.started++;
 ticks(f,2);expect(()=>f.game.restore({...stale,state:{...stale.state,tick:f.game.state.tick}})).toThrow(/flight/);
});
it('landing checks the ground unit footprint, not the former air collision layer',()=>{
 const f=fixture();takeoff(f);const target=f.game.context.get(f.target!)!;target.x=f.c.x;target.y=f.c.y;target.unit!.position=fixed(f.c);
 ticks(f,21);expect(f.game.spatial.airborne(f.c)).toBe(false);expect(precise(f.c)).not.toMatchObject(precise(target));
});
it('published Flight Form toggles real flight and replays its landing from an active-instance save',()=>{
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.flight-form')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 const make=()=>createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'self',mana:1000}));
 const f=make(),other=make();expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();for(let i=0;i<40;i++)f.game.tick(undefined,{passiveUnits:true});
 expect(f.game.spatial.airborne(f.game.context.get(f.caster)!)).toBe(true);other.game.restore(f.game.snapshot());
 for(const g of [f,other])expect(g.game.abilities.cast(g.caster,'preview',g.caster)).toBeNull();
 for(let i=0;i<12;i++){f.game.tick(undefined,{passiveUnits:true});other.game.tick(undefined,{passiveUnits:true});expect(f.game.checksum()).toBe(other.game.checksum());}
 expect(f.game.spatial.airborne(f.game.context.get(f.caster)!)).toBe(false);
});
it('published Web rejects ground targets, lands native flyers and restores them after expiry',()=>{
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.web')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 for(const mode of ['ground','air'] as const){const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetLocomotion:mode,distance:5,targetHealth:500,mana:1000}));
  const result=f.game.abilities.cast(f.caster,'preview',f.target!);if(mode==='ground'){expect(result).toBeTruthy();continue;}expect(result).toBeNull();for(let i=0;i<24;i++)f.game.tick(undefined,{passiveUnits:true});const target=f.game.context.get(f.target!)!;
  expect(f.game.spatial.airborne(target)).toBe(false);expect(target.spellStatuses?.some(s=>s.status==='webbed')).toBe(true);
  for(let i=0;i<260;i++)f.game.tick(undefined,{passiveUnits:true});expect(f.game.spatial.airborne(target)).toBe(true);
 }
});
it('independent preview fixtures can use neutral models as ordinary air targets without camp AI',()=>{
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.web')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
 const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'enemy',targetDefinition:'unit.neutral.needle-wasp',targetLocomotion:'air',targetHealth:500}),true),target=f.game.context.get(f.target!)!;
 expect(f.game.context.def(target).behaviors.campDefense).toBeUndefined();expect(f.game.spatial.airborne(target)).toBe(true);
 expect(()=>createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'neutral',combat:false}),false)).not.toThrow();
});

it('neutral spell sight uses airborne height across a terrain ridge for unit and point targets',async()=>{
 const {vi}=await import('vitest'),{TacticalTerrain}=await import('../../src/shared/map/tacticalTerrain');
 for(const kind of ['unit','point'] as const)for(const mode of ['ground','air'] as const){
  const original=coreAbilities.abilities.find(a=>a.id==='ability.core.storm-bolt')!;
  const a=abilitySchema.parse({...original,targeting:kind==='unit'?{...original.targeting,relations:['enemy']}:{...original.targeting,kind:'point',range:18,radius:2},delivery:undefined});
  const p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
  const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'neutral',distance:6,casterLocomotion:mode,targetLocomotion:mode,mana:1000}));
  const caster=f.game.context.get(f.caster)!;caster.owner='none';caster.unit!.camp='preview-camp';f.game.context.get(f.target!)!.owner='player.2';
  const heights=new Int16Array(256*256);for(let y=0;y<256;y++)heights[y*256+122]=200;
  const terrain=new TacticalTerrain(256,heights);
  const sight=vi.spyOn(f.game.spatial,'visible').mockImplementation((from,to)=>terrain.visible(from,to));
  const result=f.game.abilities.cast(f.caster,'preview',kind==='unit'?f.target!:{x:126,y:120});
  expect(result,`${kind} ${mode}`).toBe(mode==='air'?null:'Target is not visible');
  expect(sight).toHaveBeenCalled();sight.mockRestore();
 }
});

it('neutral weapon acquisition uses the same elevated sight as neutral spell targeting',async()=>{
 const {vi}=await import('vitest'),{TacticalTerrain}=await import('../../src/shared/map/tacticalTerrain');
 for(const mode of ['ground','air'] as const){
  const a=coreAbilities.abilities.find(a=>a.id==='ability.core.storm-bolt')!,p=coreAbilities.presentations.find(p=>p.id===a.presentation)!;
  const f=createAbilityEncounter(a,p,encounterSettingsSchema.parse({relationship:'neutral',distance:6,casterDefinition:'unit.ants.archer',casterLocomotion:mode,targetLocomotion:'ground',combat:true}));
  const caster=f.game.context.get(f.caster)!,target=f.game.context.get(f.target!)!;
  caster.owner='none';caster.unit!.camp='preview-camp';target.owner='player.2';
  caster.unit!.order={type:'attack',target:target.id,force:false};
  const heights=new Int16Array(256*256);for(let y=0;y<256;y++)heights[y*256+122]=200;
  const terrain=new TacticalTerrain(256,heights),sight=vi.spyOn(f.game.spatial,'visible').mockImplementation((from,to)=>terrain.visible(from,to));
  f.game.combat.plan(new Set([caster.id]));
  expect(caster.unit!.target,mode).toBe(mode==='air'?target.id:null);
  expect(sight).toHaveBeenCalled();sight.mockRestore();
 }
});
