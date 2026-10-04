import {SceneryComposition} from '../../../src/presentation/sceneryChanges';
/** Real Canvas2D full-raster oracle versus clipped production painter. No map mutations. */
import {MinimapSceneryIndex} from '../../../src/render/minimap/sceneryIndex';
import {drawScenery,MinimapSceneryRaster} from '../../../src/render/minimap/sceneryRaster';
import type {MapStamp} from '../../../src/shared/map/utcmap';
const status=document.querySelector('#status')!,result=document.querySelector('#result')!,preview=document.querySelector('#preview')!,button=document.querySelector<HTMLButtonElement>('#run')!;
button.onclick=async()=>{button.disabled=true;try{
 preview.replaceChildren();const pixels=384,size=512,scale=pixels/size,palette={forest:'#345323',crown:'#638144'};
 const contexts=[0,1].map(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=pixels;preview.append(canvas);return canvas.getContext('2d',{willReadFrequently:true})!;});
 const scratch=document.createElement('canvas');scratch.width=scratch.height=pixels;scratch.getContext('2d',{willReadFrequently:true});const raster=new MinimapSceneryRaster(scratch);
 const terrain=document.createElement('canvas');terrain.width=terrain.height=pixels;const ground=terrain.getContext('2d',{willReadFrequently:true})!;ground.fillStyle='#79724a';ground.fillRect(0,0,pixels,pixels);
 let seed=13913;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 let stamps:MapStamp[]=Array.from({length:100000},(_,i)=>({id:`prop${i}`,asset:i<14000?(i%9===0?'rock':'pine'):'grass',x:random()*size,y:random()*size,scale:.2+random()*5,widthScale:.3+random()*2,variant:i%5===0?'gold':i%11===0?'red':undefined}));
 const base=stamps.slice(14000);stamps=stamps.slice(0,14000);
 const composition=new SceneryComposition(),index=new MinimapSceneryIndex();
 const differences:unknown[]=[],examples:unknown[]=[];
 const totals={fullMs:0,incrementalMs:0,indexMs:0,changedChannels:0,maxDelta:0,comparisons:0};
 for(let step=0;step<50;step++){
  if(step>0){
   if(step%10===0)stamps=[...stamps.slice(1),{...stamps[0],x:random()*size,y:random()*size}];
   else if(step%7===0)stamps=[{id:`add${step}`,asset:'pine',x:31.5/scale-.5,y:63.5/scale-.5,scale:9},...stamps];
   else stamps=stamps.slice(1);
  }
  let t=performance.now();index.update(composition.compose(base,stamps));if(step)totals.indexMs+=performance.now()-t;
  const oracle=new MinimapSceneryIndex();oracle.update([...base,...stamps]);
  const images:Uint8ClampedArray[]=[];
  for(let variant=0;variant<2;variant++){
   const ctx=contexts[variant];t=performance.now();
   if(variant)raster.paint(ctx,terrain,index.items,size,palette,step===0);
   else{
    ctx.clearRect(0,0,pixels,pixels);ctx.drawImage(terrain,0,0);
    drawScenery(ctx,oracle.items,scale,palette);
    const v=ctx.createRadialGradient(pixels/2,pixels/2,pixels*.3,pixels/2,pixels/2,pixels*.72);v.addColorStop(0,'transparent');v.addColorStop(1,'#14201955');ctx.fillStyle=v;ctx.fillRect(0,0,pixels,pixels);
   }
   images.push(ctx.getImageData(0,0,pixels,pixels).data);
   if(step)totals[variant?'incrementalMs':'fullMs']+=performance.now()-t;
  }
  if(step)totals.comparisons++;
  let changed=0;
  for(let i=0;i<images[0].length;i++){const delta=Math.abs(images[0][i]-images[1][i]);if(delta){if(step===0&&examples.length<15)examples.push({x:Math.floor(i/4)%pixels,y:Math.floor(i/4/pixels),full:images[0][i],tile:images[1][i]});changed++;totals.changedChannels++;totals.maxDelta=Math.max(totals.maxDelta,delta);}}
  if(changed)differences.push({step,changed});
  await new Promise(requestAnimationFrame);
 }
 result.textContent=JSON.stringify({...totals,differences,examples,props:base.length+stamps.length,scenery:index.items.length,meanFullMs:totals.fullMs/totals.comparisons,meanIncrementalMs:totals.incrementalMs/totals.comparisons},null,2);
 status.textContent=totals.changedChannels?'FAIL: pixels differ':'PASS: all full and incremental pixels match';
}catch(error){status.textContent=String(error);}finally{button.disabled=false;}};
