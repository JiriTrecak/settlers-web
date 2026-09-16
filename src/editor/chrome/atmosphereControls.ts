import {atmosphereSchema,DEFAULT_ATMOSPHERE,DEFAULT_SHAFT_TINT,type AtmosphereSettings,type MistRegion} from '../../shared/landscape/atmosphere';
import type {WorldEditor} from '../world/worldEditor';
/** All fields edit the same validated map data used by MCP and gameplay. */
export class AtmosphereControls {
 readonly root=document.createElement('details');
 private readonly inputs=new Map<string,HTMLInputElement>();
 private readonly list=document.createElement('select');
 private selected='';
 private readonly regionFields=document.createElement('div');
 private readonly regionInputs=new Map<string,HTMLInputElement>();
 private readonly notice=document.createElement('p');
 constructor(private readonly editor:WorldEditor){
  this.root.className='border-t border-white/10 pt-3';
  const title=document.createElement('summary');title.textContent='Volumetric mist & light shafts';title.className='cursor-pointer text-sm font-medium';this.root.append(title);
  const body=document.createElement('div');body.className='mt-3 flex flex-col gap-3';this.root.append(body);
  const current=()=>editor.map.landscape?.environment.atmosphere??DEFAULT_ATMOSPHERE;
  const change=(key:string,value:string|number|boolean)=>this.apply({...current(),[key]:value});
  this.input(body,this.inputs,'enabled','Enable atmosphere','checkbox',undefined,undefined,undefined,change);
  this.input(body,this.inputs,'color','Mist color','color',undefined,undefined,undefined,change);
  this.input(body,this.inputs,'sunTint','Light shaft tint','color',undefined,undefined,undefined,change);
  for(const [key,label,min,max,step]of [
   ['density','Global density',0,.08,.001],['baseHeight','Mist base height',-32,64,.5],['heightFalloff','Height falloff',.5,24,.5],
   ['sunStrength','Light shaft strength',0,3,.05],['noiseScale','Mist texture scale',.01,.5,.01],['noiseStrength','Patchiness',0,1,.05],['driftSpeed','Drift speed',0,3,.05],
  ] as const)this.input(body,this.inputs,key,label,'number',min,max,step,change);
  const help=document.createElement('p');help.className='text-xs text-canopy/60';help.textContent='Saved with the map. Mist follows weather wind; rain softens shafts. Graphics settings control quality. Local regions are soft ellipsoids; Y is absolute height.';body.append(help);
  this.list.setAttribute('aria-label','Local mist region');this.list.className='rounded bg-black/30 p-2 text-canopy';this.list.onchange=()=>{this.selected=this.list.value;this.sync();};body.append(this.list);
  const actions=document.createElement('div');actions.className='flex gap-2';
  const add=document.createElement('button');add.type='button';add.textContent='Add mist here';add.onclick=()=>{
   const settings=current();if(settings.regions.length>=16){this.notice.textContent='Maximum 16 mist regions.';return;}
   const v=editor.view(),id=`mist-${crypto.randomUUID().slice(0,8)}`;this.selected=id;
   this.apply({...settings,enabled:true,regions:[...settings.regions,{id,x:Math.round(v.x),z:Math.round(v.z),y:editor.height.sample(v.x,v.z)+1,radiusX:12,radiusY:3,radiusZ:12,density:.03}]});
  };
  const remove=document.createElement('button');remove.type='button';remove.textContent='Remove region';remove.onclick=()=>this.apply({...current(),regions:current().regions.filter(r=>r.id!==this.selected)});
  for(const b of [add,remove])b.className='rounded border border-white/20 px-2 py-1 text-xs text-canopy';actions.append(add,remove);body.append(actions);
  this.regionFields.className='flex flex-col gap-2';body.append(this.regionFields);
  for(const [key,label,min,max,step]of [
   ['x','Region X',-1024,4096,1],['z','Region Z',-1024,4096,1],['y','Region height',-64,128,.5],
   ['radiusX','East / west radius',1,128,1],['radiusZ','North / south radius',1,128,1],['radiusY','Vertical radius',.5,32,.5],['density','Region density',0,.2,.001],
  ] as const)this.input(this.regionFields,this.regionInputs,key,label,'number',min,max,step,(key,value)=>{
   const settings=current();this.apply({...settings,regions:settings.regions.map(r=>r.id===this.selected?{...r,[key]:value}:r)});
  });
  this.notice.className='text-xs text-red-300';this.notice.setAttribute('role','status');body.append(this.notice);this.sync();
 }
 private input(host:HTMLElement,store:Map<string,HTMLInputElement>,key:string,label:string,type:string,min:number|undefined,max:number|undefined,step:number|undefined,change:(key:string,value:string|number|boolean)=>void){
  const row=document.createElement('label');row.className='flex items-center justify-between gap-2 text-xs text-canopy/80';row.append(label);
  const input=document.createElement('input');input.type=type;input.setAttribute('aria-label',label);input.className='w-20 rounded bg-black/30 p-1 text-canopy';
  if(min!==undefined)input.min=String(min);if(max!==undefined)input.max=String(max);if(step!==undefined)input.step=String(step);
  input.onchange=()=>{if(!input.checkValidity()){input.reportValidity();return;}change(key,type==='checkbox'?input.checked:type==='number'?Number(input.value):input.value);};
  store.set(key,input);row.append(input);host.append(row);
 }
 private apply(settings:AtmosphereSettings){const result=atmosphereSchema.safeParse(settings);if(!result.success){this.notice.textContent=result.error.issues[0]?.message??'Invalid atmosphere';return;}this.notice.textContent='';this.editor.environment({atmosphere:result.data});this.sync();}
 sync(){
  const settings=this.editor.map.landscape?.environment.atmosphere??DEFAULT_ATMOSPHERE;
  for(const [key,input]of this.inputs){if(document.activeElement===input)continue;const value=key==='sunTint'?(settings.sunTint??DEFAULT_SHAFT_TINT):settings[key as keyof AtmosphereSettings];if(input.type==='checkbox')input.checked=!!value;else input.value=String(value);}
  if(!settings.regions.some(r=>r.id===this.selected))this.selected=settings.regions[0]?.id??'';
  const options=settings.regions.map(r=>r.id).join('|');if(this.list.dataset.options!==options){this.list.dataset.options=options;this.list.replaceChildren(...settings.regions.map(r=>new Option(r.id,r.id)));}
  this.list.value=this.selected;const region=settings.regions.find(r=>r.id===this.selected);this.regionFields.style.display=region?'flex':'none';
  if(region)for(const [key,input]of this.regionInputs)if(document.activeElement!==input)input.value=String(region[key as keyof MistRegion]);
 }
}
