import {it,expect,vi} from 'vitest';
import {Vector3} from 'three';
import {visibleBounds} from '../../tooling/spell-editor/src/framing';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {EffectTrail} from '../../src/render/abilities/effectTrail';
import {TrailHistory} from '../../src/shared/effects/trailHistory';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {presentationSchema} from '../../src/content/abilities/schema';
const trail={durationTicks:20,maxPoints:16,width:.4,colour:'#88ff99',opacity:.7,breakDistance:3};
const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.trail',name:'Trail',durationTicks:80,layers:[{id:'head',shape:'missile',colour:'#ffffff',accent:'#ffffff',durationTicks:80,count:1,size:.4,height:0,trail}]});
it('bounds histories, replaces repeated ticks, clears future observations on rewind and expires idle paths',()=>{
 const h=new TrailHistory();for(let tick=0;tick<500;tick++)h.record(tick,Array.from({length:100},(_,cast)=>({cast,x:tick,y:cast,z:0})));
 expect(h.snapshot()).toHaveLength(64);expect(h.snapshot().every(p=>p.points.length<=82)).toBe(true);
 h.record(499,[{cast:0,x:999,y:0,z:0}]);expect(h.snapshot()[0].points.at(-1)?.x).toBe(999);
 h.record(10,[{cast:7,x:1,y:2,z:3}]);expect(h.snapshot()).toEqual([{cast:7,points:[{tick:10,x:1,y:2,z:3}]}]);
 h.record(100,[]);expect(h.snapshot()).toEqual([]);
});
it('draws bounded world-space ribbons, breaks teleports and fades/cleans their geometry',()=>{
 const t=new EffectTrail({...trail,maxPoints:4});try{
  t.sample(3,[{tick:0,x:0,y:0,z:0},{tick:1,x:1,y:0,z:0},{tick:2,x:1,y:0,z:1},{tick:3,x:100,y:0,z:1}]);
  expect(t.geometry.drawRange.count).toBe(12);expect(t.geometry.attributes.position.count).toBe(18);
  expect(t.geometry.boundingBox?.max.x).toBeGreaterThanOrEqual(100);
  t.sample(100,[{tick:0,x:0,y:0,z:0}]);expect(t.mesh.visible).toBe(false);expect(t.geometry.drawRange.count).toBe(0);
  const disposed=vi.spyOn(t.geometry,'dispose');t.dispose();expect(disposed).toHaveBeenCalledOnce();
 }finally{t.dispose();}
});
it('reconstructs standalone trails at arbitrary seek times and stops all owned geometry',()=>{
 const p=new EffectPlayer();try{
  const h=p.play(effect,{source:{x:0,y:0},target:{x:8,y:0}});p.update(40);
  const ribbon=p.root.getObjectByName('effect.trail') as EffectTrail['mesh'];expect(ribbon.visible).toBe(true);
  const first=Array.from(ribbon.geometry.attributes.position.array);p.update(50);p.update(40);expect(Array.from(ribbon.geometry.attributes.position.array)).toEqual(first);
  const dispose=vi.spyOn(ribbon.geometry,'dispose');p.stop(h);expect(p.liveCues).toBe(0);expect(dispose).toHaveBeenCalledOnce();
 }finally{p.dispose();}
});
it('uses observed curved delivery history rather than straight target chords and removes it when the delivery disappears',()=>{
 const p=new AbilityEffects(()=>[effect]),presentation=presentationSchema.parse({schemaVersion:1,id:'presentation.test.trail',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'flight',effect:effect.id,event:'projectile',anchor:'target',lifetime:'finite'}]});
 try{
  const points=[{tick:1,x:0,y:2,z:0},{tick:2,x:1,y:3,z:0},{tick:3,x:1,y:3,z:1}];
  p.syncDeliveries([{cast:1,ability:'ability.test.trail',position:{x:1,y:1,height:3},direction:{x:0,y:1},tick:3}],()=>presentation,()=>0,[{cast:1,points}]);
  p.update(3,undefined,()=>({position:new Vector3(1,3,1),direction:new Vector3(0,0,1)}));
  const ribbon=p.root.getObjectByName('effect.trail') as EffectTrail['mesh'];expect(ribbon.geometry.drawRange.count).toBe(12);expect(ribbon.geometry.boundingBox?.min.x).toBeLessThan(0);expect(ribbon.geometry.boundingBox?.min.y).toBeLessThan(2);
  const dispose=vi.spyOn(ribbon.geometry,'dispose');p.syncDeliveries([],()=>presentation);expect(p.liveCues).toBe(0);expect(dispose).toHaveBeenCalledOnce();
  p.syncDeliveries([{cast:1,ability:'ability.test.trail',position:{x:2,y:1,height:3},direction:{x:1,y:0},tick:4}],()=>presentation);p.update(4);expect(p.root.getObjectByName('effect.trail')?.visible).toBe(false);
 }finally{p.dispose();}
});
it('rejects unsupported trail attachments and unbounded ribbon settings',()=>{
 const invalid=structuredClone(effect);invalid.layers[0].shape='glow';expect(visualEffectSchema.safeParse(invalid).success).toBe(false);
 invalid.layers[0].shape='missile';invalid.layers[0].trail!.maxPoints=1000;expect(visualEffectSchema.safeParse(invalid).success).toBe(false);
});
it('resets an analytical trail at each standalone loop instead of stretching across cycle boundaries',()=>{
 const p=new EffectPlayer();try{
  p.play({...effect,loop:true,durationTicks:80},{source:{x:0,y:0},target:{x:8,y:0}});p.update(40);
  const ribbon=p.root.getObjectByName('effect.trail') as EffectTrail['mesh'],first=Array.from(ribbon.geometry.attributes.position.array);
  p.update(120);expect(Array.from(ribbon.geometry.attributes.position.array)).toEqual(first);
 }finally{p.dispose();}
});

it('does not join paths across a disappearance and later re-observation',()=>{
 const h=new TrailHistory();h.record(1,[{cast:1,x:0,y:0,z:0}]);h.record(2,[]);h.record(3,[{cast:1,x:1,y:0,z:0}]);
 expect(h.snapshot()).toEqual([{cast:1,points:[{tick:3,x:1,y:0,z:0}]}]);
});

it('frames only the drawn ribbon vertices rather than unused capacity at the world origin',()=>{
 const t=new EffectTrail({...trail,maxPoints:64});try{
  t.sample(2,[{tick:1,x:120,y:2,z:120},{tick:2,x:121,y:2,z:120}]);
  const bounds=visibleBounds([t.mesh]);expect(bounds.min.x).toBeGreaterThan(119);expect(bounds.min.z).toBeGreaterThan(119);
  t.sample(50,[]);expect(visibleBounds([t.mesh]).isEmpty()).toBe(true);
 }finally{t.dispose();}
});
