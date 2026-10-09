import {GameScreen} from '../screen/screen';
import {missionArt,campaignArtFallback} from '../campaign/missionArt';
import {missionMaps} from '../../shared/map/library';
import forest from '../../../assets/library/asset.interface.main-menu.forest-aftermath/image.webp';
import ants from '../../../assets/library/asset.interface.campaign.ants/image.webp';
import beetles from '../../../assets/library/asset.interface.campaign.beetles/image.webp';
import bees from '../../../assets/library/asset.interface.campaign.bees/image.webp';
import {MenuEffects} from './menuEffects';
import {MenuTransition} from './menuTransition';
import './mainMenu.css';
import '../campaign/campaign.css';
import './campaignSelector.css';

const factions = [
  {id:'ants',name:'Ants',chapter:'Queensguard',art:ants,locked:false},
  {id:'beetles',name:'Beetles',chapter:'Campaign II',art:beetles,locked:true},
  {id:'bees',name:'Bees',chapter:'Campaign III',art:bees,locked:true},
];

export class CampaignScreen extends GameScreen {
  private missions=false;
  private selectedMission?:string;
  private readonly effects:MenuEffects;
  private readonly transition:MenuTransition;
  private readonly content=document.createElement('section');
  constructor(private readonly hooks:{onBack():void;onPlay(id:string):void},missions=false){
    super('screen canopy-menu campaign-selector');
    this.transition=new MenuTransition(this.root);
    const stage=document.createElement('main');stage.className='canopy-stage campaign-stage';
    const backdrop=document.createElement('img');backdrop.src=forest;backdrop.alt='';backdrop.className='canopy-art';backdrop.draggable=false;
    this.content.className='campaign-content';
    stage.append(backdrop,this.content);this.root.append(stage);
    this.effects=new MenuEffects(stage);
    this.show(missions);
    this.onEscape(()=>this.back());
  }
  override destroy():void {this.transition.destroy();this.effects.destroy();super.destroy();}
  private back():void {this.transition.run(()=>this.missions?this.show(false):this.hooks.onBack());}
  private show(missions:boolean):void {
    this.missions=missions;
    this.selectedMission=undefined;
    this.root.classList.toggle('is-mission-selection',missions);
    this.content.replaceChildren();
    const header=document.createElement('header');header.className='campaign-heading';
    const kicker=document.createElement('p');kicker.textContent=missions?'THE ANT CAMPAIGN':'UNDER THE CANOPY';
    const title=document.createElement('h1');title.textContent=missions?'Queensguard':'Choose your campaign';
    header.append(kicker,title);
    this.content.append(header);
    if(missions)this.missionList();else this.factionList();
    const footer=document.createElement('footer');footer.className='campaign-footer';
    const back=document.createElement('button');back.type='button';back.className='canopy-action campaign-back-action';back.textContent='Back';
    back.setAttribute('aria-label',missions?'Back to campaigns':'Back to main menu');back.onclick=()=>this.back();
    const hint=document.createElement('span');hint.textContent=missions?'The ant campaign':'Three peoples. One forest.';
    footer.append(back,hint);
    if(missions&&this.selectedMission){
      const play=document.createElement('button');play.type='button';play.className='canopy-action mission-selection-begin';play.textContent='Begin Mission';play.onclick=()=>{if(this.selectedMission)this.transition.run(()=>this.hooks.onPlay(this.selectedMission!));};footer.append(play);
    }
    this.content.append(footer);
  }
  private factionList():void {
    const list=document.createElement('div');list.className='campaign-factions';
    for(const faction of factions){
      const card=document.createElement('article');card.className=`faction-panel faction-${faction.id}${faction.locked?' is-locked':''}`;
      const crest=document.createElement('img');crest.src=faction.art;crest.alt='';crest.draggable=false;crest.className='faction-crest';
      const copy=document.createElement('div');copy.className='faction-copy';
      const chapter=document.createElement('p');chapter.className='faction-chapter';chapter.textContent=faction.chapter;
      const name=document.createElement('h2');name.textContent=faction.name;
      const line=document.createElement('div');line.className='faction-rule';line.setAttribute('aria-hidden','true');
      const status=document.createElement('p');status.className='faction-status';status.textContent=faction.locked?'Finish ant campaign first':'The ambition grows';
      const play=document.createElement('button');play.type='button';play.className='canopy-action faction-play';play.disabled=faction.locked;
      play.textContent=faction.locked?'Locked':'Play';play.setAttribute('aria-label',`${faction.name} campaign: ${faction.locked?'locked':'play'}`);
      if(!faction.locked)play.onclick=()=>this.transition.run(()=>{this.show(true);this.content.querySelector<HTMLButtonElement>('.campaign-chapter')?.focus();});
      copy.append(chapter,name,line,status);card.append(crest,copy,play);list.append(card);
    }
    this.content.append(list);
  }
  private missionList():void {
    const missions=missionMaps('vanguard');
    // Editor saves retain a local copy of project maps. Show each shipped chapter
    // once, while keeping newly authored local missions available to play.
    const entries=missions.filter(entry=>entry.source==='project'||!missions.some(project=>project.source==='project'&&project.id===entry.id.replace(/^local:/,'')));
    const layout=document.createElement('div');layout.className='mission-selection';
    const list=document.createElement('nav');list.className='mission-selection-list';list.setAttribute('aria-label','Campaign chapters');
    const detail=document.createElement('section');detail.className='mission-selection-detail';detail.id='campaign-mission-detail';
    const buttons:HTMLButtonElement[]=[];
    const select=(index:number)=>{
      const entry=entries[index],mission=entry.map.mission!,presentation=mission.presentation;
      this.selectedMission=entry.id;
      buttons.forEach((button,i)=>{button.classList.toggle('is-selected',i===index);button.setAttribute('aria-pressed',String(i===index));});
      detail.replaceChildren();
      const art=document.createElement('img');art.className='mission-selection-art';art.alt='';art.draggable=false;
      art.src=missionArt(presentation?.selectionBackground)??entry.previewUrl??campaignArtFallback;
      art.onerror=()=>{art.onerror=null;art.src=campaignArtFallback;};
      const chapter=document.createElement('p');chapter.className='mission-selection-chapter';chapter.textContent=presentation?.chapter??`Chapter ${mission.order}`;
      const title=document.createElement('h2');title.textContent=mission.title;
      const description=document.createElement('p');description.className='mission-selection-description';description.textContent=presentation?.briefing??entry.map.description??'';
      const features=document.createElement('ul');features.className='mission-selection-features';
      for(const text of presentation?.features??[]){const item=document.createElement('li');item.textContent=text;features.append(item);}
      detail.append(art,chapter,title,description,features);
    };
    entries.forEach((entry,index)=>{
      const button=document.createElement('button');button.type='button';button.className='campaign-chapter mission-selection-row';button.setAttribute('aria-controls',detail.id);
      const number=document.createElement('span');number.textContent=String(entry.map.mission!.order).padStart(2,'0');
      const title=document.createElement('strong');title.textContent=entry.map.mission!.title;button.append(number,title);button.onclick=()=>select(index);
      button.onkeydown=event=>{if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?entries.length-1:(index+(event.key==='ArrowDown'?1:-1)+entries.length)%entries.length;select(next);buttons[next].focus();};
      buttons.push(button);list.append(button);
    });
    const note=document.createElement('p');note.className='mission-selection-more';note.textContent=entries.length?'More chapters to come':'No playable Queensguard missions found.';list.append(note);
    layout.append(list,detail);this.content.append(layout);if(entries.length)select(0);
  }
}
