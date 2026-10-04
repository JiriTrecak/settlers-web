import {SRGBColorSpace,Texture,TextureLoader} from 'three';
import {effectImage,type EffectTextureRef} from '../../content/abilities/resources';
import {assetUrls} from '../../shared/assets/urls.generated';
import {EFFECT_IMAGE_LIMITS as limits} from '../../content/effects/limits';

type Entry={map:Texture;refs:number;settled:boolean;bytes:number;error?:Error;ready:Promise<void>;done:()=>void;retired:boolean};
export type EffectImage={map:Texture;ready:Promise<void>;readonly error:Error|undefined;release:()=>void};
type Loader=(url:string,loaded:(texture:Texture)=>void,failed:()=>void)=>Texture;
const load:Loader=(url,loaded,failed)=>new TextureLoader().load(url,loaded,undefined,failed);
/** One lease per cue, shared across its particles. Late loads cannot revive retired entries. */
export class EffectImages {
 private entries=new Map<string,Entry>();private closed=false;private residentBytes=0;
 constructor(private loader:Loader=load){}
 acquire(ref:EffectTextureRef):EffectImage{
  const resource=effectImage(ref),key=resource.path;
  let entry=this.entries.get(key);
  if(!entry){
   this.trim(true);
   let done!:()=>void;
   entry={map:new Texture(),refs:0,settled:false,bytes:0,ready:new Promise(resolve=>done=resolve),done:()=>done(),retired:false};
   const owned=entry;
   const fail=(message:string)=>{owned.error=Error(message);owned.settled=true;owned.map.image=null;owned.map.dispose();owned.done();this.trim();};
   if(this.closed||resource.bytes>limits.maxBytes||this.entries.size>=limits.entries){
    fail(this.closed?'Effect image player closed':resource.bytes>limits.maxBytes?'Effect image exceeds 8 MB':'Effect image pending/cache budget reached');
    owned.retired=true;
   }else{
    this.entries.set(key,owned);
    // The placeholder is replaced by TextureLoader's immediate texture. Callbacks
    // run after assignment, including injected synchronous loaders used in tests.
    try{owned.map=this.loader(assetUrls[key]??'/'+key,texture=>queueMicrotask(()=>{
     if(owned.retired||this.closed){texture.dispose();owned.settled=true;owned.done();return;}
     const image=texture.image as {width?:number;height?:number}|undefined,width=image?.width??0,height=image?.height??0;
     if(!width||!height||width>limits.maxDimension||height>limits.maxDimension||width*height>limits.maxPixels){fail('Effect image exceeds 2048px or has invalid dimensions');return;}
     const bytes=Math.ceil(width*height*4*4/3);
     this.trim(false,bytes);
     if(this.residentBytes+bytes>limits.residentBytes){fail('Effect image resident memory budget reached');return;}
     owned.bytes=bytes;this.residentBytes+=bytes;owned.settled=true;owned.done();this.trim();
    }),()=>queueMicrotask(()=>{fail('Effect texture failed to load: '+ref.asset);}));owned.map.colorSpace=SRGBColorSpace;
    }catch{fail('Effect texture failed to load: '+ref.asset);}
   }
  }else{this.entries.delete(key);this.entries.set(key,entry);}
  entry.refs++;
  const owned=entry;let released=false,cancel!:()=>void;
  const ready=Promise.race([owned.ready,new Promise<void>(resolve=>cancel=resolve)]);
  return {map:owned.map,ready,get error(){return owned.error;},release:()=>{
   if(released)return;released=true;owned.refs--;cancel();
   if(owned.retired)owned.map.dispose();else this.trim();
  }};
 }
 private retire(key:string,entry:Entry){
  this.entries.delete(key);entry.retired=true;this.residentBytes-=entry.bytes;entry.bytes=0;entry.map.dispose();entry.done();
 }
 private trim(admitting=false,incomingBytes=0){
  let idle=[...this.entries.values()].filter(e=>!e.refs&&e.settled).length;
  for(const [key,entry]of this.entries){
   if(entry.refs||!entry.settled)continue;
   if(!entry.error&&idle<=limits.cachedImages&&this.residentBytes+incomingBytes<=limits.residentBytes&&(!admitting||this.entries.size<limits.entries))continue;
   this.retire(key,entry);idle--;
  }
 }
 dispose(){if(this.closed)return;this.closed=true;for(const [key,entry]of this.entries)this.retire(key,entry);}
}
