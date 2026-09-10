import {expect,it} from 'vitest';
import type {Rules} from '../../src/content/schema';
import {game,placed,run} from './helpers';
const definition='unit.ants.archer';
function scene(windupTicks=0){
 const g=game([placed('a',definition,205,210),{...placed('b','unit.ants.warrior',211,210),owner:'player.2'},placed('friend','unit.ants.warrior',212,211)],s=>{
  const a=s.definitions.find((d:any)=>d.id===definition)! as any;
  a.behaviors.combat.shell={windupTicks,flightTicks:40,radius:2,slowPermille:200,slowTicks:80};a.behaviors.combat.cooldownTicks=400;
 (s.rules as Rules).research['research.test.shells']={name:'Test shells',description:'',icon:'icon.ants.archer',priority:1,items:[],workTicks:1,effects:[{units:[definition],splashRadius:3,splashSlowPermille:350}]};
 });
 const a=g.entities.find(e=>e.placement==='a')!,b=g.entities.find(e=>e.placement==='b')!,friend=g.entities.find(e=>e.placement==='friend')!;
 // Test the shell system with stationary recipients independently from target acquisition.
 g.combat.shells.launch(a,b);
 return {g,a,b,friend};
}
it('delays impact, hits enemies in its radius, and excludes allies',()=>{
 const {g,b,friend}=scene(),hp=b.hp,friendlyHp=friend.hp;
 expect(g.combat.shells.resolve()).toEqual([]);expect(b.hp).toBe(hp);
 g.state.tick=40;const hits=g.combat.shells.resolve();
 expect(hits.map(h=>h.target)).toEqual([b.id]);expect(friend.hp).toBe(friendlyHp);expect(friend.slows).toBeUndefined();
 expect(g.context.stats(b).moveSpeedPermille).toBe(800);expect(g.combat.shells.resolve()).toEqual([]);
});
it('can be dodged, does not home, and survives the shooter being removed',()=>{
 const {g,a,b}=scene(),shell=g.state.shells[0];b.x+=5;
 g.economy.remove(a);g.state.tick=40;expect(g.combat.shells.resolve()).toEqual([]);expect(shell.target.x).toBe(211);
 const other=scene();other.g.economy.remove(other.a);other.g.state.tick=40;
 const hp=other.b.hp!;other.g.combat.resolve();expect(other.b.hp!).toBeLessThan(hp);
});
it('keeps only the strongest concurrent slow and restores a weaker remaining slow on expiry',()=>{
 const {g,a,b}=scene();g.state.tick=40;g.combat.shells.resolve();
 g.combat.shells.launch(a,b);const strong=g.state.shells[1];strong.slowPermille=350;strong.slowTicks=20;
 g.state.tick=80;g.combat.shells.resolve();expect(g.context.stats(b).moveSpeedPermille).toBe(650);
 g.state.tick=100;g.combat.shells.expire();expect(g.context.stats(b).moveSpeedPermille).toBe(800);
 g.state.tick=120;g.combat.shells.expire();expect(g.context.stats(b).moveSpeedPermille).toBe(1000);
});
it('preserves midflight snapshots and deterministic damage after restore',()=>{
 const {g}=scene();run(g,10);const restored=scene().g;restored.restore(g.snapshot());
 const bad=g.snapshot();bad.state.nextShell=1;expect(()=>g.restore(bad)).toThrow('Invalid saved shell identity');
 run(g,60);run(restored,60);expect(restored.snapshot()).toEqual(g.snapshot());
});
it('does not reveal unseen shell trajectories to another player',()=>{
 const {g,a,b}=scene();a.x=100;a.y=100;b.x=120;b.y=100;g.state.shells=[];g.observation.update();g.combat.shells.launch(a,b);
 expect(g.view('player.2').shells).toEqual([]);expect(g.view().shells).toHaveLength(1);
});
it('normal combat launches a shell instead of applying immediate or duplicate damage',()=>{
 const {g,a,b}=scene();g.state.shells=[];g.state.tick=1;a.unit!.target=b.id;
 const hp=b.hp!;g.combat.resolve();expect(b.hp).toBe(hp);expect(g.state.shells).toHaveLength(1);
 expect(a.unit!.cooldown).toBe(400);g.state.tick=41;g.combat.resolve();expect(b.hp!).toBeLessThan(hp);
 const after=b.hp;g.combat.resolve();expect(b.hp).toBe(after);
});
it('applies splash research to newly launched shots and leaves an existing flight unchanged',()=>{
 const {g,a,b}=scene();

 g.state.research[a.owner]=['research.test.shells'];g.combat.shells.launch(a,b);
 expect(g.state.shells[0]).toMatchObject({radius:2,slowPermille:200});expect(g.state.shells[1]).toMatchObject({radius:3,slowPermille:350});
});

it('holds a mortar windup, releases once on its frame, and preserves it through save',()=>{
 const {g,a,b}=scene(22);g.state.shells=[];a.unit!.target=b.id;
 g.combat.resolve();expect(g.state.shells).toHaveLength(0);expect(a.unit!.shellWindup?.releaseTick).toBe(22);
 const restored=scene(22).g;restored.restore(g.snapshot());
 g.state.tick=21;g.combat.resolve();expect(g.state.shells).toHaveLength(0);
 g.state.tick=22;g.combat.resolve();expect(g.state.shells).toHaveLength(1);expect(g.state.shells[0].launched).toBe(22);
 g.combat.resolve();expect(g.state.shells).toHaveLength(1);
 restored.state.tick=22;restored.combat.resolve();expect(restored.state.shells).toEqual(g.state.shells);
});
it('cancels a mortar windup when interrupted or its target dies',()=>{
 const {g,a,b}=scene(22);g.state.shells=[];a.unit!.target=b.id;g.combat.resolve();
 g.economy.interrupt(a);expect(a.unit!.shellWindup).toBeUndefined();g.state.tick=22;g.combat.resolve();expect(g.state.shells).toHaveLength(0);
 const next=scene(22);next.g.state.shells=[];next.a.unit!.target=next.b.id;next.g.combat.resolve();next.b.hp=0;
 next.g.state.tick=22;next.g.combat.resolve();expect(next.g.state.shells).toHaveLength(0);expect(next.a.unit!.shellWindup).toBeUndefined();
});
