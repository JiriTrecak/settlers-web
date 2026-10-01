import {effectImage,presentationImages} from './resources';
import {canonical} from '../registry';
import {ABILITY_ABI,abilityLibrarySchema} from './schema';
import published from '../../../content/abilities/published.json';

export async function sha256(value:unknown){const buffer=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(value)));return Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');}
/** Validate the current publication and resolve dependencies by ID, without stored version pins. */
export async function verifyAbilityPublication(raw:unknown=published){
 const p=raw as {schemaVersion:number;abi:string;library:unknown}|null;
 if(!p||p.abi!==ABILITY_ABI||p.schemaVersion!==1)throw Error('Unsupported ability publication ABI');
 const library=abilityLibrarySchema.parse(p.library);
 for(const presentation of library.presentations)for(const ref of presentationImages(presentation))effectImage(ref);
 return library;
}
