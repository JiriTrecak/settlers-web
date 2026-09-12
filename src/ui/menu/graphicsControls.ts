import {readHudLayout,setHudLayout,type HudLayout} from '../../shared/settings/hud';
import {keyboardControls} from './keyboardControls';
import {SHADOW_MODES,readShadowMode,setShadowMode,type ShadowMode} from '../../shared/settings/graphics';
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
 label.append(select);group.append(label,note);
 const shadowLabel=document.createElement('label');shadowLabel.textContent='Shadows';
 const shadows=document.createElement('select');shadows.style.cssText=select.style.cssText;
 const names={soft:'Soft · original',filtered:'Filtered · faster',off:'Off'};
 for(const mode of SHADOW_MODES){const option=document.createElement('option');option.value=mode;option.textContent=names[mode];shadows.append(option);}
 shadows.value=readShadowMode();shadows.onchange=()=>setShadowMode(shadows.value as ShadowMode);
 shadowLabel.append(shadows);group.append(shadowLabel);
 const shadowNote=document.createElement('p');shadowNote.className='canopy-settings-status';shadowNote.textContent='Filtered shadows use sharper edges and skip the soft-shadow blur passes. Applies immediately and is saved.';group.append(shadowNote);
 const hudLabel=document.createElement('label');hudLabel.textContent='HUD layout';
 const hudLayout=document.createElement('select');hudLayout.style.cssText=select.style.cssText;
 for(const [value,text] of [['spread','Spread · screen edges'],['compact','Compact · centered']]){const o=document.createElement('option');o.value=value;o.textContent=text;hudLayout.append(o);}
 hudLayout.value=readHudLayout();hudLayout.onchange=()=>setHudLayout(hudLayout.value as HudLayout);
 hudLabel.append(hudLayout);group.append(hudLabel);
 group.append(keyboardControls());
 return group;
}
