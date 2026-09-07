import { btn, btnPrimary, sheet } from '../../ui';
import type { WorldEditor } from '../world/worldEditor';
/** Terrain and river brushes share the same curve authoring controls. */
export class TerrainDock {
  readonly root=document.createElement('div');
  constructor(host:HTMLElement,editor:WorldEditor){
    this.root.className=`pointer-events-auto absolute left-24 top-1/2 z-20 flex w-60 -translate-y-1/2 flex-col gap-3 rounded-2xl p-3 font-dock ${sheet}`;
    this.root.setAttribute('aria-label','Terrain and curves');
    const title=document.createElement('strong');title.textContent='Terrain & curves';
    const mode=document.createElement('select');mode.setAttribute('aria-label','Brush effect');
    for(const [value,label] of [['terrain','Paint ground'],['river','Carve river'],['raise','Raise ground'],['smooth','Smooth terrain'],['flatten','Level terrain'],['foliage','Scatter current kit']]){const o=document.createElement('option');o.value=value;o.textContent=label;mode.append(o);}
    mode.className='rounded-lg bg-black/30 p-2 text-canopy';mode.onchange=()=>{editor.terrainMode=mode.value as WorldEditor['terrainMode'];};
    const layer=document.createElement('select');layer.setAttribute('aria-label','Ground material');
    for(const value of ['grass','sand','mud','rock','snow']){const o=document.createElement('option');o.value=value;o.textContent=value[0]!.toUpperCase()+value.slice(1);layer.append(o);}
    layer.value='sand';layer.className=mode.className;layer.onchange=()=>{editor.terrainLayer=layer.value as WorldEditor['terrainLayer'];};
    const radius=range('Radius (m)',.5,32,.5,4,n=>editor.terrainRadius=n);
    const depth=range('Depth / height (m)',.1,8,.1,1.4,n=>editor.terrainDepth=n);
    const curve=document.createElement('button');curve.className=btn;curve.textContent='Stroke: freehand';curve.onclick=()=>{editor.terrainCurve=!editor.terrainCurve;curve.textContent=editor.terrainCurve?'Stroke: curve points':'Stroke: freehand';editor.clearTerrainCurve();};
    const hint=document.createElement('p');hint.className='text-xs leading-5 text-canopy/60';hint.textContent='Drag to paint. In curve mode, click to add control points, then Apply curve. The line previews the center of your stroke.';
    const apply=document.createElement('button');apply.className=btnPrimary;apply.textContent='Apply curve';apply.onclick=()=>editor.applyTerrainCurve();
    const clear=document.createElement('button');clear.className=btn;clear.textContent='Clear points';clear.onclick=()=>editor.clearTerrainCurve();
    this.root.append(title,mode,layer,radius,depth,curve,hint,apply,clear);host.append(this.root);this.setOpen(false);
  }
  setOpen(on:boolean){this.root.classList.toggle('hidden',!on);}
  destroy(){this.root.remove();}
}
function range(label:string,min:number,max:number,step:number,value:number,change:(n:number)=>void){
  const root=document.createElement('label');root.className='flex flex-col gap-2 text-xs text-canopy/70';
  const text=document.createElement('span');text.textContent=`${label}: ${value}`;
  const input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);input.setAttribute('aria-label',label);
  input.oninput=()=>{change(Number(input.value));text.textContent=`${label}: ${input.value}`;};root.append(text,input);return root;
}
