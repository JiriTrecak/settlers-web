import {DEFAULT_WATER_STYLE,parseWaterStyle,type WaterStyle} from '../../shared/landscape/waterStyle';
import type {WorldEditor} from '../world/worldEditor';
const FALLBACK={...DEFAULT_WATER_STYLE,shallowColor:'#668378',deepColor:'#102f36',clarity:3.2,flowSpeed:.65,reflectionStrength:0,shadowStrength:.6,causticStrength:.4};
/** Map-authored surface appearance; geometry/depth remain terrain controls. */
export class WaterControls {
 readonly root=document.createElement('details');
 private readonly inputs=new Map<keyof WaterStyle,HTMLInputElement>();
 constructor(private readonly editor:WorldEditor){
  this.root.className='border-t border-white/10 pt-3';
  const summary=document.createElement('summary');summary.textContent='Water surface';summary.className='cursor-pointer text-sm font-medium';this.root.append(summary);
  const body=document.createElement('div');body.className='mt-3 flex flex-col gap-3';this.root.append(body);
  for(const [key,title,type,min,max,step]of [
   ['shallowColor','Shallow water','color'],['deepColor','Deep water','color'],
   ['clarity','Clarity (metres)','number',.2,12,.1],['flowSpeed','Current speed','number',0,3,.05],
   ['rippleScale','Ripple scale','number',.01,1,.01],['rippleStrength','Ripple strength','number',0,.5,.01],
   ['reflectionStrength','Reflection strength','number',0,1,.05],['foamStrength','Shore foam','number',0,1,.05],
   ['causticStrength','Caustic strength','number',0,1,.05],['shadowStrength','Surface shadows','number',0,1,.05],
   ['cloudStrength','Broad variation','number',0,.2,.005],
  ] as const){
   const label=document.createElement('label');label.className='flex items-center justify-between gap-2 text-xs text-canopy/80';label.append(title);
   const input=document.createElement('input');input.type=type;input.setAttribute('aria-label',title);input.className='w-20 rounded bg-black/30 p-1 text-canopy';
   if(min!==undefined)input.min=String(min);if(max!==undefined)input.max=String(max);if(step!==undefined)input.step=String(step);
   input.onchange=()=>{if(!input.checkValidity()){input.reportValidity();return;}
    const data=parseWaterStyle({...FALLBACK,...editor.map.landscape?.water,[key]:type==='color'?input.value:Number(input.value)});
    if(data)editor.waterStyle(data);
   };
   this.inputs.set(key,input);label.append(input);body.append(label);
  }
  const help=document.createElement('p');help.className='text-xs text-canopy/60';help.textContent='Higher clarity reveals more of the bed. Current follows river curves. These settings are saved with the map.';body.append(help);this.sync();
 }
 sync(){const value={...FALLBACK,...this.editor.map.landscape?.water};for(const [key,input]of this.inputs)if(document.activeElement!==input)input.value=String(value[key]);}
}
