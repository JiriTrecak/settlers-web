import {expect,it} from 'vitest';
import {Group,InstancedMesh,Mesh} from 'three';
import {SpellEffects} from '../../src/render/settlement/spellEffects';
import {EFFECT_PRESETS,EFFECT_BUDGET,layerLife,effectLayerSchema} from '../../src/content/effectLayers';
import {spellVisualSchema} from '../../src/content/spells';
import {content} from '../../src/content/builtin';
import {HeightField} from '../../src/shared/map/height';
import type {VisualCue} from '../../src/sim/game/visualCues';
function fixture(preset='Earthquake'){
 const rules=structuredClone(content.rules),ability=Object.keys(rules.spells).find(id=>rules.spells[id].effect==='blast')!,spell=rules.spells[ability];
 rules.spellVisuals[spell.visual].layers=structuredClone(EFFECT_PRESETS[preset]) as typeof rules.spellVisuals[string]['layers'];
 const parent=new Group(),fx=new SpellEffects(parent,()=>rules),field=new HeightField();
 const cue:VisualCue={id:1,ability,rank:1,phase:'impact',tick:0,durationTicks:120,origin:{x:100,y:100},target:{x:100,y:100},viewers:[]};return {rules,spell,parent,fx,field,cue};
}
it('layers use delayed/repeating envelopes, reject invalid authoring and keep timestamps repeatable',()=>{
 const layer=effectLayerSchema.parse({...EFFECT_PRESETS['Earthquake']![1],delay:10,duration:40,repeat:2});
 expect(layerLife(layer,9)).toBeNull();expect(layerLife(layer,50)).toBeNull();expect(layerLife(layer,15)).toEqual(layerLife(layer,35));
 expect(effectLayerSchema.safeParse({...layer,count:129}).success).toBe(false);
 const visual=Object.values(content.rules.spellVisuals)[0]!;
 expect(spellVisualSchema.safeParse({...visual,layers:[layer,layer]}).success).toBe(false);
});
it.each(Object.keys(EFFECT_PRESETS))('%s plays the same layers at the same scrubbed time and cleans up',preset=>{
 const {parent,fx,field,cue}=fixture(preset);fx.update([cue],field,15);
 const parts:Mesh[]=[];parent.traverse(o=>{if(o instanceof Mesh)parts.push(o);});expect(parts.length).toBeGreaterThan(1);
 const instances=parts.filter(o=>o instanceof InstancedMesh);const before=instances.map(m=>Array.from(m.instanceMatrix.array));
 fx.update([cue],field,16);fx.update([cue],field,15);
 const after:unknown[]=[];parent.traverse(o=>{if(o instanceof InstancedMesh)after.push(Array.from(o.instanceMatrix.array));});expect(after).toEqual(before);
 expect(fx.stats.dropped).toBe(0);fx.update([],field,16);expect(parent.children.every(root=>root.children.length===0)).toBe(true);fx.dispose();expect(parent.children).toHaveLength(0);
});
it('bounds a crowded spell storm and does not sample terrain per particle each frame',()=>{
 const {fx,field,cue}=fixture('Ice storm');let samples=0;field.walkSample=()=>{samples++;return 0;};
 const cues=Array.from({length:100},(_,i)=>({...cue,id:i+1}));fx.update(cues,field,15);const first=samples;samples=0;fx.update(cues,field,16);
 expect(fx.stats.cues).toBeLessThanOrEqual(EFFECT_BUDGET.cues);expect(fx.stats.layers).toBeLessThanOrEqual(EFFECT_BUDGET.layers);expect(fx.stats.particles).toBeLessThanOrEqual(EFFECT_BUDGET.particles);expect(fx.stats.dropped).toBeGreaterThan(0);expect(samples).toBeLessThan(first/5);fx.dispose();
});
it('rejects impact layers that would be cut off by the cue lifetime',()=>{
 const visual=Object.values(content.rules.spellVisuals)[0]!;
 const layer=effectLayerSchema.parse({...EFFECT_PRESETS['Heavy impact']![0],delay:10,duration:40});
 expect(spellVisualSchema.safeParse({...visual,durationTicks:49,layers:[layer]}).success).toBe(false);
 expect(spellVisualSchema.safeParse({...visual,durationTicks:50,layers:[layer]}).success).toBe(true);
});
it('retains a casting telegraph for impact-only presets',()=>{
 const {fx,field,cue,parent}=fixture('Heavy impact');
 fx.update([{...cue,phase:'cast',durationTicks:40}],field,10);
 expect(parent.children[0]!.children).toHaveLength(1);expect(fx.stats.layers).toBe(1);fx.dispose();
});
it('counts simple effects against the same global budget as layered effects',()=>{
 const {fx,rules,spell,field,cue}=fixture('Ice storm');
 const other=Object.keys(rules.spells).find(id=>rules.spells[id].visual!==spell.visual)!;
 delete rules.spellVisuals[rules.spells[other].visual].layers;
 const cues=Array.from({length:40},(_,i)=>({...cue,id:i+1,ability:i%2?other:cue.ability}));
 fx.update(cues,field,15);expect(fx.stats.layers).toBeLessThanOrEqual(EFFECT_BUDGET.layers);expect(fx.stats.particles).toBeLessThanOrEqual(EFFECT_BUDGET.particles);fx.dispose();
});
