import {expect,it,vi} from 'vitest';
import {EffectAudioDevice,type SoundSettings} from '../../src/render/audio/effectSound';
vi.mock('../../src/content/abilities/resources',()=>({effectResource:()=>({path:'test-audio.wav',bytes:8,sha256:'test'})}));
it('decodes during loading while suspended, without starting playback, and reuses the decoded buffer',async()=>{
 const decoded={duration:1,length:100,numberOfChannels:1} as AudioBuffer;
 const context={state:'suspended',decodeAudioData:vi.fn(async()=>decoded),resume:vi.fn(async()=>{})};
 const request=vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)}));vi.stubGlobal('fetch',request);
 const sound={asset:'asset.test.sound',role:'audio',index:1} as SoundSettings;
 const device=new EffectAudioDevice(()=>context as unknown as AudioContext);
 try{await device.preload([sound,sound]);expect(request).toHaveBeenCalledTimes(1);expect(context.decodeAudioData).toHaveBeenCalledTimes(1);expect(context.resume).not.toHaveBeenCalled();expect(device.voices).toBe(0);context.state='running';expect(device.buffer(sound)).toBe(decoded);expect(request).toHaveBeenCalledTimes(1);}finally{vi.unstubAllGlobals();}
});
