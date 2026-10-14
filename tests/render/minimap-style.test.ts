import {expect,it} from 'vitest';
import {sceneryKind,terrainPixel} from '../../src/render/minimap/terrainStyle';
it('gives deep water a darker blue hue than the pale shallow shelves',()=>{
 const shallow=terrainPixel([123,119,81],-.1,0,0,0,10,10),deep=terrainPixel([123,119,81],-5,0,0,0,10,10);
 expect(deep[0]).toBeLessThan(shallow[0]);expect(deep[2]).toBeGreaterThan(deep[0]);expect(shallow[1]).toBeGreaterThan(shallow[0]);
});
it('keeps cartographic grain deterministic and shades slopes by light direction',()=>{
 const args=[123,119,81];expect(terrainPixel(args,3,0,1,1,10,10)).toEqual(terrainPixel(args,3,0,1,1,10,10));
 expect(terrainPixel(args,3,0,-1,-1,10,10)[0]).toBeGreaterThan(terrainPixel(args,3,0,1,1,10,10)[0]);
 expect(sceneryKind('tree_primary')).toBe('tree');expect(sceneryKind('rock_formation')).toBe('rock');expect(sceneryKind('grass_03')).toBeNull();
});
