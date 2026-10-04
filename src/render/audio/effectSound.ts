import {readEffectVolume} from '../../shared/settings/audio';
import type {VisualLayer} from '../../content/effects/schema';
import {effectResource} from '../../content/abilities/resources';
import {assetUrls} from '../../shared/assets/urls.generated';
export type SoundSettings=NonNullable<VisualLayer['sound']>;
export type AudioView={x:number;z:number;rightX:number;rightZ:number};
export type SoundFrame={tick:number;endTick?:number;playing:boolean;speed:number;x:number;z:number;view:AudioView};
const MAX_VOICES=24,MAX_BUFFERS=24;
/** A tab owns one lazily unlocked context. Muted/hidden pages never start voices. */
export class EffectAudioDevice {
 context?:AudioContext;enabled=true;voices=0;
 private buffers=new Map<string,{buffer?:AudioBuffer;failed?:boolean}>();
 constructor(private factory=()=>new AudioContext()){}
 unlock(){
  if(!this.enabled)return;
  try{this.context??=this.factory();void this.context.resume().catch(()=>{});}catch{/* No browser audio device: visuals remain usable. */}
 }
 buffer(sound:SoundSettings){
  const context=this.context;if(!context||context.state!=='running')return;
  const resource=effectResource(sound),key=resource.path+':'+resource.sha256;
  let cached=this.buffers.get(key);if(cached)return cached.buffer;
  if(this.buffers.size>=MAX_BUFFERS){const disposable=[...this.buffers].find(([,entry])=>entry.buffer||entry.failed);if(!disposable)return;this.buffers.delete(disposable[0]);}
  cached={};this.buffers.set(key,cached);
  void (async()=>{
   try{
    if(resource.bytes>8_000_000)throw Error('Audio asset exceeds 8 MB');
    const response=await fetch(assetUrls[resource.path]??'/'+resource.path,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Audio asset could not be loaded');
    const bytes=await response.arrayBuffer();if(bytes.byteLength>8_000_000)throw Error('Audio asset exceeds 8 MB');
    const buffer=await context.decodeAudioData(bytes);
    if(buffer.duration>60||buffer.length*buffer.numberOfChannels>6_000_000)throw Error('Effect audio must be at most 60 seconds / six million samples');
    cached!.buffer=buffer;
   }catch(error){cached!.failed=true;console.warn('Effect audio unavailable:',error instanceof Error?error.message:String(error));}
  })();return;
 }
 get available(){return this.enabled&&!!this.context&&this.context.state==='running'&&(typeof document==='undefined'||!document.hidden);}
}
export const effectAudio=new EffectAudioDevice();
let installed=false;
export function installEffectAudio(){
 if(installed||typeof window==='undefined')return;installed=true;
 const unlock=()=>effectAudio.unlock();window.addEventListener('pointerdown',unlock,{passive:true});window.addEventListener('keydown',unlock,{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)void effectAudio.context?.suspend();});
}
/** Explicit tick sampling makes pause/resume, seek, late loads and loops predictable. */
export class EffectSound {
 private voice?:{source:AudioBufferSourceNode;gain:GainNode;pan:StereoPannerNode;contextAt:number;offset:number;rate:number};
 constructor(readonly settings:SoundSettings,private device=effectAudio){}
 sample(frame:SoundFrame){
  const s=this.settings,age=frame.tick/40,remaining=frame.endTick===undefined?Infinity:(frame.endTick-frame.tick)/40;
  const dx=frame.x-frame.view.x,dz=frame.z-frame.view.z,distance=Math.hypot(dx,dz);
  if(!frame.playing||readEffectVolume()===0||!this.device.available||frame.speed<=0||age<0||remaining<=0||distance>=s.maxDistance){this.stop();return;}
  const buffer=this.device.buffer(s),context=this.device.context;if(!buffer||!context){this.stop();return;}
  const offset=age*s.pitch;if(!s.loop&&offset>=buffer.duration){this.stop();return;}
  const rate=s.pitch*frame.speed,position=s.loop?offset%buffer.duration:offset;
  if(this.voice){
   const expected=this.voice.offset+(context.currentTime-this.voice.contextAt)*this.voice.rate;
   const drift=s.loop?Math.abs(((offset-expected+buffer.duration/2)%buffer.duration+buffer.duration)%buffer.duration-buffer.duration/2):Math.abs(offset-expected);
   if(drift>.12||rate!==this.voice.rate)this.stop();
  }
  if(!this.voice){
   if(this.device.voices>=MAX_VOICES)return;
   const source=context.createBufferSource(),gain=context.createGain(),pan=context.createStereoPanner();
   source.buffer=buffer;source.loop=s.loop;source.playbackRate.value=rate;gain.gain.value=0;
   source.connect(gain);gain.connect(pan);pan.connect(context.destination);
   const voice={source,gain,pan,contextAt:context.currentTime,offset,rate};this.voice=voice;this.device.voices++;
   source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();if(this.voice===voice)this.voice=undefined;this.device.voices--;};
   source.start(0,position);
  }
  const attenuation=distance<=s.referenceDistance?1:Math.max(0,1-(distance-s.referenceDistance)/(s.maxDistance-s.referenceDistance))**2;
  const fade=Math.min(1,s.fadeInTicks?frame.tick/s.fadeInTicks:1)*Math.min(1,s.fadeOutTicks?remaining*40/s.fadeOutTicks:1);
  this.voice.gain.gain.setTargetAtTime(s.volume*readEffectVolume()*attenuation*fade,context.currentTime,.012);
  this.voice.pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,(dx*frame.view.rightX+dz*frame.view.rightZ)/Math.max(s.referenceDistance,distance))),context.currentTime,.02);
 }
 stop(){const voice=this.voice;if(!voice)return;this.voice=undefined;voice.source.stop();}
 get playing(){return !!this.voice;}
}
