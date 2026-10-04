import {createRoot,type Root} from 'react-dom/client';
import {useState} from 'react';
import {Pause,Play,Sun,TreePine,X} from 'lucide-react';
import {BIOMES,biomeById,biomeEnvironment} from '../../content/biomes';
import {WEATHER_CHOICES} from '../../shared/landscape/weather';
import {formatHour} from '../../render/sky/sky';
import type {WorldEditor} from '../world/worldEditor';
import {Button} from '../../components/ui/button';
import {Checkbox} from '../../components/ui/checkbox';
import {NativeSelect,NativeSelectOption} from '../../components/ui/native-select';

type State={biome:string;weather:string;canopy:boolean;hour:number;playing:boolean};
function EnvironmentPanel({state:s,editor,close,refresh}:{state:State;editor:WorldEditor;close:()=>void;refresh:()=>void}){
 const b=biomeById(s.biome),look=biomeEnvironment(b.id,editor.map.landscape?.environment),[error,setError]=useState('');
 const run=(action:()=>void)=>{try{action();setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}refresh();};
 return <div className="flex flex-col gap-5" onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}}}>
  <header className="flex items-center justify-between gap-2"><h2 className="m-0 text-sm font-semibold">Environment</h2><Button variant="ghost" size="icon-xs" aria-label="Close environment" onClick={close}><X className="size-4"/></Button></header>
  <section className="space-y-2"><label htmlFor="map-biome" className="block text-xs font-medium">Art direction</label><NativeSelect id="map-biome" aria-label="Map biome" value={b.id} onChange={e=>run(()=>editor.setBiome(e.target.value))}>{BIOMES.map(b=><NativeSelectOption key={b.id} value={b.id}>{b.name}</NativeSelectOption>)}</NativeSelect><p className="m-0 text-xs leading-relaxed text-muted-foreground">{b.description}</p></section>
  <section className="space-y-2 rounded-lg border border-solid border-border bg-muted/30 p-3">
   <div className="flex items-start gap-2.5"><Checkbox id="preview-canopy" aria-label="Preview canopy" checked={s.canopy} onCheckedChange={checked=>run(()=>editor.setCanopyPreview(checked))}/><label htmlFor="preview-canopy" className="cursor-pointer text-xs font-medium">Preview canopy</label><TreePine aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground"/></div>
   <p className="m-0 text-xs leading-relaxed text-muted-foreground">Editor only. Off by default for faster editing; the game keeps the biome’s canopy.</p>
  </section>
  <section className="space-y-2"><label htmlFor="map-weather" className="block text-xs font-medium">Weather</label><NativeSelect id="map-weather" aria-label="Weather condition" value={s.weather} onChange={e=>run(()=>editor.environment({weather:e.target.value==='default'?undefined:{kind:e.target.value as 'clear'|'rain'|'snow'|'spores'}}))}><NativeSelectOption value="default">Biome default</NativeSelectOption>{WEATHER_CHOICES.map(w=><NativeSelectOption key={w.kind} value={w.kind}>{w.name}</NativeSelectOption>)}</NativeSelect></section>
  <section className="space-y-3"><div className="flex items-center justify-between gap-2 text-xs"><label htmlFor="preview-hour" className="flex items-center gap-2 font-medium"><Sun aria-hidden className="size-4"/>Time of day</label><output htmlFor="preview-hour" className="tabular-nums text-muted-foreground">{formatHour(s.hour)}</output></div><input id="preview-hour" aria-label="Environment preview hour" type="range" min="0" max="23.99" step=".05" value={s.hour} className="m-0 block w-full accent-zinc-200" onChange={e=>run(()=>editor.environment({hour:Number(e.target.value),playing:false}))}/><Button size="sm" variant="outline" onClick={()=>run(()=>editor.environment({hour:editor.sky?.hour??s.hour,playing:!s.playing}))}>{s.playing?<Pause className="size-3.5"/>:<Play className="size-3.5"/>}{s.playing?'Pause cycle':'Play cycle'}</Button></section>
  <details className="border-0 border-t border-solid border-border pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Biome rendering profile</summary><p className="leading-relaxed">{b.terrainSet} terrain · {look.atmosphere?.enabled?'Atmosphere':'Clear air'} · {look.canopy?.enabled?'Canopy light':'Open sky'} · {b.rivers.length} water styles</p><p className="leading-relaxed">Lighting, grading, atmosphere and water are defined by the biome and shared with the game and asset workbench.</p></details>
  {error&&<p role="alert" className="m-0 text-xs text-red-400">{error}</p>}
 </div>;
}
/** Biome-owned appearance, with a separate unsaved viewport canopy preference. */
export class EnvironmentDock {
 readonly root=document.createElement('aside');private react:Root;private opened=false;private signature='';
 constructor(host:HTMLElement,private readonly editor:WorldEditor,private close:()=>void){
  this.root.className='editor-theme pointer-events-auto absolute right-4 top-[76px] bottom-[102px] z-30 box-border w-[var(--scene-right,292px)] overflow-y-auto rounded-xl border border-solid border-border bg-background p-4 font-sans text-foreground shadow-xl [&_*]:box-border';this.root.setAttribute('aria-label','Biome and conditions');host.append(this.root);this.react=createRoot(this.root);this.root.hidden=true;
 }
 settings(){return {biome:this.editor.map.biome??BIOMES[0].id,conditions:this.editor.map.landscape?.environment,resolved:biomeEnvironment(this.editor.map.biome,this.editor.map.landscape?.environment)};}
 sync(){
  if(!this.opened)return;
  const b=biomeById(this.editor.map.biome),look=biomeEnvironment(b.id,this.editor.map.landscape?.environment);
  // The day cycle updates every frame; controls only need the displayed minute.
  const hour=this.editor.sky?.hour??look.hour;
  const state:State={biome:b.id,weather:this.editor.map.landscape?.environment.weather?.kind??'default',canopy:this.editor.canopyPreview,hour,playing:this.editor.sky?.playing??false};
  const key=JSON.stringify({...state,hour:Math.floor(hour*60)});if(key===this.signature)return;this.signature=key;
  this.react.render(<EnvironmentPanel state={state} editor={this.editor} close={this.close} refresh={()=>{this.signature='';this.sync();}}/>);
 }
 setOpen(on:boolean){this.opened=on;this.root.hidden=!on;this.sync();}
 destroy(){this.react.unmount();this.root.remove();}
}
