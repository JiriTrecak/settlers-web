import { btn, sheet } from '../../ui';
import type { WorldEditor } from '../world/worldEditor';
/** Spawn tool flyout, matching the terrain/decal controls. */
export class SpawnDock {
 readonly root=document.createElement('div');
 private readonly info=document.createElement('p');
 private readonly buttons:HTMLButtonElement[]=[];
 private readonly facing=document.createElement('select');
 constructor(host:HTMLElement,private readonly editor:WorldEditor){
  this.root.className=`pointer-events-auto absolute left-24 top-1/2 z-20 flex w-52 -translate-y-1/2 flex-col gap-3 rounded-2xl p-3 font-dock ${sheet}`;
    this.root.classList.add('editor-properties');
  this.root.setAttribute('aria-label','Player spawn points');
  const title=document.createElement('strong');title.textContent='Spawn point';this.root.append(title);
  for(const player of [1,2,3,4,5,6,7,8]){const b=document.createElement('button');b.className=btn;b.textContent=`Player ${player}`;b.onclick=()=>{editor.spawnPlayer=player;editor.spawnRotation=editor.map.playerStarts.find(s=>s.player===player)?.rotation??0;editor.spawnMessage='';this.sync();};this.buttons.push(b);this.root.append(b);}
  const label=document.createElement('label');label.textContent='Hall facing';label.className='flex flex-col gap-1 text-xs';
  this.facing.setAttribute('aria-label','Hall facing');this.facing.className=`${btn} w-full`;
  for(const rotation of [0,90,180,270])this.facing.add(new Option(`${rotation}°`,String(rotation)));
  this.facing.onchange=()=>{editor.spawnRotation=Number(this.facing.value) as 0|90|180|270;
   const start=editor.map.playerStarts.find(s=>s.player===editor.spawnPlayer);
   if(start)editor.setSpawnPoint(start.player,start.x,start.z,editor.spawnRotation);this.sync();};
  label.append(this.facing);this.root.append(label);
  this.info.className='text-xs leading-5 text-canopy/70';this.root.append(this.info);host.append(this.root);this.setOpen(false);
 }
 sync(){this.facing.value=String(this.editor.spawnRotation);this.buttons.forEach((b,i)=>{b.hidden=i>=Math.max(2,...this.editor.map.playerStarts.map(s=>s.player));b.setAttribute('aria-pressed',String(this.editor.spawnPlayer===i+1));b.style.background=this.editor.spawnPlayer===i+1?'#ffffff18':'';});this.info.textContent=this.editor.spawnMessage||`Click dry, level terrain to place Player ${this.editor.spawnPlayer}.`;}
 setOpen(on:boolean){this.root.classList.toggle('hidden',!on);if(on)this.sync();}
 destroy(){this.root.remove();}
}
