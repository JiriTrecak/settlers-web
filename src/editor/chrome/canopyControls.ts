import {canopySchema,DEFAULT_CANOPY,type CanopySettings} from '../../shared/landscape/canopy';
import type {WorldEditor} from '../world/worldEditor';
/** Appearance-only map settings; no hidden navigation blockers. */
export class CanopyControls {
 readonly root=document.createElement('details');
 private inputs=new Map<keyof CanopySettings,HTMLInputElement>();
 constructor(private editor:WorldEditor){
  this.root.className='border-t border-white/10 pt-3';
  const summary=document.createElement('summary');summary.textContent='Overhead forest canopy';summary.className='cursor-pointer text-sm font-medium';this.root.append(summary);
  const body=document.createElement('div');body.className='mt-3 flex flex-col gap-3';this.root.append(body);
  const fields=[['enabled','Canopy shadows',0,1,1],['height','Canopy height',12,100,1],['scale','Pattern span',16,160,1],['coverage','Leaf coverage',.1,.95,.01],['sway','Branch sway',0,3,.1],['speed','Canopy animation speed',0,2,.05],['cloudShadow','Passing cloud shade',0,1,.05],['seed','Canopy pattern seed',0,2147483647,1]] as const;
  for(const [key,label,min,max,step] of fields){
   const row=document.createElement('label');row.className='flex items-center justify-between gap-2 text-xs text-canopy/80';row.append(label);
   const input=document.createElement('input');input.type=key==='enabled'?'checkbox':'number';input.min=String(min);input.max=String(max);input.step=String(step);input.className='w-20 rounded bg-black/30 p-1 text-canopy';input.setAttribute('aria-label',label);
   input.onchange=()=>{
    if(!input.checkValidity()){input.reportValidity();return;}
    const settings={...(editor.map.landscape?.environment.canopy??DEFAULT_CANOPY),[key]:key==='enabled'?input.checked:Number(input.value)};
    editor.environment({canopy:canopySchema.parse(settings)});this.sync();
   };
   this.inputs.set(key,input);row.append(input);body.append(row);
  }
  const note=document.createElement('p');note.className='text-xs text-canopy/60';note.textContent='An unseen layer of leaves shades the ground, buildings and mist together. Enable shadows in graphics settings. Higher coverage gives fewer sunlit openings; the same world pattern gently sways.';body.append(note);this.sync();
 }
 sync(){const s=this.editor.map.landscape?.environment.canopy??DEFAULT_CANOPY;for(const [key,input]of this.inputs){if(document.activeElement===input)continue;if(key==='enabled')input.checked=s.enabled;else input.value=String(s[key]??DEFAULT_CANOPY[key]??0);}}
}
