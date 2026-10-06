import '../fixtures/walkableCatalogue';
import {expect,it} from 'vitest';
import {content,builtinSource} from '../../src/content/builtin';
import {ContentRegistry} from '../../src/content/registry';
import {placementOccupancyError} from '../../src/content/map';
import type {AuthoredDefinition,Placement} from '../../src/content/schema';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
const unit=(id:string,x:number,y:number,definition='unit.ants.warrior'):Placement=>({id,definition,owner:'player.1',position:{x,y},rotation:0});
const map=(entities:Placement[])=>({...emptyUtcMap(),sandbox:true,entities});
it('rejects overlapping circles in different center cells and accepts exact touching or diagonal separation',()=>{
 const m=map([unit('a',32,32),unit('b',34,32)]);
 expect(placementOccupancyError(m,content)).toBe('b: overlaps a');
 m.entities[1].position.x=35;expect(placementOccupancyError(m,content)).toBeNull();
 m.entities[1].position={x:34,y:35};expect(placementOccupancyError(m,content)).toBeNull();
 m.entities[1].definition='unit.ants.bombardier';expect(placementOccupancyError(m,content)).toBe('b: overlaps a');
});
it('checks complete bodies at the map edge, including deferred spawns',()=>{
 const m=map([unit('a',0,32)]);expect(placementOccupancyError(m,content)).toMatch(/body is outside/);
 m.entities[0].activation='script';expect(placementOccupancyError(m,content)).toMatch(/body is outside/);
 m.entities[0].position.x=1;expect(placementOccupancyError(m,content)).toBeNull();
});
it('allows ground/air overlap but still separates airborne bodies',()=>{
 const source=structuredClone(builtinSource);
 const d=source.definitions.find(d=>(d as AuthoredDefinition).id==='unit.ants.archer') as AuthoredDefinition;
 d.behaviors={...d.behaviors,movement:{...content.get(d.id).behaviors.movement!,locomotion:'air'}};
 const registry=new ContentRegistry(source),m=map([unit('a',32,32),unit('b',32,32,d.id)]);
 expect(placementOccupancyError(m,registry)).toBeNull();
 m.entities.push(unit('c',34,32,d.id));expect(placementOccupancyError(m,registry)).toBe('c: overlaps b');
});
it('uses vertical body intervals rather than a fixed two-unit floor threshold',()=>{
 const m={...map([unit('lower',32,32),{...unit('upper',32,32),position:{x:32,y:32,surface:'root'}}]),stamps:[{id:'root',asset:'leafbound-twig-bridge',x:31.5,y:31.5}]};
 expect(placementOccupancyError(m,content)).toBeNull();
 const source=structuredClone(builtinSource),d=source.definitions.find(d=>(d as AuthoredDefinition).id==='unit.ants.warrior') as AuthoredDefinition;
 d.dimensions={...d.dimensions!,height:6};
 expect(placementOccupancyError(m,new ContentRegistry(source))).toBe('upper: overlaps lower');
});
