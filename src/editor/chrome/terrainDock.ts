import {biomeById} from '../../content/biomes';
import { btn, btnPrimary, sheet } from '../../ui';
import type { WorldEditor } from '../world/worldEditor';
/** Terrain and river brushes share the same curve authoring controls. */
export class TerrainDock {
  readonly root=document.createElement('div');
  private refreshBiome=()=>{};
  constructor(host:HTMLElement,editor:WorldEditor){
    this.root.className=`pointer-events-auto absolute left-24 top-1/2 z-20 flex w-60 max-h-[85vh] overflow-y-auto -translate-y-1/2 flex-col gap-3 rounded-2xl p-3 font-dock ${sheet}`;
    this.root.classList.add('editor-properties');
    this.root.setAttribute('aria-label','Terrain and curves');
    const title=document.createElement('strong');title.textContent='Terrain';
    const mode=document.createElement('select');mode.setAttribute('aria-label','Brush effect');
    for(const [value,label] of [['terrain','Paint ground'],['hill','Shape hill'],['plateau','Plateau'],['ramp','Ramp'],['basin','Basin'],['raise','Raise ground'],['smooth','Smooth ground'],['flatten','Level ground']]){const o=document.createElement('option');o.value=value;o.textContent=label;mode.append(o);}
    mode.className='rounded-lg bg-black/30 p-2 text-canopy';mode.onchange=()=>{editor.terrainMode=mode.value as WorldEditor['terrainMode'];editor.clearTerrainCurve();if(mode.value==='plateau'||mode.value==='ramp'){editor.terrainCurve=true;curve.textContent='Stroke: curve points';}};
    const layer=document.createElement('select');layer.setAttribute('aria-label','Ground material');
    for(const material of biomeById(editor.map.biome).materials){layer.append(new Option(material.name,material.id));}
    layer.value='sand';layer.className=mode.className;layer.onchange=()=>{editor.terrainLayer=layer.value as WorldEditor['terrainLayer'];};
    const radius=range('Radius (m)',.5,32,.5,editor.terrainRadius,n=>editor.terrainRadius=n);
    const depth=range('Depth / absolute plateau height (m)',-16,24,.1,1.4,n=>editor.terrainDepth=n);
    const aspect=range('Oval shape',.25,2,.05,1,n=>editor.terrainAspect=n);
    const rotation=range('Rotation',0,180,5,0,n=>editor.terrainRotation=n);
    const curve=document.createElement('button');curve.className=btn;curve.textContent='Stroke: freehand';curve.onclick=()=>{if(editor.terrainMode==='ramp')return;editor.terrainCurve=!editor.terrainCurve;curve.textContent=editor.terrainCurve?'Stroke: curve points':'Stroke: freehand';editor.clearTerrainCurve();};
    const hint=document.createElement('p');hint.className='text-xs leading-5 text-canopy/60';hint.textContent='Plateau: click a closed outline, then Apply; height is absolute. Ramp: click from lower to upper ground, then Apply; radius sets half-width. Drag to paint; click to place a hill, plateau, or basin. In curve mode, click to add control points, then Apply curve.';
    const apply=document.createElement('button');apply.className=btnPrimary;apply.textContent='Apply curve';apply.onclick=()=>{try{editor.applyTerrainCurve();message.textContent='Terrain applied';}catch(e){message.textContent=(e as Error).message;}};
    const message=document.createElement('p');message.setAttribute('role','status');message.className='text-xs text-amber-200';
    const clear=document.createElement('button');clear.className=btn;clear.textContent='Clear points';clear.onclick=()=>editor.clearTerrainCurve();
    const landform=document.createElement('select');landform.setAttribute('aria-label','Landform preset');for(const p of biomeById(editor.map.biome).landforms)landform.add(new Option(p.name,p.id));
    const paint=document.createElement('button');paint.className=btn;paint.textContent='Paint landform';paint.onclick=()=>editor.beginLayerPaint(landform.value,landform.selectedOptions[0]!.text);
    this.refreshBiome=()=>{const b=biomeById(editor.map.biome);layer.replaceChildren(...b.materials.map(m=>new Option(m.name,m.id)));layer.value=editor.terrainLayer;landform.replaceChildren(...b.landforms.map(m=>new Option(m.name,m.id)));};
    const trail=document.createElement('select');trail.setAttribute('aria-label','Surface layer preset');
    const trailMode=document.createElement('select');trailMode.setAttribute('aria-label','Surface drawing mode');for(const [id,name] of [['paint','Paint'],['line','Line'],['curve','Curve']])trailMode.add(new Option(name,id));
    const addTrail=document.createElement('button');addTrail.className=btnPrimary;addTrail.textContent='New surface layer';addTrail.onclick=()=>{const name=trail.selectedOptions[0]!.text;if(trailMode.value==='paint')editor.beginLayerPaint(trail.value,name);else editor.beginNewLayer(trail.value,name,trailMode.value as 'line'|'curve');};
    const refresh=this.refreshBiome;this.refreshBiome=()=>{refresh();const paths=biomeById(editor.map.biome).paths??[];trail.replaceChildren(...paths.map(p=>new Option(p.name,p.id)));for(const el of [trail,trailMode,addTrail])el.hidden=!paths.length;};this.refreshBiome();
    this.root.append(title,trail,trailMode,addTrail,landform,paint,mode,layer,radius,depth,aspect,rotation,curve,hint,apply,clear,message);host.append(this.root);this.setOpen(false);
  }
  setOpen(on:boolean){if(on)this.refreshBiome();this.root.classList.toggle('hidden',!on);}
  destroy(){this.root.remove();}
}
function range(label:string,min:number,max:number,step:number,value:number,change:(n:number)=>void){
  const root=document.createElement('label');root.className='flex flex-col gap-2 text-xs text-canopy/70';
  const text=document.createElement('span');text.textContent=`${label}: ${value}`;
  const input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.value=String(value);input.setAttribute('aria-label',label);
  input.oninput=()=>{change(Number(input.value));text.textContent=`${label}: ${input.value}`;};root.append(text,input);return root;
}
