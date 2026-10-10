import {useEffect,useState} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {FilePlus,Save,Download,FolderOpen,FileCode,LogOut,FileInput} from 'lucide-react';
import {Button} from '../../components/ui/button';
import {Input} from '../../components/ui/input';
import type {FileToolHooks} from './tools';

type Hooks=FileToolHooks&{onName:(name:string)=>void};
function FileBar({name,dirty,hooks}:{name:string;dirty:boolean;hooks:Hooks}){
 const [draft,setDraft]=useState(name);useEffect(()=>setDraft(name),[name]);
 const actions=[['New',FilePlus,hooks.onNew],['Save',Save,hooks.onSave],['Export',Download,hooks.onSaveAs],['Load',FolderOpen,hooks.onLoad],['Import WC3',FileInput,hooks.onImportWarcraft],['Mission & Lua',FileCode,hooks.onMission],['Exit',LogOut,hooks.onLeave]] as const;
 return <div className="flex items-center gap-1">
  <div className="relative w-40 shrink-0 md:w-48"><Input aria-label="Map name" placeholder="Untitled" maxLength={80} spellCheck={false} value={draft} className="border-transparent pr-5 font-medium" onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(draft!==name)hooks.onName(draft);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}}}/>{dirty&&<span role="status" aria-label="Unsaved changes" title="Unsaved changes" className="absolute right-2 top-3 size-1.5 rounded-full bg-amber-400"/>}</div>
  <nav aria-label="File" className="flex items-center gap-0.5 border-0 border-l border-solid border-border pl-1">
   {actions.map(([label,Icon,run])=><Button key={label} variant="ghost" size="sm" title={label} aria-label={label} onClick={run} className="h-11 flex-col gap-1 px-2 text-[10px] text-muted-foreground"><Icon aria-hidden className="size-4"/>{label}</Button>)}
  </nav>
 </div>;
}
export class EditorFileBar {
 readonly root=document.createElement('div');private react:Root;private name='';private dirty=false;
 constructor(host:HTMLElement,private hooks:Hooks){this.root.className='editor-theme pointer-events-auto absolute left-1/2 top-4 z-20 max-w-[calc(100vw-32px)] -translate-x-1/2 rounded-xl border border-solid border-border bg-background/95 p-1.5 font-sans text-foreground shadow-xl [&_*]:box-border';host.append(this.root);this.react=createRoot(this.root);this.render();}
 private render(){this.react.render(<FileBar name={this.name} dirty={this.dirty} hooks={this.hooks}/>);}
 setName(name:string){if(this.name!==name){this.name=name;this.render();}}
 setDirty(dirty:boolean){if(this.dirty!==dirty){this.dirty=dirty;this.render();}}
 destroy(){this.react.unmount();this.root.remove();}
}
