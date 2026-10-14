import {expect,it} from 'vitest';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {ProjectileEffects} from '../../src/render/settlement/projectileEffects';
import type {GameState} from '../../src/sim/game/state';
import {HeightField} from '../../src/shared';
import {ARCHER,THORN_SHOOTER,flightEffect,syntheticEffectModel,weaponEffects,weaponRegistry} from './weapon-effect-fixture';

const registry=weaponRegistry(),effects=weaponEffects(registry);
async function create(parent=new Group()){const fx=new ProjectileEffects(parent,registry,effects,syntheticEffectModel);await fx.ready;return fx;}
function batchMesh(fx:ProjectileEffects,unit:string){return fx.root.getObjectByName(`projectiles.${flightEffect(registry,effects,unit).id}/body`)!.children[0] as InstancedMesh;}
type Missile=GameState['missiles'][number];
const flight=(over:Partial<Missile>={}):Missile=>({id:1,source:1,target:2,definition:ARCHER,owner:'player.1',origin:{x:10,y:10},destination:{x:20,y:10},launched:100,impact:120,damage:10,damageType:'piercing',viewers:['player.1'],resolved:false,...over});

it('batches authoritative volleys per declared flight effect, uses their impact time, and reuses buffers',async()=>{
 const parent=new Group(),fx=await create(parent),field=new HeightField();
 const shot=(id:number,definition=ARCHER)=>flight({id,definition,origin:{x:0,y:0},destination:{x:10,y:0},launched:10,impact:22});
 const shots=[...Array.from({length:200},(_,i)=>shot(i+1)),shot(201,THORN_SHOOTER)];
 fx.update(16,shots,field);
 expect(fx.root.children.filter(c=>c.visible)).toHaveLength(2);
 const arrows=batchMesh(fx,ARCHER),thorns=batchMesh(fx,THORN_SHOOTER);
 expect(arrows).not.toBe(thorns);expect(arrows.count).toBe(200);expect(thorns.count).toBe(1);
 // Half-way along the flight: horizontal midpoint, vertical midpoint plus the authored arc height.
 const {effect}=flightEffect(registry,effects,ARCHER),arc=effect.layers[0].arcHeight!;
 const matrix=new Matrix4(),point=new Vector3();arrows.getMatrixAt(0,matrix);point.setFromMatrixPosition(matrix);
 expect(point.x).toBeCloseTo(5);
 expect(point.y).toBeCloseTo(((field.walkSample(0,0)+1.5)+(field.walkSample(10,0)+1))/2+arc);
 expect([...arrows.instanceMatrix.array].every(Number.isFinite)).toBe(true);
 expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo((registry.get(ARCHER).modelScale??1)*effect.layers[0].size);
 fx.update(22,shots,field);expect(arrows.count).toBe(0);expect(arrows.visible).toBe(false);
 fx.update(24,[{...shot(202),launched:23,impact:35}],field);
 expect(batchMesh(fx,ARCHER)).toBe(arrows);expect(arrows.count).toBe(1);
 fx.dispose();expect(parent.children).toHaveLength(0);
});

it('captures the launch point once at release, follows the observed target and retires at authoritative impact',async()=>{
 const fx=await create(),field=new HeightField(),shot=flight();
 const bow=new Vector3(10.4,1.1,10.1);let calls=0;
 const resolve=()=>{calls++;return bow;};
 fx.update(99,[shot],field,resolve);expect(calls).toBe(0);expect(fx.root.children.every(c=>!c.visible)).toBe(true);
 fx.update(100,[shot],field,resolve);
 const mesh=batchMesh(fx,ARCHER);
 const position=()=>{const m=new Matrix4();mesh.getMatrixAt(0,m);return new Vector3().setFromMatrixPosition(m);};
 expect(position().distanceTo(bow)).toBeLessThan(.00001);
 bow.set(99,99,99);shot.destination={x:22,y:12};fx.update(110,[shot],field,resolve);
 expect(calls).toBe(1);expect(position().x).toBeCloseTo((10.4+22)/2);expect(position().z).toBeCloseTo((10.1+12)/2);
 // Shooter removal cannot alter an already sampled origin.
 fx.update(119.999,[shot],field,()=>undefined);
 expect(position().distanceTo(new Vector3(22,field.walkSample(22,12)+1,12))).toBeLessThan(.002);
 fx.update(120,[shot],field,resolve);expect(mesh.count).toBe(0);
 fx.dispose();
});

it('never samples a moved shooter for late or newly revealed flights',async()=>{
 const fx=await create(),field=new HeightField(),shot=flight();
 let calls=0;const resolve=()=>{calls++;return new Vector3(99,99,99);};
 fx.update(105,[shot],field,resolve);expect(calls).toBe(0);
 const mesh=batchMesh(fx,ARCHER),matrix=new Matrix4();mesh.getMatrixAt(0,matrix);
 expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(12.5);
 fx.update(106,[],field,resolve);expect(mesh.count).toBe(0);
 fx.update(107,[shot],field,resolve);expect(calls).toBe(0);
 fx.update(140,[{...shot,launched:140,impact:160}],field,()=>undefined);
 mesh.getMatrixAt(0,matrix);expect(new Vector3().setFromMatrixPosition(matrix).x).toBe(10);
 fx.dispose();
});

it('shares the exact curved weapon pose with enhancement effects and clears it on impact or hiding',async()=>{
 const fx=await create(),field=new HeightField();
 const shot=flight({damage:25,enhancement:{rank:1,ability:'ability.test.enhanced-shot',bonus:10,cast:42}});
 fx.update(100,[shot],field,()=>new Vector3(10.4,2.4,10.3));
 fx.update(110.5,[shot],field,()=>undefined);
 const mesh=batchMesh(fx,ARCHER),matrix=new Matrix4();mesh.getMatrixAt(0,matrix);
 const pose=fx.effectPose(42)!;expect(pose.position.distanceTo(new Vector3().setFromMatrixPosition(matrix))).toBeLessThan(.00001);expect(pose.direction.length()).toBeCloseTo(1);
 expect(fx.effectPose(43)).toBeUndefined();
 fx.update(111,[],field);expect(fx.effectPose(42)).toBeUndefined();
 fx.update(112,[shot],field);expect(fx.effectPose(42)).toBeDefined();fx.update(120,[shot],field);expect(fx.effectPose(42)).toBeUndefined();fx.dispose();
});
