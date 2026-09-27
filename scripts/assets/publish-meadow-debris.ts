/** Publish the meadow debris props (pebbles, edge boulder, sticks) built by art/recipes/meadow_debris.py.
 * Usage: node --import tsx scripts/assets/publish-meadow-debris.ts tmp/env-art/debris */
import {readFile,readdir} from 'node:fs/promises';
import {originalPackage,addBytes,addFile,publishOriginals,type OriginalPackage} from './original-publication';

const root=process.argv[2]!,packs:OriginalPackage[]=[];
for(const slug of (await readdir(root)).sort()){
 const dir=`${root}/${slug}`,id='asset.models.environment.'+slug,build=JSON.parse(await readFile(dir+'/build.json','utf8'));
 const a=originalPackage(id,slug.replaceAll('-',' '),'prop','authored');
 await addFile(a,'geometry','glb',dir+'/geometry.glb');
 await addFile(a,'source','blend',dir+'/source.blend');
 await addFile(a,'recipe','py','art/recipes/meadow_debris.py');
 addBytes(a,'generation','json',Buffer.from(JSON.stringify({method:'procedural Blender recipe',...build},null,1)+'\n'));
 a.definition.tags=['original','woodland','debris'];
 a.definition.bindings={profile:'model',render:[{id:'asset.scenery.'+slug,sceneryAsset:slug,geometry:{role:'geometry',index:1,asset:id}}],scenery:[{id:slug,name:a.definition.name,category:'landmark',type:'prop',geometry:{role:'geometry',index:1}}]};
 a.definition.capabilities={groundContact:{mode:'pivot'},vegetationClearance:slug==='meadow-boulder'?.8:.15};
 packs.push(a);
}
await publishOriginals(packs);
