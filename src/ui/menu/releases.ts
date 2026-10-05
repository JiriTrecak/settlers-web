import {releaseGallery} from './releaseGallery';
import {createElement,ScrollText,Rocket,Sparkles,Wrench,TriangleAlert,ArrowDownToLine,Check,X,RefreshCw,type IconNode} from 'lucide';
import {installedHistory,installedVersion,releaseBaseUrl} from '../../shared/release/installed';
import {changeKinds,releaseEntry,type ReleaseEntry} from '../../shared/release/schema';
import {desktopUpdates,isDesktop} from '../../shared/release/desktop';
import {UpdateController,type UpdateState} from '../../shared/release/updater';
import './releases.css';
const categories={added:{label:'New',icon:Sparkles,tone:'violet'},improved:{label:'Improved',icon:Rocket,tone:'amber'},fixed:{label:'Fixed',icon:Wrench,tone:'emerald'},knownIssues:{label:'Known issues',icon:TriangleAlert,tone:'amber'}};
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string){const e=document.createElement(tag);if(text)e.textContent=text;if(className)e.className=className;return e;}
function icon(node:IconNode){return createElement(node,{width:18,height:18,'stroke-width':1.75,'aria-hidden':'true'});}
function button(text:string,node?:IconNode){const b=el('button',undefined,'release-button');b.type='button';if(node)b.append(icon(node));b.append(el('span',text));return b;}
export function renderRelease(entry:ReleaseEntry):HTMLElement {
 const milestone=entry.version.endsWith('.0');
 const section=el('article',undefined,'release-entry');
 const marker=el('div',undefined,`release-marker release-tone-${milestone?'violet':'emerald'}`);marker.append(icon(milestone?Rocket:Wrench));
 const body=el('div',undefined,'release-entry-body');
 const meta=el('div',undefined,'release-meta');
 meta.append(el('span',`v${entry.version}`,`release-badge release-tone-${milestone?'violet':'emerald'}`));
 const time=el('time',new Date(entry.publishedAt).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}));time.dateTime=entry.publishedAt;meta.append(time);
 if(entry.version===installedVersion)meta.append(el('span','Installed','release-installed'));
 body.append(meta,el('h3',entry.title));
 for(const kind of changeKinds){
  if(!entry[kind].length)continue;
  const category=categories[kind],group=el('section',undefined,'release-group');
  const title=el('h4',undefined,`release-category release-tone-${category.tone}`);title.append(icon(category.icon),el('span',category.label));
  const list=el('ul');for(const note of entry[kind])list.append(el('li',note));group.append(title,list);body.append(group);
 }
 const gallery=releaseGallery(entry);if(gallery)body.append(gallery);
 section.append(marker,body);return section;
}
export function releaseMenu(root:HTMLElement):()=>void {
 const desktop=isDesktop();
 const footer=el('div',undefined,'canopy-release-bar');
 const versionButton=button(`v${installedVersion}`);versionButton.classList.add('release-version');
 const versionText=el('span',`v${installedVersion}`),versionStatus=el('span',desktop?'Checking…':'','release-version-status');versionButton.replaceChildren(versionText,versionStatus);versionStatus.setAttribute('aria-live','polite');
 const notesButton=button('What’s new');footer.append(versionButton,notesButton);
 const dialog=el('dialog',undefined,'canopy-release-dialog');dialog.setAttribute('aria-labelledby','release-title');
 const header=el('header',undefined,'release-header'),heading=el('h2','Changelog');heading.id='release-title';
 const headingIcon=el('span',undefined,'release-heading-icon');headingIcon.append(icon(ScrollText));
 const dismiss=button('',X);dismiss.classList.add('release-dismiss');dismiss.setAttribute('aria-label','Close dialog');
 header.append(headingIcon,heading,dismiss);
 const viewport=el('div',undefined,'release-scroll');
 const status=el('p',undefined,'release-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const progress=el('progress');progress.setAttribute('aria-label','Update download');progress.hidden=true;
 const content=el('div',undefined,'release-timeline');
 const actions=el('footer',undefined,'release-actions');
 const primary=button('Download update',ArrowDownToLine),close=button('Close');primary.classList.add('release-primary');primary.hidden=true;actions.append(primary,close);
 viewport.append(status,progress,content);dialog.append(header,viewport,actions);root.append(footer,dialog);
 let updateView=false,disposed=false,loadedVersion:string|undefined,remoteRelease:ReleaseEntry|undefined,renderedKey='';
 const requests=new AbortController();
 const controller=new UpdateController(desktopUpdates,draw);
 function drawTimeline(s:UpdateState){
  const key=updateView?`${s.version}:${s.notes}:${remoteRelease?.version}`:'installed';
  if(key===renderedKey)return;renderedKey=key;
  content.replaceChildren();
  if(updateView&&s.version){
   if(remoteRelease?.version===s.version)content.append(renderRelease(remoteRelease));
   else {const entry=el('article',undefined,'release-entry release-entry-fallback');const marker=el('div',undefined,'release-marker release-tone-violet');marker.append(icon(Rocket));const body=el('div',undefined,'release-entry-body');body.append(el('span',`v${s.version}`,'release-badge release-tone-violet'),el('div',s.notes||'A new version is ready to download.','release-update-notes'));entry.append(marker,body);content.append(entry);}
  }else for(const entry of installedHistory)content.append(renderRelease(entry));
 }
 async function loadNotes(version:string){
  loadedVersion=version;
  try{
   const response=await fetch(`${releaseBaseUrl}/releases/${encodeURIComponent(version)}/changelog.json`,{signal:AbortSignal.any([requests.signal,AbortSignal.timeout(10000)])});
   if(!response.ok)return;
   const entry=releaseEntry.parse(await response.json());
   if(disposed||entry.version!==version||controller.state.version!==version)return;
   remoteRelease=entry;draw(controller.state);
  }catch{/* The update feed's text notes remain usable offline or on a bad changelog response. */}
 }
 function draw(s:UpdateState){
  if(disposed)return;
  const available=['available','downloading','ready','installing','restart'].includes(s.phase);
  const text=available?'Update available':s.phase==='current'?'Latest':s.phase==='checking'?'Checking…':s.phase==='error'?'Check unavailable':'Check for updates';
  versionStatus.replaceChildren(el('span',text));
  if(available)versionStatus.append(icon(ArrowDownToLine));else if(s.phase==='current')versionStatus.append(icon(Check));
  versionButton.dataset.available=String(available);versionButton.title=s.phase==='error'?'Could not check for updates. Click to retry.':available?`Version ${s.version} is available`:'Desktop updates';
  if(s.version&&loadedVersion!==s.version)void loadNotes(s.version);
  if(!updateView)return;
  heading.textContent='Desktop updates';
  const messages:Record<UpdateState['phase'],string>={idle:'',checking:'Checking for updates…',current:`You’re up to date — v${installedVersion}.`,available:`Version ${s.version} is available.`,downloading:'Downloading and verifying the update…',ready:'Ready to install. The game will restart.',installing:'Installing…',restart:'Restarting…',error:''};
  status.textContent=s.error??messages[s.phase];
  progress.hidden=s.phase!=='downloading';if(s.total){progress.max=s.total;progress.value=s.received;}else progress.removeAttribute('value');
  drawTimeline(s);
  const action=({available:'Download update',ready:'Install and restart',restart:'Restart now',current:'Check again',error:'Try again'} as Partial<Record<UpdateState['phase'],string>>)[s.phase];
  primary.hidden=!action;primary.replaceChildren(icon(s.phase==='current'||s.phase==='error'?RefreshCw:ArrowDownToLine),el('span',action??''));
  dismiss.disabled=close.disabled=controller.busy||s.phase==='restart';
 }
 function show(){if(!dialog.open)dialog.showModal();viewport.scrollTop=0;dismiss.focus({preventScroll:true});}
 function showNotes(){updateView=false;heading.textContent='Changelog';status.textContent='Updates from under the canopy.';progress.hidden=true;primary.hidden=true;dismiss.disabled=close.disabled=false;drawTimeline(controller.state);show();}
 notesButton.onclick=showNotes;
 versionButton.onclick=()=>{
  if(!desktop){showNotes();return;}
  updateView=true;draw(controller.state);show();
  if(controller.state.phase==='idle'||controller.state.phase==='error')void controller.check();
 };
 primary.onclick=()=>{switch(controller.state.phase){case 'available':void controller.download();break;case 'ready':void controller.install();break;case 'restart':void controller.restart();break;default:void controller.check();}};
 dismiss.onclick=close.onclick=()=>dialog.close();
 dialog.addEventListener('cancel',e=>{if(updateView&&(controller.busy||controller.state.phase==='restart'))e.preventDefault();});
 // Background checks report status only. Downloads and installation remain explicit.
 if(desktop)void controller.check();
 return ()=>{disposed=true;requests.abort();void controller.dispose();footer.remove();dialog.remove();};
}
