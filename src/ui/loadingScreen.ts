import type {LoadProgress} from '../shared/loading';
import type {MissionDefinition} from '../shared/scenario/schema';
import {missionArt,campaignArtFallback} from './campaign/missionArt';
import crest from '../../assets/library/asset.interface.campaign.ants/image.webp';
import './loadingScreen.css';
const defaultLabels={title:'Preparing the battlefield',progress:'Match loading progress',waiting:'The match starts when preparation is complete.',error:'The battlefield could not be loaded'};
export class LoadingScreen {
  readonly root=document.createElement('div');
  private readonly stage=document.createElement('p');
  private readonly progress=document.createElement('progress');
  private readonly detail=document.createElement('p');
  private tipTimer=0;
  private readonly inert=new Map<HTMLElement,boolean>();
  private readonly observer:MutationObserver;
  private readonly previousFocus=document.activeElement;
  private readonly blockKeys=(event:KeyboardEvent)=>{
    if(event.key!=='Tab'&&!(event.target instanceof HTMLElement&&this.root.contains(event.target)))event.preventDefault();
    event.stopImmediatePropagation();
  };
  constructor(host:HTMLElement,onLeave:()=>void,private readonly labels=defaultLabels,mission?:Pick<MissionDefinition,'order'|'title'|'presentation'>){
    window.addEventListener('keydown',this.blockKeys,true);window.addEventListener('keyup',this.blockKeys,true);
    this.root.className='match-loading';
    const panel=document.createElement('section'),title=document.createElement('h1'),leave=document.createElement('button');
    title.textContent=mission?.title??labels.title;leave.type='button';leave.textContent='Back to menu';leave.onclick=onLeave;
    this.progress.setAttribute('aria-label',labels.progress);this.detail.className='match-loading-detail';
    this.stage.className='match-loading-stage';this.stage.setAttribute('role','status');this.stage.setAttribute('aria-live','polite');
    if(mission){
      this.root.classList.add('mission-loading');
      const art=document.createElement('img');art.className='mission-loading-art';art.alt='';art.src=missionArt(mission.presentation?.loadingBackground)??campaignArtFallback;
      art.onerror=()=>{art.onerror=null;art.src=campaignArtFallback;};art.draggable=false;
      const emblem=document.createElement('img');emblem.className='mission-loading-crest';emblem.alt='';emblem.src=crest;
      const chapter=document.createElement('p');chapter.className='mission-loading-chapter';chapter.textContent=mission.presentation?.chapter??`Chapter ${mission.order}`;
      const briefing=document.createElement('p');briefing.className='mission-loading-briefing';briefing.textContent=mission.presentation?.briefing??'';
      panel.className='mission-loading-copy';panel.append(emblem,chapter,title,briefing);
      const footer=document.createElement('div');footer.className='mission-loading-footer';
      const label=document.createElement('p');label.className='mission-loading-label';label.textContent='Loading';
      footer.append(this.progress,label,this.stage,this.detail);
      const tip=document.createElement('p');tip.className='mission-loading-tip';tip.textContent=mission.presentation?.tips?.[0]??'';
      const tips=mission.presentation?.tips??[];
      if(tips.length>1){let index=0;this.tipTimer=window.setInterval(()=>{index=(index+1)%tips.length;tip.textContent=tips[index];},9000);}
      footer.append(tip);leave.className='mission-loading-leave';this.root.append(art,panel,footer,leave);
    }else{panel.append(title,this.stage,this.progress,this.detail,leave);this.root.append(panel);}
    host.append(this.root);
    const blockBackground=()=>{for(const child of host.children)if(child instanceof HTMLElement&&child!==this.root&&!this.inert.has(child)){this.inert.set(child,child.inert);child.inert=true;}};
    blockBackground();this.observer=new MutationObserver(blockBackground);this.observer.observe(host,{childList:true});leave.focus();this.update({stage:labels.title});
  }
  update(p:LoadProgress){
    this.stage.textContent=p.stage;
    if(p.total&&p.total>0){this.progress.max=p.total;this.progress.value=Math.min(p.total,Math.max(0,p.loaded??0));this.detail.textContent=`${p.loaded??0} / ${p.total} files loaded`;}
    else{this.progress.removeAttribute('value');this.detail.textContent=this.labels.waiting;}
  }
  error(error:unknown){window.clearInterval(this.tipTimer);this.root.classList.add('is-error');this.stage.textContent=this.labels.error;this.detail.textContent=error instanceof Error?error.message:String(error);this.progress.hidden=true;}
  destroy(){window.clearInterval(this.tipTimer);window.removeEventListener('keydown',this.blockKeys,true);window.removeEventListener('keyup',this.blockKeys,true);this.observer.disconnect();for(const [element,inert]of this.inert)element.inert=inert;this.inert.clear();this.root.remove();if(this.previousFocus instanceof HTMLElement&&this.previousFocus.isConnected)this.previousFocus.focus();}
}
