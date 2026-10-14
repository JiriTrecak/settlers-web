import {it,expect} from 'vitest';
import {Texture,Box3,Vector3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {missingModelPackage} from '../../tooling/asset-studio/server/authoring/placeholder';
import {TreePlayer} from '../../src/render/prop/treePlayer';

it('the missing-model placeholder is a visible box with valid harvest animations so resource logic remains usable',async()=>{
 const p=await missingModelPackage(),loader=new GLTFLoader().register(()=>({name:'TestTexture',loadTexture:async()=>new Texture()}));
 const gltf=await loader.parseAsync(Uint8Array.from(p.geometry).buffer,'');
 expect(gltf.scene.getObjectByName('MissingModel')!.userData.missingModel).toBe(true);
 expect(new Box3().setFromObject(gltf.scene).getSize(new Vector3()).toArray()).toEqual([1,1,1]);
 const player=new TreePlayer(gltf.scene,gltf.animations),felling={hp:0,lastHitTick:0,fallTick:0,direction:{x:0,y:1}};
 expect(player.sample(felling,20,40,40)).toBe(true);expect(player.state).toBe('fall');
 expect(player.sample(felling,60,40,40)).toBe(true);expect(player.state).toBe('decay');
 expect(player.sample(felling,80,40,40)).toBe(false);player.dispose();
});
