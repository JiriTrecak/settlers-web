import { GameScreen } from '../screen/screen';
import { authoredMaps, playableMaps, type MapEntry } from '../../shared/map/library';
import { playableMapError } from '../../shared/map/playable';
import './mapPicker.css';
export class MapPicker extends GameScreen {
 constructor(mode:'play'|'edit',hooks:{onBack():void;onChoose(map:MapEntry):void;onNew?():void}){
  super('screen map-picker');
  const panel=document.createElement('main');panel.className='map-picker-panel';
  const title=document.createElement('h1');title.textContent=mode==='play'?'Choose your battlefield':'Choose a map to edit';
  const list=document.createElement('div');list.className='map-picker-list';
  const maps=mode==='play'?playableMaps():authoredMaps();
  for(const map of maps){
   const b=document.createElement('button');b.type='button';
   const name=document.createElement('strong');name.textContent=map.name;
   const info=document.createElement('span');info.textContent=`256 × 256 · ${playableMapError(map.map)?'Landscape study':`${map.players} players`} · ${map.source==='local'?'Saved locally':'Project map'}`;
   b.append(name,info);b.onclick=()=>hooks.onChoose(map);list.append(b);
  }
  if(!maps.length){const p=document.createElement('p');p.textContent='Create a map with Player 1 and Player 2 starts in the editor to begin.';list.append(p);}
  const back=document.createElement('button');back.textContent='Back';back.onclick=hooks.onBack;
  panel.append(title,list,back);
  if(hooks.onNew){const b=document.createElement('button');b.textContent='New map';b.onclick=hooks.onNew;panel.append(b);}
  this.root.append(panel);this.onEscape(hooks.onBack);
 }
}
