import {expect,it} from 'vitest';
import {Box3,Vector3,Group,Mesh,BoxGeometry,MeshBasicMaterial,OrthographicCamera,SkinnedMesh,Skeleton,Bone,Uint16BufferAttribute,Float32BufferAttribute} from 'three';
import {Camera} from '../../src/render/camera/camera';
import {visibleBounds,frameBounds,inspectionCapture} from '../../tooling/spell-editor/src/framing';
it.each([.4,1,inspectionCapture.aspect,2.6])('frames off-axis elevated groups inside the actual camera at aspect %s',aspect=>{
 const box=new Box3(new Vector3(93,4,138),new Vector3(109,15,151)),pose=frameBounds(box,aspect),camera=new Camera();camera.minZoom=1;camera.maxZoom=80;camera.setGame(false);camera.pose(pose);
 const view=new OrthographicCamera();camera.applyTo(view,aspect*1000,1000);view.updateMatrixWorld();
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new Vector3(x,y,z).project(view);expect(Math.abs(p.x)).toBeLessThan(.81);expect(Math.abs(p.y)).toBeLessThan(.81);}
});
it('ignores invisible and faded particles so dead effects do not zoom the camera into empty space',()=>{
 const root=new Group(),a=new Mesh(new BoxGeometry(2,4,2),new MeshBasicMaterial()),hidden=new Mesh(new BoxGeometry(100,100,100),new MeshBasicMaterial()),faded=new Mesh(new BoxGeometry(100,100,100),new MeshBasicMaterial({transparent:true,opacity:0}));a.position.set(10,2,20);hidden.visible=false;root.add(a,hidden,faded);
 expect(visibleBounds([root])).toEqual(new Box3(new Vector3(9,0,19),new Vector3(11,4,21)));
});

it('fits a newly moved and scaled skinned actor before the first render',()=>{
 const geometry=new BoxGeometry(1,2,1),count=geometry.attributes.position.count;
 geometry.setAttribute('skinIndex',new Uint16BufferAttribute(new Uint16Array(count*4),4));const weights=new Float32Array(count*4);for(let i=0;i<count;i++)weights[i*4]=1;geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));
 const mesh=new SkinnedMesh(geometry,new MeshBasicMaterial()),bone=new Bone(),root=new Group();mesh.add(bone);mesh.bind(new Skeleton([bone]));root.add(mesh);root.updateMatrixWorld(true);
 root.position.set(126,0,120);root.scale.setScalar(1.7);
 const bounds=visibleBounds([root]);expect(bounds.getCenter(new Vector3()).distanceTo(new Vector3(126,0,120))).toBeLessThan(.001);expect(bounds.getSize(new Vector3()).y).toBeCloseTo(3.4);
 geometry.dispose();mesh.material.dispose();mesh.skeleton.dispose();
});
