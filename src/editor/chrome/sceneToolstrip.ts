import {createElement,MousePointer2,Plus,Mountain,TreePine,Waves,Flag,Undo2,Redo2,Sun,Cable,Grid2x2,Gamepad2,Orbit,type IconNode} from 'lucide';
export type AuthoringMode='select'|'place'|'terrain'|'foliage'|'water'|'spawn';
export type AuthoringCamera='top'|'game'|'free';
const modes:[AuthoringMode,string,IconNode][]=[['select','Select',MousePointer2],['place','Place',Plus],['terrain','Terrain',Mountain],['foliage','Foliage',TreePine],['water','Water',Waves],['spawn','Spawn',Flag]];
/** Persistent commands; rebuilding the scene hierarchy never steals toolbar focus. */
export class SceneToolstrip {
 readonly root=document.createElement('nav');
 readonly camera=document.createElement('nav');
 private buttons=new Map<string,HTMLButtonElement>();
 private cameras=new Map<string,HTMLButtonElement>();
 private placement=document.createElement('div');
 constructor(host:HTMLElement,hooks:{mode:(mode:AuthoringMode)=>void;camera:(mode:AuthoringCamera)=>void;undo:(redo:boolean)=>void;placement:(scenery:boolean)=>void;environment:()=>void;mcp:()=>void}){
  this.root.className='scene-toolstrip';this.root.setAttribute('aria-label','Authoring tools');
  const primary=document.createElement('div');primary.className='scene-tool-group';primary.setAttribute('role','group');primary.setAttribute('aria-label','Editing tools');
  for(const [mode,label,icon]of modes){const b=this.button(label,icon,()=>hooks.mode(mode));b.dataset.tool=mode;primary.append(b);this.buttons.set(mode,b);}
  this.root.append(primary);
  const history=document.createElement('div');history.className='scene-tool-group scene-history-tools';history.setAttribute('role','group');history.setAttribute('aria-label','Layer history');
  for(const [id,label,icon]of [['undo','Undo layer edit',Undo2],['redo','Redo layer edit',Redo2]]as const){const b=this.button(label,icon,()=>hooks.undo(id==='redo'),false);history.append(b);this.buttons.set(id,b);}
  this.root.append(history);
  const utility=document.createElement('div');utility.className='scene-tool-group';utility.setAttribute('role','group');utility.setAttribute('aria-label','Editor utilities');
  for(const [id,label,icon,run]of [['environment','Environment',Sun,hooks.environment],['mcp','MCP',Cable,hooks.mcp]]as const){const b=this.button(label,icon,run);utility.append(b);this.buttons.set(id,b);}
  this.root.append(utility);
  this.camera.className='scene-camera';this.camera.setAttribute('aria-label','Viewport camera');
  for(const [mode,label,icon]of [['top','Top down',Grid2x2],['game','Game',Gamepad2],['free','Free',Orbit]]as const){const b=this.button(label,icon,()=>hooks.camera(mode));this.camera.append(b);this.cameras.set(mode,b);}
  this.placement.className='scene-placement';this.placement.setAttribute('aria-label','Placement type');
  for(const [id,label]of [['entity','Units & buildings'],['scenery','Scenery & landmarks']]as const){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.placement=id;b.onclick=()=>hooks.placement(id==='scenery');this.placement.append(b);}
  this.root.append(this.placement);host.append(this.root,this.camera);
 }
 private button(label:string,icon:IconNode,run:()=>void,caption=true){
  const b=document.createElement('button');b.type='button';b.className='scene-tool'+(caption?'':' icon-only');b.title=label;b.setAttribute('aria-label',label);b.append(createElement(icon,{width:20,height:20,'stroke-width':1.65,'aria-hidden':'true'}));
  if(caption){const text=document.createElement('span');text.textContent=label;b.append(text);}
  b.onclick=run;return b;
 }
 sync(mode:AuthoringMode,undo:boolean,redo:boolean,camera:AuthoringCamera,scenery=false){
  this.placement.hidden=mode!=='place';
  for(const b of this.placement.querySelectorAll<HTMLButtonElement>('button'))b.setAttribute('aria-pressed',String((b.dataset.placement==='scenery')===scenery));
  for(const [id]of modes)this.buttons.get(id)!.setAttribute('aria-pressed',String(mode===id));
  this.buttons.get('undo')!.disabled=!undo;this.buttons.get('redo')!.disabled=!redo;
  for(const [id,b]of this.cameras)b.setAttribute('aria-pressed',String(id===camera));
 }
 utilities(mcp:boolean,environment:boolean){for(const [id,on]of [['mcp',mcp],['environment',environment]]as const)this.buttons.get(id)!.setAttribute('aria-pressed',String(on));}
 destroy(){this.root.remove();this.camera.remove();}
}
