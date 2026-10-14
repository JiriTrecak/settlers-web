/** A disposable authoring workspace containing only the test content world, for editor-service tests that
 * read published content from a workspace root. Published resource files are placeholders: services under
 * test resolve and validate references, they never decode the test art. */
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterAll,beforeAll} from 'vitest';
import world from './world.json';
import authoring from './authoring.json';
import {testAbilities,testEffects} from './index';
import {ABILITY_ABI} from '../../../src/content/abilities/schema';
import {publishedResource} from '../../../tooling/asset-studio/server/authoring/packages';
import type {AssetDefinition} from '../../../src/shared/authoring/asset';

const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');

export async function testWorkspace(){
 const root=await mkdtemp(path.join(os.tmpdir(),'test-content-'));
 const put=async(file:string,value:unknown)=>{await mkdir(path.dirname(path.join(root,file)),{recursive:true});await writeFile(path.join(root,file),typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value));};
 const {assets,...game}=world;
 await put('content/game.json',game);
 await put('content/abilities/published.json',{schemaVersion:1,abi:ABILITY_ABI,library:testAbilities});
 await put('content/effects/published.json',{schemaVersion:1,effects:testEffects});
 await put('assets/manifest.json',{version:1,records:assets.map(a=>({id:a.id,render:[a]}))});
 await put('assets/authoring/published.json',authoring);
 for(const asset of authoring.assets as unknown as AssetDefinition[])for(const r of asset.resources)
  await put(publishedResource(asset,r),r.format==='png'?PNG:'placeholder');
 return {root,dispose:()=>rm(root,{recursive:true,force:true})};
}
/** One shared workspace for a test file, created before its tests and removed afterwards. */
export function useTestWorkspace(){
 let workspace:Awaited<ReturnType<typeof testWorkspace>>|undefined;
 beforeAll(async()=>{workspace=await testWorkspace();});
 afterAll(()=>workspace?.dispose());
 return ()=>{if(!workspace)throw Error('Test workspace is not ready');return workspace.root;};
}
