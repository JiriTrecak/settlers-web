import {expect,it,vi} from 'vitest';
import {EffectAudioDevice,EffectSound,type SoundSettings,type SoundFrame} from '../../src/render/audio/effectSound';
const settings:SoundSettings={asset:'asset.test.audio',role:'audio',index:1,volume:.5,pitch:1,loop:false,fadeInTicks:4,fadeOutTicks:8,referenceDistance:10,maxDistance:50};
const frame=(tick:number,extra:Partial<SoundFrame>={}):SoundFrame=>({tick,endTick:80,playing:true,speed:1,x:0,z:0,view:{x:0,z:0,rightX:1,rightZ:0},...extra});
function fixture(loop=false){
 const sources:any[]=[],gains:any[]=[],pans:any[]=[];
 const context={state:'running',currentTime:0,destination:{},resume:vi.fn(async()=>{}),createBufferSource:()=>{const s:any={playbackRate:{value:1},connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(()=>s.onended?.())};sources.push(s);return s;},createGain:()=>{const g={gain:{value:0,setTargetAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};gains.push(g);return g;},createStereoPanner:()=>{const p={pan:{setTargetAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};pans.push(p);return p;}};
 const device=new EffectAudioDevice(()=>context as unknown as AudioContext);device.unlock();vi.spyOn(device,'buffer').mockReturnValue({duration:1} as AudioBuffer);
 return {sound:new EffectSound({...settings,loop},device),device,context,sources,gains,pans};
}
it('resumes from simulation time after pause and seeks without replaying a completed one-shot',()=>{
 const f=fixture();f.sound.sample(frame(10));expect(f.sources[0].start).toHaveBeenCalledWith(0,.25);expect(f.device.voices).toBe(1);
 f.context.currentTime=.05;f.sound.sample(frame(12));expect(f.sources).toHaveLength(1);
 f.sound.sample(frame(12,{playing:false}));expect(f.device.voices).toBe(0);expect(f.sources[0].disconnect).toHaveBeenCalled();
 f.sound.sample(frame(20));expect(f.sources[1].start).toHaveBeenCalledWith(0,.5);
 f.sound.sample(frame(60));expect(f.device.voices).toBe(0);expect(f.sources).toHaveLength(2);f.sound.stop();expect(f.device.voices).toBe(0);
});
it('loops at the correct offset, restarts on seek/rate changes, and ends at cue expiry',()=>{
 const f=fixture(true);f.sound.sample(frame(50));expect(f.sources[0].start).toHaveBeenCalledWith(0,.25);
 f.context.currentTime=.1;f.sound.sample(frame(54));expect(f.sources).toHaveLength(1);
 f.sound.sample(frame(60,{speed:2}));expect(f.sources[1].playbackRate.value).toBe(2);expect(f.sources[1].start).toHaveBeenCalledWith(0,.5);
 f.sound.sample(frame(80));expect(f.device.voices).toBe(0);
});
it('attenuates, pans, and suspends out-of-range or disabled audio',()=>{
 const f=fixture(true);f.sound.sample(frame(20));const near=f.gains[0].gain.setTargetAtTime.mock.calls.at(-1)![0];
 f.sound.sample(frame(20,{x:30}));expect(f.gains[0].gain.setTargetAtTime.mock.calls.at(-1)![0]).toBeLessThan(near);expect(f.pans[0].pan.setTargetAtTime.mock.calls.at(-1)![0]).toBe(1);
 f.sound.sample(frame(20,{x:50}));expect(f.device.voices).toBe(0);
 f.device.enabled=false;f.sound.sample(frame(20));expect(f.device.voices).toBe(0);
});
it('caps concurrent voices and lets a late-decoded sound join at its current time',()=>{
 const f=fixture(true),load=vi.spyOn(f.device,'buffer');load.mockReturnValue(undefined);f.sound.sample(frame(2));expect(f.sources).toHaveLength(0);
 load.mockReturnValue({duration:1} as AudioBuffer);f.sound.sample(frame(8));expect(f.sources[0].start).toHaveBeenCalledWith(0,.2);
 const others=Array.from({length:30},()=>new EffectSound({...settings,loop:true},f.device));for(const sound of others)sound.sample(frame(8));expect(f.device.voices).toBe(24);
 f.sound.stop();for(const sound of others)sound.stop();expect(f.device.voices).toBe(0);
});

it('uses generic cue delay, status ownership and pause/cancellation cleanup without allocating meshes',async()=>{
 const {AbilityEffects}=await import('../../src/render/abilities/abilityEffects');
 const {visualEffectSchema}=await import('../../src/content/effects/schema');
 const {presentationSchema}=await import('../../src/content/abilities/schema');
 const effect=visualEffectSchema.parse({schemaVersion:1,id:'effect.test.audio',name:'Audio',durationTicks:80,layers:[{id:'sound',shape:'sound',follow:true,startTick:4,colour:'#ffffff',accent:'#ffffff',size:1,height:0,count:1,durationTicks:40,sound:settings}]});
 const p=presentationSchema.parse({schemaVersion:1,id:'presentation.test.audio',animations:{prepare:'idle',release:'idle',recover:'idle',fallback:'idle'},effects:[{id:'audio',effect:effect.id,event:'statusApplied',anchor:'target',lifetime:'status'}]});
 const sample=vi.spyOn(EffectSound.prototype,'sample').mockImplementation(()=>{}),stop=vi.spyOn(EffectSound.prototype,'stop').mockImplementation(()=>{}),fx=new AbilityEffects(()=>[effect]);
 try{
  fx.setAudioFrame({x:0,z:0,rightX:1,rightZ:0},true);
  const e={id:1,cast:1,event:'statusApplied' as const,tick:10,ability:'ability.test.audio',caster:1,target:2,origin:{x:0,y:0},point:{x:3,y:4},viewers:[]};
  fx.consume(e,p);fx.update(12);expect(sample).not.toHaveBeenCalled();expect(fx.root.children[0].children).toHaveLength(0);
  fx.update(24,()=>({x:13,y:14,height:3}));expect(sample).toHaveBeenLastCalledWith(expect.objectContaining({tick:10,playing:true,x:13,z:14,endTick:undefined}));
  stop.mockClear();fx.setAudioFrame({x:0,z:0,rightX:1,rightZ:0},false);expect(stop).toHaveBeenCalledOnce();
  stop.mockClear();fx.syncStatuses([],25,()=>p);expect(stop).toHaveBeenCalledOnce();expect(fx.liveCues).toBe(0);
  fx.consume({...e,id:2,cast:2},p);stop.mockClear();fx.consume({...e,id:3,cast:2,event:'cancelled'},p);expect(stop).toHaveBeenCalledOnce();expect(fx.liveCues).toBe(0);
  fx.consume({...e,id:4,cast:3},p);stop.mockClear();fx.clear();expect(stop).toHaveBeenCalledOnce();
 }finally{fx.dispose();sample.mockRestore();stop.mockRestore();}
});
