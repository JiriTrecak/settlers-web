import {GameScreen} from '../screen/screen';
import {missionMaps} from '../../shared/map/library';
import forest from '../../../assets/ui/main-menu/forest-heroes.png';
import {content} from '../../content/builtin';
import {iconArt} from '../settlement/commandArt';
import '../campaign/campaign.css';
export class CampaignScreen extends GameScreen {
  private missions=false;
  constructor(private readonly hooks:{onBack():void;onPlay(id:string):void},missions=false){
    super('screen campaign-screen');
    this.show(missions);
    this.onEscape(()=>this.missions?this.show(false):hooks.onBack());
  }
  private show(missions:boolean):void {
    this.missions=missions;
    const hooks=this.hooks;
    this.root.replaceChildren();
    const backdrop=document.createElement('img');backdrop.src=forest;backdrop.alt='';backdrop.className='campaign-backdrop';
    const panel=document.createElement('main');panel.className='campaign-main';
    const kicker=document.createElement('p');kicker.className='campaign-kicker';kicker.textContent=missions?'VANGUARD · THE ANT CAMPAIGN':'UNDER THE CANOPY · CAMPAIGNS';
    const title=document.createElement('h1');title.textContent=missions?'The first footsteps':'Vanguard';
    const intro=document.createElement('p');intro.className='campaign-intro';intro.textContent=missions?'Every colony begins with a few brave souls beyond the safety of the mound.':'Small beneath the canopy. Unbroken beneath its weight. Follow the ants who venture into the wild to secure a future for their colony.';
    const list=document.createElement('div');list.className='campaign-chapters';
    if(!missions){
      const emblem=document.createElement('div');emblem.className='campaign-emblem';emblem.innerHTML=iconArt(content.get('unit.ants.marshal').icon);panel.append(emblem);
      const enter=document.createElement('button');enter.className='campaign-primary';enter.textContent='Enter the Vanguard campaign';enter.onclick=()=>this.show(true);list.append(enter);
    } else {
      for(const entry of missionMaps('vanguard')){
        const card=document.createElement('button');card.className='campaign-chapter';
        const number=document.createElement('span');number.className='campaign-number';number.textContent=String(entry.map.mission!.order).padStart(2,'0');
        const copy=document.createElement('span'),name=document.createElement('strong'),description=document.createElement('span');
        name.textContent=entry.map.mission!.title;description.textContent=entry.map.description??'';copy.append(name,description);
        const play=document.createElement('span');play.className='campaign-play';play.textContent='Begin →';card.append(number,copy,play);card.onclick=()=>hooks.onPlay(entry.id);list.append(card);
      }
      if(!list.childElementCount)list.textContent='No playable Vanguard missions found.';
    }
    const back=document.createElement('button');back.className='campaign-back';back.textContent=missions?'← Campaigns':'← Main menu';back.onclick=missions?()=>this.show(false):hooks.onBack;
    panel.append(kicker,title,intro,list,back);this.root.append(backdrop,panel);
  }
}
