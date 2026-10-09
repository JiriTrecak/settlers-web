/** Publish the approved clean campaign illustrations into the canonical asset library. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
const [loading,selection]=process.argv.slice(2);
if(!loading||!selection)throw Error('Usage: publish-mission-art.ts <loading.png> <selection.png>');
const store=new AuthoringStore(process.cwd());
for(const [slug,path,prompt] of [
 ['amber-watch-loading',loading,'Approved clean campaign loading artwork: calm miniature woodland brook, twig bridge and distant acorn fort; charcoal right third and bottom reserved for live UI; no text or controls.'],
 ['amber-watch-selection',selection,'Approved clean mission illustration: calm woodland brook and twig bridge, distant acorn fort with red leaf pennants, soft forest light; no text, frames or controls.'],
] as const){
 const id=`asset.interface.campaign.${slug}`;
 try{await store.get(id);}catch{await store.dispatch({op:'asset.create',definition:{version:1,id,name:slug.replaceAll('-',' '),kind:'interface',revision:1,status:'draft',tags:['campaign','original','amber-watch'],resources:[],usesGeometry:false,materials:[],bindings:{profile:'interface-image',render:[],scenery:[]},capabilities:{},provenance:{method:'generated',licenseNote:'Original Under the Canopy artwork, generated from approved clean menu concepts.'}}});}
 const bytes=await sharp(await readFile(path)).resize({width:1920,withoutEnlargement:true}).webp({quality:92,effort:6}).toBuffer();
 for(const [role,format,data] of [['image','webp',bytes],['generation','json',Buffer.from(JSON.stringify({tool:'built-in image_gen',prompt,processing:'WebP quality 92; no enlargement',text:'All titles, briefings, controls and progress are live HTML.'},null,2)+'\n')]] as const){
  await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role,index:1,format,base64:data.toString('base64')});
 }
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id);
}
