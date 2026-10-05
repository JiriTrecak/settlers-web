import {GameScreen} from '../screen/screen';
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
    this.content.replaceChildren();
    const header=document.createElement('header');header.className='campaign-heading';
    const kicker=document.createElement('p');kicker.textContent='UNDER THE CANOPY';
    const title=document.createElement('h1');title.textContent=missions?'Queensguard':'Choose your campaign';
    header.append(kicker,title);
    this.content.append(header);
    if(missions)this.missionList();else this.factionList();
    const footer=document.createElement('footer');footer.className='campaign-footer';
    const back=document.createElement('button');back.type='button';back.className='canopy-action campaign-back-action';back.textContent='Back';
    back.setAttribute('aria-label',missions?'Back to campaigns':'Back to main menu');back.onclick=()=>this.back();
    const hint=document.createElement('span');hint.textContent=missions?'The ant campaign':'Three peoples. One forest.';
    footer.append(back,hint);this.content.append(footer);
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
    const panel=document.createElement('section');panel.className='campaign-missions';
    const intro=document.createElement('p');intro.className='campaign-intro';intro.textContent='Every colony begins with a few brave souls beyond the safety of the mound.';
    const list=document.createElement('div');list.className='campaign-chapters';
    for(const entry of missionMaps('vanguard')){
      const card=document.createElement('button');card.type='button';card.className='campaign-chapter';
      const number=document.createElement('span');number.className='campaign-number';number.textContent=String(entry.map.mission!.order).padStart(2,'0');
      const copy=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('span');
      name.textContent=entry.map.mission!.title;description.textContent=entry.map.description??'';copy.append(name,description);
      const play=document.createElement('span');play.className='campaign-play';play.textContent='Begin →';card.append(number,copy,play);
      card.onclick=()=>this.transition.run(()=>this.hooks.onPlay(entry.id));list.append(card);
    }
    if(!list.childElementCount)list.textContent='No playable Queensguard missions found.';
    panel.append(intro,list);this.content.append(panel);
  }
}
