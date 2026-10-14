import {expect,it} from 'vitest';
import {abilityOutline} from '../../src/render/settlement/abilityTarget';
import type {AbilityDefinition} from '../../src/content/abilities/schema';
import {testAbilities} from '../fixtures/content';

// Any test ability supplies the unrelated required fields; targeting and delivery are set explicitly here.
const spell=(targeting:Partial<AbilityDefinition['targeting']>,delivery?:AbilityDefinition['delivery']):AbilityDefinition=>{
 const base=structuredClone(testAbilities.abilities[0]);
 return {...base,targeting:{...base.targeting,...targeting} as AbilityDefinition['targeting'],delivery};
};

it('outlines the chosen unit without implying an area damage footprint',()=>{
 const points=abilityOutline({spell:spell({kind:'unit'}),rank:1,origin:{x:0,y:0},point:{x:10,y:12},valid:true});
 expect(points.length).toBeGreaterThan(8);
 for(const p of points)expect(Math.hypot(p.x-10,p.y-12)).toBeCloseTo(.8);
});

it('outlines the declared area radius around a targeted point',()=>{
 const points=abilityOutline({spell:spell({kind:'point',radius:3}),rank:1,origin:{x:0,y:0},point:{x:10,y:12},valid:true});
 for(const p of points)expect(Math.hypot(p.x-10,p.y-12)).toBeCloseTo(3);
});

it('previews the full swept corridor for a directional spell regardless of the aimed distance',()=>{
 const line=spell({kind:'point',radius:2},{kind:'line',speed:22,length:24,width:1.8} as AbilityDefinition['delivery']);
 const points=abilityOutline({spell:line,rank:1,origin:{x:10,y:10},point:{x:10,y:12},valid:true});
 expect(points).toHaveLength(4);
 expect(Math.max(...points.map(p=>p.y))-10).toBeCloseTo(24);
 expect(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x))).toBeCloseTo(3.6);
});
