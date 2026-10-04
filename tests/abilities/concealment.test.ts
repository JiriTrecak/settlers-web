import {it,expect} from 'vitest';
import {coreAbilities} from '../../src/content/abilities/core';
import {releaseEffects} from '../../src/content/abilities/schema';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {SpellStatuses} from '../../src/sim/abilities/statuses';
import {spellHidden,concealmentOpacity} from '../../src/sim/abilities/concealment';
import {Game} from '../../src/sim/game/game';
const spell=(id:string)=>coreAbilities.abilities.find(a=>a.id==='ability.core.'+id)!;
function fixture(id='wind-walk',settings:Record<string,unknown>={}){
 const a=spell(id),f=createAbilityEncounter(a,coreAbilities.presentations.find(p=>p.id===a.presentation)!,encounterSettingsSchema.parse({relationship:'enemy',combat:true,distance:3,targetHealth:500,...settings}));
 return {...f,c:()=>f.game.context.get(f.caster)!,t:()=>f.game.context.get(f.target)!};
}
function run(f:ReturnType<typeof fixture>,n:number){for(let i=0;i<n;i++)f.game.tick(undefined,{passiveUnits:true});}
function apply(f:ReturnType<typeof fixture>,id:string,target:number,source=target){
 const a=spell(id),cast=f.game.state.nextCast++;
 for(const effect of releaseEffects(a,1,'ally'))new SpellStatuses(f.game).apply(source,target,a,1,cast,effect);
}
it('concealment fades before hiding enemies, keeps owner projection, and expires cleanly',()=>{
 const f=fixture();expect(f.game.abilities.cast(f.caster,'preview',f.caster)).toBeNull();
 const release=f.c().abilities!.pending!.releaseTick;run(f,release+15);
 expect(f.game.observation.visible('player.2',f.c())).toBe(true);expect(concealmentOpacity(f.c(),f.game.registry,f.game.state.tick)).toBeLessThan(.4);
 run(f,1);expect(spellHidden(f.c(),f.game.registry,f.game.state.tick)).toBe(true);
 expect(f.game.observation.visible('player.2',f.c())).toBe(false);expect(f.game.view('player.2').entities.some(e=>e.id===f.caster)).toBe(false);
 expect(f.game.view('player.1').entities.find(e=>e.id===f.caster)?.concealmentOpacity).toBeCloseTo(.28);
 expect(f.game.context.stats(f.c()).moveSpeedPermille).toBe(1300);
 run(f,400);expect(f.game.observation.visible('player.2',f.c())).toBe(true);expect(f.c().spellStatuses).toBeUndefined();expect(f.game.context.stats(f.c()).moveSpeedPermille).toBe(1000);
});
it('rejects direct casts against hidden targets while area damage can still hit them',()=>{
 const f=fixture('holy-light-lite');apply(f,'invisibility',f.target);run(f,16);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toMatch(/visible/);
 const before=f.t().hp!;f.game.abilities.invoke(f.caster,f.target,spell('war-stomp'),1,spell('war-stomp').onRelease);
 expect(f.t().hp).toBeLessThan(before);expect(spellHidden(f.t(),f.game.registry,f.game.state.tick)).toBe(true);
});
it('cancels preparation if its target becomes invisible before release and refunds escrow',()=>{
 const f=fixture('holy-light-lite'),mana=f.c().abilities!.mana;apply(f,'invisibility',f.target);run(f,12);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();run(f,30);
 expect(f.c().abilities!.mana).toBe(mana);expect(f.game.abilities.drainEvents().some(e=>e.event==='cancelled'&&e.reason?.includes('visible'))).toBe(true);
});
it('accepted casting breaks a veil while a rejected cast does not',()=>{
 const f=fixture('holy-light-lite');apply(f,'invisibility',f.caster);run(f,16);
 expect(f.game.abilities.cast(f.caster,'missing',f.target)).not.toBeNull();expect(spellHidden(f.c(),f.game.registry,f.game.state.tick)).toBe(true);
 expect(f.game.abilities.cast(f.caster,'preview',f.target)).toBeNull();expect(spellHidden(f.c(),f.game.registry,f.game.state.tick)).toBe(false);
});
it('a successful weapon release consumes Wind Walk and adds its bonus exactly once',()=>{
 const a=fixture(),b=fixture();apply(a,'wind-walk',a.caster);run(a,16);run(b,16);
 const attack=(f:ReturnType<typeof fixture>)=>{const c=f.c(),t=f.t();t.x=c.x+1;t.y=c.y;c.rotation=90;c.unit!.target=t.id;c.unit!.order={type:'attack',target:t.id,force:false};c.unit!.cooldown=0;f.game.combat.resolve();const impact=c.unit!.attack!.impact;f.game.state.tick=impact;f.game.combat.resolve();return 500-t.hp!;};
 const bonus=attack(a)-attack(b);expect(bonus).toBeGreaterThan(40);expect(bonus).toBeLessThanOrEqual(60);expect(a.c().spellStatuses).toBeUndefined();
});
it('detection reveals concealed enemies only inside its range and normal visibility',()=>{
 const f=fixture('holy-light-lite');apply(f,'invisibility',f.target);run(f,16);expect(f.game.observation.visible('player.1',f.t())).toBe(false);
 apply(f,'true-sight',f.caster);f.game.observation.update();expect(f.game.observation.visible('player.1',f.t())).toBe(true);
 f.t().x=f.c().x+13;f.game.context.motionRevision++;f.game.observation.update();expect(f.game.observation.visible('player.1',f.t())).toBe(false);
});
it('shares hidden allied units without revealing them to the other team',()=>{
 const f=fixture(),g=new Game(f.game.map,[{player:0,kind:'human',team:0},{player:1,kind:'human',team:0},{player:2,kind:'human',team:1}],f.game.registry);
 const c=g.context.get(f.caster)!;const a=spell('wind-walk');new SpellStatuses(g).apply(c.id,c.id,a,1,g.state.nextCast++,releaseEffects(a,1,'ally')[0]);
 for(let i=0;i<16;i++)g.tick(undefined,{passiveUnits:true});
 expect(g.observation.detects('player.2',c)).toBe(true);expect(g.observation.detects('player.3',c)).toBe(false);
});
it('never leaks the death of an undetected concealed enemy through observed-death reports',()=>{
 const f=fixture();apply(f,'wind-walk',f.caster);run(f,16);f.c().hp=0;f.game.onCombatDeath(f.c());f.game.observation.update();
 expect(f.game.view('player.2').observedDeaths?.some(e=>e.id===f.caster)).not.toBe(true);
});
it('restores fade clocks and hidden projections deterministically',()=>{
 const a=fixture(),b=fixture();apply(a,'wind-walk',a.caster);run(a,7);b.game.restore(a.game.snapshot());
 for(let i=0;i<410;i++){run(a,1);run(b,1);expect(a.game.checksum()).toBe(b.game.checksum());expect(a.game.view('player.2').entities.map(e=>e.id)).toEqual(b.game.view('player.2').entities.map(e=>e.id));}
});
it('keeps passive detection active across ticks and removes it when its binding is removed',()=>{
 const f=fixture('true-sight');apply(f,'invisibility',f.target);run(f,20);
 expect(f.game.observation.visible('player.1',f.t())).toBe(true);
 f.c().abilities!.ranks.preview=0;run(f,2);expect(f.game.observation.visible('player.1',f.t())).toBe(false);
});
it('ordinary remote vision does not reveal concealment; detection is an explicit sensor policy',()=>{
 const f=fixture('far-sight');f.t().x=180;f.t().y=120;f.game.context.motionRevision++;f.game.observation.update();
 apply(f,'invisibility',f.target);run(f,16);expect(f.game.abilities.cast(f.caster,'preview',{x:180,y:120})).toBeNull();run(f,30);
 expect(f.game.observation.currentlyVisible('player.1',[120*256+180])).toBe(true);expect(f.game.observation.visible('player.1',f.t())).toBe(false);
 f.game.state.spellVisions[0].detectInvisible=true;f.game.observation.update();expect(f.game.observation.visible('player.1',f.t())).toBe(true);
 const saved=f.game.snapshot();expect(()=>f.game.restore(saved)).toThrow(/spell/);
});
