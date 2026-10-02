import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {effectLibrarySchema} from '../../src/content/effects/schema';
export async function readEffectLibrary(root:string){try{return effectLibrarySchema.parse(JSON.parse(await readFile(path.join(root,'content/effects/published.json'),'utf8')));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {schemaVersion:1 as const,effects:[]};throw e;}}
