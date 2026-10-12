import {expect,it} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {coreEffects,presentationRecipes} from '../../src/content/effects/library';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {snapPlacement} from '../../src/shared/spatial/placement';
import {precise} from '../../src/sim/game/motion';
const spell=coreAbilities.abilities.find(a=>a.id==='ability.ants.thorn-rush')!;
const presentation=coreAbilities.presentations.find(p=>p.id===spell.presentation)!;
function fixture(){
 const f=createAbilityEncounter(spell,presentation,encounterSettingsSchema.parse({casterDefinition:'unit.ants.thornblade',relationship:'enemy',targetHealth:3000,mana:1000,distance:18}));
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;
 return {...f,c,t,cast:()=>f.game.abilities.cast(f.caster,'preview',f.target!)};
}
it('closes a full-range gap in a fraction of a second and only damages on contact',()=>{
 const f=fixture(),hp=f.t.hp!,start=precise(f.c);expect(f.cast()).toBeNull();let moving=false,impact=0;
 for(let tick=1;tick<=12;tick++){
  f.game.tick(undefined,{passiveUnits:true});
  if(f.t.hp!<hp){impact=tick;break;}
  if(precise(f.c).x>start.x){moving=true;expect(f.t.hp).toBe(hp);}
 }
 expect(moving).toBe(true);expect(impact).toBeGreaterThan(2);expect(impact).toBeLessThanOrEqual(9);
 expect(f.game.spatial.bodyRange(f.c,f.t)).toBeLessThanOrEqual(.65**2);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it('does not tunnel through a unit at lunge speed or apply remote impact damage',()=>{
 const f=fixture(),hp=f.t.hp;
 const block=f.game.context.create({id:'block',definition:'unit.ants.warrior',owner:'player.1',position:{x:127,y:120},rotation:0});block.unit!.order={type:'hold'};
 expect(f.cast()).toBeNull();for(let i=0;i<14;i++)f.game.tick(undefined,{passiveUnits:true});
 expect(f.t.hp).toBe(hp);expect(precise(f.c).x).toBeLessThan(127);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
it('restores a fast in-flight charge deterministically',()=>{
 const a=fixture(),b=fixture();expect(a.cast()).toBeNull();for(let i=0;i<3;i++)a.game.tick(undefined,{passiveUnits:true});
 expect(a.game.state.spellDeliveries).toHaveLength(1);b.game.restore(a.game.snapshot());
 for(let i=0;i<15;i++){a.game.tick(undefined,{passiveUnits:true});b.game.tick(undefined,{passiveUnits:true});expect(a.game.checksum()).toBe(b.game.checksum());}
});
it('publishes editable launch, actual-delivery trail and contact effects without poison',()=>{
 const recipes=presentationRecipes(presentation,coreEffects);
 expect(recipes.some(r=>r.event==='projectile'&&r.shape==='missile'&&r.trail&&r.durationFrom==='delivery')).toBe(true);
 expect(recipes.some(r=>r.event==='impact'&&r.shape==='particles')).toBe(true);
 expect(presentation.animations.prepare).toBe('charge');
});

it('stops at building terrain clearance even at the increased dash speed',()=>{
 const f=fixture(),hp=f.t.hp;
 f.game.context.create({id:'wall',definition:'building.ants.house',owner:'player.1',position:snapPlacement(f.game.registry.get('building.ants.house'),{x:127,y:120}),rotation:0});
 f.game.spatial.rebuild();f.game.observation.update();
 const result=f.cast();if(result===null)for(let i=0;i<14;i++)f.game.tick(undefined,{passiveUnits:true});
 expect(f.t.hp).toBe(hp);expect(precise(f.c).x).toBeLessThan(127);expect(f.game.state.spellDeliveries).toHaveLength(0);
});
