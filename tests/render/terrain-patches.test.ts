import {expect,it,vi} from 'vitest';
import {Frustum,Matrix4,Mesh,MeshStandardMaterial,OrthographicCamera,Raycaster,Scene,Vector3} from 'three';
vi.mock('../../src/render/terrain/terrainMaterial',()=>({TerrainMaterial:class extends MeshStandardMaterial{}}));
import {HeightMesh} from '../../src/render/height/heightMesh';
import {HeightField} from '../../src/shared/map/height';

it('keeps full terrain detail while culling distant patches and raycasting the visible surface',()=>{
 const scene=new Scene(),terrain=new HeightMesh(scene,512),field=new HeightField(512);terrain.setFrom(field);scene.updateMatrixWorld(true);
 const patches=terrain.mesh.children as Mesh[];
 const total=patches.reduce((n,m)=>n+m.geometry.index!.count/3,0);expect(total).toBe(544*544*2);
 const camera=new OrthographicCamera(-20,20,20,-20,.1,100);camera.position.set(128,50,128);camera.up.set(0,0,-1);camera.lookAt(128,0,128);camera.updateMatrixWorld(true);
 const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 const visible=patches.filter(m=>frustum.intersectsObject(m)).reduce((n,m)=>n+m.geometry.index!.count/3,0);
 expect(visible).toBeGreaterThan(0);expect(visible).toBeLessThan(total/10);
 const ray=new Raycaster(new Vector3(400,50,400),new Vector3(0,-1,0));expect(ray.intersectObject(terrain.mesh,true)[0].point.y).toBe(0);
 terrain.destroy(scene);expect(scene.children).toHaveLength(0);
});
it('updates heights and identical slope normals on both sides of a patch boundary',()=>{
 const scene=new Scene(),terrain=new HeightMesh(scene),field=new HeightField();
 field.samples[40*field.verts+32]=2;field.samples[40*field.verts+33]=4;
 terrain.setFrom(field,{loX:32,hiX:33,loZ:40,hiZ:40});scene.updateMatrixWorld(true);
 const shared:{y:number;nx:number;ny:number;nz:number}[]=[];
 for(const child of terrain.mesh.children){const m=child as Mesh,p=m.geometry.getAttribute('position'),n=m.geometry.getAttribute('normal');
  for(let i=0;i<p.count;i++)if(p.getX(i)===16&&p.getZ(i)===24)shared.push({y:p.getY(i),nx:n.getX(i),ny:n.getY(i),nz:n.getZ(i)});
 }
 expect(shared).toHaveLength(2);expect(shared[0]).toEqual(shared[1]);expect(shared[0].y).toBe(2);expect(shared[0].nx).toBeLessThan(0);
 const ray=new Raycaster(new Vector3(16,50,24),new Vector3(0,-1,0));expect(ray.intersectObject(terrain.mesh,true)[0].point.y).toBe(2);
 terrain.destroy(scene);
});
