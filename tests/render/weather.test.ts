import {expect,it} from 'vitest';
import {Matrix4,OrthographicCamera,Scene,Vector3} from 'three';
import {WeatherLayer} from '../../src/render/sky/weatherLayer';
import {emptyLandscape,parseLandscape} from '../../src/shared/landscape/curve';
import {HeightField} from '../../src/shared/map/height';
it('validates map-authored weather and keeps existing clear maps effect-free',()=>{
 const landscape=emptyLandscape();expect(parseLandscape(landscape)).toBeDefined();
 landscape.environment.weather={kind:'rain',intensity:.5,windX:2,windZ:-1};expect(parseLandscape(landscape)).toBeDefined();
 expect(parseLandscape({...landscape,environment:{...landscape.environment,weather:{...landscape.environment.weather,intensity:10}}})).toBeUndefined();
});
it('bounds weather to one camera-local instance batch, switches precipitation and disables cleanly',()=>{
 const scene=new Scene(),weather=new WeatherLayer(scene),camera=new OrthographicCamera(),field=new HeightField();
 expect(weather.mesh.visible).toBe(false);expect(weather.mesh.count).toBe(0);
 weather.configure({kind:'rain',intensity:.5,windX:2,windZ:-1});weather.update(10000,200,200,camera,field);
 expect(scene.children).toHaveLength(1);expect(weather.mesh.count).toBe(384);
 const m=new Matrix4(),p=new Vector3();
 for(let i=0;i<weather.mesh.count;i++){weather.mesh.getMatrixAt(i,m);p.setFromMatrixPosition(m);expect(p.x).toBeGreaterThanOrEqual(152);expect(p.x).toBeLessThan(248);expect(p.z).toBeGreaterThanOrEqual(152);expect(p.z).toBeLessThan(248);expect(p.y).toBeGreaterThanOrEqual(field.sample(p.x,p.z));}
 const rain=weather.mesh.geometry;weather.configure({kind:'snow',intensity:1,windX:0,windZ:0});weather.update(12000,300,300,camera,field);expect(weather.mesh.geometry).not.toBe(rain);expect(weather.mesh.count).toBe(768);
 weather.configure();const version=weather.mesh.instanceMatrix.version;weather.update(14000,300,300,camera,field);expect(weather.mesh.visible).toBe(false);expect(weather.mesh.instanceMatrix.version).toBe(version);
 weather.dispose();expect(scene.children).toHaveLength(0);
});
