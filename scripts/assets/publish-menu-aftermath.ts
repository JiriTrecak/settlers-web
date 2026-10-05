/** Publish independent main-menu artwork. Input: directory of the four named PNGs. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';

const input=process.argv[2];
if(!input)throw Error('Usage: node --import tsx scripts/assets/publish-menu-aftermath.ts <input-directory>');
const store=new AuthoringStore(process.cwd());
const descriptions={
 'forest-aftermath':'Dark insect-scale ruined woodland settlement; no UI, flames, smoke or volumetric rays. Preserve giant oak, miniature huts, acorn and leaf composition.',
 'panel-charcoal':'Isolated blank charcoal carved-oak menu panel with pewter leaf ornaments; transparent exterior; no logo, buttons or text.',
 'logo-oak':'Isolated UNDER THE CANOPY sculpted ivory and bronze wordmark with green oak-leaf crest; transparent exterior.',
 'button-charcoal':'Single blank near-black timber button with pewter beveled border and oak-leaf end ornaments; transparent exterior; no text.',
};
for(const [slug,prompt] of Object.entries(descriptions)){
 const id=`asset.interface.main-menu.${slug}`;
 try{await store.get(id);}catch{await store.dispatch({op:'asset.create',definition:{version:1,id,name:slug.split('-').join(' '),kind:'interface',revision:1,status:'draft',tags:['main-menu','original'],resources:[],usesGeometry:false,materials:[],bindings:{profile:'interface-image',render:[],scenery:[]},capabilities:{},provenance:{method:'generated',licenseNote:'Original Under the Canopy menu artwork, generated from approved concept.'}}});}
 const source=await readFile(resolve(input,slug+'.png'));
 let image=sharp(source);
 if(slug!=='forest-aftermath')image=image.trim({threshold:12});
 const width=slug==='forest-aftermath'?1920:slug==='panel-charcoal'?720:slug==='logo-oak'?800:800;
 const bytes=await image.resize({width,withoutEnlargement:true}).webp({quality:92,alphaQuality:100,effort:6}).toBuffer();
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role:'image',index:1,format:'webp',base64:bytes.toString('base64')});
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role:'generation',index:1,format:'json',base64:Buffer.from(JSON.stringify({tool:'built-in image_gen',prompt,processing:'Alpha trim for isolated UI, downsize without enlargement, WebP quality 92. Background unchanged except encoding.',effects:'Runtime shafts, fire, smoke and embers are separate; labels remain HTML.'},null,2)+'\n').toString('base64')});
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id,bytes.length);
}
