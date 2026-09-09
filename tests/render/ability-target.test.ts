import {it,expect} from 'vitest';
import {abilityOutline} from '../../src/render/settlement/abilityTarget';
import {content} from '../../src/content/builtin';
it('previews the actual line width and circular impact radius from the learned rank',()=>{
 const spell=content.rules.spells['spell.marshal.faultline'];
 expect(abilityOutline({spell,rank:1,origin:{x:0,y:0},point:{x:10,y:0},valid:true})).toEqual([{x:0,y:2},{x:10,y:2},{x:10,y:-2},{x:0,y:-2}]);
 const blast=content.rules.spells['spell.marshal.crownfall'],circle=abilityOutline({spell:blast,rank:1,origin:{x:0,y:0},point:{x:10,y:12},valid:true});
 for(const p of circle)expect(Math.hypot(p.x-10,p.y-12)).toBeCloseTo(blast.ranks[0].radius);
});
