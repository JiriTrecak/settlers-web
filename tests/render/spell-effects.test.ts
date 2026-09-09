import {expect,it} from 'vitest';
import {Group,InstancedMesh,Mesh,MeshBasicMaterial} from 'three';
import {SpellEffects} from '../../src/render/settlement/spellEffects';
import {content} from '../../src/content/builtin';
import {HeightField} from '../../src/shared/map/height';
import type {VisualCue} from '../../src/sim/game/visualCues';

it('uses draft declarations in the gameplay renderer and rebuilds them on replay without retaining meshes',()=>{
 const rules=structuredClone(content.rules),parent=new Group(),effects=new SpellEffects(parent,()=>rules),field=new HeightField();
 const ability=Object.keys(rules.spells).find(id=>rules.spells[id].effect==='blast')!;
 const spell=rules.spells[ability],visual=rules.spellVisuals[spell.visual];
 visual.color='#123456';visual.particles=7;
 const cue:VisualCue={id:1,ability,rank:1,phase:'impact',tick:0,durationTicks:40,origin:{x:100,y:100},target:{x:100,y:100},viewers:[]};
 effects.update([cue],field,10);
 const root=parent.children[0],burst=root.children[0];
 expect(burst.children.length).toBe(2);
 expect((burst.children[1] as InstancedMesh).count).toBe(7);
 const material=(burst.children[0] as Mesh).material as MeshBasicMaterial;
 expect(material.color.getHexString()).toBe('123456');
 let disposed=false;material.addEventListener('dispose',()=>disposed=true);
 effects.reset();expect(disposed).toBe(true);expect(root.children).toHaveLength(0);
 visual.particles=2;visual.color='#abcdef';effects.update([cue],field,5);
 expect(root.children[0].children).toHaveLength(2);
 expect((root.children[0].children[1] as InstancedMesh).count).toBe(2);
 expect(((root.children[0].children[0] as Mesh).material as MeshBasicMaterial).color.getHexString()).toBe('abcdef');
 effects.update([],field,6);expect(root.children).toHaveLength(0);
 effects.dispose();expect(parent.children).toHaveLength(0);
});
