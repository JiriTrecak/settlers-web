/** Reuse our authored woodland kit for the existing neutral root deposit. */
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {originalPackage,addBytes,addFile,publishOriginals} from './original-publication';
const source='.asset-work/build/resources/corrupted-root',id='asset.models.resources.corrupted-root';
const p=originalPackage(id,'Corrupted Root Deposit','prop','authored');
await addFile(p,'geometry','glb',source+'/geometry.glb');await addFile(p,'source','blend',source+'/source.blend');await addFile(p,'preview','png',source+'/render.png');
addBytes(p,'image','png',await sharp(source+'/render.png').resize(128,128).png().toBuffer());
addBytes(p,'generation','json',Buffer.from(JSON.stringify({method:'authored',recipe:source+'/model.py',base:'asset.models.environment.woodland-giant-stump',adapter:await readFile(source+'/model.py','utf8')},null,2)));
p.definition.bindings.render=[{id:'asset.resource.corrupted-root',geometry:{asset:id,role:'geometry',index:1},scale:1,healthHeight:3.2}];
p.definition.capabilities={groundContact:{mode:'pivot'}};
await publishOriginals([p],(index,changed)=>{for(const a of index.values())if(a.id!==id&&a.bindings.render.some(r=>r.id==='asset.resource.corrupted-root')){a.bindings.render=a.bindings.render.filter(r=>r.id!=='asset.resource.corrupted-root');a.revision++;changed.add(a.id);}});
