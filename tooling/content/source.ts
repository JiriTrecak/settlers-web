import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {ContentSource} from '../../src/content/registry.ts';
import {readAbilityLibrary} from './abilities.ts';
/** Read current publication at operation time; Node's JSON module cache is not an authoring catalogue. */
export async function readContentSource(root:string,fallback?:ContentSource):Promise<ContentSource>{
 let raw:ContentSource;
 try{raw=JSON.parse(await readFile(path.join(root,'content/game.json'),'utf8'));}
 catch(e){if(fallback&&(e as NodeJS.ErrnoException).code==='ENOENT')return structuredClone(fallback);throw e;}
 const [manifest,abilityLibrary]=await Promise.all([readFile(path.join(root,'assets/manifest.json'),'utf8').then(JSON.parse),readAbilityLibrary(root)]);
 return {...raw,assets:manifest.records.flatMap((r:{render:ContentSource['assets']})=>r.render),abilityLibrary};
}
