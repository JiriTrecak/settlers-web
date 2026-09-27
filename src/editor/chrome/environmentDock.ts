import {BIOMES,biomeById,biomeEnvironment} from '../../content/biomes';
import {WEATHER_CHOICES} from '../../shared/landscape/weather';
import {sheet,btn} from '../../ui';
import {formatHour} from '../../render/sky/sky';
import type {WorldEditor} from '../world/worldEditor';

/** Maps choose an art direction. Its rendering controls live in the biome. */
export class EnvironmentDock {
 readonly root=document.createElement('aside');
 private readonly biome=document.createElement('select');
 private readonly weather=document.createElement('select');
 private readonly description=document.createElement('p');
 private readonly profile=document.createElement('p');
 private readonly hour=document.createElement('input');
 private readonly clock=document.createElement('span');
 private readonly play=document.createElement('button');
 private opened=false;
 constructor(host:HTMLElement,private readonly editor:WorldEditor,close:()=>void){
  this.root.className=`editor-properties pointer-events-auto absolute right-4 top-20 bottom-24 z-30 flex w-80 flex-col gap-3 overflow-y-auto rounded-2xl p-4 font-dock ${sheet}`;
  this.root.setAttribute('aria-label','Biome and conditions');
  const head=document.createElement('div');head.className='flex items-center justify-between';const title=document.createElement('strong');title.textContent='Biome & conditions';
  const exit=document.createElement('button');exit.className=btn;exit.textContent='Close';exit.onclick=close;head.append(title,exit);this.root.append(head);
  this.biome.setAttribute('aria-label','Map biome');for(const b of BIOMES)this.biome.add(new Option(b.name,b.id));this.biome.onchange=()=>{editor.setBiome(this.biome.value);this.sync();};
  this.root.append(this.label('Art direction',this.biome),this.description);
  this.profile.className='text-xs leading-5 text-canopy/70';this.root.append(this.profile);
  const help=document.createElement('p');help.className='text-xs leading-5 text-canopy/50';help.textContent='Lighting, grading, atmosphere, canopy and water styles are defined by this biome and shared with the game and asset workbench. Change the biome definition to tune its look everywhere.';this.root.append(help);
  this.weather.setAttribute('aria-label','Weather condition');this.weather.add(new Option('Biome default','default'));for(const w of WEATHER_CHOICES)this.weather.add(new Option(w.name,w.kind));
  this.weather.onchange=()=>{editor.environment({weather:this.weather.value==='default'?undefined:{kind:this.weather.value as 'clear'|'rain'|'snow'|'spores'}});this.sync();};this.root.append(this.label('Weather condition',this.weather));
  this.hour.type='range';this.hour.min='0';this.hour.max='23.99';this.hour.step='.05';this.hour.setAttribute('aria-label','Environment preview hour');this.hour.oninput=()=>{editor.environment({hour:Number(this.hour.value),playing:false});this.sync();};
  this.play.className=btn;this.play.onclick=()=>{editor.environment({hour:editor.sky?.hour??12,playing:!editor.sky?.playing});this.sync();};this.root.append(this.clock,this.hour,this.play);
  host.append(this.root);this.setOpen(false);
 }
 private label(name:string,control:HTMLElement){const label=document.createElement('label');label.className='flex flex-col gap-1 text-sm';label.append(name,control);control.className='rounded-lg bg-black/30 p-2 text-canopy';return label;}
 settings(){return {biome:this.editor.map.biome??BIOMES[0].id,conditions:this.editor.map.landscape?.environment,resolved:biomeEnvironment(this.editor.map.biome,this.editor.map.landscape?.environment)};}
 sync(){if(!this.opened)return;const b=biomeById(this.editor.map.biome),look=biomeEnvironment(b.id,this.editor.map.landscape?.environment);this.biome.value=b.id;this.description.textContent=b.description;this.profile.textContent=`${b.terrainSet} terrain · ${look.atmosphere?.enabled?'Atmosphere':'Clear air'} · ${look.canopy?.enabled?'Canopy light':'Open sky'} · ${b.rivers.length} water styles`;this.weather.value=this.editor.map.landscape?.environment.weather?.kind??'default';this.hour.value=String(this.editor.sky?.hour??look.hour);this.clock.textContent=formatHour(Number(this.hour.value));this.play.textContent=this.editor.sky?.playing?'Pause cycle':'Play cycle';}
 setOpen(on:boolean){this.opened=on;this.root.classList.toggle('hidden',!on);this.sync();}
 destroy(){this.root.remove();}
}
