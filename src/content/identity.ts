import {coreEffects} from './effects/library';
import {builtinSource} from './builtin';
import {sha256,verifyAbilityPublication} from './abilities/publication';
import {ABILITY_ABI} from './abilities/schema';
import {effectImage,presentationImages} from './abilities/resources';
/** Compare the currently loaded content between peers; this is not a persisted dependency lock. */
export async function matchContentIdentity(){
 const library=await verifyAbilityPublication();
 const resources=[...new Map(library.presentations.flatMap(p=>presentationImages(p)).map(effectImage).map(r=>[r.path,{path:r.path,sha256:r.sha256,bytes:r.bytes}])).values()].sort((a,b)=>a.path<b.path?-1:1);
 return {abi:ABILITY_ABI,sha256:await sha256({source:builtinSource,effects:coreEffects,resources})};
}
