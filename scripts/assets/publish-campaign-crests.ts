/** Publish three independently generated, transparent campaign crests. */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';
import {AuthoringStore} from '../../tooling/asset-studio/server/authoring/store';
const input=process.argv[2];
if(!input)throw Error('Usage: node --import tsx scripts/assets/publish-campaign-crests.ts <input-directory>');
const common='Use case: stylized-concept. Asset type: finished illustrated faction crest for a dark fantasy RTS campaign selector, NOT a UI screenshot. Square composition, isolated on genuinely transparent background. Centered large readable sculpted emblem inside an elegant circular intertwined ancient oak twig and carved dark wood wreath, small ivory leaf carvings, antique pewter highlights, sophisticated Warcraft-like hand painted 3D game art. Rich dimensional forms, strong silhouette, subtle material detail, dark moody forest palette with restrained bright highlights. No lettering, no words, no buttons, no backdrop, no humanoid characters. Keep generous transparent margin around complete wreath. The insect is a heraldic sculpture, not a realistic photograph.';
const subjects={
 ants:'An elegant reddish copper ANT seen from above with six articulated legs, bent antennae, three clearly segmented body parts, amber-red gemstone abdomen accents. Oak leaves and a pair of small ivory mandibles frame it. Warm ember and copper accents.',
 beetles:'A powerful emerald and aged bronze RHINOCEROS BEETLE seen from above with symmetrical ridged armored wing cases, six sturdy legs and one prominent upward curving central horn. Verdigris green and dark jade accents, oak nut shell details.',
 bees:'A regal golden BEE seen from above with striped amber-black abdomen, six delicate legs, two pairs of translucent ivory wings spread symmetrically. Honeycomb insets and small pale blossom details within the wood wreath. Muted honey gold and ivory accents.',
};
const store=new AuthoringStore(process.cwd());
for(const [slug,subject] of Object.entries(subjects)){
 const id=`asset.interface.campaign.${slug}`;
 try{await store.get(id);}catch{await store.dispatch({op:'asset.create',definition:{version:1,id,name:`${slug} campaign crest`,kind:'interface',revision:1,status:'draft',tags:['campaign','original'],resources:[],usesGeometry:false,materials:[],bindings:{profile:'interface-image',render:[],scenery:[]},capabilities:{},provenance:{method:'generated',licenseNote:'Original Under the Canopy faction crest, generated with built-in ImageGen.'}}});}
 const bytes=await sharp(await readFile(resolve(input,`${slug}.png`))).resize({width:768,withoutEnlargement:true}).webp({quality:90,alphaQuality:100,effort:6}).toBuffer();
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role:'image',index:1,format:'webp',base64:bytes.toString('base64')});
 const metadata={tool:'built-in image_gen',prompt:common+' Subject: '+subject,processing:'Downsize to 768px, WebP quality 90, preserve alpha. Labels and locked treatment remain live HTML/CSS.'};
 await store.dispatch({op:'asset.upload',id,expectedRevision:(await store.get(id)).revision,role:'generation',index:1,format:'json',base64:Buffer.from(JSON.stringify(metadata,null,2)+'\n').toString('base64')});
 await store.dispatch({op:'asset.publish',id,expectedRevision:(await store.get(id)).revision});
 console.log('Published',id,bytes.length);
}
