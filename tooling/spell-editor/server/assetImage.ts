import {readFile,stat} from 'node:fs/promises';
import sharp from 'sharp';
import {readPublished} from '../../asset-studio/server/authoring/publication';
import {publishedResource} from '../../asset-studio/server/authoring/packages';
import {hash,within} from '../../asset-studio/server/storage';
import {EFFECT_IMAGE_LIMITS} from '../../../src/content/effects/limits';

/** Reopen verified published pixels without exposing a general filesystem reader. */
export async function inspectAssetImage(root:string,id:string,index:number){
 const asset=(await readPublished(root))?.find(a=>a.id===id),resource=asset?.resources.find(r=>r.role==='image'&&r.index===index);
 if(!asset||!resource)throw Error('No published image resource for '+id+' at index '+index);
 const file=await within(root,publishedResource(asset,{role:'image',index}));
 const size=(await stat(file)).size;if(size>EFFECT_IMAGE_LIMITS.maxBytes)throw Error('Image exceeds inspection size limit');
 const bytes=await readFile(file);if(bytes.length!==resource.bytes||hash(bytes)!==resource.sha256)throw Error('Published image is damaged: '+id);
 const pipeline=sharp(bytes,{limitInputPixels:EFFECT_IMAGE_LIMITS.maxPixels}),metadata=await pipeline.metadata();
 const preview=await pipeline.resize(512,512,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
 return {asset:id,index,name:asset.name,width:metadata.width,height:metadata.height,sha256:resource.sha256,published:true,image:'data:image/png;base64,'+preview.toString('base64')};
}
