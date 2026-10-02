import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {Group,Panel,Separator,useDefaultLayout,usePanelRef,type PanelImperativeHandle} from 'react-resizable-panels';
import {PanelLeftClose,PanelLeftOpen,PanelRightClose,PanelRightOpen} from 'lucide-react';
import {Button} from './ui/button';

const storage={
 getItem(key:string){try{return localStorage.getItem(key);}catch{return null;}},
 setItem(key:string,value:string){try{localStorage.setItem(key,value);}catch{/* Layout persistence is optional. */}},
};

/** Panels retain their DOM, including unsaved forms and the live canvas, when collapsed. */
export function StudioPanels({workspace,library,canvas,inspector}:{workspace:'spells'|'effects';library:ReactNode;canvas:ReactNode;inspector:ReactNode}){
 const id=`studio-${workspace}-panels`,widthKey=id+'-widths';
 const left=usePanelRef(),right=usePanelRef();
 const {defaultLayout,onLayoutChanged}=useDefaultLayout({id,storage});
 const [header,setHeader]=useState<HTMLElement|null>(null);
 const [collapsed,setCollapsed]=useState({left:false,right:false});
 const widths=useRef<{left:number;right:number}|null>(null);
 if(!widths.current){let saved;try{saved=JSON.parse(storage.getItem(widthKey)??'null');}catch{}widths.current={left:Math.min(420,Math.max(170,Number(saved?.left)||224)),right:Math.min(560,Math.max(240,Number(saved?.right)||320))};}
 useEffect(()=>{setHeader(document.querySelector('#app > header'));},[]);
 function resized(side:'left'|'right',pixels:number){
  setCollapsed(previous=>previous[side]===(pixels<1)?previous:{...previous,[side]:pixels<1});
  if(pixels>=1)widths.current![side]=pixels;
 }
 function toggle(panel:PanelImperativeHandle|null,side:'left'|'right'){
  if(panel?.isCollapsed())panel.resize(`${widths.current![side]}px`);else panel?.collapse();
 }
 return <>
  {header&&createPortal(<div className="studio-panel-controls" data-workspace={workspace} aria-label="Panel visibility">
   <Button variant="ghost" size="icon" title={collapsed.left?'Show library':'Hide library'} aria-label={collapsed.left?'Show library':'Hide library'} aria-expanded={!collapsed.left} aria-controls={id+'-library'} onClick={()=>toggle(left.current,'left')}>{collapsed.left?<PanelLeftOpen/>:<PanelLeftClose/>}</Button>
   <Button variant="ghost" size="icon" title={collapsed.right?'Show inspector':'Hide inspector'} aria-label={collapsed.right?'Show inspector':'Hide inspector'} aria-expanded={!collapsed.right} aria-controls={id+'-inspector'} onClick={()=>toggle(right.current,'right')}>{collapsed.right?<PanelRightOpen/>:<PanelRightClose/>}</Button>
  </div>,header)}
  <Group id={id} className="studio-panels" defaultLayout={defaultLayout} onLayoutChanged={(layout,meta)=>{onLayoutChanged(layout,meta);storage.setItem(widthKey,JSON.stringify(widths.current));}} resizeTargetMinimumSize={{fine:8,coarse:24}}>
   <Panel id={id+'-library'} panelRef={left} defaultSize="224px" minSize="170px" maxSize="420px" collapsible collapsedSize="0px" groupResizeBehavior="preserve-pixel-size" onResize={size=>resized('left',size.inPixels)} className="studio-panel-content" inert={collapsed.left}>{library}</Panel>
   <Separator className="studio-panel-handle" aria-label="Resize library" title="Drag or use arrow keys to resize library"/>
   <Panel id={id+'-canvas'} minSize="240px" className="studio-panel-content">{canvas}</Panel>
   <Separator className="studio-panel-handle" aria-label="Resize inspector" title="Drag or use arrow keys to resize inspector"/>
   <Panel id={id+'-inspector'} panelRef={right} defaultSize="320px" minSize="240px" maxSize="560px" collapsible collapsedSize="0px" groupResizeBehavior="preserve-pixel-size" onResize={size=>resized('right',size.inPixels)} className="studio-panel-content" inert={collapsed.right}>{inspector}</Panel>
  </Group>
 </>;
}
