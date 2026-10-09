import {describe,expect,it} from 'vitest';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition,Owner,Rules} from '../../src/content/schema';
import {Game} from '../../src/sim/game/game';
import {Progression} from '../../src/sim/game/progression';
import type {Entity} from '../../src/sim/game/state';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {placed,slots,source} from './helpers';

function fixture(edit?: (data: ReturnType<typeof source>) => void, heroLevelCap?: number) {
 const data=source(),rules=data.rules as Rules;
 rules.startingSetup.gathering=[];
 rules.experience.soloHeroTierBonusPermille=[0,0,0];
 edit?.(data);
 const map={...emptyUtcMap(),sandbox:true,...(heroLevelCap ? {mission:{campaign:"test",title:"XP ceiling",order:1,heroLevelCap,regions:[],script:"function on_start() end"}}:{}),entities:[
  placed('hero','unit.ants.marshal',200,220),
  {...placed('rival','unit.ants.marshal',216,220),owner:'player.2' as Owner},
  {...placed('neutral','unit.neutral.webling',208,220),owner:'none' as Owner},
 ],camps:[{id:'camp',members:['neutral'],home:{x:208,y:220},aggroRange:5,leash:10,aggression:'players' as const}]};
 delete rules.startingSetup.hero;
 const make=()=>new Game(map,slots,new ContentRegistry(data));
 const g=make(),hero=g.entities.find(e=>e.placement==='hero')!,rival=g.entities.find(e=>e.placement==='rival')!,neutral=g.entities.find(e=>e.placement==='neutral')!;
 const award=(victim:Entity,owner:Owner='player.1')=>new Progression(g.context).award(victim,owner,h=>h.owner===owner);
 const create=(definition='unit.ants.warrior',owner:Owner='player.2')=>g.context.create({...placed('victim.'+g.entities.length,definition,210,224),owner});
 return {g,hero,rival,neutral,award,create,make,data};
}

it('publishes our eleven-level curve, strength rewards and six-level neutral ceiling',()=>{
 const {g,hero}=fixture(),p=g.context.def(hero).behaviors.progression!;
 expect(p.levels.map(l=>l.experience)).toEqual([0,160,400,720,1120,1600,2160,2800,3520,4320,5200]);
 expect(p.experienceRadius).toBe(40);
 expect(g.registry.rules.experience.neutralMultipliersPermille).toEqual([1000,900,800,700,600]);
 expect(g.registry.definitions.filter(d=>(d.experienceYield??0)>0)).toHaveLength(0);
});

describe('authoritative experience attribution',()=>{
 it('gives a neutral kill only to the killing side, including a detached spell source',()=>{
  const {g,hero,rival,neutral}=fixture();
  g.combat.abilityHit({source:999999,owner:'player.1',target:neutral.id,damage:100000,damageType:'spell'});
  expect(hero.progression!.experience).toBe(24);expect(rival.progression!.experience).toBe(0);
 });
 it('uses the captured hit owner when the source has changed allegiance',()=>{
  const {g,hero,rival,neutral}=fixture();
  g.combat.abilityHit({source:rival.id,owner:'player.1',target:neutral.id,damage:100000,damageType:'spell'});
  expect(hero.progression!.experience).toBe(24);expect(rival.progression!.experience).toBe(0);
 });
 it('does not credit nearby opponents for a friendly last hit after hostile damage in the same tick',()=>{
  const {g,hero,rival,create}=fixture(),victim=create();victim.hp=10;
  g.combat.resolve([
   {source:hero.id,owner:hero.owner,target:victim.id,damage:1,damageType:'spell'},
   {source:rival.id,owner:rival.owner,target:victim.id,damage:100000,damageType:'spell'},
  ],new Set());
  expect(victim.hp).toBe(0);expect(hero.progression!.experience).toBe(0);expect(rival.progression!.experience).toBe(0);
 });
 it('uses the lethal owner for batched weapon/projectile hits and excludes dead recipients',()=>{
  const {g,hero,rival,neutral}=fixture();
  g.combat.resolve([
   {source:hero.id,owner:hero.owner,target:neutral.id,damage:1,damageType:'spell'},
   {source:rival.id,owner:rival.owner,target:neutral.id,damage:100000,damageType:'spell'},
   {source:hero.id,owner:hero.owner,target:rival.id,damage:100000,damageType:'spell'},
  ],new Set());
  expect(hero.progression!.experience).toBe(90);expect(rival.progression!.experience).toBe(0);
 });
});

describe('sharing and limits',()=>{
 it('shares one pool among nearby allies, with deterministic remainder and no distant share',()=>{
  const {g,hero,rival,neutral}=fixture(data=>{
   (data.definitions.find((d:any)=>d.id==='unit.neutral.webling') as AuthoredDefinition).experienceYield=35;
  });
  const second=g.context.create(placed('second','unit.ants.marshal',202,225));second.readyTick=0;
  const distant=g.context.create(placed('distant','unit.ants.marshal',250,225));
  new Progression(g.context).award(neutral,hero.owner,e=>e.owner===hero.owner);
  expect([hero,second,distant,rival].map(e=>e.progression!.experience)).toEqual([18,17,0,0]);
 });
 it('falls back to the owner globally only when no eligible ally is nearby',()=>{
  const {g,hero,rival,neutral}=fixture();hero.x=150;
  new Progression(g.context).award(neutral,hero.owner,()=>true);
  expect(hero.progression!.experience).toBe(0);expect(rival.progression!.experience).toBe(24);
  rival.progression!.experience=1600;
  new Progression(g.context).award(neutral,hero.owner,()=>true);
  expect(hero.progression!.experience).toBe(24);expect(rival.progression!.experience).toBe(1600);
 });
 it('applies level-dependent neutral rewards and clamps overflow exactly at level six',()=>{
  const {g,hero,neutral,award,create}=fixture();
  hero.progression!.experience=1120;award(neutral);expect(hero.progression!.experience).toBe(1134);
  hero.progression!.experience=1595;award(neutral);expect(hero.progression!.experience).toBe(1600);
  award(neutral);expect(hero.progression!.experience).toBe(1600);
  award(create());expect(hero.progression!.experience).toBe(1624);
  expect(g.context.stats(hero).level).toBe(6);
 });
 it('excludes capped heroes from the pool and respects lower mission caps',()=>{
  const {g,hero,neutral,award}=fixture(),second=g.context.create(placed('second','unit.ants.marshal',202,225));second.readyTick=0;
  hero.progression!.experience=1600;award(neutral);expect(second.progression!.experience).toBe(24);
  const mission=fixture(undefined,2);
  mission.hero.progression!.experience=155;mission.award(mission.neutral);expect(mission.hero.progression!.experience).toBe(160);
  mission.award(mission.neutral);expect(mission.hero.progression!.experience).toBe(160);
 });
 it('rewards actual hero level, halves summon rewards, and ignores zero-yield split actors',()=>{
  const {hero,rival,award,create}=fixture();rival.progression!.experience=2800;
  award(rival);expect(hero.progression!.experience).toBe(615);
  const summon=create('unit.spell.feral-spirit');
  summon.summoned={source:rival.id,ability:'ability.core.feral-spirit',rank:1,cast:1,started:0,expires:100};
  award(summon);expect(hero.progression!.experience).toBe(651);
  award(create('unit.spell.trinity-earth'));expect(hero.progression!.experience).toBe(651);
 });
 it('round-trips level eleven and continues identically on independent replicas',()=>{
  const a=fixture(),b=fixture();a.hero.progression!.experience=5195;b.hero.progression!.experience=5195;
  for(const f of [a,b]){
   const dead=f.create();
   f.g.combat.abilityHit({source:f.hero.id,owner:f.hero.owner,target:dead.id,damage:100000,damageType:'spell'});
   f.g.onCombatDeath(dead);
  }
  expect(a.g.context.stats(a.hero).level).toBe(11);
  expect(a.g.checksum('full')).toBe(b.g.checksum('full'));
  const cold=a.make();cold.restore(JSON.parse(JSON.stringify(a.g.snapshot())));
  for(let i=0;i<80;i++){a.g.tick();b.g.tick();cold.tick();}
  expect(a.g.snapshot()).toEqual(b.g.snapshot());expect(cold.snapshot()).toEqual(a.g.snapshot());
 });
});

it('grants the single-hero Hall-tier bonus and removes it when another hero is fallen',()=>{
 const f=fixture(data=>{
  (data.rules as Rules).experience.soloHeroTierBonusPermille=[0,150,300];
  const hero=data.definitions.find((d:any)=>d.id==='unit.ants.marshal') as AuthoredDefinition;
  data.definitions.push({...structuredClone(hero),id:'unit.test.second-hero'});
 });
 const hall=f.g.context.create(placed('hall','building.ants.great-mound',181.5,221.5));
 f.award(f.neutral);expect(f.hero.progression!.experience).toBe(27);
 hall.definition='building.ants.elder-hall';f.award(f.neutral);expect(f.hero.progression!.experience).toBe(58);
 const second=f.g.context.create(placed('other-hero','unit.test.second-hero',150,225));
 second.hp=0;f.g.economy.remove(second);f.g.revival.retain(second);
 f.award(f.neutral);expect(f.hero.progression!.experience).toBe(82);
});
