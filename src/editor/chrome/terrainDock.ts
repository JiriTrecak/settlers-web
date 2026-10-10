import {isCliffMaterial} from '../../shared/authoring/groundTextures';
import {HEIGHT_MIN,HEIGHT_MAX} from '../../shared/map/terrainLimits';
import {TERRAIN_AUTHORING} from '../../content/terrain';
import {biomeById} from '../../content/biomes';
import { btn, btnPrimary, sheet } from '../../ui';
import type { WorldEditor } from '../world/worldEditor';
import {landscapeAssets} from '../../shared/authoring/project';
import {assetUrls} from '../../shared/assets/urls.generated';
/** Grid selections are primary; sculpting and generator controls remain optional. */
export class TerrainDock {
  readonly root=document.createElement('div');
  private refreshBiome=()=>{};
  constructor(host:HTMLElement,editor:WorldEditor){
    this.root.className=`pointer-events-auto absolute left-24 top-1/2 z-20 flex w-60 max-h-[85vh] overflow-y-auto -translate-y-1/2 flex-col gap-3 rounded-2xl p-3 font-dock ${sheet}`;
    this.root.classList.add('editor-properties');
    this.root.setAttribute('aria-label','Terrain and curves');
    const title=document.createElement('strong');title.textContent='Terrain';
    const mode=document.createElement('select');mode.setAttribute('aria-label','Brush effect');
    for(const [value,label] of [['grid-level','Grid · set level'],['grid-ramp','Grid · ramp'],['grid-material','Grid · paint material'],['grid-shallow','Grid · shallow water'],['grid-deep','Grid · deep water'],['grid-dry','Grid · dry ground'],['hill','Sculpt · hill'],['plateau','Sculpt · plateau'],['ramp','Sculpt · ramp'],['basin','Sculpt · basin'],['raise','Sculpt · raise'],['smooth','Sculpt · smooth'],['flatten','Sculpt · flatten']]){const o=document.createElement('option');o.value=value;o.textContent=label;mode.append(o);}
    mode.className='rounded-lg bg-black/30 p-2 text-canopy';mode.onchange=()=>{editor.terrainMode=mode.value as WorldEditor['terrainMode'];editor.clearTerrainCurve();if(mode.value==='plateau'||mode.value==='ramp')editor.terrainCurve=true;curve.textContent=editor.terrainCurve?'Selection: polygon points':'Selection: drag rectangle';refreshControls();};
    const layer=document.createElement('select');layer.setAttribute('aria-label','Ground material');
    for(const material of biomeById(editor.map.biome).materials){layer.append(new Option(material.name,material.id));}
    layer.value='sand';layer.className=mode.className;layer.onchange=()=>{editor.terrainLayer=layer.value as WorldEditor['terrainLayer'];};
    const radius=range('Radius (m)',.5,32,.5,editor.terrainRadius,n=>editor.terrainRadius=n);
    const minLevel=Math.ceil(HEIGHT_MIN/TERRAIN_AUTHORING.levelHeight),maxLevel=Math.floor(HEIGHT_MAX/TERRAIN_AUTHORING.levelHeight);
    const gridLevel=range('Terrain / water level',minLevel,maxLevel,1,editor.terrainGridLevel,n=>editor.terrainGridLevel=n);
    const edge=document.createElement('select');edge.setAttribute('aria-label','Level edge');edge.className=mode.className;
    edge.add(new Option('Edge: cliff','cliff'));edge.add(new Option('Edge: sloped bank','bank'));edge.value=editor.terrainGridEdge;
    edge.onchange=()=>{editor.terrainGridEdge=edge.value as WorldEditor['terrainGridEdge'];refreshControls();};
    const bank=range('Outer bank width (cells)',.5,4,.5,editor.terrainGridBankCells,n=>editor.terrainGridBankCells=n);
    const rampFrom=range('Ramp start level',minLevel,maxLevel,1,editor.terrainRampFromLevel,n=>editor.terrainRampFromLevel=n);
    const rampTo=range('Ramp end level',minLevel,maxLevel,1,editor.terrainRampToLevel,n=>editor.terrainRampToLevel=n);
    const direction=document.createElement('select');direction.className=mode.className;direction.setAttribute('aria-label','Ramp direction');
    for(const id of ['north','east','south','west'])direction.add(new Option(`Start → end: ${id}`,id));
    direction.value=editor.terrainRampDirection;direction.onchange=()=>{editor.terrainRampDirection=direction.value as WorldEditor['terrainRampDirection'];};
    const refreshControls=()=>{
      const value=editor.terrainMode;mode.value=value;
      const waterDepth=value==='grid-shallow'?TERRAIN_AUTHORING.shallowDepth:value==='grid-deep'?TERRAIN_AUTHORING.deepDepth:0;
      const input=gridLevel.querySelector('input')!;input.min=String(Math.ceil((HEIGHT_MIN+waterDepth)/TERRAIN_AUTHORING.levelHeight));
      editor.terrainGridLevel=Math.max(Number(input.min),editor.terrainGridLevel);input.value=String(editor.terrainGridLevel);
      gridLevel.querySelector('span')!.textContent=`Terrain / water level: ${editor.terrainGridLevel}`;
      gridLevel.style.display=['grid-level','grid-dry','grid-shallow','grid-deep'].includes(value)?'':'none';
      edge.hidden=value!=='grid-level';bank.style.display=value==='grid-shallow'||value==='grid-deep'||value==='grid-level'&&editor.terrainGridEdge==='bank'?'':'none';
      for(const control of [rampFrom,rampTo,direction])control.style.display=value==='grid-ramp'?'':'none';
    };
    const gridMaterial=document.createElement('select');gridMaterial.setAttribute('aria-label','Grid ground material');gridMaterial.className=mode.className;
    const eraseLabel=document.createElement('label');eraseLabel.className='flex gap-2 text-xs text-canopy/70';const eraseTexture=document.createElement('input');eraseTexture.type='checkbox';eraseTexture.checked=editor.terrainGridErase;eraseTexture.onchange=()=>{editor.terrainGridErase=eraseTexture.checked;mode.value='grid-material';editor.terrainMode='grid-material';refreshControls();};eraseLabel.append(eraseTexture,'Erase selected texture');
    const textures=document.createElement('div');textures.className='grid max-h-64 grid-cols-2 gap-2 overflow-y-auto';textures.setAttribute('aria-label','Ground texture previews');
    const materialHint=document.createElement('p');materialHint.className='text-xs text-canopy/60';
    const selectMaterial=(id:string)=>{materialHint.textContent=isCliffMaterial(id)?'Cliff face: paints steep slopes without replacing the ground above or below.':'';editor.terrainGridMaterial=id;gridMaterial.value=id;for(const button of textures.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.material===id));};
    gridMaterial.onchange=()=>selectMaterial(gridMaterial.value);
    const depth=range('Depth / absolute plateau height (m)',HEIGHT_MIN,HEIGHT_MAX,.1,1.4,n=>editor.terrainDepth=n);
    const aspect=range('Oval shape',.25,2,.05,1,n=>editor.terrainAspect=n);
    const rotation=range('Rotation',0,180,5,0,n=>editor.terrainRotation=n);
    const curve=document.createElement('button');curve.className=btn;curve.textContent='Selection: drag rectangle';curve.onclick=()=>{if(editor.terrainMode==='ramp')return;editor.terrainCurve=!editor.terrainCurve;curve.textContent=editor.terrainCurve?'Selection: polygon points':'Selection: drag rectangle';editor.clearTerrainCurve();};
    const hint=document.createElement('p');hint.className='text-xs leading-5 text-canopy/60';hint.textContent='Grid: drag a rectangle, or click polygon points then Apply. Polygon points snap to corners and edge midpoints. Selected cells reach the exact level or depth; banks extend outside the selection. Shallow water allows ground units to cross. Apply generator previews before editing cells.';
    const apply=document.createElement('button');apply.className=btnPrimary;apply.textContent='Apply selection';apply.onclick=async()=>{apply.disabled=true;message.textContent='Applying…';try{await editor.applyTerrainCurve();message.textContent='';}catch(e){message.textContent=e instanceof Error?e.message:String(e);}finally{apply.disabled=false;}};
    const message=document.createElement('p');message.setAttribute('role','status');message.className='text-xs text-amber-200';
    const clear=document.createElement('button');clear.className=btn;clear.textContent='Clear points';clear.onclick=()=>editor.clearTerrainCurve();
    const landform=document.createElement('select');landform.setAttribute('aria-label','Landform preset');for(const p of biomeById(editor.map.biome).landforms)landform.add(new Option(p.name,p.id));
    const paint=document.createElement('button');paint.className=btn;paint.textContent='Paint landform';paint.onclick=()=>editor.beginLayerPaint(landform.value,landform.selectedOptions[0]!.text);
    this.refreshBiome=()=>{
     const b=biomeById(editor.map.biome);layer.replaceChildren(...b.materials.map(m=>new Option(m.name,m.id)));layer.value=editor.terrainLayer;landform.replaceChildren(...b.landforms.map(m=>new Option(m.name,m.id)));
     const choices=[...Object.entries(b.terrainTiles??{}).map(([name,tile])=>({id:tile.ar,name,image:`assets/library/${tile.ar}/albedo.png`})),...landscapeAssets.filter(a=>a.terrain?.runtime).map(a=>({id:a.id,name:a.name,image:a.terrainImages?.thumbnail??''}))];
     gridMaterial.replaceChildren(...choices.map(a=>new Option(a.name,a.id)));textures.replaceChildren();
     for(const choice of choices){const button=document.createElement('button');button.type='button';button.className='flex flex-col gap-1 rounded-lg border border-white/15 bg-black/20 p-1 text-left text-xs text-canopy hover:bg-white/10 aria-pressed:border-amber-300 aria-pressed:bg-amber-200/10';button.dataset.material=choice.id;button.setAttribute('aria-label',`Paint ${choice.name}`);button.title=choice.name;
      const image=document.createElement('img');image.src=assetUrls[choice.image]??'';image.alt='';image.className='aspect-square w-full rounded object-cover';image.loading='lazy';
      const label=document.createElement('span');label.textContent=choice.name;button.append(image,label);button.onclick=()=>{selectMaterial(choice.id);mode.value='grid-material';editor.terrainMode='grid-material';refreshControls();};textures.append(button);
     }
     selectMaterial(choices.some(a=>a.id===editor.terrainGridMaterial)?editor.terrainGridMaterial:choices[0]?.id??'');
    };
    const trail=document.createElement('select');trail.setAttribute('aria-label','Surface layer preset');
    const trailMode=document.createElement('select');trailMode.setAttribute('aria-label','Surface drawing mode');for(const [id,name] of [['paint','Paint'],['line','Line'],['curve','Curve']])trailMode.add(new Option(name,id));
    const addTrail=document.createElement('button');addTrail.className=btnPrimary;addTrail.textContent='New surface layer';addTrail.onclick=()=>{const name=trail.selectedOptions[0]!.text;if(trailMode.value==='paint')editor.beginLayerPaint(trail.value,name);else editor.beginNewLayer(trail.value,name,trailMode.value as 'line'|'curve');};
    const refresh=this.refreshBiome;this.refreshBiome=()=>{refresh();const paths=biomeById(editor.map.biome).paths??[];trail.replaceChildren(...paths.map(p=>new Option(p.name,p.id)));for(const el of [trail,trailMode,addTrail])el.hidden=!paths.length;};this.refreshBiome();
    const advanced=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Generator and sculpting controls';advanced.append(summary,trail,trailMode,addTrail,landform,paint,layer,radius,depth,aspect,rotation);
    const textureSection=document.createElement('details'),textureSummary=document.createElement('summary');textureSummary.textContent='Ground textures';textureSection.open=true;textureSection.append(textureSummary,gridMaterial,materialHint,eraseLabel,textures);
    refreshControls();this.root.append(title,mode,gridLevel,edge,bank,rampFrom,rampTo,direction,textureSection,curve,hint,apply,clear,advanced,message);host.append(this.root);this.setOpen(false);
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
