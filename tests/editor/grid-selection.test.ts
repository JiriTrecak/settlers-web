import {EditorControl} from '../../src/editor/control/editorControl';
import {expect,it,vi} from 'vitest';
import {WorldEditor} from '../../src/editor/world/worldEditor';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
function editor(){const value=new WorldEditor({} as HTMLCanvasElement,{host:{} as HTMLElement});value.replace(emptyUtcMap());value['terrainPoints']=[{x:16,z:16},{x:31,z:31}];return value;}
it('keeps a failed grid selection available and allows retry',async()=>{
 const value=editor(),points=value['terrainPoints'],edit=vi.spyOn(value,'editGridTerrain').mockRejectedValueOnce(Error('Apply generator previews first')).mockResolvedValue({samples:1} as any);
 await expect(value.applyTerrainCurve()).rejects.toThrow('Apply generator previews first');expect(value['terrainPoints']).toBe(points);expect(value.applyingTerrain).toBe(false);
 await value.applyTerrainCurve();expect(edit).toHaveBeenCalledTimes(2);expect(value['terrainPoints']).toEqual([]);
});
it('applies once while pending and leaves a newly drawn selection intact',async()=>{
 const value=editor();let done!:()=>void;
 const edit=vi.spyOn(value,'editGridTerrain').mockImplementation(()=>new Promise(resolve=>done=()=>resolve({samples:1} as any)));
 const pending=value.applyTerrainCurve();expect(value.applyTerrainCurve()).toBe(pending);expect(value.applyingTerrain).toBe(true);expect(edit).toHaveBeenCalledOnce();
 value.clearTerrainCurve();const next=[{x:40,z:40},{x:47,z:47}];value['terrainPoints']=next;
 done();await pending;expect(value['terrainPoints']).toBe(next);expect(value.applyingTerrain).toBe(false);
});
it('sends UI ramp and bank settings through the shared grid operation',async()=>{
 const value=editor(),points=value['terrainPoints'];const edit=vi.spyOn(value,'editGridTerrain').mockResolvedValue({samples:1} as any);
 value.terrainMode='grid-ramp';value.terrainRampFromLevel=1;value.terrainRampToLevel=3;value.terrainRampDirection='west';
 await value.applyTerrainCurve();expect(edit).toHaveBeenLastCalledWith(expect.objectContaining({operation:{type:'ramp',fromLevel:1,toLevel:3,direction:'west'}}));
 value['terrainPoints']=points;value.terrainMode='grid-level';value.terrainGridEdge='bank';value.terrainGridBankCells=2;
 await value.applyTerrainCurve();expect(edit).toHaveBeenLastCalledWith(expect.objectContaining({operation:{type:'level',level:0,edge:'bank',bankCells:2}}));
});
it('undoes and redoes an applied selection as one terrain edit',async()=>{
 const value=editor(),before=value.map.authoring!.terrain;value.terrainGridLevel=2;
 await value.applyTerrainCurve();const after=value.map.authoring!.terrain;expect(after).not.toEqual(before);
 await value.undoLayers();expect(value.map.authoring!.terrain).toEqual(before);
 await value.undoLayers(true);expect(value.map.authoring!.terrain).toEqual(after);
});
it('detaches the previous file before a successful MCP replacement, but not an invalid import',()=>{
 const value=editor(),replace=vi.fn();const control=new EditorControl(value,{} as any,vi.fn(),replace);
 expect(()=>control.dispatch('landscape',{action:'load',map:{v:2}})).toThrow('Invalid map');expect(replace).not.toHaveBeenCalled();
 control.dispatch('landscape',{action:'load',map:emptyUtcMap()});expect(replace).toHaveBeenCalledOnce();
});
it('bounds scene replies and exposes exact object pages without encoded terrain arrays',()=>{
 const value=editor();
 const objects=Array.from({length:205},(_,i)=>({id:`prop.${i}`,asset:'asset.models.environment.canopy-oak',x:20+i%20,z:20+Math.floor(i/20),elevation:0,yaw:0,scale:1,heightMode:'terrain' as const,visible:true,locked:false}));
 value.replace({...value.map,authoring:{...value.map.authoring!,objects}});
 const control=new EditorControl(value,{} as any,vi.fn()),first=control.dispatch('scene',{action:'get'}) as any,second=control.dispatch('scene',{action:'get',offset:200,limit:20}) as any;
 expect(first.scene.objects).toHaveLength(200);expect(first.objectPage).toEqual({offset:0,total:205,nextOffset:200});
 expect(second.scene.objects.map((o:any)=>o.id)).toEqual(objects.slice(200).map(o=>o.id));expect(second.objectPage.nextOffset).toBeNull();
 expect(first.scene.terrain).not.toHaveProperty('heights');expect(first.scene.terrain).toMatchObject({size:256,version:1,materials:[]});expect(JSON.stringify(first).length).toBeLessThan(100000);
});
