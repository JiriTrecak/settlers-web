import {coreEffects} from '../../src/content/effects/library';
import {visualEffectSchema} from '../../src/content/effects/schema';
import {expect,it,vi} from 'vitest';
import {TextureLoader,Texture,Mesh} from 'three';
import {AbilityEffects} from '../../src/render/abilities/abilityEffects';
import {sampleCueMotion} from '../../src/render/abilities/cueMotion';
import {coreAbilities} from '../../src/content/abilities/core';
import {presentationSchema} from '../../src/content/abilities/schema';

it('samples independent rotation and eased/bouncing pulses at reproducible tick positions',()=>{
 const motion={rotation:{periodTicks:320,direction:'clockwise' as const},scale:{periodTicks:80,min:.7,max:1.1,easing:'bounce' as const},opacity:{periodTicks:80,min:.4,max:1,easing:'sine' as const}};
 expect(sampleCueMotion(motion,80).rotation).toBeCloseTo(-Math.PI/2);
 expect(sampleCueMotion(motion,320)).toEqual(sampleCueMotion(motion,0));
 expect(sampleCueMotion(motion,0).scale).toBeCloseTo(.7);
 expect(sampleCueMotion(motion,40).scale).toBeCloseTo(1.1);
 expect(sampleCueMotion(motion,40).opacity).toBe(1);
 for(let tick=0;tick<320;tick++){const sample=sampleCueMotion(motion,tick);expect(sample.scale).toBeGreaterThanOrEqual(.7);expect(sample.scale).toBeLessThanOrEqual(1.100001);}
 const earlier=sampleCueMotion(motion,19.5);sampleCueMotion(motion,240);expect(sampleCueMotion(motion,19.5)).toEqual(earlier);
});

it.each(['vampiric-aura','thorns-aura'])('%s keeps all three layers steady beyond five seconds, follows movement and clears on status loss',name=>{
 const loader=vi.spyOn(TextureLoader.prototype,'load').mockReturnValue(new Texture()),fx=new AbilityEffects(),fresh=new AbilityEffects();
 const p=coreAbilities.presentations.find(p=>p.id==='presentation.core.'+name)!;
 const entity={id:2,x:4,y:5,hp:100,spellStatuses:[{ability:'ability.core.'+name,cast:1,source:1,started:1,expires:2,aura:true}]};
 const sync=(tick:number)=>{entity.spellStatuses[0].started=tick;entity.spellStatuses[0].expires=tick+1;fx.syncStatuses([entity],tick,()=>p);fx.update(tick,()=>({x:9,y:12,height:3}));};
 try{
  sync(1);expect(fx.liveCues).toBe(3);const roots=[...fx.root.children];const glow=roots[0].children[0] as Mesh;
  const opacity=(glow.material as any).opacity;
  sync(201);sync(801);expect(fx.root.children).toEqual(roots);expect((glow.material as any).opacity).toBe(opacity);
  expect(roots.every(r=>r.position.x===9&&r.position.z===12&&r.position.y===3.035)).toBe(true);
  fresh.syncStatuses([entity],801,()=>p);fresh.update(801);
  expect(fresh.root.children.map(r=>r.children[0].scale.toArray())).toEqual(roots.map(r=>r.children[0].scale.toArray()));
  expect(fresh.root.children.map(r=>r.children[0].rotation.toArray())).toEqual(roots.map(r=>r.children[0].rotation.toArray()));
  fx.syncStatuses([{...entity,spellStatuses:[]}],802,()=>p);expect(fx.liveCues).toBe(0);
  fx.syncStatuses([{...entity,hp:0}],801,()=>p);expect(fx.liveCues).toBe(0);
  fx.syncStatuses([entity],803,()=>p);expect(fx.liveCues).toBe(0);
 }finally{fx.dispose();fresh.dispose();loader.mockRestore();}
});

it('validates animation ranges and status-bound lifecycle declarations',()=>{
 const p=structuredClone(coreAbilities.presentations.find(p=>p.id==='presentation.core.vampiric-aura')!);
 p.effects[0].event='released';expect(presentationSchema.safeParse(p).success).toBe(false);
 const e=structuredClone(coreEffects.find(e=>e.id===p.effects[0].effect)!);
 e.layers[1].motion!.rotation!.periodTicks=0;expect(visualEffectSchema.safeParse(e).success).toBe(false);
 e.layers[1].motion!.rotation!.periodTicks=320;e.layers[2].motion!.scale!.max=.1;expect(visualEffectSchema.safeParse(e).success).toBe(false);
});
