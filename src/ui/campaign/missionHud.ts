import {shortcuts} from '../../shared/input/shortcuts';
import type {SettlementView} from '../../sim/game/observation';
import {content} from '../../content/builtin';
import {iconArt} from '../settlement/commandArt';
import './campaign.css';
export class MissionHud {
  private objective=document.createElement('aside');
  private dialogue=document.createElement('aside');
  private result=document.createElement('div');
  private key='';
  private readonly bars=document.createElement('div');
  private active=false;
  private readonly blockKey=(e:KeyboardEvent)=>{if(this.active && !document.querySelector('dialog[open]') && !shortcuts.matches('game.settings',e)){e.preventDefault();e.stopImmediatePropagation();}};
  constructor(private readonly host:HTMLElement,onLeave:()=>void){
    this.bars.className='mission-letterbox';host.append(this.bars);
    window.addEventListener('keydown',this.blockKey,true);
    this.objective.className='mission-objective';this.objective.setAttribute('aria-label','Mission objective');
    this.dialogue.className='mission-dialogue';this.dialogue.setAttribute('role','status');this.dialogue.setAttribute('aria-live','polite');
    this.result.className='mission-result';this.result.innerHTML='<section><h2></h2><p></p><button class="campaign-primary">Return to campaign</button></section>';
    this.result.querySelector('button')!.onclick=onLeave;
    this.objective.hidden=this.dialogue.hidden=this.result.hidden=true;host.append(this.objective,this.dialogue,this.result);
  }
  update(view:SettlementView){
    const m=view.mission;if(!m)return;
    this.active=(!!m.scene || (!!m.dialogue?.cinematic && m.dialogue.remaining>0)) && !view.outcome;
    this.host.classList.toggle('mission-cinematic',this.active);
    this.bars.classList.toggle('active',this.active);
    const key=JSON.stringify([{...m,pausedTicks:0,dialogue:m.dialogue?{...m.dialogue,remaining:0}:null},this.active,!!view.outcome,view.outcome?.winner,m.dialogue && (m.dialogue.cinematic?m.dialogue.remaining>0:(view.tick??0)<m.dialogue.until)]);if(key===this.key)return;this.key=key;
    this.objective.replaceChildren();const label=document.createElement('small');label.textContent=m.error?'SCRIPT ERROR':'CURRENT OBJECTIVE';const text=document.createElement('span');text.textContent=m.error??m.objective;this.objective.append(label,text);this.objective.hidden=!text.textContent;
    if(!m.error && view.missionObjectives?.length){
      const shown=view.missionObjectives.filter(o=>m.objectiveStates[o.id]);
      const active=shown.filter(o=>m.objectiveStates[o.id]==='active');
      for(const o of active){const title=document.createElement('strong');title.textContent=(o.optional?'Optional: ':'')+o.title;const description=document.createElement('span');description.textContent=o.description;if(!o.optional){text.remove();}this.objective.append(title,description);}
      const finished=shown.filter(o=>m.objectiveStates[o.id]!=='active');
      if(finished.length){const history=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`Objectives completed: ${finished.filter(o=>m.objectiveStates[o.id]==='completed').length}`;history.append(summary);for(const o of finished){const line=document.createElement('div');line.textContent=`${m.objectiveStates[o.id]==='completed'?'✓':'✕'} ${o.title}`;history.append(line);}this.objective.append(history);}
    }

    const d=m.dialogue;this.dialogue.hidden=!d || (d.cinematic?d.remaining===0:(view.tick??0)>=d.until);
    if(d){const portrait=document.createElement('div');portrait.className='mission-portrait';portrait.innerHTML=iconArt(content.get(d.portrait).icon);const copy=document.createElement('div');copy.className='mission-speech';const name=document.createElement('strong');name.textContent=d.speaker;const line=document.createElement('p');line.textContent=d.text;copy.append(name,line);this.dialogue.replaceChildren(portrait,copy);}
    this.result.hidden=!view.outcome;
    if(view.outcome){const won=view.outcome.winner==='player.1';this.result.querySelector('h2')!.textContent=won?'Prologue complete':'Mission failed';this.result.querySelector('p')!.textContent=won?'Lantern Rise is secure. The northern road is open to the colony.':(m.objective || 'The Vanguard could not complete its mission. Rally and try again.');this.dialogue.hidden=true;}
  }
  destroy(){window.removeEventListener('keydown',this.blockKey,true);this.host.classList.remove('mission-cinematic');this.bars.remove();this.objective.remove();this.dialogue.remove();this.result.remove();}
}
