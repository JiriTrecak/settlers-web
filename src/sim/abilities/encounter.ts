import {locomotion} from '../game/locomotion';
import {unitNature} from './eligibility';
import {SpellStatuses} from './statuses';
import {releaseEffects} from '../../content/abilities/schema';
import {neutralEncounterModels,type EncounterSettings} from '../../content/abilities/encounter';
import {builtinSource} from '../../content/builtin';
import {ContentRegistry,type ContentSource} from '../../content/registry';
import type {Definition,authoredDefinitionSchema} from '../../content/schema';
import type {z} from 'zod';
import {abilityLibrarySchema,type AbilityDefinition,type AbilityPresentation} from '../../content/abilities/schema';
import {emptyUtcMap} from '../../shared/map/utcmap';
import {Game} from '../game/game';

/** A fixture around Game, not a second combat implementation. No production map is modified. */
export function createAbilityEncounter(ability:AbilityDefinition,presentation:AbilityPresentation,settings:EncounterSettings,preview=false,baseSource:ContentSource=builtinSource){
 if(preview){ability=structuredClone(ability);ability.cast.cost.amount=0;ability.cast.cooldown.ticks=0;if(ability.autocast)ability.autocast.enabledByDefault=false;}
 const source=structuredClone(baseSource);
 const library=abilityLibrarySchema.parse(source.abilityLibrary);
 library.abilities=library.abilities.filter(a=>a.id!==ability.id).concat(ability);
 library.presentations=library.presentations.filter(p=>p.id!==presentation.id).concat(presentation);
 source.abilityLibrary=library;
 const models=new Map<string,string>();
 function unit(id:string,newId:string,caster:boolean){
  const raw=source.definitions.find(d=>(d as Definition).id===id);
  if(!raw)throw Error('Unknown encounter unit '+id);
  const d=structuredClone(raw) as z.infer<typeof authoredDefinitionSchema>;
  if(d.kind!=='unit'||!d.body)throw Error('Encounter subjects must be units');
  const camp=!caster&&settings.relationship==='neutral';
  d.behaviors??={};d.id=newId;const mode=settings[caster?'casterLocomotion':'targetLocomotion'];if(mode)d.behaviors.movement={...d.behaviors.movement,locomotion:mode};const nature=settings[caster?'casterNature':'targetNature'];if(nature)d.unitNature=nature;d.hero=settings[caster?'casterHero':'targetHero'];if(!preview&&!settings.combat&&!camp)delete d.behaviors.combat;if(!camp)delete d.behaviors.campDefense;delete d.behaviors.progression;delete d.behaviors.inventory;delete d.behaviors.abilities;
  d.disabledBehaviors=[...(d.disabledBehaviors??[]),...(!preview&&!settings.combat&&!camp?['combat'] as const:[]),...(!camp?['campDefense'] as const:[]),'progression','inventory','abilities'];
  d.body.maxHp=500;
  if(caster){d.disabledBehaviors=d.disabledBehaviors.filter(b=>b!=='abilities');d.behaviors.abilities={maxMana:1000,manaRegenPerSecond:0,bindings:[{id:'preview',ability:ability.id,initialRank:1,controls:['player','ai','scenario'],command:{hotkey:'Q',column:1}}]};}
  source.definitions.push(d);models.set(newId,id);return d;
 }
 const casterDef=unit(settings.casterDefinition,'unit.preview.caster',true);
 const owner=settings.relationship==='neutral'?'none' as const:settings.relationship==='enemy'?'player.2' as const:'player.1' as const;
 const map={...emptyUtcMap(),sandbox:true,biome:settings.biome,entities:[
  {id:'caster',definition:casterDef.id,owner:'player.1' as 'player.1'|'player.2'|'none',position:{x:120,y:120},rotation:90},
 ]};
 if(settings.relationship!=='self')for(let i=0;i<settings.targetCount;i++){
  const model=settings.relationship==='neutral'?neutralEncounterModels[i%neutralEncounterModels.length]:settings.targetDefinition;
  const definition=unit(model,i===0?'unit.preview.target':'unit.preview.target-'+i,false);
  const angle=(i-1)*Math.PI*2/Math.max(1,settings.targetCount-1);
  map.entities.push({id:i===0?'target':'target-'+i,definition:definition.id,owner,position:{x:Math.round(120+settings.distance+(i?Math.cos(angle)*settings.targetSpacing:0)),y:Math.round(120+(i?Math.sin(angle)*settings.targetSpacing:0))},rotation:270});
 }
 if(settings.relationship==='neutral')map.camps=[{id:'preview-camp',members:map.entities.filter(e=>e.id!=='caster').map(e=>e.id),home:{x:120+settings.distance,y:120},aggroRange:8,leash:18,aggression:'players'}];
 const game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}],new ContentRegistry(source),settings.seed);
 const caster=game.entities.find(e=>e.placement==='caster')!,target=settings.relationship==='self'?caster:game.entities.find(e=>e.placement==='target');
 caster.hp=Math.min(game.context.stats(caster).maxHp,settings.casterHealth);caster.abilities!.mana=settings.mana;if(preview)caster.abilities!.ranks.preview=0;for(const e of game.entities)if(e.id!==caster.id||settings.relationship==='self')e.hp=Math.min(game.context.stats(e).maxHp,settings.targetHealth);
 const traits=(e:typeof caster)=>({hp:e.hp??0,maxHp:game.context.stats(e).maxHp,mana:e.abilities?.mana,maxMana:game.context.stats(e).maxMana,owner:e.owner,locomotion:locomotion(game.context.def(e)),nature:unitNature(game.registry.get(e.definition)),hero:!!game.registry.get(e.definition).hero,summoned:!!e.summoned,level:game.context.stats(e).level});
 for(const id of target?settings.initialStatuses:[]){
  const spell=game.registry.abilityLibrary.abilities.find(a=>a.id===id);if(!spell)throw Error('Unknown fixture status spell '+id);
  const cast=game.state.nextCast++;
  for(const effect of releaseEffects(spell,1,'ally',{caster:traits(caster),target:traits(target!)}))if(effect.op==='status')new SpellStatuses(game).apply(caster.id,target!.id,spell,1,cast,effect);
 }
 if(settings.fallenTargets)for(const e of [...game.entities])if(e.id!==caster.id&&e.unit){e.hp=0;game.onCombatDeath(e);}
 game.observation.update();
 return {game,caster:caster.id,target:target?.id??0,models};
}
