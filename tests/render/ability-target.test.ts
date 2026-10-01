import {expect,it} from 'vitest';
import {abilityOutline} from '../../src/render/settlement/abilityTarget';
import {coreAbilities} from '../../src/content/abilities/core';
it('outlines the chosen unit without implying an area damage footprint',()=>{
 const points=abilityOutline({spell:coreAbilities.abilities[0],rank:1,origin:{x:0,y:0},point:{x:10,y:12},valid:true});
 for(const p of points)expect(Math.hypot(p.x-10,p.y-12)).toBeCloseTo(.8);
});

it('previews the full swept corridor for a directional spell',async()=>{
 const {abilitySchema}=await import('../../src/content/abilities/schema');
 const {default:raw}=await import('../../content/abilities/ability.core.shockwave/definition.json');
 const spell=abilitySchema.parse(raw);
 const points=abilityOutline({spell,rank:1,origin:{x:10,y:10},point:{x:10,y:12},valid:true});
 expect(points).toHaveLength(4);
 expect(Math.max(...points.map(p=>p.y))-10).toBe(24);
 expect(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))).toBeCloseTo(3.6);
});
