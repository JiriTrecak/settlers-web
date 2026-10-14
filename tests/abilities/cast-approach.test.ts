import {expect,it} from 'vitest';
import {createAbilityEncounter} from '../../src/sim/abilities/encounter';
import {encounterSettingsSchema} from '../../src/content/abilities/encounter';
import {precise} from '../../src/sim/game/motion';
import {abilitySchema} from '../../src/content/abilities/schema';
import {testAbilities,testSource} from '../fixtures/content';
const RANGE=8,MANA=65;
const cast={prepareTicks:28,recoverTicks:20,cost:{resource:'mana',amount:MANA,commit:'release'},cooldown:{ticks:360,start:'release',scope:'ability'},cancelBeforeRelease:'refund',revalidateAtRelease:['caster','target','range','visibility','relationship']};
/** Melee-range spells cast from outside their range: one aimed at a unit, one at a ground point. */
const spells={
 unit:abilitySchema.parse({schemaVersion:1,id:'ability.test.approach-unit',name:'Unit strike',description:'',activation:'targeted',ranks:[{}],cast,
  targeting:{filter:{locomotion:['ground']},kind:'unit',alive:true,visible:true,relations:['enemy'],allowSelf:false,range:RANGE,outOfRange:'reject'},
  onRelease:[{op:'damage',target:'target',amount:120,damageType:'hero'}],presentation:'presentation.test.rootbreaker-skullcrack'}),
 point:abilitySchema.parse({schemaVersion:1,id:'ability.test.approach-point',name:'Ground slam',description:'',activation:'targeted',ranks:[{}],cast,
  targeting:{filter:{locomotion:['ground']},kind:'point',radius:8,maxTargets:32,alive:true,visible:true,relations:['enemy'],allowSelf:false,range:RANGE,outOfRange:'reject'},
  onRelease:[{op:'damage',target:'target',amount:220,damageType:'hero'}],presentation:'presentation.test.rootbreaker-uproot'}),
};
function fixture(kind:keyof typeof spells='unit'){
 const spell=spells[kind],presentation=testAbilities.presentations.find(p=>p.id===spell.presentation)!;
 const f=createAbilityEncounter(spell,presentation,encounterSettingsSchema.parse({casterDefinition:'unit.test.warrior',targetDefinition:'unit.test.warrior',targetHealth:500,mana:1000,relationship:'enemy',distance:2*RANGE}),false,testSource());
 const c=f.game.context.get(f.caster)!,t=f.game.context.get(f.target)!;
 const aim=spell.targeting.kind==='point'?{kind:'point' as const,position:{x:t.x,y:t.y}}:{kind:'unit' as const,entity:t.id};
 return {...f,spell,c,t,aim,cast:()=>f.game.command(c.owner,{type:'castAbility',actor:c.id,binding:'preview',target:aim})};
}
it.each(['unit','point'] as const)('a %s-aimed cast moves into range before spending mana or casting, then releases once',kind=>{
 const f=fixture(kind),g=f.game,mana=f.c.abilities!.mana,start=precise(f.c);
 expect(f.cast()).toMatchObject({accepted:true});expect(f.c.unit!.order?.type).toBe('castAbility');
 expect(f.c.abilities!.pending).toBeNull();expect(f.c.abilities!.mana).toBe(mana);expect(f.c.abilities!.cooldowns).toEqual({});
 for(let i=0;i<200&&!f.c.abilities!.pending;i++)g.tick();
 expect(f.c.abilities!.pending).not.toBeNull();
 const p=precise(f.c);expect(p.x).toBeGreaterThan(start.x);
 expect(Math.hypot(p.x-f.t.x,p.y-f.t.y)).toBeLessThanOrEqual(RANGE);
 expect(Math.hypot(p.x-f.t.x,p.y-f.t.y)).toBeGreaterThan(RANGE-.5);
 expect(f.c.abilities!.mana).toBe(mana-MANA);
 for(let i=0;i<90;i++)g.tick();expect(f.t.hp).toBeLessThan(500);
 expect(g.abilities.observedEvents().filter(e=>e.ability===f.spell.id&&e.event==='released')).toHaveLength(1);
});
it('tracks a moving target and restores the approach deterministically',()=>{
 const a=fixture(),b=fixture();expect(a.cast().accepted).toBe(true);
 expect(a.game.command(a.t.owner,{type:'move',actors:[a.t.id],destination:{x:140,y:125},attackMove:false}).accepted).toBe(true);
 for(let i=0;i<8;i++)a.game.tick();b.game.restore(JSON.parse(JSON.stringify(a.game.snapshot())));
 for(let i=0;i<220;i++){a.game.tick();b.game.tick();expect(b.game.checksum('full')).toBe(a.game.checksum('full'));}
 expect(a.game.context.get(a.t.id)!.hp).toBeLessThan(500);
});
it.each(['stop','move'] as const)('%s cancels the pending approach without spending mana',type=>{
 const f=fixture();f.cast();for(let i=0;i<3;i++)f.game.tick();
 expect(f.game.command(f.c.owner,type==='stop'?{type,actors:[f.c.id]}:{type,actors:[f.c.id],destination:{x:115,y:115},attackMove:false}).accepted).toBe(true);
 for(let i=0;i<150;i++)f.game.tick();expect(f.c.abilities!.mana).toBe(1000);expect(f.t.hp).toBe(500);
});
it('rejects invalid targets even when outside range and abandons a target that dies en route',()=>{
 const f=fixture();f.t.owner=f.c.owner;f.game.observation.update();expect(f.cast().accepted).toBe(false);expect(f.c.unit!.order).toBeNull();
 f.t.owner='player.2';f.game.observation.update();expect(f.cast().accepted).toBe(true);f.t.hp=0;f.game.onCombatDeath(f.t);f.game.tick();
 expect(f.c.unit!.order).toBeNull();expect(f.c.abilities!.mana).toBe(1000);
});
it('keeps an unreachable cast unspent and obeys the terrain pathfinder',()=>{
 const f=fixture(),s=f.game.context.spatial,start=precise(f.c);
 // Block every cell around the caster; accepting an intention must never teleport it.
 for(let y=114;y<=126;y++)for(let x=114;x<=126;x++)if(x<117||x>123||y<117||y>123)s.terrain[y*s.size+x]=0;
 s.rebuild();expect(f.cast().accepted).toBe(true);
 for(let i=0;i<30;i++)f.game.tick();
 expect(precise(f.c)).toEqual(start);expect(f.c.abilities!.pending).toBeNull();expect(f.c.abilities!.mana).toBe(1000);expect(f.t.hp).toBe(500);
});
