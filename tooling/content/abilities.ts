import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {ABILITY_ABI,abilityLibrarySchema,emptyAbilityLibrary} from '../../src/content/abilities/schema';
/** Authoring services read the last publication at transaction time, never cached drafts. */
export async function readAbilityLibrary(root:string){
 try{const p=JSON.parse(await readFile(path.join(root,'content/abilities/published.json'),'utf8'));if(p.abi!==ABILITY_ABI)throw Error('Unsupported ability ABI');return abilityLibrarySchema.parse(p.library);}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return emptyAbilityLibrary();throw e;}
}
