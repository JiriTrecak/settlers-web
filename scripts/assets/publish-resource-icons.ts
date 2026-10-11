/** Split the generated 2×2 sheet into alpha-preserving 128px resource icons. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';

const [sourcePath,promptPath]=process.argv.slice(2);
if(!sourcePath||!promptPath)throw Error('Usage: node --import tsx scripts/assets/publish-resource-icons.ts <sheet.png> <prompt.txt>');
const source=await readFile(sourcePath),prompt=await readFile(promptPath,'utf8');
const metadata=await sharp(source).metadata();
if(!metadata.width||!metadata.height||metadata.width%2||metadata.height%2||!metadata.hasAlpha)throw Error('Expected an even-sized 2×2 transparent sheet');
const width=metadata.width/2,height=metadata.height/2,store=new AuthoringStore(process.cwd());
const entries=[['amber','Amber','icon.item.amber'],['lumber','Wood','icon.item.wood'],['root','Root','icon.item.root'],['supply','Supply','icon.resource.supply']] as const;
for(const [cell,[slug,name,renderId]] of entries.entries()){
 const id=`asset.icons.resource-${slug}`;
 try{await store.get(id);}catch(error){
  if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
  await store.dispatch({op:'asset.create',definition:{version:1,id,name,kind:'icon',revision:1,status:'draft',tags:['woodland-interface','resources','original'],resources:[],usesGeometry:false,bindings:{profile:'icon',render:[{id:renderId,image:{asset:id,role:'image',index:1}}],scenery:[]},provenance:{method:'generated'}}});
 }
 const crop={left:cell%2*width,top:Math.floor(cell/2)*height,width,height};
 const image=await sharp(source).extract(crop).resize(128,128,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
 const generation=Buffer.from(JSON.stringify({tool:'built-in image_gen',prompt,reference:'image.woodland-connected-hud',crop,processing:'Extract sprite cell and resize to 128×128 PNG; preserve generated alpha.'},null,2)+'\n');
 for(const [role,format,bytes] of [['source','png',source],['image','png',image],['generation','json',generation]] as const){
  await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role,index:1,format,base64:bytes.toString('base64')});
 }
 const current=await store.get(id);
 await store.dispatch({op:'asset.save',expectedRevision:current.revision,definition:{...current,name,tags:['woodland-interface','resources','original'],provenance:{method:'generated',sourceHash:current.resources.find(r=>r.role==='source')!.sha256,licenseNote:'Original Under the Canopy resource artwork generated with built-in ImageGen.'}}});
 await store.dispatch({op:'asset.validate',id});
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id);
}
