import {createRoot,type Root} from 'react-dom/client';
import {MousePointer2,Plus,Mountain,TreePine,Waves,Flag,Undo2,Redo2,Sun,Cable,Grid2x2,Gamepad2,Orbit,type LucideIcon} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {cn} from '../../ui/cn';

export type AuthoringMode='select'|'place'|'terrain'|'foliage'|'water'|'spawn';
export type AuthoringCamera='top'|'game'|'free';
type Hooks={mode:(mode:AuthoringMode)=>void;camera:(mode:AuthoringCamera)=>void;undo:(redo:boolean)=>void;placement:(scenery:boolean)=>void;environment:()=>void;mcp:()=>void};
type State={mode:AuthoringMode;undo:boolean;redo:boolean;camera:AuthoringCamera;scenery:boolean;mcp:boolean;environment:boolean};
const modes:[AuthoringMode,string,LucideIcon][]=[['select','Select',MousePointer2],['place','Place',Plus],['terrain','Terrain',Mountain],['foliage','Foliage',TreePine],['water','Water',Waves],['spawn','Spawn',Flag]];
const cameras:[AuthoringCamera,string,LucideIcon][]=[['top','Top down',Grid2x2],['game','Game',Gamepad2],['free','Free',Orbit]];
const surface='pointer-events-auto absolute flex items-center rounded-xl border border-solid border-border bg-background/95 p-1.5 text-foreground shadow-xl';
function ToolButton({label,icon:Icon,active,onClick,disabled=false,compact=false}:{label:string;icon:LucideIcon;active?:boolean;onClick:()=>void;disabled?:boolean;compact?:boolean}){
 return <Button variant={active?'secondary':'ghost'} size={compact?'icon-sm':'sm'} className={compact?'':cn('h-12 min-w-12 flex-col gap-1 px-2 text-[10px] md:min-w-14',!active&&'text-muted-foreground')} title={label} aria-label={label} aria-pressed={active} disabled={disabled} onClick={onClick}><Icon aria-hidden className={compact?'size-4':'size-[18px]'}/>{!compact&&label}</Button>;
}
function Tools({state:s,hooks}:{state:State;hooks:Hooks}){
 return <>
  <nav aria-label="Authoring tools" className={cn(surface,'bottom-4 left-1/2 z-[28] max-w-[calc(100vw-24px)] -translate-x-1/2 gap-1')}>
   <div role="group" aria-label="Editing tools" className="flex gap-0.5">{modes.map(([mode,label,icon])=><ToolButton key={mode} label={label} icon={icon} active={s.mode===mode} onClick={()=>hooks.mode(mode)}/>)}</div>
   <div role="group" aria-label="Layer history" className="flex gap-0.5 border-0 border-l border-solid border-border pl-1"><ToolButton label="Undo layer edit" icon={Undo2} compact disabled={!s.undo} onClick={()=>hooks.undo(false)}/><ToolButton label="Redo layer edit" icon={Redo2} compact disabled={!s.redo} onClick={()=>hooks.undo(true)}/></div>
   <div role="group" aria-label="Editor utilities" className="flex gap-0.5 border-0 border-l border-solid border-border pl-1"><ToolButton label="Environment" icon={Sun} active={s.environment} onClick={hooks.environment}/><ToolButton label="MCP" icon={Cable} active={s.mcp} onClick={hooks.mcp}/></div>
   {s.mode==='place'&&<div role="group" aria-label="Placement type" className={cn(surface,'bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 gap-1 rounded-lg p-1')}>
    <Button size="sm" variant={!s.scenery?'secondary':'ghost'} aria-pressed={!s.scenery} onClick={()=>hooks.placement(false)}>Units & buildings</Button><Button size="sm" variant={s.scenery?'secondary':'ghost'} aria-pressed={s.scenery} onClick={()=>hooks.placement(true)}>Scenery & landmarks</Button>
   </div>}
  </nav>
  <nav aria-label="Viewport camera" className={cn(surface,'left-1/2 top-20 z-[19] -translate-x-1/2 gap-0.5 rounded-lg p-1')}>
   {cameras.map(([mode,label,Icon])=><Button key={mode} variant={mode===s.camera?'secondary':'ghost'} size="sm" aria-pressed={mode===s.camera} onClick={()=>hooks.camera(mode)} className="gap-1.5 px-2"><Icon aria-hidden className="size-3.5"/>{label}</Button>)}
  </nav>
 </>;
}
/** Persistent React controls preserve focus; identical notifications schedule no work. */
export class SceneToolstrip {
 readonly root=document.createElement('div');
 private react:Root;
 private state:State={mode:'select',undo:false,redo:false,camera:'free',scenery:false,mcp:false,environment:false};
 constructor(host:HTMLElement,private hooks:Hooks){this.root.className='editor-theme font-sans [&_*]:box-border';host.append(this.root);this.react=createRoot(this.root);this.render();}
 private render(){this.react.render(<Tools state={this.state} hooks={this.hooks}/>);}
 private update(next:Partial<State>){if(Object.entries(next).every(([key,value])=>this.state[key as keyof State]===value))return;this.state={...this.state,...next};this.render();}
 sync(mode:AuthoringMode,undo:boolean,redo:boolean,camera:AuthoringCamera,scenery=false){this.update({mode,undo,redo,camera,scenery});}
 utilities(mcp:boolean,environment:boolean){this.update({mcp,environment});}
 destroy(){this.react.unmount();this.root.remove();}
}
