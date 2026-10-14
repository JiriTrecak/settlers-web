import {expect,it} from 'vitest';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import {previewModelScale} from '../../tooling/src/asset-editor/modelScale';
import {ProjectileEffects} from '../../src/render/settlement/projectileEffects';
import {ShellEffects} from '../../src/render/settlement/shellEffects';
import {HeightField} from '../../src/shared/map/height';
import type {GameState} from '../../src/sim/game/state';
import type {Shell} from '../../src/sim/game/shellState';
import authoring from '../fixtures/content/authoring.json';
import {testContent} from '../fixtures/content';
import {ARCHER,SHELL_SHOOTER,THORN_SHOOTER,flightEffect,syntheticEffectModel,weaponEffects,weaponRegistry} from './weapon-effect-fixture';

it('previews the bound definition size and leaves unbound assets at authored size',()=>{
 // Every definition sharing the warrior asset presents it at the same size.
 const asset=testContent.get('unit.test.warrior').asset;
 const registry=weaponRegistry(defs=>{for(const d of defs)if(d.asset===asset)d.modelScale=2.25;});
 const bound=(definition:string)=>assetDefinitionSchema.parse(authoring.assets.find(a=>a.bindings.render.some(b=>b.id===registry.get(definition).asset)));
 const warrior=bound('unit.test.warrior'),scale=warrior.bindings.render.find(b=>b.geometry)?.scale??1;
 expect(previewModelScale(warrior,registry)).toBe(scale*2.25);
 warrior.bindings.render=[];expect(previewModelScale(warrior,registry)).toBe(1);
 // A building keeps its own definition's presentation size.
 const building=registry.definitions.find(d=>d.kind==='building'&&authoring.assets.some(a=>a.bindings.render.some(b=>b.id===d.asset&&'geometry' in b)))!;
 const hall=bound(building.id);
 expect(previewModelScale(hall,registry)).toBe((hall.bindings.render.find(b=>b.geometry)?.scale??1)*(building.modelScale??1));
});

it('uses per-shooter presentation sizes in the same projectile batch and preserves world trajectories',async()=>{
 const scales:Record<string,number>={[ARCHER]:2,[THORN_SHOOTER]:.75,[SHELL_SHOOTER]:3};
 const registry=weaponRegistry(defs=>{for(const [id,scale] of Object.entries(scales))defs.find(d=>d.id===id)!.modelScale=scale;});
 const effects=weaponEffects(registry),root=new Group(),field=new HeightField();
 const fx=new ProjectileEffects(root,registry,effects,syntheticEffectModel),shells=new ShellEffects(root,registry,effects,syntheticEffectModel,new EffectPlayer());
 await Promise.all([fx.ready,shells.ready]);
 const base={source:1,target:2,owner:'player.1' as const,origin:{x:10,y:10},destination:{x:20,y:10},launched:100,impact:120,damage:10,damageType:'piercing',viewers:['player.1' as const],resolved:false};
 const missiles:GameState['missiles']=[{...base,id:1,definition:ARCHER},{...base,id:2,definition:THORN_SHOOTER}];
 fx.update(110,missiles,field);
 const check=(owner:ProjectileEffects|ShellEffects,unit:string)=>{
  const {id,effect}=flightEffect(registry,effects,unit);
  const mesh=owner.root.getObjectByName(`projectiles.${id}/body`)!.children[0] as InstancedMesh,matrix=new Matrix4();mesh.getMatrixAt(0,matrix);
  expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(scales[unit]*effect.layers[0].size);
  expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(15);
 };
 check(fx,ARCHER);check(fx,THORN_SHOOTER);
 const shell:Shell={...base,id:3,definition:SHELL_SHOOTER,target:base.destination,radius:2,slowPermille:0,slowTicks:1,victims:['player.2']};
 shells.update([shell],field,110);check(shells,SHELL_SHOOTER);
 fx.dispose();shells.dispose();
});
