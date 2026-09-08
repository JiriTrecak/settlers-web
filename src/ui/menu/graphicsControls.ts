import {RESOLUTION_SCALES,readResolutionScale,setResolutionScale,renderPixelRatio,type ResolutionScale} from '../../shared/settings/graphics';
/** Shared by main-menu and in-game settings; applies immediately. */
export function graphicsControls():HTMLElement {
 const group=document.createElement('section');group.style.marginTop='24px';
 const label=document.createElement('label');label.textContent='Game resolution';
 const select=document.createElement('select');select.style.cssText='padding:12px;background:#101b20;color:#ead6ae;border:1px solid #776344;font:inherit';
 for(const scale of RESOLUTION_SCALES){
  const option=document.createElement('option');option.value=String(scale);
  const ratio=renderPixelRatio(scale,window.devicePixelRatio);
  option.textContent=`${scale*100}%${scale===1?' · Native':''} — ${Math.floor(innerWidth*ratio)} × ${Math.floor(innerHeight*ratio)}`;select.append(option);
 }
 select.value=String(readResolutionScale());select.onchange=()=>setResolutionScale(Number(select.value) as ResolutionScale);
 const note=document.createElement('p');note.className='canopy-settings-status';note.textContent='Applies immediately and is saved. Only the 3D scene changes; interface text stays sharp. 50% uses one quarter of the native pixels.';
 label.append(select);group.append(label,note);return group;
}
