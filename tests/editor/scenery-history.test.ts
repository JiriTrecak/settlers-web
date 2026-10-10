import {expect,it,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
function fixture(locked=false){
 const value=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});
 value.replace({...emptyUtcMap(),stamps:[{id:'existing',asset:'woodland-mushroom-cluster',x:50,y:50,locked}]});return value;
}
it('places, moves, edits and removes scenery in the terrain undo history',async()=>{
 const value=fixture(),initial=value.map.stamps;
 const placed=value.placeAt('woodland-mushroom-cluster',70,70)!;expect(placed).not.toBeNull();
 expect(value.moveStamp(placed.id,80,80,1)).toBe(true);
 expect(value.removeStamp(placed.id)).toBe(true);expect(value.map.stamps).toEqual(initial);
 await value.undoLayers();expect(value.map.stamps.find(s=>s.id===placed.id)).toMatchObject({x:80,y:80,yaw:1});
 await value.undoLayers();expect(value.map.stamps[1]).toEqual(placed);
 await value.undoLayers();expect(value.map.stamps).toEqual(initial);
 await value.undoLayers(true);expect(value.map.stamps[1]).toEqual(placed);
});
it('protects locked scenery from move, rotate, deletion and walk-surface edits',()=>{
 const value=fixture(true),map=value.map;
 expect(value.moveStamp('existing',70,70)).toBe(false);expect(value.removeStamp('existing')).toBe(false);
 value.pickStamp('existing');value.nudgeSelected(1);value.deleteSelected();
 expect(()=>value.setStampWalk('existing',null)).toThrow('locked');expect(value.map).toBe(map);expect(value.layers.canUndo).toBe(false);
});
it('applies brush instances in one undo step and redoes the exact instances',async()=>{
 const value=fixture(),before=value.map.stamps;
 value.kit.add('woodland-mushroom-cluster');value.brush.radius=8;value.brush.density=2.5;value.dabBrush(90,90);
 const random=vi.spyOn(Math,'random').mockReturnValue(.5);
 try{value.applyBrush();}finally{random.mockRestore();}
 const after=value.map.stamps;expect(after.length).toBeGreaterThan(before.length);
 await value.undoLayers();expect(value.map.stamps).toEqual(before);expect(value.layers.canUndo).toBe(false);
 await value.undoLayers(true);expect(value.map.stamps).toEqual(after);
});
