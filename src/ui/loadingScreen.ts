import type {LoadProgress} from '../shared/loading';
import './loadingScreen.css';
export class LoadingScreen {
  readonly root=document.createElement('div');
  private readonly stage=document.createElement('p');
  private readonly progress=document.createElement('progress');
  private readonly detail=document.createElement('p');
  private readonly inert = new Map<HTMLElement,boolean>();
  private readonly observer: MutationObserver;
  private readonly previousFocus = document.activeElement;
  private readonly blockKeys = (event:KeyboardEvent) => {
    if(event.key!=="Tab" && !(event.target instanceof HTMLElement && this.root.contains(event.target))) event.preventDefault();
    event.stopImmediatePropagation();
  };
  constructor(host:HTMLElement,onLeave:()=>void){
    window.addEventListener('keydown',this.blockKeys,true);
    window.addEventListener('keyup',this.blockKeys,true);
    this.root.className='match-loading';this.root.setAttribute('role','status');this.root.setAttribute('aria-live','polite');
    const panel=document.createElement('section'),title=document.createElement('h1'),leave=document.createElement('button');
    title.textContent='Preparing the battlefield';leave.textContent='Back to menu';leave.onclick=onLeave;
    this.progress.setAttribute('aria-label','Match loading progress');this.detail.className='match-loading-detail';
    panel.append(title,this.stage,this.progress,this.detail,leave);this.root.append(panel);host.append(this.root);
    const blockBackground=()=>{
      for(const child of host.children)if(child instanceof HTMLElement && child!==this.root && !this.inert.has(child)){
        this.inert.set(child,child.inert);child.inert=true;
      }
    };
    blockBackground();this.observer=new MutationObserver(blockBackground);this.observer.observe(host,{childList:true});
    leave.focus();
    this.update({stage:'Preparing match'});
  }
  update(p:LoadProgress){
    this.stage.textContent=p.stage;
    if(p.total){this.progress.max=p.total;this.progress.value=p.loaded??0;this.detail.textContent=`${p.loaded??0} / ${p.total} files loaded`;}
    else{this.progress.removeAttribute('value');this.detail.textContent='The match starts when preparation is complete.';}
  }
  error(error:unknown){this.stage.textContent='The battlefield could not be loaded';this.detail.textContent=error instanceof Error?error.message:String(error);this.progress.hidden=true;}
  destroy(){window.removeEventListener('keydown',this.blockKeys,true);window.removeEventListener('keyup',this.blockKeys,true);this.observer.disconnect();for(const [element,inert] of this.inert)element.inert=inert;this.inert.clear();this.root.remove();if(this.previousFocus instanceof HTMLElement && this.previousFocus.isConnected)this.previousFocus.focus();}
}
