import { describe, it, expect } from "vitest";
import { Game } from "../../src/sim/game/game";
import { ContentRegistry } from "../../src/content/registry";
import { emptyUtcMap } from "../../src/shared/map/utcmap";
import { placed, slots, source } from "./helpers";
import type { Rules } from "../../src/content/schema";

function setup() {
  const data=source();
  (data.rules as Rules).startingSetup.units = (data.rules as Rules).startingSetup.units.filter(u=>u.definition!=="unit.ants.marshal");
  const warrior=structuredClone(data.definitions.find(d=>(d as {id:string}).id==="unit.ants.warrior")) as Record<string,unknown>;
  data.definitions.push({...warrior,id:"unit.ants.test-hero",hero:true,level:1,
    body:{maxHp:100,armor:0,armorType:"heavy"},
    behaviors:{movement:{speed:4},playerControl:{},combat:{damage:30,damageType:"melee",range:2,cooldownTicks:40,aggroRange:8},
      progression:{levels:[0,10,30].map((experience,i)=>({experience,maxHp:100+20*i,damage:30+5*i,armor:i,cooldownTicks:40,maxMana:0,healthRegenPerSecond:0,manaRegenPerSecond:0})),experienceRadius:8}}});
  for(const d of data.definitions as Record<string,unknown>[]) if(d.id==="unit.neutral.wolf" || d.id==="unit.ants.settler")d.experienceYield=35;
  const map={...emptyUtcMap(),entities:[placed("hero1","unit.ants.test-hero",208,230),placed("hero2","unit.ants.test-hero",208,229),
    {...placed("victim","unit.neutral.wolf",209,230,{health:1}),owner:"none" as const}],
    camps:[{id:"camp",members:["victim"],home:{x:209,y:230},aggroRange:5,leash:10,aggression:"players" as const}]};
  return new Game(map,slots,new ContentRegistry(data));
}

describe("hero leveling",()=>{
  it("shares XP deterministically and exposes derived level/health/damage without exposing enemy XP",()=>{
    const g=setup(),h=g.entities.find(e=>e.placement==="hero1")!,h2=g.entities.find(e=>e.placement==="hero2")!;
    h.hp=70; h.unit!.target=g.entities.find(e=>e.placement==="victim")!.id;
    for(let t=0;t<=g.registry.get(h.definition).behaviors.combat!.attack.windupTicks;t++)g.tick();
    expect(h.progression!.experience).toBe(18);expect(h2.progression!.experience).toBe(17);
    expect(g.context.stats(h)).toMatchObject({level:2,maxHp:120,damage:35,armor:1});
    // Level-up adds maximum-health growth; it does not erase earlier damage.
    expect(h.hp).toBeLessThanOrEqual(90);expect(h.hp).toBeGreaterThan(70);
    const own=g.view("player.1").entities.find(e=>e.id===h.id)!;
    expect(own.stats?.maxHp).toBe(120);expect(own.progression?.experience).toBe(18);
    const saved=g.snapshot(), restored=setup();restored.restore(saved);
    expect(restored.context.stats(restored.context.get(h.id)!)).toEqual(own.stats);
    const experience=h.progression!.experience;g.tick();expect(h.progression!.experience).toBe(experience);
  });
  it("does not reward forced friendly kills and rejects forged progression on ordinary units",()=>{
    const g=setup(),h=g.entities.find(e=>e.placement==="hero1")!;
    const victim=g.entities.find(e=>e.definition==="unit.ants.settler"&&e.owner==="player.1")!;
    victim.x=h.x+1;victim.y=h.y;victim.hp=1;
    h.unit!.order={type:"attack",target:victim.id,force:true};h.unit!.target=victim.id;
    // Keep the neutral alive outside combat range.
    const wolf=g.entities.find(e=>e.placement==="victim")!;wolf.x=100;wolf.y=100;
    for(let t=0;t<=g.registry.get(h.definition).behaviors.combat!.attack.windupTicks;t++)g.tick();
    expect(g.context.get(victim.id)).toBeUndefined();expect(h.progression!.experience).toBe(0);
    const saved=g.snapshot();saved.state.entities.find(e=>!e.progression)!.progression={experience:1};
    expect(()=>g.restore(saved)).toThrow(/Invalid saved entity/);
  });
});
