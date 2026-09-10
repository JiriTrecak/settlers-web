/** Apply the seed and landscape brushes through the running game's editor, then export. */
import {readFileSync,writeFileSync} from 'node:fs';
import {EditorHub} from '../../mcp/editor/hub';
const hub=new EditorHub();await hub.listen();
try {
 const before=await hub.call('landscape',{action:'export'}) as {map:unknown};
 writeFileSync('tmp/editor-before-worldroot.utcmap',JSON.stringify(before.map));
 const seed=JSON.parse(readFileSync('tmp/worldroot-seed.utcmap','utf8'));
 for(const e of seed.entities)if(e.id==='worldroot.mine.0'||e.id==='worldroot.mine.1')e.initialState={amount:3000};
 await hub.call('landscape',{action:'load',map:seed},30000);
 const roads=JSON.parse(readFileSync('tmp/worldroot-roads.json','utf8')) as number[][][];
 for(const road of roads)await hub.call('landscape',{action:'curve',points:road.map(([x,z])=>({x,z})),mode:'terrain',layer:'sand',radius:4,opacity:.85});
 for(const [x,z] of [[35,35],[221,35],[35,221],[221,221]])await hub.call('landscape',{action:'landform',x,z,radiusX:22,radiusZ:28,height:4,roughness:.09,seed:4719});
 for(let z=18;z<250;z+=24)for(let x=18;x<250;x+=24)await hub.call('landscape',{action:'cover',x,z,radius:15,density:.8,flowers:.015,grassScale:.65,broadRatio:1,palette:'forest',seed:x*73+z});
 await hub.call('landscape',{action:'view',grid:false});
 const result=await hub.call('landscape',{action:'export'}) as {map:unknown};
 writeFileSync('assets/maps/skirmish/worldroot-hollow.utcmap',JSON.stringify(result.map)+'\n');
 console.log('Exported Worldroot Hollow from the live editor');
 console.log(JSON.stringify(await hub.call('landscape',{action:'status'})));
}finally{hub.stop()}
