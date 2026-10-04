import {Texture} from 'three';
import type {GLTFLoaderPlugin,GLTFParser} from 'three/addons/loaders/GLTFLoader.js';

/** GLBs often embed the same atlas in many models. Share the immutable image
 * Source, not the material/Texture: UV transforms, colour space and later
 * material setup remain private. Three shares GPU storage by Source + upload
 * settings, and reference-counts it when individual textures are disposed.
 * Owned by one scenery loader; no process-wide asset cache survives its world. */
export class EmbeddedTexturePool {
 private entries=new Map<string,Promise<Texture|null>>();
 private closed=false;
 private requests=0;
 private shared=0;
 diagnostics(){return {requests:this.requests,shared:this.shared,unique:this.entries.size};}
 dispose(){this.closed=true;this.entries.clear();}

 plugin(parser:GLTFParser):GLTFLoaderPlugin {
  const hashes=new Map<number,Promise<string>>();
  return {name:'UTC_shared_embedded_images',loadTexture:(index)=>{
   const definition=parser.json.textures?.[index],source=parser.json.images?.[definition?.source];
   // Let native/extension loaders own compressed images, external URLs and
   // future texture extensions. This path only pools standard embedded images.
   if(this.closed||!globalThis.crypto?.subtle||!source||source.bufferView===undefined||source.uri||definition.extensions||source.extensions||!['image/png','image/jpeg'].includes(source.mimeType))return null;
   let hash=hashes.get(source.bufferView);
   if(!hash){
    hash=parser.getDependency('bufferView',source.bufferView).then(async(bytes:ArrayBuffer)=>{
     const digest=await crypto.subtle.digest('SHA-256',bytes);
     return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    });
    hashes.set(source.bufferView,hash);
   }
   return hash.then(async digest=>{
    // Native sampler construction remains GLTFLoader's responsibility. Equal
    // sampler definitions can share a decoded image without reimplementing it.
    const key=JSON.stringify([source.mimeType,digest,parser.json.samplers?.[definition.sampler]??{}]);
    this.requests++;
    let pending=this.entries.get(key);
    if(pending)this.shared++;
    else {
     pending=parser.loadTexture(index);
     if(!this.closed)this.entries.set(key,pending);
     const current=pending;
     void pending.then(value=>{if(!value&&this.entries.get(key)===current)this.entries.delete(key);},()=>{if(this.entries.get(key)===current)this.entries.delete(key);});
    }
    const template=await pending;
    if(!template)return template as unknown as Texture; // Matches GLTFLoader's failed-image fallback.
    // Never return the cached template: assignTexture can change colorSpace,
    // texCoord and KHR_texture_transform immediately after this resolves.
    const texture=template.clone();
    texture.name=definition.name||source.name||'';
    texture.userData={...(typeof source.extras==='object'&&source.extras!==null?source.extras:{}),mimeType:source.mimeType};
    parser.associations.set(texture,{textures:index});
    return texture;
   });
  }};
 }
}
