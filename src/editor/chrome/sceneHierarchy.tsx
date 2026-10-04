import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {useTree} from '@headless-tree/react';
import {buildProxiedInstance,hotkeysCoreFeature,selectionFeature,syncDataLoaderFeature} from '@headless-tree/core';
import {useVirtualizer} from '@tanstack/react-virtual';
import {Box,ChevronRight,ChevronsDownUp,EyeOff,Flag,Folder,Layers,Lock,Mountain,Paintbrush,Search,TreePine,Waves,X} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import {cn} from '../../ui/cn';
import {perf} from '../../debug/performance';
import {buildSceneTree,filterSceneTree,type SceneTreeInput,type SceneTreeNode,type SceneTreeSelection} from './sceneTreeModel';

type Props=SceneTreeInput&{size:number;biome:string;selected?:SceneTreeSelection;onSelect:(selection:SceneTreeSelection)=>void};
const icons={folder:Folder,layers:Layers,tree:TreePine,water:Waves,terrain:Mountain,path:Paintbrush,object:Box,entity:Flag};
const features=[syncDataLoaderFeature,selectionFeature,hotkeysCoreFeature];
const expandedDefault=['layers','objects'];
function SceneHierarchy(props:Props){
 const renderStart=perf.start();
 useLayoutEffect(()=>{perf.end('Scene hierarchy · React render and commit (event)',renderStart);});
 const [query,setQuery]=useState(''),[filter,setFilter]=useState<'all'|'layers'|'objects'>('all');
 const [expanded,setExpanded]=useState(expandedDefault),viewport=useRef<HTMLDivElement>(null),revealed=useRef<string|undefined>(undefined);
 const model=useMemo(()=>buildSceneTree(props),[props.scene,props.assets,props.generated,props.stamps,props.entities]);
 const shown=useMemo(()=>filterSceneTree(model,query,filter),[model,query,filter]);
 const selected=props.selected?`${props.selected.kind}:${props.selected.id}`:undefined;
 const selectedItems=useMemo(()=>selected&&shown.nodes.has(selected)?[selected]:[],[selected,shown]);
 const expandedItems=useMemo(()=>query.trim()?[...shown.nodes.values()].filter(n=>n.folder).map(n=>n.id):expanded,[shown,query,expanded]);
 const tree=useTree<SceneTreeNode>({
  rootItemId:'root',instanceBuilder:buildProxiedInstance,features,
  initialState:{expandedItems:expandedDefault},state:{expandedItems,selectedItems},
  setExpandedItems:update=>{if(!query.trim())setExpanded(update);},
  getItemName:i=>i.getItemData().name,isItemFolder:i=>i.getItemData().folder,
  dataLoader:{getItem:id=>shown.nodes.get(id)!,getChildren:id=>shown.nodes.get(id)?.children??[]},
  onPrimaryAction:item=>{const selection=item.getItemData().selection;if(selection)props.onSelect(selection);},
  scrollToItem:item=>{virtualizer.scrollToIndex(item.getItemMeta().index,{align:'auto'});},
 });
 useEffect(()=>{tree.rebuildTree();},[tree,shown,expandedItems]);
 // Canvas/context-menu selections reveal their parents without resetting user's
 // other expanded groups or search input.
 useEffect(()=>{
  if(!selected||!shown.nodes.has(selected))return;
  const parents:string[]=[];let node=shown.nodes.get(selected);
  while(node?.parent&&node.parent!=='root'){parents.push(node.parent);node=shown.nodes.get(node.parent);}
  setExpanded(old=>parents.every(p=>old.includes(p))?old:[...new Set([...old,...parents])]);
 },[selected,shown]);
 const items=tree.getItems().filter(item=>shown.nodes.has(item.getId())),virtualizer=useVirtualizer({count:items.length,getScrollElement:()=>viewport.current,estimateSize:()=>28,overscan:8,getItemKey:i=>items[i].getId()});
 useEffect(()=>{
  if(!selected){revealed.current=undefined;return;}
  if(revealed.current===selected)return;
  const index=items.findIndex(item=>item.getId()===selected);if(index<0)return;
  virtualizer.scrollToIndex(index,{align:'auto'});revealed.current=selected;
 },[selected,items,virtualizer]);
 return <div className="editor-theme flex h-full min-h-0 flex-col bg-background text-foreground [&_*]:box-border">
  <header className="shrink-0 border-0 border-b border-solid border-border p-3">
   <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">Scene</span><span className="text-[10px] tabular-nums text-muted-foreground">{props.size} × {props.size}</span></div>
   <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{props.biome}</div>
   <div className="relative mt-3"><Search aria-hidden className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground"/><Input aria-label="Search scene" placeholder="Find layers, objects, IDs…" value={query} onChange={e=>setQuery(e.target.value)} className="pl-8 pr-8"/>{query&&<Button variant="ghost" size="icon-xs" className="absolute right-1 top-1" aria-label="Clear scene search" onClick={()=>setQuery('')}><X className="size-3"/></Button>}</div>
   <div className="mt-2 flex items-center gap-1" aria-label="Scene filter">{(['all','layers','objects'] as const).map(f=><Button key={f} variant={f===filter?'secondary':'ghost'} size="xs" className="flex-1 capitalize" aria-pressed={f===filter} onClick={()=>setFilter(f)}>{f}</Button>)}<Button variant="ghost" size="icon-xs" aria-label="Collapse scene groups" title="Collapse groups" onClick={()=>setExpanded([])}><ChevronsDownUp className="size-3.5"/></Button></div>
  </header>
  <div ref={viewport} className="min-h-0 flex-1 overflow-auto p-1" onKeyDown={e=>e.stopPropagation()}>
   <div {...tree.getContainerProps('Scene hierarchy')} className="relative outline-none" style={{height:virtualizer.getTotalSize()}}>
    {virtualizer.getVirtualItems().map(row=>{
     const item=items[row.index],node=item.getItemData(),Icon=icons[node.icon],itemProps=item.getProps();
     return <button {...itemProps} key={row.key} type="button" title={`${node.name}${node.selection?' · '+node.selection.id:''}`} className={cn('absolute left-0 flex h-7 w-full items-center gap-1.5 rounded px-2 text-left text-xs text-zinc-300 outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',item.isSelected()&&'bg-accent text-foreground',node.hidden&&'opacity-60')} style={{top:row.start,paddingLeft:6+item.getItemMeta().level*12}}>
      {node.folder?<ChevronRight aria-hidden className={cn('size-3 shrink-0 text-muted-foreground',item.isExpanded()&&'rotate-90')}/>:<span className="w-3 shrink-0"/>}
      <Icon aria-hidden className="size-3.5 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1 truncate">{node.name}</span>
      {node.locked&&<Lock aria-label="Locked" className="size-3 shrink-0 text-muted-foreground"/>}{node.hidden&&<EyeOff aria-label="Hidden" className="size-3 shrink-0 text-muted-foreground"/>}
      <span className="max-w-16 truncate text-[10px] tabular-nums text-muted-foreground">{node.detail}</span>
     </button>;
    })}
   </div>
   {!shown.count&&<p className="px-3 py-6 text-center text-xs text-muted-foreground">{query?'No matching items.':'No items in this view.'}</p>}
  </div>
  <footer className="shrink-0 border-0 border-t border-solid border-border px-3 py-2 text-[10px] text-muted-foreground">{query?`${shown.count} matches`:`${model.count} authored items`} · {props.generated.length.toLocaleString()} generated</footer>
 </div>;
}

export class SceneHierarchyView{
 private readonly root:Root;
 constructor(host:HTMLElement){this.root=createRoot(host);}
 render(props:Props){this.root.render(<SceneHierarchy {...props}/>);}
 destroy(){this.root.unmount();}
}
