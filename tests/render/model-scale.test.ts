import {expect,it} from 'vitest';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {ContentRegistry} from '../../src/content/registry';
import type {AuthoredDefinition} from '../../src/content/schema';
import {assetDefinitionSchema} from '../../src/shared/authoring/asset';
import published from '../../assets/authoring/published.json';
import {previewModelScale} from '../../tooling/src/asset-editor/modelScale';
import {ProjectileEffects} from '../../src/render/settlement/projectileEffects';
import {ShellEffects} from '../../src/render/settlement/shellEffects';
import {HeightField} from '../../src/shared/map/height';
import type {GameState} from '../../src/sim/game/state';
import type {Shell} from '../../src/sim/game/shellState';
import {source} from '../game/helpers';

it('previews the bound definition size and leaves unbound assets at authored size',()=>{
 const raw=source();(raw.definitions as AuthoredDefinition[]).find(d=>d.id==='unit.ants.warrior')!.modelScale=2.25;
 const registry=new ContentRegistry(raw);
 const warrior=assetDefinitionSchema.parse(published.assets.find(a=>a.id==='asset.models.units.ants-warrior'));
 expect(previewModelScale(warrior,registry)).toBe(2.25);
 warrior.bindings.render=[];expect(previewModelScale(warrior,registry)).toBe(1);
 const hall=assetDefinitionSchema.parse(published.assets.find(a=>a.id==='asset.models.buildings.ants-acorn-hall'));
 expect(previewModelScale(hall,registry)).toBe((hall.bindings.render.find(b=>b.geometry)?.scale??1)*(registry.get('building.ants.fort').modelScale??1));
});

it('uses per-shooter presentation sizes in the same projectile batch and preserves world trajectories',()=>{
 const raw=source(),defs=raw.definitions as AuthoredDefinition[];
 defs.find(d=>d.id==='unit.ants.archer')!.modelScale=2;
 defs.find(d=>d.id==='unit.neutral.spitter')!.modelScale=.75;
 defs.find(d=>d.id==='unit.ants.bombardier')!.modelScale=3;
 const registry=new ContentRegistry(raw),root=new Group(),field=new HeightField();
 const fx=new ProjectileEffects(root,registry),shells=new ShellEffects(root,registry);
 const base={source:1,target:2,owner:'player.1' as const,origin:{x:10,y:10},destination:{x:20,y:10},launched:100,impact:120,damage:10,damageType:'piercing',viewers:['player.1' as const],resolved:false};
 const missiles:GameState['missiles']=[{...base,id:1,definition:'unit.ants.archer'},{...base,id:2,definition:'unit.neutral.spitter'}];
 fx.update(110,missiles,field);
 for(const [kind,scale] of [['arrow',2],['thorn',.75]] as const){
  const mesh=fx.root.getObjectByName('projectiles.'+kind) as InstancedMesh,matrix=new Matrix4();mesh.getMatrixAt(0,matrix);
  expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(scale);
  expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(15);
 }
 const shell:Shell={...base,id:3,definition:'unit.ants.bombardier',target:base.destination,radius:2,slowPermille:0,slowTicks:1,victims:['player.2']};
 shells.update([shell],field,110);
 const ball=root.children.at(-1)!.children[0] as InstancedMesh,matrix=new Matrix4();ball.getMatrixAt(0,matrix);
 expect(new Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(3);
 expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo(15);
 fx.dispose();shells.dispose();
});
