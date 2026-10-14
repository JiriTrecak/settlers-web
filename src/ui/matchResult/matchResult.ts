import type {MatchResult} from '../../presentation/matchResult';
import './matchResult.css';

/** Native modal keeps focus and pointer input out of the finished battlefield. */
export class MatchResultDialog {
  private readonly dialog=document.createElement('dialog');
  private closed=false;

  constructor(result:MatchResult,onClose:()=>void){
    const dialog=this.dialog;
    dialog.className=`match-result match-result-${result.kind}`;
    dialog.setAttribute('aria-label',result.title);
    const eyebrow=document.createElement('p');
    eyebrow.className='match-result-eyebrow';eyebrow.textContent='Multiplayer · Match complete';
    const title=document.createElement('h1');title.textContent=result.title;
    const description=document.createElement('p');description.textContent=result.description;
    const hint=document.createElement('p');hint.className='match-result-hint';hint.textContent='Close to return to multiplayer.';
    const close=document.createElement('button');close.type='button';close.textContent='Close';close.autofocus=true;
    const finish=()=>{if(this.closed)return;this.destroy();onClose();};
    close.addEventListener('click',finish);
    dialog.addEventListener('cancel',event=>{event.preventDefault();finish();});
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    dialog.addEventListener('keyup',event=>event.stopPropagation());
    dialog.append(eyebrow,title,description,hint,close);
    document.body.append(dialog);dialog.showModal();
  }

  destroy(){this.closed=true;this.dialog.close();this.dialog.remove();}
}
