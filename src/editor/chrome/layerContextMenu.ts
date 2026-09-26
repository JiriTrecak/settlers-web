import {sheet} from '../../ui';

type LayerItem={id:string;name:string;detail:string;selected:boolean};

/** Ephemeral canvas menu. Selection never edits or regenerates a layer. */
export class LayerContextMenu {
  private root:HTMLElement|null=null;
  private events:AbortController|null=null;
  constructor(private readonly canvas:HTMLCanvasElement){}

  close(restoreFocus=false):void {
    this.events?.abort();this.events=null;
    this.root?.remove();this.root=null;
    if(restoreFocus)this.canvas.focus({preventScroll:true});
  }

  open(x:number,y:number,items:readonly LayerItem[],select:(id:string)=>void):void {
    this.close();
    const root=document.createElement('div');this.root=root;
    root.className=`pointer-events-auto rounded-xl p-1.5 font-dock text-canopy shadow-2xl ${sheet}`;
    root.setAttribute('role','menu');root.setAttribute('aria-label','Layers at this point');root.tabIndex=-1;
    Object.assign(root.style,{position:'fixed',zIndex:'1000',width:'280px',maxWidth:'calc(100vw - 16px)',maxHeight:'min(420px, calc(100vh - 16px))',overflowY:'auto'});
    const title=document.createElement('div');title.textContent='Layers at this point';
    title.className='px-2 py-2 text-[10px] uppercase tracking-wider text-canopy/50';root.append(title);
    const buttons:HTMLButtonElement[]=[];
    for(const item of items){
      const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');
      button.className='flex w-full flex-col rounded-lg px-2 py-2 text-left hover:bg-white/10 focus:bg-white/10 focus:outline-none';
      const name=document.createElement('span');name.className='text-xs text-canopy';name.textContent=item.name+(item.selected?' ✓':'');
      const detail=document.createElement('span');detail.className='text-[10px] text-canopy/50';detail.textContent=item.detail;
      button.append(name,detail);button.addEventListener('click',()=>{this.close(true);select(item.id);});
      buttons.push(button);root.append(button);
    }
    if(!items.length){const empty=document.createElement('div');empty.className='px-2 py-3 text-xs text-canopy/50';empty.textContent='No layers at this point';root.append(empty);}
    document.body.append(root);
    const bounds=root.getBoundingClientRect();
    root.style.left=Math.max(8,Math.min(x,window.innerWidth-bounds.width-8))+'px';
    root.style.top=Math.max(8,Math.min(y,window.innerHeight-bounds.height-8))+'px';
    this.events=new AbortController();const signal=this.events.signal;
    window.addEventListener('pointerdown',event=>{if(!root.contains(event.target as Node))this.close();},{capture:true,signal});
    window.addEventListener('wheel',event=>{if(!root.contains(event.target as Node))this.close();},{capture:true,signal});
    window.addEventListener('resize',()=>this.close(),{signal});
    window.addEventListener('blur',()=>this.close(),{signal});
    root.addEventListener('contextmenu',event=>event.preventDefault(),{signal});
    // Capture before editor shortcuts so menu focus cannot rotate/delete a selection.
    window.addEventListener('keydown',event=>{
      event.stopImmediatePropagation();
      if(event.key==='Escape'){event.preventDefault();this.close(true);return;}
      if(event.key==='Tab'){this.close();return;}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();if(!buttons.length)return;
      const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
      buttons[next]!.focus();
    },{capture:true,signal});
    (buttons[0]??root).focus({preventScroll:true});
  }
}
