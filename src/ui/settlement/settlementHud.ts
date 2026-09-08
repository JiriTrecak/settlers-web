import { SOLDIERS, isSoldier, unitMaxHealth, type SoldierKind } from '../../shared/settlement/rules';
import type { Action } from '../../shared/types/types';
import { ART, DESCRIPTIONS, art } from "./commandArt";
import { CommandTooltips } from "./tooltips";
import "./commandDock.css";
import { economyStatus } from "./economyStatus";
import {
  BUILDINGS,
  BUILDING_KINDS,
  type BuildingKind,
} from "../../shared/settlement/rules";
import type { SettlementView } from "../../sim/settlement/settlement";

export class SettlementHud {
  readonly root = document.createElement("div");
  private readonly stock = document.createElement("div");
  private readonly panel = document.createElement("div");
  private readonly info = document.createElement("p");
  private readonly hint = document.createElement("p");
  private readonly cancel = document.createElement("button");
  private readonly buttons = new Map<BuildingKind, HTMLButtonElement>();
  private readonly construction=document.createElement("div");
  private readonly recruitment=document.createElement('div');
  private readonly queue=document.createElement('div');
  private readonly military=document.createElement('div');
  private queueMarkup='';
  rallyMode=false;
  mode: BuildingKind | null = null;
  selectedIds:number[]=[];
  get selected():number|null{return this.selectedIds[0]??null;}
  set selected(id:number|null){this.setSelection(id===null?[]:[id]);}
  setSelection(ids:readonly number[]) {this.selectedIds=[...new Set(ids)];this.clearMode();}
  attackMode=false;
  private canAttack=false;
  private readonly cards=document.createElement('div');
  private cardsKey='';
  private readonly cardNodes=new Map<number,HTMLButtonElement>();
  armAttack(){
    if(!this.canAttack)return;
    this.clearMode();this.attackMode=true;
    this.hint.textContent='Attack: click ground to advance and engage, or click a target to force attack. Escape cancels.';
  }
  private lastEvent = -1;
  private stockMarkup = "";
  private readonly portrait=document.createElement("div");
  private readonly meter=document.createElement("div");
  private readonly tooltips:CommandTooltips;
  private portraitIndex=-1;
  readonly minimapHost=document.createElement("div");
  readonly clockHost=document.createElement("div");
  private readonly heading=document.createElement("h2");
  private readonly onKey=(e:KeyboardEvent)=>{
    if(e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && (e.target.matches('input,textarea,select') || e.target.isContentEditable || e.target.closest('dialog[open]'))))return;
    const index=Number(e.key)-1;
    if(index>=0 && index<BUILDING_KINDS.length){e.preventDefault();this.buttons.get(BUILDING_KINDS[index]!)?.click();}
    if(e.key.toLowerCase()==='a'){e.preventDefault();this.armAttack();}
    if(e.key==='Home'){e.preventDefault();this.hooks.home();}
  };
  constructor(
    host: HTMLElement,
    private readonly owner: number,
    private readonly hooks: {
      action: (action:Action) => void;
      mode: () => void;
      cancel: (id: number) => void;
      home: () => void;
    },
  ) {
    this.root.className = "rts-hud";
    this.stock.className="rts-resources";
    this.stock.setAttribute("aria-label","Settlement economy");
    this.panel.className="rts-dock";
    this.panel.setAttribute("aria-label","Game command panel");
    const map=document.createElement("section");map.className="rts-map";
    map.innerHTML='<div class="rts-map-label"><span></span><span>N ↑</span></div>';
    this.minimapHost.className="rts-map-slot";map.append(this.minimapHost);
    this.clockHost.className="rts-clock-slot";
    const selection=document.createElement("section");selection.className="rts-selection";
    const label=document.createElement("div");label.className="rts-eyebrow";label.textContent="COMMAND / SELECTION";
    this.heading.textContent="Your settlement";
    this.portrait.className="rts-portrait";this.portrait.tabIndex=0;
    this.meter.className="rts-portrait-meter";
    const text=document.createElement("div");text.className="rts-selection-copy";text.append(label,this.heading,this.info,this.hint);
    this.cards.className='rts-unit-cards';this.cards.hidden=true;
    this.cards.onclick=e=>{
      const card=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-unit]');if(!card)return;
      const id=Number(card.dataset.unit);
      this.setSelection((e as MouseEvent).shiftKey?this.selectedIds.filter(v=>v!==id):[id]);
    };
    text.append(this.cards);
    selection.append(this.portrait,text,this.clockHost);
    const actions=document.createElement("section");actions.className="rts-actions";
    const actionsLabel=document.createElement("div");actionsLabel.className="rts-actions-label";actionsLabel.textContent="";
    const row = this.construction;row.className="rts-command-grid";
    actions.append(actionsLabel,row);
    this.panel.append(map,selection,actions);
    for (const kind of BUILDING_KINDS) {
      const rule = BUILDINGS[kind],
        b = document.createElement("button");
      b.className = "rts-command";
      b.setAttribute('aria-label',rule.name);
      Object.assign(b.dataset,{tipName:rule.name,tipDescription:DESCRIPTIONS[kind],tipWood:String(rule.wood),tipStone:String(rule.stone),tipKey:String(BUILDING_KINDS.indexOf(kind)+1)});
      b.innerHTML=`${art(ART[kind])}<kbd>${BUILDING_KINDS.indexOf(kind)+1}</kbd><span class="rts-command-name">${rule.name.replace("'s hut",'').replace(' lodge','').replace('Settler house','House')}</span>`;
      b.onclick = () => {
        if(b.hidden || b.disabled)return;
        this.mode = this.mode === kind ? null : kind;
        this.rallyMode=false;
        this.hooks.mode();
        this.hint.textContent = this.mode
          ? "Click clear, flat ground inside your border. Escape cancels placement."
          : "";
        this.syncButtons();
      };
      row.append(b);
      this.buttons.set(kind, b);
    }
    this.recruitment.className='rts-recruitment';
    for(const kind of ['warrior','archer'] as SoldierKind[]) {
      const button=document.createElement('button');button.className='rts-command';
      button.innerHTML=`${art(kind==='warrior'?17:18)}<span class="rts-command-name">${SOLDIERS[kind].name}</span>`;
      Object.assign(button.dataset,{tipName:`Recruit ${SOLDIERS[kind].name}`,tipWood:'1',tipDescription:`1 free settler. ${SOLDIERS[kind].training/40}s training after delivery and arrival. ${SOLDIERS[kind].health} HP. ${kind==='warrior'?'Close-range infantry.':'Ranged support; protect from melee.'}`});
      button.onclick=()=>{if(this.selected)this.hooks.action({type:'recruit',id:this.selected,kind});};
      this.recruitment.append(button);
    }
    const rally=document.createElement('button');rally.textContent='Set rally point';
    Object.assign(rally.dataset,{tipName:'Rally point',tipDescription:'Click ground to choose where newly trained units assemble.'});
    rally.onclick=()=>{this.rallyMode=true;this.hint.textContent='Click ground to set the rally point.';};
    this.queue.className='rts-recruit-queue';
    this.queue.onclick=e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-index]');if(button&&this.selected)this.hooks.action({type:'cancel-recruit',id:this.selected,index:Number(button.dataset.index)});};
    this.recruitment.append(rally,this.queue);actions.append(this.recruitment);
    const stop=document.createElement('button');stop.textContent='Stop';
    Object.assign(stop.dataset,{tipName:'Stop',tipDescription:'Stop moving or pursuing. The unit will defend itself against nearby visible enemies.'});
    stop.onclick=()=>{for(const id of this.selectedIds)this.hooks.action({type:'stop-unit',id});};
    this.military.className="rts-military";
    const attack=document.createElement('button');attack.textContent='Attack [A]';
    Object.assign(attack.dataset,{tipName:'Attack',tipKey:'A',tipDescription:'Click ground to attack-move, or click any visible unit/building to force an attack, including friendlies.'});
    attack.onclick=()=>this.armAttack();
    this.military.append(attack,stop);actions.append(this.military);
    const home = document.createElement("button");
    home.innerHTML=art(12)+'<span>Home fort</span>';
    Object.assign(home.dataset,{tipName:'Home fort',tipDescription:'Center the camera on your main fort.',tipKey:'Home'});
    home.onclick = hooks.home;
    const tools=document.createElement("div");tools.className="rts-tools";tools.append(home,this.cancel);row.append(tools);
    this.info.style.whiteSpace = "pre-line";
    this.info.className = "rts-info";
    this.info.textContent =
      "Build a lumberjack, sawmill and stonemason first. Carriers deliver goods; builders construct automatically.";
    this.hint.className = "rts-notice";
    this.hint.setAttribute("role", "status");

    this.cancel.innerHTML=art(13)+'<span>Cancel</span>';
    Object.assign(this.cancel.dataset,{tipName:'Cancel construction',tipDescription:'Cancel this unfinished building. Reserved, delivered and in-transit construction materials are refunded.'});
    this.cancel.hidden = true;
    this.cancel.onclick = () => {
      if (this.selected) this.hooks.cancel(this.selected);
    };
    this.root.append(this.stock, this.panel);
    window.addEventListener("keydown",this.onKey);
    host.append(this.root);
    Object.assign(this.minimapHost.dataset,{tipName:'Tactical map',tipDescription:'Click or drag to move the camera. Bright ground is in sight; dim ground is remembered; black ground is unexplored.'});
    Object.assign(this.clockHost.dataset,{tipName:'Time of day',tipDescription:'A full day and night lasts 240 seconds. Lighting changes as the clock advances.'});
    for(const el of [this.minimapHost,this.clockHost])el.tabIndex=0;
    this.tooltips=new CommandTooltips(host);
    const exit=host.querySelector<HTMLButtonElement>('button');
    if(exit?.textContent==='Exit')Object.assign(exit.dataset,{tipName:'Exit match',tipDescription:'Return to the main menu. This prototype does not save the current match.'});
  }
  setMapName(name:string) { const label=this.panel.querySelector(".rts-map-label span");if(label)label.textContent=name; }
  clearMode() {
    this.mode = null;
    this.rallyMode=false;
    this.attackMode=false;
    this.hooks.mode();
    this.syncButtons();
  }
  placement(message: string | null) {
    if (this.mode)
      this.hint.textContent = message ?? "Click to order construction.";
  }
  private syncButtons() {
    for (const [kind, b] of this.buttons)
      b.setAttribute("aria-pressed",String(this.mode===kind));
  }
  update(state: SettlementView) {
    const c = state.colonies.find((c) => c.owner === this.owner);
    if (c) {
      const workers=state.workers.filter(w=>w.owner===this.owner),carriers=workers.filter(w=>w.role==='carrier');
      const markup = [
        [8,c.stock.wood,'Planks','Sawn timber at the fort, used for construction and soldier recruitment.'],
        [9,c.stock.stone,'Stone','Dressed stone stored at the fort, available for construction.'],
        [7,workers.length,'Settlers','Your entire workforce. Build houses to welcome three additional settlers.'],
        [11,`${carriers.filter(w=>w.shipment).length}/${carriers.length}`,'Carriers','Busy carriers / all unassigned settlers. Everyone without a specialist role helps transport goods.']
      ].map(([icon,count,name,description])=>`<span tabindex="0" data-tip-name="${name}" data-tip-description="${description}" aria-label="${name}: ${count}">${art(Number(icon))}<b>${count}</b></span>`).join('');
      if(markup!==this.stockMarkup){this.stock.innerHTML=markup;this.stockMarkup=markup;}
    }
    const knownIds=new Set([...state.workers.filter(w=>w.health>0&&w.job!=='training'),...state.buildings.filter(b=>b.health>0)].map(e=>e.id));
    this.selectedIds=this.selectedIds.filter(id=>knownIds.has(id));
    const selectedUnits=this.selectedIds.map(id=>state.workers.find(w=>w.id===id)).filter(w=>!!w);
    this.canAttack=selectedUnits.some(w=>w.owner===this.owner&&isSoldier(w.role));
    this.cards.hidden=selectedUnits.length===0;
    const cardsKey=selectedUnits.map(w=>`${w.id}:${w.role}`).join(',');
    if(cardsKey!==this.cardsKey){
      this.cards.innerHTML=selectedUnits.map(w=>`<button data-unit="${w.id}" data-tip-name="${w.role} #${w.id}" data-tip-description="Click to select only this unit. Shift-click to remove it from the group.">${art(w.role==='warrior'?17:w.role==='archer'?18:7)}<span class="rts-unit-hp"><i></i></span><small></small></button>`).join('');this.cardsKey=cardsKey;
      this.cardNodes.clear();for(const card of this.cards.querySelectorAll<HTMLButtonElement>('button[data-unit]'))this.cardNodes.set(Number(card.dataset.unit),card);
    }
    for(const w of selectedUnits){
      const card=this.cardNodes.get(w.id)!;
      if(card.dataset.health===String(w.health))continue;
      card.dataset.health=String(w.health);
      card.querySelector<HTMLElement>('i')!.style.width=`${w.health/unitMaxHealth(w.role)*100}%`;
      card.querySelector('small')!.textContent=`${w.health}/${unitMaxHealth(w.role)}`;
      card.setAttribute('aria-label',`${w.role} ${w.id}, ${w.health} of ${unitMaxHealth(w.role)} HP`);
    }
    const building = state.buildings.find((b) => b.id === this.selected),
      worker = state.workers.find((w) => w.id === this.selected);
    const canBuild=selectedUnits.some(w=>w.owner===this.owner&&!isSoldier(w.role))&&!this.canAttack;
    for(const button of this.buttons.values()){button.hidden=!canBuild && !this.mode;button.disabled=!!state.outcome;}
    this.recruitment.hidden=!(building?.kind==='barracks' && building.complete && building.health>0 && building.owner===this.owner && !state.outcome);
    this.military.hidden=!(this.canAttack && !state.outcome);
    this.construction.hidden=!this.recruitment.hidden || !this.military.hidden;
    if(!this.recruitment.hidden && building){
      const markup=building.queue.map((kind,index)=>`<button data-index="${index}" data-tip-name="Cancel ${SOLDIERS[kind].name}" data-tip-description="Remove this recruit from the queue. Delivered planks stay at the barracks.">${index+1}. ${SOLDIERS[kind].name}${index===0 && building.training?` ${Math.floor(building.training/SOLDIERS[kind].training*100)}%`:''} ×</button>`).join('');
      if(markup!==this.queueMarkup){this.queue.innerHTML=markup;this.queueMarkup=markup;}
    }
    this.heading.textContent=building?BUILDINGS[building.kind].name:worker?worker.role[0]!.toUpperCase()+worker.role.slice(1):this.mode?BUILDINGS[this.mode].name:"Your settlement";
    const portraitIndex=building?ART[building.kind]:worker?(worker.role==='warrior'?17:worker.role==='archer'?18:7):this.mode?ART[this.mode]:6;
    if(portraitIndex!==this.portraitIndex){this.portrait.innerHTML=art(portraitIndex);this.portrait.append(this.meter);this.portraitIndex=portraitIndex;}
    this.meter.textContent=building?(building.complete?`${building.health} / ${BUILDINGS[building.kind].health??250}`:`${Math.floor(building.progress/BUILDINGS[building.kind].work*100)}% built`):worker?`${worker.health} / ${unitMaxHealth(worker.role)} HP`:this.mode?'BUILDING PLAN':'MAIN FORT';
    Object.assign(this.portrait.dataset,{tipName:this.heading.textContent??'Selection',tipDescription:building?DESCRIPTIONS[building.kind]:worker?(worker.owner<0?'Neutral creature. Defends its camp against nearby players.':isSoldier(worker.role)?'Click ground to move. Click a visible enemy to attack. Nearby enemies are engaged automatically.':'Select a construction command to build. Unassigned carriers can move and become recruits.'):'Select a building or settler to inspect it.',...(building?{tipWood:String(BUILDINGS[building.kind].wood),tipStone:String(BUILDINGS[building.kind].stone)}:{})});
    if(!building){delete this.portrait.dataset.tipWood;delete this.portrait.dataset.tipStone;}
    this.cancel.hidden =
      !building || building.owner !== this.owner || building.complete;
    if (building) {
      const r = BUILDINGS[building.kind];
      const inventory =
        building.kind === "fort"
          ? {
              log: 0,
              plank:
                state.colonies.find((c) => c.owner === building.owner)?.stock
                  .wood ?? 0,
              stone:
                state.colonies.find((c) => c.owner === building.owner)?.stock
                  .stone ?? 0,
            }
          : building.inventory;
      this.info.textContent = `${r.name} · Player ${building.owner + 1} · ${building.complete ? `HP ${building.health}/${r.health ?? 250} · Stock: ${inventory.log} logs, ${inventory.plank} planks, ${inventory.stone} stone` : `Construction ${Math.floor((building.progress / r.work) * 100)}% · Delivered ${building.delivered.wood}/${r.wood} planks, ${building.delivered.stone}/${r.stone} stone`}`;
      this.info.textContent += "\n" + (building.remembered ? "Last seen · Current activity unknown" : building.owner !== this.owner ? "Enemy building in sight" : economyStatus(building,state));
    } else if (worker)
      this.info.textContent = `${worker.role} · HP ${worker.health}/${unitMaxHealth(worker.role)} · ${worker.job.replaceAll("-", " ")}${worker.quantity ? ` · Carrying ${worker.quantity} ${worker.shipment?.item ?? (worker.carry === "wood" ? "logs" : "stone")}` : ""}${(worker.role === "carrier" || isSoldier(worker.role)) && !worker.shipment ? " · Click ground to move." : ""}`;
    else
      this.info.textContent = this.mode ? DESCRIPTIONS[this.mode] : "Select a settler to build, a barracks to recruit, or a soldier to command. Click a visible enemy to attack. Builders repair damaged buildings for free.";
    if(selectedUnits.length){
      this.heading.textContent=selectedUnits.length>1?`${selectedUnits.length} units selected`:this.heading.textContent;
      this.info.hidden=selectedUnits.length>1;
      this.hint.hidden=selectedUnits.length>1&&!this.attackMode;
    }else{this.info.hidden=false;this.hint.hidden=false;}
    if(selectedUnits.length===1){this.info.hidden=false;this.hint.hidden=false;}
    this.root.classList.toggle('has-unit-selection',selectedUnits.length>0);
    if (state.outcome) {
      this.info.textContent =
        state.outcome.winner === this.owner
          ? "Victory — the enemy main fort has fallen."
          : "Defeat — your main fort has fallen.";
      this.clearMode();
      for (const button of this.buttons.values()) button.disabled = true;
    }
    const event = state.events.filter((e) => e.owner === this.owner).at(-1);
    if (event && event.tick !== this.lastEvent) {
      this.lastEvent = event.tick;
      this.hint.textContent = event.message;
    }
  }
  destroy() {
    this.tooltips.destroy();
    window.removeEventListener("keydown",this.onKey);
    this.root.remove();
  }
}
