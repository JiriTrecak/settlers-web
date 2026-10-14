import {expect,it} from 'vitest';
import {Group,InstancedMesh,Matrix4,Vector3} from 'three';
import {ShellEffects} from '../../src/render/settlement/shellEffects';
import {EffectPlayer} from '../../src/render/abilities/effectPlayer';
import {HeightField} from '../../src/shared/map/height';
import type {Shell} from '../../src/sim/game/shellState';
import {SHELL_SHOOTER,flightEffect,syntheticEffectModel,weaponEffects,weaponRegistry} from './weapon-effect-fixture';

const registry=weaponRegistry(),effects=weaponEffects(registry);
const shell:Shell={id:1,source:1,definition:SHELL_SHOOTER,owner:'player.1',origin:{x:10,y:10},target:{x:18,y:10},launched:100,impact:140,damage:42,damageType:'siege',radius:2,slowPermille:200,slowTicks:80,victims:['player.2'],viewers:['player.1'],resolved:false};
async function fixture(){
 const root=new Group(),impacts=new EffectPlayer();
 const effect=new ShellEffects(root,registry,effects,syntheticEffectModel,impacts);
 await effect.ready;return {root,impacts,effect,field:new HeightField(256)};
}
function ball(effect:ShellEffects){return effect.root.getObjectByName(`projectiles.${flightEffect(registry,effects,SHELL_SHOOTER).id}/body`)!.children[0] as InstancedMesh;}

it('captures the muzzle once, batches the authored shell and lands at the fixed ground point',async()=>{
 const {root,effect,field}=await fixture();const muzzle=new Vector3(10.4,1.9,10.1);let calls=0;
 const resolve=()=>{calls++;return muzzle;};effect.update([shell],field,100,resolve);
 const mesh=ball(effect),position=()=>{const m=new Matrix4();mesh.getMatrixAt(0,m);return new Vector3().setFromMatrixPosition(m);};
 expect(position().distanceTo(muzzle)).toBeLessThan(.00001);
 muzzle.set(99,99,99);effect.update([shell],field,120,resolve);
 expect(calls).toBe(1);expect(position().x).toBeCloseTo((10.4+18)/2);expect(position().z).toBeCloseTo((10.1+10)/2);
 const arc=flightEffect(registry,effects,SHELL_SHOOTER).effect.layers[0].arcHeight!;
 expect(position().y).toBeCloseTo((1.9+field.walkSample(18,10)+.1)/2+arc);
 effect.update([shell],field,140);expect(mesh.count).toBe(0);effect.dispose();expect(root.children).toHaveLength(0);
});

it('plays the declared impact once and lets it finish after the shell leaves observation',async()=>{
 const {effect,impacts,field}=await fixture();expect(impacts.root.children).toHaveLength(0);
 const duration=effects.find(e=>e.id===registry.asset(registry.get(SHELL_SHOOTER).asset).impactEffect)!.durationTicks;
 effect.update([shell],field,140);const count=impacts.root.children.length;expect(count).toBeGreaterThan(0);
 effect.update([shell],field,141);expect(impacts.root.children).toHaveLength(count);
 effect.update([],field,140+duration-1);expect(impacts.root.children.length).toBeGreaterThan(0);
 effect.update([],field,140+duration+20);expect(impacts.root.children).toHaveLength(0);effect.dispose();
});

it('keeps an army volley in shared model batches and never emits an early impact',async()=>{
 const {effect,impacts,field}=await fixture();effect.update(Array.from({length:300},(_,i)=>({...shell,id:i+1})),field,110);
 const mesh=ball(effect);expect(mesh.count).toBe(300);expect(impacts.root.children).toHaveLength(0);
 effect.update([],field,111);expect(mesh.count).toBe(0);effect.dispose();
});
