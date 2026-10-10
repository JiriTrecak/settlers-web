import { btn, sheet } from '../../ui';
import { DECAL_KINDS, type DecalKind } from '../../shared/landscape/decal';
import type { WorldEditor } from '../world/worldEditor';

export class DecalDock {
  readonly root=document.createElement('div');
  private readonly kind=document.createElement('select');
  private readonly mode=document.createElement('select');
  private readonly info=document.createElement('p');
  private readonly preview=document.createElement('p');
  private readonly apply=document.createElement('button');
  private readonly discard=document.createElement('button');
  private error='';
  private readonly positions: {key:'x'|'z';input:HTMLInputElement}[]=[];
  private readonly fields: {input:HTMLInputElement; output:HTMLElement; key:'size'|'rotation'|'opacity';label:string}[]=[];
  constructor(host:HTMLElement,private readonly editor:WorldEditor){
    this.root.className=`pointer-events-auto absolute right-4 top-[76px] bottom-[102px] z-20 flex w-60 flex-col gap-3 overflow-y-auto rounded-2xl p-3 font-dock ${sheet}`;
    this.root.setAttribute('aria-label','Ground decals');
    const title=document.createElement('strong');title.textContent='Ground decals';this.root.append(title);
    for(const [select,label,values] of [[this.mode,'Decal action',['place','select','erase']],[this.kind,'Decal pattern',DECAL_KINDS]] as const){
      select.setAttribute('aria-label',label);select.className='rounded-lg bg-black/30 p-2 text-canopy';
      for(const value of values){const o=document.createElement('option');o.value=value;o.textContent=value==='place'?'Paint preview':value.replaceAll('-',' ').replace(/^./,c=>c.toUpperCase());select.append(o);}this.root.append(select);
    }
    this.mode.onchange=()=>{editor.decalMode=this.mode.value as WorldEditor['decalMode'];editor.selectedDecal=null;this.sync();};
    this.kind.onchange=()=>editor.configureDecal({kind:this.kind.value as DecalKind});
    for(const [key,label,min,max,step] of [['size','Decal size (m)',.5,32,.5],['rotation','Decal rotation',-180,180,5],['opacity','Decal opacity',0,1,.05]] as const){
      const row=document.createElement('label');row.className='flex flex-col gap-2 text-xs text-canopy/70';
      const output=document.createElement('span'),input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.setAttribute('aria-label',label);
      input.oninput=()=>{editor.configureDecal({[key]:Number(input.value)});this.sync();};row.append(output,input);this.root.append(row);this.fields.push({input,output,key,label});
    }
    for(const key of ['x','z'] as const){
      const row=document.createElement('label');row.className='flex items-center justify-between text-xs text-canopy/70';row.textContent=`Position ${key.toUpperCase()}`;
      const input=document.createElement('input');input.type='number';input.step='.1';input.className='w-24 rounded bg-black/30 p-1';input.setAttribute('aria-label',`Decal position ${key.toUpperCase()}`);
      input.onchange=()=>{const d=editor.map.landscape?.decals?.find(d=>d.id===editor.selectedDecal);const n=Number(input.value);if(d&&Number.isFinite(n)&&n>=0&&n<editor.map.size)editor.putDecal({...d,[key]:n});this.sync();};
      row.append(input);this.root.append(row);this.positions.push({key,input});
    }
    const remove=document.createElement('button');remove.className=btn;remove.textContent='Delete selected decal';remove.onclick=()=>{if(editor.selectedDecal)editor.removeDecal(editor.selectedDecal);this.sync();};this.root.append(remove);
    this.preview.setAttribute('role','status');this.preview.className='text-xs text-canopy';
    this.apply.className=btn;this.apply.textContent='Apply decal preview';this.apply.onclick=()=>{void this.run(()=>editor.applyDecalPreview());};
    this.discard.className=btn;this.discard.textContent='Discard decal preview';this.discard.onclick=()=>{void this.run(()=>editor.discardDecalPreview());};
    this.root.append(this.preview,this.apply,this.discard);
    this.info.className='text-xs leading-5 text-canopy/60';this.root.append(this.info);host.append(this.root);this.setOpen(false);
  }
  private async run(action:()=>void|Promise<void>){this.error='';try{await action();}catch(error){this.error=error instanceof Error?error.message:String(error);}this.sync();}
  sync(){
    const e=this.editor;const selected=e.map.landscape?.decals?.find(d=>d.id===e.selectedDecal);
    for(const p of this.positions){p.input.disabled=!selected;p.input.value=selected?String(Math.round(selected[p.key]*100)/100):'';}
    this.kind.value=e.decalKind;this.mode.value=e.decalMode;
    for(const f of this.fields){const value=f.key==='size'?e.decalSize:f.key==='rotation'?e.decalRotation:e.decalOpacity;f.input.value=String(value);f.output.textContent=`${f.label}: ${value}`;}
    this.preview.textContent=this.error||`${e.decalPreview.length} preview patches · ${e.applyingDecals?'Applying…':'not saved until Apply'}`;
    this.apply.disabled=this.discard.disabled=e.applyingDecals||!e.decalPreview.length;
    this.info.textContent=e.decalMode==='select'?(e.selectedDecal?'Selected: adjust pattern, size, rotation or opacity.':'Click a decal to edit it.'):'Drag to preview patches, then Apply them together. Erase removes preview patches first. Details follow sculpted terrain.';
  }
  setOpen(on:boolean){this.root.classList.toggle('hidden',!on);if(on)this.sync();}
  destroy(){this.root.remove();}
}
