import {it,expect,vi} from 'vitest';
import {Mesh,Raycaster,Scene,Texture,TextureLoader,Vector3} from 'three';
import {ceilingGeometry,InteriorCeiling} from '../../src/render/terrain/interiorCeiling';

it('closes a room from below without reducing the authored clearance',()=>{
  const geometry=ceilingGeometry(256,18),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
  for(let i=0;i<positions.count;i++){
    expect(positions.getY(i)).toBeGreaterThanOrEqual(18);
    expect(positions.getY(i)).toBeLessThanOrEqual(19.6);
    expect(normals.getY(i)).toBeLessThan(-.9);
  }
  const mesh=new Mesh(geometry);mesh.updateMatrixWorld();
  expect(new Raycaster(new Vector3(79,4,188),new Vector3(0,1,0)).intersectObject(mesh).length).toBeGreaterThan(0);
  expect(new Raycaster(new Vector3(79,25,188),new Vector3(0,-1,0)).intersectObject(mesh)).toHaveLength(0);
  geometry.dispose();
});
it('keeps the roof out of RTS and outdoor views and releases replaced geometry',()=>{
  const loader=vi.spyOn(TextureLoader.prototype,'load').mockImplementation(()=>new Texture());
  try {
    const scene=new Scene(),ceiling=new InteriorCeiling(scene),environment={interior:true,ceilingHeight:18,hour:10,season:'summer' as const,playing:false};
    ceiling.configure(256,environment);const roof=scene.children[0] as Mesh,disposed=vi.spyOn(roof.geometry,'dispose');
    expect(roof.visible).toBe(false);ceiling.update(true);expect(roof.visible).toBe(true);
    ceiling.update(false);expect(roof.visible).toBe(false);
    ceiling.configure(256,environment);expect(scene.children[0]).toBe(roof);expect(disposed).not.toHaveBeenCalled();
    ceiling.configure(256,{...environment,ceilingHeight:20});expect(disposed).toHaveBeenCalledOnce();
    ceiling.configure(256,{...environment,interior:false});expect(scene.children).toHaveLength(0);
    ceiling.dispose();
  }finally{loader.mockRestore();}
});
