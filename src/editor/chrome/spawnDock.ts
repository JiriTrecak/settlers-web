import type { WorldEditor } from '../world/worldEditor';
import { playableMapError } from '../../shared/map/playable';
import { rememberAuthoredMap } from '../../shared/map/library';
/** Required player starts are authored in the document, never inferred by the game. */
export class SpawnDock {
 constructor(host:HTMLElement,editor:WorldEditor){
  const root=document.createElement('details');root.className='pointer-events-auto absolute left-4 bottom-4 rounded-lg bg-slate-950/95 p-3 text-sm text-slate-200';root.style.zIndex='12';
  const summary=document.createElement('summary');summary.textContent='Player starts / Publish';root.append(summary);
  const fields=document.createElement('div');root.append(fields);
  const status=document.createElement('p');status.style.maxWidth='240px';status.setAttribute('role','status');
  const refresh=()=>{
    fields.replaceChildren();
    for(const player of [1,2]){
      const row=document.createElement('label');row.style.display='block';row.textContent=`P${player}  X / Z `;
      const start=editor.map.playerStarts?.find(s=>s.player===player);
      const inputs=(['x','z'] as const).map(axis=>{const input=document.createElement('input');input.type='number';input.min='8';input.max='247';input.step='1';input.value=String(start?.[axis]??(player===1?218:38));input.style.cssText='width:58px;background:#263337;padding:4px;margin:4px';input.setAttribute('aria-label',`Player ${player} ${axis.toUpperCase()}`);return input;});
      const set=document.createElement('button');set.textContent='Set';set.onclick=()=>{
        editor.replace({...editor.map,playerStarts:[...(editor.map.playerStarts??[]).filter(s=>s.player!==player),{player,x:Number(inputs[0]!.value),z:Number(inputs[1]!.value)}].sort((a,b)=>a.player-b.player)});
        status.textContent=playableMapError(editor.map)??'Ready to play';
      };row.append(...inputs,set);fields.append(row);
    }
    status.textContent=playableMapError(editor.map)??'Ready to play';
  };
  root.addEventListener('toggle',()=>{if(root.open)refresh();});
  const publish=document.createElement('button');publish.textContent='Save to map library';publish.style.cssText='display:block;padding:8px;margin-top:8px;background:#344740';publish.onclick=()=>{
    const error=playableMapError(editor.map);if(error){status.textContent=error;return;}
    try{rememberAuthoredMap(editor.map);status.textContent='Saved. Available in Singleplayer.';}catch{status.textContent='Browser storage is full. Save a .utcmap file instead.';}
  };root.append(publish,status);host.append(root);
 }
}
