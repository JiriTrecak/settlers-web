/** Publish the original resource ribbon through the shared authoring pipeline. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';

const [sourcePath,promptPath]=process.argv.slice(2);
if(!sourcePath||!promptPath)throw Error('Usage: node --import tsx scripts/assets/publish-resource-ribbon.ts <image.png> <prompt.txt>');
const id='asset.interface.woodland.resource-ribbon',store=new AuthoringStore(process.cwd());
try{await store.get(id);}catch(error){
 if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
 await store.dispatch({op:'asset.create',definition:{version:1,id,name:'Woodland resource ribbon',kind:'interface',revision:1,status:'draft',tags:['woodland-interface','resources','original'],resources:[],usesGeometry:false,bindings:{profile:'interface-image',render:[],scenery:[]},provenance:{method:'generated',licenseNote:'Original Under the Canopy interface artwork generated with built-in ImageGen.'}}});
}
const source=await readFile(sourcePath),prompt=await readFile(promptPath,'utf8');
const image=await sharp(source).trim({threshold:10}).resize({width:1024,withoutEnlargement:true}).webp({quality:94,alphaQuality:100}).toBuffer();
for(const [role,format,bytes] of [
 ['source','png',source],['image','webp',image],
 ['generation','json',Buffer.from(JSON.stringify({tool:'built-in image_gen',prompt,reference:'image.woodland-connected-hud',processing:'Trim transparent exterior; resize to 1024px wide; WebP quality 94 with alpha preserved.'},null,2)+'\n')],
] as const){
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role,index:1,format,base64:bytes.toString('base64')});
}
await store.dispatch({op:'asset.validate',id});
await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
console.log('Published',id,image.length,'bytes');
