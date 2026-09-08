import { art } from './commandArt';
/** Delegated so changing selection and resource counters need no new event listeners. */
export class CommandTooltips {
  private readonly box=document.createElement('div');
  private active:HTMLElement|null=null;
  constructor(private readonly host:HTMLElement){
    this.box.className='rts-tooltip';this.box.id='rts-command-tooltip';this.box.role='tooltip';this.box.hidden=true;host.append(this.box);
    host.addEventListener('pointerover',this.over);host.addEventListener('pointerout',this.out);
    host.addEventListener('focusin',this.over);host.addEventListener('focusout',this.out);
    window.addEventListener('keydown',this.key);window.addEventListener('resize',this.hide);
  }
  private over=(event:Event)=>{
    const target=(event.target as Element).closest<HTMLElement>('[data-tip-name]');if(!target || target===this.active)return;
    this.hide();this.active=target;target.setAttribute('aria-describedby',this.box.id);
    const name=document.createElement('strong');name.textContent=target.dataset.tipName??'';
    const description=document.createElement('p');description.textContent=target.dataset.tipDescription??'';
    const costs=document.createElement('div');costs.className='rts-tooltip-costs';
    const wood=target.dataset.tipWood,stone=target.dataset.tipStone;
    if(wood!==undefined || stone!==undefined)costs.innerHTML=`<span aria-label="${Number(wood)||0} planks">${art(8)}${Number(wood)||0}</span><span aria-label="${Number(stone)||0} stone">${art(9)}${Number(stone)||0}</span>`;
    const shortcut=document.createElement('small');shortcut.textContent=target.dataset.tipKey?`Shortcut: ${target.dataset.tipKey}`:'';
    this.box.replaceChildren(name,costs,description,shortcut);this.box.hidden=false;
    const rect=target.getBoundingClientRect(),height=this.box.offsetHeight,width=this.box.offsetWidth;
    this.box.style.left=`${Math.max(8,Math.min(innerWidth-width-8,rect.right-width))}px`;
    this.box.style.top=`${rect.top>height+12?rect.top-height-10:Math.min(innerHeight-height-8,rect.bottom+10)}px`;
  };
  private out=(event:Event)=>{if(this.active?.contains((event as MouseEvent).relatedTarget as Node|null))return;this.hide();};
  private key=(e:KeyboardEvent)=>{if(e.key==='Escape')this.hide();};
  private hide=()=>{this.active?.removeAttribute('aria-describedby');this.active=null;this.box.hidden=true;};
  destroy(){this.host.removeEventListener('pointerover',this.over);this.host.removeEventListener('pointerout',this.out);this.host.removeEventListener('focusin',this.over);this.host.removeEventListener('focusout',this.out);window.removeEventListener('keydown',this.key);window.removeEventListener('resize',this.hide);this.box.remove();}
}
