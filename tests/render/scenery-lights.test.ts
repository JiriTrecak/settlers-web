import {expect,it} from 'vitest';
import {Scene,PointLight} from 'three';
import {SceneryLights} from '../../src/render/prop/sceneryLights';
import {HeightField} from '../../src/shared/map/height';
it('keeps a fixed light budget, transforms emitters and reuses lights after camera movement',()=>{
 const scene=new Scene(),lights=new SceneryLights(scene),field=new HeightField(256);
 lights.sync(Array.from({length:12},(_,i)=>({id:`l${i}`,asset:'lantern-post',x:10+i*2,y:10,yaw:Math.PI/2,scale:2})),field);
 lights.update(10,10);
 const pool=scene.children.filter((o):o is PointLight=>o instanceof PointLight);
 expect(pool).toHaveLength(4);expect(pool.every(l=>l.intensity>0&&!l.castShadow)).toBe(true);
 expect(pool[0].position.x).toBeCloseTo(10.5);expect(pool[0].position.z).toBeCloseTo(10.5-1.56);expect(pool[0].position.y).toBeCloseTo(5.7);
 lights.update(240,240);expect(pool.every(l=>l.intensity===0)).toBe(true);expect(scene.children).toHaveLength(4);
 lights.dispose();expect(scene.children).toHaveLength(0);
});
