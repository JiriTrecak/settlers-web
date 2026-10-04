import {afterEach,expect,it,vi} from 'vitest';
import {Scene} from 'three';
import {HeightField} from '../../src/shared/map/height';
import type {MapStamp} from '../../src/shared/map/utcmap';
const {created}=vi.hoisted(()=>({created:[] as {source:unknown;dispose:ReturnType<typeof vi.fn>;tick:ReturnType<typeof vi.fn>;ready:Promise<void>}[]}));
vi.mock('../../src/render/foliage/importedGrass',()=>({ImportedGrass:class{
 readonly dispose=vi.fn();readonly tick=vi.fn();readonly ready=Promise.resolve();
 constructor(_scene:unknown,readonly source:unknown){created.push(this);}
}}));
import {PlacedGrass} from '../../src/render/foliage/placedGrass';
afterEach(()=>{created.length=0;});
const grass=():MapStamp=>({id:'grass',asset:'reference-grass-test',x:10,y:12,yaw:.4,scale:1.2});
const rock=():MapStamp=>({id:'rock',asset:'rock',x:20,y:20});

it('keeps grass meshes, loading and wind state while unrelated scenery changes',()=>{
 const layer=new PlacedGrass(new Scene()),field=new HeightField(32),g=grass(),r=rock();
 expect(layer.sync([g,r],field)).toEqual([r]);const first=created[0]!;
 for(let i=0;i<5;i++){
  Object.assign(r,{yaw:i*.1});
  expect(layer.sync([{...g},r],field)).toEqual([r]);
 }
 expect(created).toHaveLength(1);expect(first.dispose).not.toHaveBeenCalled();expect(layer.ready).toBe(first.ready);
 layer.tick(1234);expect(first.tick).toHaveBeenCalledWith(1234);
 layer.destroy();expect(first.dispose).toHaveBeenCalledTimes(1);
});

it('rebuilds for real grass transforms, addition/removal, and a new terrain field',()=>{
 const layer=new PlacedGrass(new Scene()),field=new HeightField(32),g=grass();
 layer.sync([g],field);
 // Mutation of a reused record must not corrupt the cached comparison.
 Object.assign(g,{scale:2});layer.sync([g],field);expect(created).toHaveLength(2);expect(created[0]!.dispose).toHaveBeenCalledOnce();
 layer.sync([g,{...g,id:'second',x:15}],field);expect(created).toHaveLength(3);
 layer.sync([g],field);expect(created).toHaveLength(4);
 const higher=new HeightField(32);higher.samples.fill(3);layer.sync([g],higher);expect(created).toHaveLength(5);
 expect(created[4]!.source).toMatchObject({groups:[{instances:[{x:10,z:12,y:3,scale:2,yaw:.4}]}]});
 layer.sync([rock()],higher);expect(created[4]!.dispose).toHaveBeenCalledOnce();expect(created).toHaveLength(5);
 layer.sync([g],higher);expect(created).toHaveLength(6);
 layer.destroy();
});
