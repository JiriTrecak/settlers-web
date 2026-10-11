/** Update the shared original pine atlas and retain the exact generation prompt. */
import {readFile} from 'node:fs/promises';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
const [imagePath,promptPath]=process.argv.slice(2);
if(!imagePath||!promptPath)throw Error('Usage: node --import tsx scripts/assets/set-woodland-pine-atlas.ts <atlas.png> <prompt.txt>');
const bytes=await readFile(imagePath),prompt=await readFile(promptPath,'utf8'),store=new AuthoringStore(process.cwd());
for(const variant of ['a','b','sapling']){
 const id=`asset.models.environment.woodland-pine-${variant}`;
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role:'albedo',index:1,format:'png',base64:bytes.toString('base64')});
 const generation={tool:'built-in image_gen',prompt,reference:'CleanShot 2026-10-10 at 23.11.43@2x.png',geometry:'Original curved branch sheets and tapered trunk from art/recipes/woodland_originals.py; no imported Warcraft geometry.',runtimeTextureSize:512};
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role:'generation',index:1,format:'json',base64:Buffer.from(JSON.stringify(generation,null,2)+'\n').toString('base64')});
 console.log('Updated atlas',id);
}
