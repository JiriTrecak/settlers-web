/** Capture through the existing local renderer inspection API, not browser automation.
 * Start this, then open the printed reference-stage URL in the browser. */
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import sharp from 'sharp';
import {EditorHub} from '../../../mcp/editor/hub';
const folder='art/references/scouring-maps/eldenvale/comparisons';
const hub=new EditorHub(),port=7391;
const [x=291,z=254,zoom=1.2]=process.argv.slice(2).filter(a=>a!=='--occlusion-probe'&&a!=='--tour').map(Number);
if(![x,z,zoom].every(Number.isFinite)||zoom<.5||zoom>1.5)throw Error('Usage: capture.ts [x z zoom(.5..1.5)]');
const mode=await hub.listen(port);
if(mode!=='host'){hub.stop();throw Error(`Capture port ${port} is already in use; finish that capture first`);}
console.log(`Open http://127.0.0.1:5173/reference-stage.html?map=scouring-eldenvale&x=${x}&z=${z}&zoom=${zoom}&hour=12&inspect&inspectPort=${port}`);
try{
 const deadline=Date.now()+120_000;
 while(!hub.connected&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,250));
 if(!hub.connected)throw Error('No reference preview connected within two minutes');
 const result=await hub.call('screenshot',{maxWidth:1920,aspect:16/9,animationTime:12},30_000) as {data:string;mime:string;mapName:string;width:number;height:number;camera:{x:number;z:number;zoom:number};hour:number;animationTime:number};
 if(result.mapName!=='Eldenvale · Source Import'||result.mime!=='image/png')throw Error('Unexpected reference scene');
 if(Math.abs(result.camera.x-x)>.001||Math.abs(result.camera.z-z)>.001||Math.abs(result.camera.zoom-zoom)>.001||result.hour!==12)throw Error('Connected preview has a different camera or hour; open the printed URL and retry');
 const bytes=Buffer.from(result.data,'base64');
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid PNG capture');
 mkdirSync(folder,{recursive:true});const filename=`eldenvale-${Date.now()}`;
 writeFileSync(join(folder,filename+'.png'),bytes);
 const {data,...metadata}=result;
 const runtimeWaterDiagnostics=await hub.call('waterDiagnostics',{},30_000);
 console.log('Water reflection diagnostics:',JSON.stringify(runtimeWaterDiagnostics));
 writeFileSync(join(folder,filename+'.json'),JSON.stringify({...metadata,runtimeWaterDiagnostics,sourceMap:'assets/maps/showcase/scouring-eldenvale.utcmap'},null,2)+'\n');
 if(process.argv.includes('--tour')){
  const views=[
   {name:'01-river-crossing',x:291,z:254,gameZoom:1.5},
   {name:'02-outpost-and-ruins',x:276,z:202,gameZoom:1.5},
   {name:'03-forest-and-gold',x:306,z:444,gameZoom:1.5},
   {name:'04-river-monuments',x:254,z:251,gameZoom:1.5},
  ];
  const tourFolder=join(folder,filename+'-tour');mkdirSync(tourFolder,{recursive:true});
  try{
   for(const view of views){
    await hub.call('gameView',view,30_000);
    const shot=await hub.call('screenshot',{maxWidth:1920,aspect:16/9,animationTime:12},30_000) as typeof result;
    const {data,...info}=shot;
    if(shot.mime!=='image/png'||shot.mapName!==result.mapName)throw Error('Unexpected tour capture');
    writeFileSync(join(tourFolder,view.name+'.png'),Buffer.from(data,'base64'));
    writeFileSync(join(tourFolder,view.name+'.json'),JSON.stringify(info,null,2)+'\n');
    console.log(join(tourFolder,view.name+'.png'));
   }
  }finally{await hub.call('gameView',{x,z,gameZoom:zoom},30_000);}
 }
 if(process.argv.includes('--occlusion-probe')){
  const {readFileSync}=await import('node:fs');
  const map=JSON.parse(readFileSync('assets/maps/showcase/scouring-eldenvale.utcmap','utf8'));
  const plants=map.landscape.importedTerrain.occlusion.dynamic.plants as {id:string;x:number;z:number}[];
  const target=plants.reduce((a,b)=>Math.hypot(a.x-x,a.z-z)<Math.hypot(b.x-x,b.z-z)?a:b);
  const probe=await hub.call('occlusionProbe',{id:target.id,radius:12},30_000) as {id:string;baseline:string;without:string;restored:string;restoredBytes:boolean;changedPixels:number};
  for(const phase of ['baseline','without','restored'] as const)writeFileSync(join(folder,filename+'-occlusion-'+phase+'.png'),Buffer.from(probe[phase],'base64'));
  const {baseline,without,restored,...report}=probe;
  const decoded=await Promise.all([baseline,without,restored].map(data=>sharp(Buffer.from(data,'base64')).ensureAlpha().raw().toBuffer({resolveWithObject:true})));
  const [before,changed,after]=decoded;
  if(decoded.some(image=>image.info.width!==before!.info.width||image.info.height!==before!.info.height||image.info.channels!==4))throw Error('Occlusion probe image dimensions differ');
  let changedRenderedPixels=0,restoredPixelMismatches=0,maximumChannelDifference=0;
  for(let i=0;i<before!.data.length;i+=4){
   let differs=false,restoreDiffers=false;
   for(let c=0;c<4;c++){
    const a=before!.data[i+c]!,b=changed!.data[i+c]!,r=after!.data[i+c]!;
    differs ||= a!==b;restoreDiffers ||= a!==r;
    maximumChannelDifference=Math.max(maximumChannelDifference,Math.abs(a-b));
   }
   if(differs)changedRenderedPixels++;if(restoreDiffers)restoredPixelMismatches++;
  }
  const pixelCheck={changedRenderedPixels,restoredPixelMismatches,maximumChannelDifference};
  writeFileSync(join(folder,filename+'-occlusion.json'),JSON.stringify({...report,pixelCheck},null,2)+'\n');
  if(!probe.restoredBytes||!probe.changedPixels)throw Error('Occlusion probe failed to change and restore source bytes');
  if(!changedRenderedPixels||restoredPixelMismatches)throw Error('Occlusion probe failed to change and exactly restore rendered pixels');
  console.log('Occlusion probe:',JSON.stringify({...report,pixelCheck}));
 }
 console.log(join(folder,filename+'.png'));
}finally{hub.stop();}
