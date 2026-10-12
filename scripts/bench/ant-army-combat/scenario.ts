import type {Placement} from '../../../src/content/schema';
import {Game} from '../../../src/sim/game/game';
import {emptyUtcMap} from '../../../src/shared/map/utcmap';

/** A mixed army using published definitions, abilities and normal combat orders. */
export const armyRoster = [
  {slug:'marshal',count:1,rank:-1},
  {slug:'queensguard',count:2,rank:0},
  {slug:'warrior',count:4,rank:1},
  {slug:'thornblade',count:3,rank:2},
  {slug:'archer',count:4,rank:3},
  {slug:'banneret',count:1,rank:4},
  {slug:'silkwarden',count:2,rank:5},
  {slug:'nectarist',count:2,rank:6},
  {slug:'amber-adept',count:2,rank:7},
  {slug:'bombardier',count:2,rank:8},
  {slug:'winglancer',count:2,rank:3},
  {slug:'rootweaver',count:2,rank:9},
] as const;
export function createArmyEncounter(multiplier=1,heroDefinition='unit.ants.marshal') {
 const map={...emptyUtcMap(),sandbox:true,entities:[] as Placement[]};
 for(const side of [0,1]) {
  const owner=side?'player.2':'player.1';
  for(const row of armyRoster)for(let i=0;i<row.count*(row.slug==='marshal'?1:multiplier);i++) {
   map.entities.push({id:`army.${side}.${row.slug}.${i}`,definition:row.slug==='marshal'?heroDefinition:`unit.ants.${row.slug}`,
    position:{x:side?148+row.rank*6:108-row.rank*6,y:Math.round(128+(i-(row.count*(row.slug==='marshal'?1:multiplier)-1)/2)*7+(row.slug==='winglancer'?18:0))},rotation:side?270:90,owner});
  }
  // Workers stay behind the lines for the full roster comparison.
  for(let i=0;i<2;i++)map.entities.push({id:`worker.${side}.${i}`,definition:'unit.ants.settler',position:{x:side?218:38,y:123+i*10},rotation:side?270:90,owner});
 }
 const game=new Game(map,[{player:0,kind:'human'},{player:1,kind:'human'}]);
 // A level-five commander demonstrates learned hero support alongside regular troops.
 for(const hero of game.entities.filter(e=>e.definition===heroDefinition)){
  hero.progression!.experience=game.registry.get(hero.definition).behaviors.progression!.levels[4]!.experience;
  game.observation.update();
  const bindings=game.registry.get(hero.definition).behaviors.abilities!.bindings;
  const basic=bindings.filter(b=>b.learning?.requiredLevels[0]===1),ultimate=bindings.find(b=>b.learning?.requiredLevels[0]===5);
  for(const ability of [...basic.map(b=>b.id),basic[0]!.id,...(ultimate?[ultimate.id]:[])]){
   const result=game.command(hero.owner,{type:'learnAbility',actor:hero.id,ability});
   if(!result.accepted)throw Error(result.reason);
  }
 }
 return game;
}
export function engageArmies(game:Game) {
 for(const side of [0,1]) {
  const owner=side?'player.2':'player.1';
  const result=game.command(owner,{type:'move',actors:game.entities.filter(e=>e.owner===owner&&e.definition!=='unit.ants.settler').map(e=>e.id),destination:{x:side?108:148,y:128},attackMove:true});
  if(!result.accepted)throw Error(result.reason);
 }
}

/** Preview buttons issue the same declared hero commands as the game command card. */
export function castArmyHeroSpell(game:Game,bindingId:string) {
 const hero=game.entities.find(e=>e.owner==='player.1'&&e.hp!>0&&game.registry.get(e.definition).hero);
 if(!hero)return {accepted:false,reason:'The red hero has fallen'};
 const binding=game.registry.get(hero.definition).behaviors.abilities?.bindings.find(b=>b.id===bindingId);
 const ability=game.registry.abilityLibrary.abilities.find(a=>a.id===binding?.ability);
 if(!binding||!ability)return {accepted:false,reason:'Unknown hero spell'};
 const enemy=game.entities.filter(e=>e.owner!==hero.owner&&e.hp!>0).sort((a,b)=>Math.hypot(a.x-hero.x,a.y-hero.y)-Math.hypot(b.x-hero.x,b.y-hero.y))[0];
 if(ability.targeting.kind!=='self'&&!enemy)return {accepted:false,reason:'No enemy target remains'};
 const target=ability.targeting.kind==='self'?{kind:'unit' as const,entity:hero.id}:
  ability.targeting.kind==='point'?{kind:'point' as const,position:{x:enemy!.x,y:enemy!.y}}:{kind:'unit' as const,entity:enemy!.id};
 return game.command(hero.owner,{type:'castAbility',actor:hero.id,binding:bindingId,target});
}
