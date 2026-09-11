import {CLEAR_WEATHER,type WeatherSettings} from '../../shared/landscape/weather';
import { sheet, btn, btnPrimary } from '../../ui';
import { environmentPreset, environmentPresets, saveEnvironmentPreset, LIGHT_RANGES, type GlobalLight, type EnvironmentPreset } from '../../shared/environment/presets';
import { formatHour } from '../../render/sky/sky';
import type { WorldEditor } from '../world/worldEditor';

/** Infrequent world-look authoring lives on the right, separate from map-building tools. */
export class EnvironmentDock {
  readonly root=document.createElement('aside');
  private preset=environmentPreset();
  private draft:GlobalLight={...this.preset.light};
  private readonly select=document.createElement('select');
  private readonly state=document.createElement('span');
  private readonly notice=document.createElement('p');
  private readonly controls=new Map<keyof GlobalLight,{input:HTMLInputElement;number?:HTMLInputElement}>();
  private readonly hour=document.createElement('input');
  private readonly clock=document.createElement('span');
  private readonly season=document.createElement('select');
  private readonly weather=document.createElement('select');
  private readonly weatherInputs=new Map<'intensity'|'windX'|'windZ',HTMLInputElement>();
  private readonly play=document.createElement('button');
  private readonly fallback=document.createElement('textarea');
  private opened=false;
  constructor(host:HTMLElement,private readonly editor:WorldEditor,close:()=>void){
    this.root.className=`pointer-events-auto absolute right-4 top-20 bottom-24 z-30 flex w-80 max-w-[calc(100vw-6rem)] flex-col gap-3 overflow-y-auto rounded-2xl p-4 font-dock ${sheet}`;
    this.root.setAttribute('aria-label','Environment settings');
    const head=document.createElement('div');head.className='flex items-center justify-between';
    const title=document.createElement('strong');title.textContent='Environment';
    const collapse=this.button('Close environment',close);collapse.textContent='Close';head.append(title,collapse);this.root.append(head);
    this.select.className='rounded-lg bg-black/30 p-2 text-canopy';this.select.setAttribute('aria-label','Environment preset');this.options();
    this.select.onchange=()=>{this.preset=environmentPreset(this.select.value);this.draft={...this.preset.light};editor.environment({preset:this.preset.id});this.apply();this.sync();};
    this.state.className='text-xs text-canopy/60';this.root.append(this.select,this.state);
    const actions=document.createElement('div');actions.className='flex flex-wrap gap-1';
    const save=this.button('Save preset',()=>this.save());save.className=btnPrimary;
    actions.append(save,this.button('Reset',()=>{this.preset=environmentPreset(this.preset.id);this.draft={...this.preset.light};this.apply();this.notice.textContent='Restored saved preset.';this.sync();}),this.button('Copy settings',()=>void this.copy()));this.root.append(actions);
    const help=document.createElement('p');help.className='text-xs leading-5 text-canopy/50';help.textContent='Live draft · Save updates this preset for maps on this device. White tints keep the existing daylight colors.';this.root.append(help);
    const global=this.section('Global light',true);
    this.color(global,'Sun tint','sunTint');this.range(global,'Sun strength','sunStrength',.05);
    this.range(global,'Sun direction offset (°)','sunDirection',1);this.range(global,'Midday sun height (°)','sunHeight',1);
    this.color(global,'Ambient tint','ambientTint');this.range(global,'Ambient strength','ambientStrength',.05);
    this.color(global,'Sky fill tint','skyTint');this.color(global,'Ground bounce tint','bounceTint');this.range(global,'Sky / ground fill strength','fillStrength',.05);
    const shadows=this.section('Shadows');this.range(shadows,'Shadow softness','shadowSoftness',.25);
    const atmosphere=this.section('Atmosphere');this.color(atmosphere,'Haze color','hazeColor');this.range(atmosphere,'Haze fade distance (m)','hazeDistance',5);
    const weather=this.section('Weather',true);
    this.weather.setAttribute('aria-label','Weather');this.weather.className='rounded bg-black/30 p-2 text-canopy';
    for(const [id,label] of [['clear','Clear'],['rain','Rain'],['snow','Snow']])this.weather.add(new Option(label,id));
    this.weather.onchange=()=>{const current=editor.map.landscape?.environment.weather??CLEAR_WEATHER;editor.environment({weather:{...current,kind:this.weather.value as WeatherSettings['kind'],intensity:current.intensity||.5}});this.sync();};weather.append(this.weather);
    for(const [key,label,min,max,step] of [['intensity','Weather intensity',0,1,.05],['windX','Weather east wind',-10,10,.5],['windZ','Weather south wind',-10,10,.5]] as const){
      const row=document.createElement('label');row.className='flex flex-col gap-1 text-xs text-canopy/80';row.append(label);
      const input=document.createElement('input');input.type='range';input.min=String(min);input.max=String(max);input.step=String(step);input.setAttribute('aria-label',label);
      input.oninput=()=>{const current=editor.map.landscape?.environment.weather??CLEAR_WEATHER;editor.environment({weather:{...current,[key]:Number(input.value)}});};this.weatherInputs.set(key,input);row.append(input);weather.append(row);
    }
    const weatherHelp=document.createElement('p');weatherHelp.className='text-xs text-canopy/50';weatherHelp.textContent='Weather is saved with this map. Wind moves rain or snow; it does not affect unit movement.';weather.append(weatherHelp);
    const time=this.section('Preview time',true);this.hour.type='range';this.hour.min='0';this.hour.max='23.99';this.hour.step='.05';this.hour.setAttribute('aria-label','Environment preview hour');this.hour.oninput=()=>{editor.environment({hour:Number(this.hour.value),playing:false});this.sync();};
    this.play.className=btn;this.play.onclick=()=>{editor.environment({hour:editor.sky?.hour??10,playing:!editor.sky?.playing});this.sync();};time.append(this.clock,this.hour,this.play);
    this.season.setAttribute('aria-label','Environment season');this.season.className='rounded bg-black/30 p-2 text-canopy';for(const value of ['spring','summer','autumn']){const o=document.createElement('option');o.value=value;o.textContent=value[0]!.toUpperCase()+value.slice(1);this.season.append(o);}this.season.onchange=()=>editor.environment({season:this.season.value as 'spring'|'summer'|'autumn'});time.append(this.season);
    const timing=document.createElement('p');timing.className='text-xs text-canopy/50';timing.textContent='10-minute full cycle. Light controls tune daytime; the clock still drives sun movement. Editing light pauses the preview.';time.append(timing);
    this.notice.className='text-xs text-canopy/70';this.notice.setAttribute('role','status');this.fallback.className='hidden h-36 w-full rounded bg-black/30 p-2 text-xs';this.fallback.setAttribute('aria-label','Environment settings JSON');this.fallback.readOnly=true;this.root.append(this.fallback);actions.after(this.notice);host.append(this.root);this.setOpen(false);
  }
  private section(label:string,open=false){const details=document.createElement('details');details.open=open;details.className='border-t border-white/10 pt-3';const summary=document.createElement('summary');summary.textContent=label;summary.className='cursor-pointer text-sm font-medium';const body=document.createElement('div');body.className='mt-3 flex flex-col gap-3';details.append(summary,body);this.root.append(details);return body;}
  private button(text:string,run:()=>void){const b=document.createElement('button');b.type='button';b.className=btn;b.textContent=text;b.setAttribute('aria-label',text);b.onclick=run;return b;}
  private color(host:HTMLElement,label:string,key:keyof GlobalLight){const row=document.createElement('label');row.className='flex items-center justify-between text-xs text-canopy/80';row.append(label);const input=document.createElement('input');input.type='color';input.setAttribute('aria-label',label);input.className='h-7 w-12 cursor-pointer rounded bg-transparent';input.oninput=()=>this.change(key,input.value);row.append(input);host.append(row);this.controls.set(key,{input});}
  private range(host:HTMLElement,label:string,key:keyof typeof LIGHT_RANGES,step:number){const row=document.createElement('label');row.className='flex flex-col gap-1 text-xs text-canopy/80';row.append(label);const line=document.createElement('div');line.className='flex items-center gap-2';const input=document.createElement('input'),number=document.createElement('input');for(const el of [input,number]){el.min=String(LIGHT_RANGES[key][0]);el.max=String(LIGHT_RANGES[key][1]);el.step=String(step);el.setAttribute('aria-label',label+(el===number?' value':''));}input.type='range';input.className='min-w-0 flex-1 accent-canopy';number.type='number';number.className='w-16 rounded bg-black/30 p-1 text-canopy';number.style.color='inherit';const change=(el:HTMLInputElement)=>{const value=Number(el.value);if(el.value!==''&&Number.isFinite(value)&&value>=LIGHT_RANGES[key][0]&&value<=LIGHT_RANGES[key][1])this.change(key,value);};input.oninput=()=>change(input);number.oninput=()=>change(number);number.onchange=()=>change(number);line.append(input,number);row.append(line);host.append(row);this.controls.set(key,{input,number});}
  private change(key:keyof GlobalLight,value:string|number){this.draft={...this.draft,[key]:value};this.editor.environment({hour:this.editor.sky?.hour??10,playing:false});this.apply();this.sync();}
  private apply(){this.editor.sky?.setGlobalLight(this.draft);}
  private options(){this.select.replaceChildren();for(const p of environmentPresets()){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;this.select.append(o);}}
  private save(){try{const p:EnvironmentPreset={...this.preset,light:{...this.draft}};saveEnvironmentPreset(p);this.preset=p;this.notice.textContent='Preset saved on this device.';this.sync();}catch(e){this.notice.textContent=`Could not save: ${e instanceof Error?e.message:String(e)}`;}}
  settings(){return {version:1,preset:{...this.preset,light:{...this.draft}},preview:{...this.editor.map.landscape?.environment,...this.editor.sky?.snapshot()}};}
  private async copy(){const text=JSON.stringify(this.settings(),null,2);try{await navigator.clipboard.writeText(text);this.notice.textContent='Settings copied. Paste them into the conversation.';this.fallback.classList.add('hidden');}catch{this.fallback.value=text;this.fallback.classList.remove('hidden');this.fallback.focus();this.fallback.select();this.notice.textContent='Select and copy the settings below.';}}
  sync(){if(!this.opened)return;const id=this.editor.map.landscape?.environment.preset??'forest';if(id!==this.preset.id){this.preset=environmentPreset(id);this.draft={...this.preset.light};this.options();this.apply();}this.select.value=this.preset.id;this.state.textContent=`${this.preset.name}${JSON.stringify(this.draft)!==JSON.stringify(this.preset.light)?' · Modified':' · Saved'}`;for(const [key,c] of this.controls){if(document.activeElement!==c.input)c.input.value=String(this.draft[key]);if(c.number&&document.activeElement!==c.number)c.number.value=String(this.draft[key]);}this.season.value=this.editor.map.landscape?.environment.season??'summer';const weather=this.editor.map.landscape?.environment.weather??CLEAR_WEATHER;this.weather.value=weather.kind;for(const [key,input]of this.weatherInputs){if(document.activeElement!==input)input.value=String(weather[key]);input.disabled=weather.kind==='clear';}const sky=this.editor.sky;this.hour.value=String(sky?.hour??10);this.clock.textContent=formatHour(sky?.hour??10);this.play.textContent=sky?.playing?'Pause cycle':'Play cycle';}
  setOpen(on:boolean){this.opened=on;this.root.classList.toggle('hidden',!on);if(on){this.sync();this.apply();}}
  destroy(){this.root.remove();}
}
