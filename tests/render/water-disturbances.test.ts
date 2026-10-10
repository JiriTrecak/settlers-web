import {expect,it} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import type {EntityView} from '../../src/sim/game/observation';
import {WaterDisturbances,WATER_DISTURBANCES as C,DISTURBANCE_STRIDE as S} from '../../src/render/water/waterDisturbances';
const field=()=>{const f=new HeightField(64);f.samples.fill(-.3);return f;};
const unit=(id=1,x=10):EntityView=>({id,definition:'test',owner:'red' as EntityView['owner'],x,y:10,rotation:0,hp:100,unit:{moving:true,contained:false,cargo:null,target:null,cooldown:0} as EntityView['unit']});
function run(hz:number){const f=field(),pool=new WaterDisturbances(),e=unit();for(let frame=0;frame<=hz*2;frame++){e.x=10+frame/hz*3;pool.update([e],f,frame/hz,20,20);}return pool;}
it('emits spatially consistent rings at different frame rates',()=>{
 const a=run(30),b=run(120);expect(a.count).toBeGreaterThan(2);expect(a.count).toBe(b.count);
 for(let i=0;i<a.count;i++)expect(a.data[i*S]).toBeCloseTo(b.data[i*S],4);
});
it('leaves fading history after units disappear, but never emits for standing units',()=>{
 const p=run(60),f=field(),count=p.count,e=unit(1,16);
 p.update([e],f,2.1,20,20);expect(p.count).toBe(count);
 p.update([],f,2.2,20,20);expect(p.count).toBe(count);
 for(let t=2.5;t<=5;t+=.5)p.update([],f,t,20,20);expect(p.count).toBe(0);
});
it('does not disturb dry land, bridges, flight, contained or remembered units',()=>{
 for(const kind of ['dry','bridge','flight','contained','remembered','dead']){
  const f=field(),e=unit(),p=new WaterDisturbances();
  if(kind==='dry')f.samples.fill(.3);
  if(kind==='bridge'){e.surface='bridge';f.walkSurface=()=>1;}
  if(kind==='flight')e.unit!.flight={height:2};
  if(kind==='contained')e.unit!.contained=true;
  if(kind==='remembered')e.remembered=true;
  if(kind==='dead')e.hp=0;
  p.update([e],f,0,20,20);e.x++;p.update([e],f,.2,20,20);expect(p.count,kind).toBe(0);
 }
});
it('records local water height and ignores teleports or an unseen off-camera journey',()=>{
 const f=field();f.samples.fill(4.7);f.waterLevel=5;const p=new WaterDisturbances(),e=unit();
 p.update([e],f,0,20,20);e.x++;p.update([e],f,.2,20,20);expect(p.count).toBeGreaterThan(0);expect(p.data[3]).toBe(5);
 p.clear();p.update([e],f,1,20,20);e.x+=30;p.update([e],f,1.1,20,20);expect(p.count).toBe(0);
 p.update([e],f,1.2,400,400);e.x++;p.update([e],f,1.3,20,20);expect(p.count).toBe(0);
});
it('bounds a thousand-unit crossing and expires it without growing allocations',()=>{
 const p=new WaterDisturbances(),f=field(),units=Array.from({length:1000},(_,i)=>unit(i+1,10)),data=p.data;
 for(let frame=0;frame<240;frame++){
  for(const e of units)e.x=10+frame/60*4;
  p.update(units,f,frame/60,20,20);
  expect(p.emitted).toBeLessThanOrEqual(C.emissionsPerFrame);expect(p.count).toBeLessThanOrEqual(C.capacity);
 }
 expect(p.count).toBe(C.capacity);expect(p.data).toBe(data);expect(p.data.every(Number.isFinite)).toBe(true);
 for(let t=4;t<8;t+=.5)p.update([],f,t,20,20);expect(p.count).toBe(0);
});
