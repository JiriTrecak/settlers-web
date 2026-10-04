import {it,expect} from 'vitest';
import '../fixtures/walkableCatalogue';
import {Game} from '../../src/sim/game/game';
import {coreAbilities} from '../../src/content/abilities/core';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {abilitySchema} from '../../src/content/abilities/schema';
function fixture(name:string,settings:Record<string,unknown>={}){
 const a=coreAbilities.abilities.find(a=>a.id==='ability.core.'+name)!;
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'ally',targetHealth:500,distance:3,...settings}));
 return {...f,a,c:()=>f.game.context.get(f.caster)!,t:()=>f.game.context.get(f.target)!};
}
function advance(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
it('Blink relocates a unit with current body clearance and clears stale movement',()=>{
 const f=fixture('blink'),c=f.c();
 expect(f.game.abilities.cast(c.id,'preview',{x:128,y:125})).toBeNull();advance(f,30);
 expect({x:c.x,y:c.y}).toEqual({x:128,y:125});expect(c.unit!.route).toEqual([]);expect(c.unit!.position).toBeNull();expect(c.unit!.segment).toBeNull();
 const moved=f.game.abilities.drainEvents().find(e=>e.event==='teleported')!;
 expect(moved.origin).toEqual({x:120,y:120,height:0});expect(moved.point).toEqual({x:128,y:125,height:0});
 expect(f.game.observation.visible('player.1',c)).toBe(true);
});
it('Blink rejects fully blocked arrivals without charging mana or starting cooldown',()=>{
 const f=fixture('blink'),c=f.c(),mana=c.abilities!.mana;
 for(let y=124;y<=132;y++)for(let x=124;x<=132;x++)f.game.context.spatial.occupied[y*256+x]=999;
 expect(f.game.abilities.cast(c.id,'preview',{x:128,y:128})).toMatch(/arrival/);
 expect(c.abilities!.mana).toBe(mana);expect(c.abilities!.pending).toBeNull();expect(c.abilities!.cooldowns).toEqual({});
});
it('Blink rechecks arrival clearance at release and refunds if the destination becomes blocked',()=>{
 const f=fixture('blink'),c=f.c(),mana=c.abilities!.mana;
 expect(f.game.abilities.cast(c.id,'preview',{x:128,y:128})).toBeNull();expect(c.abilities!.mana).toBeLessThan(mana);
 for(let y=124;y<=132;y++)for(let x=124;x<=132;x++)f.game.context.spatial.occupied[y*256+x]=999;
 advance(f,30);
 expect({x:c.x,y:c.y}).toEqual({x:120,y:120});expect(c.abilities!.mana).toBe(mana);expect(c.abilities!.cooldowns).toEqual({});
 expect(f.game.abilities.drainEvents().some(e=>e.event==='cancelled'&&e.reason?.includes('arrival'))).toBe(true);
});
it('checks fog before terrain clearance so an invalid Blink cannot probe hidden blockers',()=>{
 const f=fixture('blink');for(let y=190;y<210;y++)for(let x=190;x<210;x++)f.game.context.spatial.occupied[y*256+x]=999;
 expect(f.game.abilities.cast(f.caster,'preview',{x:200,y:200})).toMatch(/visible/);
});
it('Mass Teleport transports nearby allies once and leaves the destination anchor in place',()=>{
 const f=fixture('mass-teleport',{targetCount:4,targetSpacing:2}),g=f.game;
 const destination=g.context.create({id:'destination',definition:'unit.ants.warrior',owner:'player.1',position:{x:160,y:120},rotation:0});
 g.observation.update();
 expect(g.abilities.cast(f.caster,'preview',destination.id)).toBeNull();advance(f,140);
 expect({x:destination.x,y:destination.y}).toEqual({x:160,y:120});
 const moved=g.abilities.drainEvents().filter(e=>e.event==='teleported');expect(moved).toHaveLength(5);
 expect(new Set(moved.map(e=>e.target)).size).toBe(5);
 for(const e of g.entities)expect(e.x).toBeGreaterThan(150);
 const cells=g.entities.map(e=>`${e.x}:${e.y}`);expect(new Set(cells).size).toBe(cells.length);
});
it('Far Sight reveals remote enemies in actual observation and expires to explored fog',()=>{
 const f=fixture('far-sight'),g=f.game;
 const enemy=g.context.create({id:'hidden',definition:'unit.ants.warrior',owner:'player.2',position:{x:180,y:120},rotation:0});g.observation.update();
 expect(g.observation.visible('player.1',enemy)).toBe(false);
 expect(g.abilities.cast(f.caster,'preview',{x:180,y:120})).toBeNull();advance(f,30);
 expect(g.state.spellVisions).toHaveLength(1);expect(g.observation.visible('player.1',enemy)).toBe(true);
 expect(g.observation.currentlyVisible('player.1',[120*256+180])).toBe(true);
 expect(g.abilities.drainEvents().find(e=>e.event==='visionCreated')?.viewers).toContain('player.1');
 f.c().hp=0;g.onCombatDeath(f.c());advance(f,10);expect(g.observation.visible('player.1',enemy)).toBe(true);
 advance(f,470);expect(g.state.spellVisions).toHaveLength(0);expect(g.observation.visible('player.1',enemy)).toBe(false);expect(g.observation.explored('player.1',[120*256+180])).toBe(true);
});
it.each(['blink','mass-teleport','far-sight'])('%s survives save/load during preparation and after release',name=>{
 const a=fixture(name),b=fixture(name),aim=name==='mass-teleport'?a.target:{x:128,y:125};
 expect(a.game.abilities.cast(a.caster,'preview',aim)).toBeNull();advance(a,2);b.game.restore(a.game.snapshot());
 for(let i=0;i<150;i++){advance(a,1);advance(b,1);expect(a.game.checksum()).toBe(b.game.checksum());}
 b.game.restore(a.game.snapshot());advance(a,500);advance(b,500);expect(a.game.checksum()).toBe(b.game.checksum());
});
it('validates temporary vision clocks and declaration parameters before restoring',()=>{
 const f=fixture('far-sight');f.game.abilities.cast(f.caster,'preview',{x:180,y:120});advance(f,30);
 const snapshot=f.game.snapshot(),checksum=f.game.checksum();snapshot.state.spellVisions[0].radius=64;
 expect(()=>f.game.restore(snapshot)).toThrow(/spell/);expect(f.game.checksum()).toBe(checksum);
});
it('keeps the destination walk surface when teleporting to a unit on a bridge',()=>{
 const f=fixture('mass-teleport');
 const game=new Game({...f.game.map,stamps:[{id:'test-arch',asset:'leafbound-twig-bridge',x:160,y:120}]},f.game.slots,f.game.registry);
 const caster=game.entities.find(e=>e.placement==='caster')!;
 const anchor=game.context.create({id:'bridge-anchor',definition:'unit.ants.warrior',owner:'player.1',position:{x:160,y:120,surface:'test-arch'},rotation:0});
 game.observation.update();expect(game.abilities.cast(caster.id,'preview',anchor.id)).toBeNull();
 for(let i=0;i<140;i++)game.tick(undefined,{passiveUnits:true});
 expect(caster.surface).toBe('test-arch');expect(game.context.spatial.height(caster)).toBeGreaterThan(3);
 expect(caster.x).toBeGreaterThan(150);expect(caster.unit!.segment).toBeNull();
 const saved=game.snapshot();game.restore(saved);expect(game.snapshot()).toEqual(saved);
});
it('does not attach an airborne teleport recipient to the target bridge deck',()=>{
 const base=coreAbilities.abilities.find(a=>a.id==='ability.core.mass-teleport')!;
 const a=abilitySchema.parse({...base,onRelease:[{op:'status',id:'flight',target:'caster',amount:400,polarity:'positive',dispel:true,form:{movement:{locomotion:'air',flightHeight:7}}},...base.onRelease]});
 const f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'ally',targetHealth:500,distance:3}));
 const game=new Game({...f.game.map,stamps:[{id:'test-arch',asset:'leafbound-twig-bridge',x:160,y:120}]},f.game.slots,f.game.registry);
 const caster=game.entities.find(e=>e.placement==='caster')!;
 const anchor=game.context.create({id:'bridge-anchor',definition:'unit.ants.warrior',owner:'player.1',position:{x:160,y:120,surface:'test-arch'},rotation:0});
 game.observation.update();expect(game.abilities.cast(caster.id,'preview',anchor.id)).toBeNull();
 for(let i=0;i<140;i++)game.tick(undefined,{passiveUnits:true});
 expect(game.spatial.airborne(caster)).toBe(true);expect(caster.surface).toBeUndefined();expect(caster.x).toBeGreaterThan(150);
 expect(anchor.surface).toBe('test-arch');
 const saved=game.snapshot();game.restore(saved);expect(game.snapshot()).toEqual(saved);
});
it('shares scouting with allies without revealing it to opposing players',()=>{
 const f=fixture('far-sight');
 const game=new Game(f.game.map,[{player:0,kind:'human',team:0},{player:1,kind:'human',team:0},{player:2,kind:'human',team:1}],f.game.registry);
 const caster=game.entities.find(e=>e.placement==='caster')!;
 expect(game.abilities.cast(caster.id,'preview',{x:180,y:120})).toBeNull();
 for(let i=0;i<30;i++)game.tick(undefined,{passiveUnits:true});
 const cell=[120*256+180];expect(game.observation.currentlyVisible('player.1',cell)).toBe(true);expect(game.observation.currentlyVisible('player.2',cell)).toBe(true);expect(game.observation.currentlyVisible('player.3',cell)).toBe(false);
});
it('expiry of one overlapping vision source preserves the other source until its own expiry',()=>{
 const f=fixture('far-sight'),g=f.game;
 expect(g.abilities.cast(f.caster,'preview',{x:180,y:120})).toBeNull();advance(f,80);
 f.c().abilities!.cooldowns={};expect(g.abilities.cast(f.caster,'preview',{x:180,y:120})).toBeNull();advance(f,30);
 expect(g.state.spellVisions).toHaveLength(2);const first=g.state.spellVisions[0].expires,last=g.state.spellVisions[1].expires;
 advance(f,first-g.state.tick);expect(g.state.spellVisions).toHaveLength(1);expect(g.observation.currentlyVisible('player.1',[120*256+180])).toBe(true);
 advance(f,last-g.state.tick);expect(g.state.spellVisions).toHaveLength(0);expect(g.observation.currentlyVisible('player.1',[120*256+180])).toBe(false);
});
