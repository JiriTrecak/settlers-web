import {expect,it} from 'vitest';
import {biomeById} from '../../src/content/biomes';
import {compileMapScene} from '../../src/shared/authoring/mapScene';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {proceduralFixture} from './fixture';

it('matches unpruned vegetation max-blending exactly across dense trees, meadow grass and river banks',()=>{
 const map=proceduralFixture(),forest=map.authoring!.layers.find(l=>l.id==='forest')!;
 map.authoring!.layers.push({...forest,id:'meadow',recipe:'recipe.meadow.woodland-edge',order:10});
 const {field,generated}=compileMapScene(map,landscapeAssets),assets=new Map(landscapeAssets.map(a=>[a.id,a]));
 const grass=generated!.landformSurface?.grass.slice()??new Float32Array(field.samples.length),trees=new Float32Array(grass.length);
 if(generated!.meadow)for(let i=0;i<grass.length;i++)grass[i]=Math.max(grass[i],generated!.meadow[i]);
 const cover=biomeById(field.biome).groundCover;
 for(const object of generated!.objects){
  const asset=assets.get(object.asset);if(!object.visible||!asset||!['tree','foliage'].includes(asset.kind)||asset.scenery?.includes('water-leaves'))continue;
  const radius=(asset.kind==='tree'?3:cover?.radius??1.3)*object.scale;
  for(let z=Math.max(0,Math.floor(object.z-radius-field.origin));z<=Math.min(field.verts-1,Math.ceil(object.z+radius-field.origin));z++)for(let x=Math.max(0,Math.floor(object.x-radius-field.origin));x<=Math.min(field.verts-1,Math.ceil(object.x+radius-field.origin));x++){
   const wx=x+field.origin,wz=z+field.origin,d=Math.hypot(wx-object.x,wz-object.z);if(d>=radius||field.sample(wx,wz)<field.waterAt(wx,wz)+.15)continue;
   const i=z*field.verts+x,w=(cover?.strength??.8)*(1-d/radius);
   grass[i]=Math.max(grass[i],w);if(asset.kind==='tree')trees[i]=Math.max(trees[i],Math.min(1,w*2));
  }
 }
 expect(field.grassCoverage).toEqual(grass);expect(field.forestCoverage).toEqual(trees);
});
