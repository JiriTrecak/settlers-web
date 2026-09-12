import {HUD_CHANGED,readHudLayout} from '../../shared/settings/hud';
import {workplaceCard} from '../../presentation/workplace';
import {prioritizeSelection,cycleSelection} from "../../presentation/selection";
import {ControlGroups} from "../../presentation/controlGroups";
import {shortcuts,keyLabel,authoredKey,commandShortcut,inputCaptured,SHORTCUTS_CHANGED} from "../../shared/input/shortcuts";
import { itemStatusCard } from "../../presentation/itemStatus";
import { heroShortcuts } from "../../presentation/heroes";
import { unitOrderCard } from "../../presentation/orderQueue";
import { workforceReserve } from "../../presentation/workforce";
import { HeroBar } from "./heroBar";
import { armorMultiplier } from "../../sim/game/damage";
import { experienceMeter } from "../../presentation/experience";
import { TICK_MS } from "../../shared/match/match";
import { content } from "../../content/builtin";
import { slotOwner, type Owner } from "../../content/schema";
import {
  commandCard,
  inventoryCard,
  commandPage,
  queueCard,
  commandMenu,
  commandPageCount,
  type CommandEntry,
  costs,
  type CommandBinding,
} from "../../presentation/commands";
import type { Action } from "../../shared/types/types";
import type { SettlementView } from "../../sim/game/observation";
import { healthPipState } from "../../presentation/health";
import { iconArt } from "./commandArt";
import { CommandTooltips } from "./tooltips";
import "./commandDock.css";

/** HTML adapter: receives a presentation model, emits concrete intentions/targeting choices. */
export class SettlementHud {
  readonly root = document.createElement("div");
  readonly minimapHost = document.createElement("div");
  readonly clockHost = document.createElement("div");
  private readonly heroes: HeroBar;
  private readonly stock = document.createElement("div");
  private readonly heading = document.createElement("h2");
  private readonly portrait = document.createElement("div");
  private readonly info = document.createElement("div");
  private readonly level = document.createElement("div");
  private readonly experience = document.createElement("div");
  private readonly portraitMana = document.createElement("div");
  private readonly portraitHp = document.createElement("div");
  private readonly errorNotice = document.createElement("div");
  private errorTimer: ReturnType<typeof setTimeout> | undefined;
  private lastErrorFact: unknown;
  showError(message: string) {
    this.errorNotice.className = "rts-error visible";
    this.errorNotice.textContent = message;
    this.errorNotice.role = "alert";
    this.root.append(this.errorNotice);
    clearTimeout(this.errorTimer);
    this.errorTimer = setTimeout(() => this.errorNotice.classList.remove("visible"), 2500);
  }
  learnedAbility() { this.navigate(null); }
  private readonly hint = document.createElement("p");
  private readonly cards = document.createElement("div");
  private readonly grid = document.createElement("div");
  private readonly activeTask = document.createElement("div");
  private readonly workplaceSummary = document.createElement("div");
  private readonly selection = document.createElement("section");
  private readonly syncLayout=()=>{this.root.dataset.layout=readHudLayout();};
  private readonly queues = document.createElement("div");
  private readonly statuses = document.createElement("div");
  private statusSignature = "";
  private readonly inventory = document.createElement("div");
  private readonly orders = document.createElement("div");
  private ordersSignature = "";
  private inventorySignature = "";
  private readonly pages = document.createElement("div");
  private readonly mapLabel = document.createElement("span");
  private readonly tooltips: CommandTooltips;
  private readonly owner: Owner;
  private readonly readOnly: boolean;
  private current: SettlementView | null = null;
  private bindings: CommandBinding[] = [];
  private menuEntries: CommandEntry[] = [];
  private category: string | null = null;
  private commandSignature = "";
  private cardsSignature = "";
  private queueSignature = "";
  private page = 0;
  private stockSignature = "";
  private readonly resourceBadges = new Map<string, HTMLElement>();
  private portraitDefinition = "";
  private readonly controlGroups=new ControlGroups();
  private readonly groupBar=document.createElement("nav");
  private groupSignature="";
  private readonly bindingsChanged=()=>{this.groupSignature="";this.commandSignature="";this.inventorySignature="";if(this.current)this.update(this.current,true);};
  selectedIds: number[] = [];
  targeting: CommandBinding | null = null;
  placementRotation = 0;
  get selected() {
    return this.selectedIds[0] ?? null;
  }
  set selected(id: number | null) {
    this.setSelection(id === null ? [] : [id]);
  }
  get mode() {
    return this.targeting?.type === "build"
      ? this.targeting.targetDefinition!
      : null;
  }
  get attackMode() {
    return this.targeting?.type === "attack";
  }
  get rallyMode() {
    return this.targeting?.type === "rally";
  }
  get buildingActor() {
    return this.targeting?.actors[0];
  }
  setSelection(ids: readonly number[], focus?: number) {
    this.selectedIds = prioritizeSelection(ids, this.current?.entities ?? [], content, focus);
    this.category = null;
    this.page = 0;
    this.clearMode();
    if (this.current) this.update(this.current, true);
  }
  clearMode() {
    this.targeting = null;
    this.placementRotation = 0;
    this.hooks.mode();
    this.hint.textContent = "";
  }
  placement(message: string | null) {
    if (this.mode)
      this.hint.textContent = `${message ?? "Click to order construction."} ${keyLabel(shortcuts.key("placement.rotate"))} / ${keyLabel(shortcuts.key("placement.reverse"))}: rotate (${this.placementRotation}°). ${keyLabel(shortcuts.key("target.cancel"))} cancels.`;
  }
  private groupInput(slot:number,operation:"assign"|"add"|"recall"){
    if(!this.current||this.readOnly)return;
    const owned=new Set(this.current.entities.filter(e=>e.owner===this.owner&&!e.remembered&&content.get(e.definition).behaviors.playerControl).map(e=>e.id));
    if(operation==="recall"){
      const result=this.controlGroups.recall(slot,performance.now());
      if(result.ids.length){this.setSelection(result.ids);if(result.focus)this.hooks.focus(this.selectedIds[0],this.selectedIds);}
    }else this.controlGroups.assign(slot,this.selectedIds.filter(id=>owned.has(id)),operation==="add");
    this.renderGroups(this.current);
  }
  private renderGroups(view:SettlementView){
    const owned=new Set(view.entities.filter(e=>e.owner===this.owner&&!e.remembered&&content.get(e.definition).behaviors.playerControl).map(e=>e.id));
    this.controlGroups.prune(owned);
    const signature=JSON.stringify([Array.from({length:10},(_,i)=>this.controlGroups.members((i+1)%10)),this.selectedIds]);
    if(signature===this.groupSignature)return;this.groupSignature=signature;this.groupBar.replaceChildren();
    for(let i=0;i<10;i++){
      const slot=(i+1)%10,ids=this.controlGroups.members(slot),button=document.createElement("button");button.type="button";
      const label=keyLabel(shortcuts.key(`group.${slot}.recall`));
      button.setAttribute("aria-label",`Control group ${slot}, ${ids.length} members`);
      button.setAttribute("aria-pressed",String(ids.length>0&&ids.length===this.selectedIds.length&&ids.every(id=>this.selectedIds.includes(id))));
      const key=document.createElement("kbd");key.textContent=label||"—";
      const count=document.createElement("span");count.textContent=ids.length?String(ids.length):"·";button.append(key,count);
      Object.assign(button.dataset,{tipName:`Control group ${slot}`,tipDescription:`${ids.length} members. ${keyLabel(shortcuts.key(`group.${slot}.assign`))}: assign. ${keyLabel(shortcuts.key(`group.${slot}.add`))}: add selection. Double press or double click to focus.`,tipKey:label});
      button.onclick=e=>this.groupInput(slot,e.ctrlKey?"assign":e.shiftKey?"add":"recall");this.groupBar.append(button);
    }
    this.groupBar.hidden=this.readOnly;
  }
  private alerts:{x:number;y:number;tick:number}[]=[];
  private alertCursor=0;
  private previousAlerts:SettlementView|null=null;
  private recordAlerts(view:SettlementView){
    const previous=this.previousAlerts;this.previousAlerts=view;if(!previous||view.revision<previous.revision){this.alerts=[];return;}
    if(previous===view)return;const previousEntities=new Map(previous.entities.map(e=>[e.id,e]));
    for(const entity of view.entities){if(entity.owner!==this.owner||entity.remembered)continue;
      const old=previousEntities.get(entity.id);
      const damage=old?.hp!=null&&entity.hp!=null&&entity.hp<old.hp;
      const completed=old?.construction&&!entity.construction;
      const born=!old&&!!entity.unit;
      if((damage||completed||born)&&!this.alerts.some(a=>view.revision-a.tick<120&&Math.hypot(a.x-entity.x,a.y-entity.y)<10)){
        this.alerts.unshift({x:entity.x,y:entity.y,tick:view.revision});this.alerts.length=Math.min(8,this.alerts.length);this.alertCursor=0;
      }
    }
  }
  private cycleCursor=new Map<string,number>();
  private heroPress:{id:number;time:number}|null=null;
  private cycle(key:string,ids:number[],select=true){
    if(!ids.length)return;const old=this.cycleCursor.get(key),i=old===undefined?-1:ids.indexOf(old),id=ids[(i+1)%ids.length];
    this.cycleCursor.set(key,id);if(select)this.setSelection([id]);this.hooks.focus(id);
  }
  private readonly onKey = (e: KeyboardEvent) => {
    if(inputCaptured(e)||e.repeat)return;
    for(let slot=0;slot<10;slot++)for(const operation of ["assign","add","recall"] as const){
      if(shortcuts.matches(`group.${slot}.${operation}`,e)){e.preventDefault();this.groupInput(slot,operation);return;}
    }
    const view=this.current;
    if(shortcuts.matches('camera.alert',e)){e.preventDefault();const a=this.alerts[this.alertCursor%this.alerts.length];if(a){this.hooks.lookAt?.(a.x,a.y);this.alertCursor++;}return;}
    for(let n=1;n<=3;n++)if(shortcuts.matches(`hero.${n}`,e)){
      e.preventDefault();if(!view)return;const hero=heroShortcuts(view,this.owner,content)[n-1];if(!hero?.available)return;
      this.setSelection([hero.id]);const time=performance.now();if(this.heroPress?.id===hero.id&&time-this.heroPress.time<=350)this.hooks.focus(hero.id);this.heroPress={id:hero.id,time};return;
    }
    if(view&&(shortcuts.matches('selection.worker',e)||shortcuts.matches('selection.workerAlt',e))){
      e.preventDefault();this.cycle('worker',view.entities.filter(v=>v.owner===this.owner&&v.unit&&!v.unit.contained&&content.get(v.definition).behaviors.work&&v.control&&!v.control.order&&!v.control.job&&!v.control.orderQueue.length&&!v.control.employment&&!v.control.pendingMove&&!v.unit.cargo&&!v.control.releasing&&!v.control.stunned).map(v=>v.id));return;
    }
    if(view&&shortcuts.matches('camera.hall',e)){
      e.preventDefault();this.cycle('hall',view.entities.filter(v=>v.owner===this.owner&&content.get(v.definition).behaviors.storage?.dropoff&&!v.construction).map(v=>v.id),false);return;
    }
    if(shortcuts.matches('selection.next',e)||shortcuts.matches('selection.previous',e)){
      e.preventDefault();if(!view)return;
      const next=cycleSelection(this.selectedIds,view.entities,content,shortcuts.matches('selection.previous',e));
      if(next!==undefined)this.setSelection(this.selectedIds,next);return;
    }
    for(let slot=0;slot<4;slot++)if(shortcuts.matches(`inventory.${slot}`,e)){
      e.preventDefault();if(view){const entry=inventoryCard(view,this.selectedIds[0],this.owner,content,this.readOnly)[slot];if(entry?.use)this.hooks.action(entry.use);}return;
    }
    if (shortcuts.matches('target.cancel',e) && this.targeting) {e.preventDefault();this.clearMode();this.tooltips.hide();return;}
    if (this.mode && (shortcuts.matches('placement.rotate',e)||shortcuts.matches('placement.reverse',e))) {
      e.preventDefault();this.placementRotation=(this.placementRotation+(shortcuts.matches('placement.reverse',e)?270:90))%360;this.placement(null);this.hooks.mode();return;
    }
    if (shortcuts.matches('camera.selection',e)) {e.preventDefault();if(this.selectedIds.length)this.hooks.focus(this.selectedIds[0],this.selectedIds);else this.hooks.home();return;}
    const entries=[...commandPage(this.menuEntries,this.page).map(s=>s.binding),...this.bindings.filter(b=>['move','attack','stop','hold','patrol'].includes(b.type))];
    const binding=commandShortcut(entries,e);
    if(binding){e.preventDefault();this.activate(binding,e.shiftKey);}
  };
  constructor(
    host: HTMLElement,
    owner: number | null,
    private readonly hooks: {
      action: (action: Action) => void;
      mode: () => void;
      home: () => void;
      focus: (id: number, group?: readonly number[]) => void;
      portrait?: (host:HTMLElement,definition:string|null,owner:Owner)=>void;
      lookAt?: (x:number,y:number)=>void;
    },
  ) {
    this.owner = owner === null ? "none" : slotOwner(owner);
    this.readOnly = owner === null;
    this.heroes = new HeroBar({
      select: id => this.setSelection([id]),
      focus: id => this.hooks.focus(id),
    });
    this.root.className = "rts-hud";
    this.stock.className = "rts-resources";
    const dock = document.createElement("div");
    dock.className = "rts-dock";
    const map = document.createElement("section");
    map.className = "rts-map";
    const label = document.createElement("div");
    label.className = "rts-map-label";
    label.append(this.mapLabel);
    this.minimapHost.className = "rts-map-slot";
    map.append(label, this.minimapHost);
    const selection = this.selection;
    selection.className = "rts-selection";
    this.portrait.className = "rts-portrait";
    this.portrait.tabIndex = 0;
    const copy = document.createElement("div");
    copy.className = "rts-selection-copy";
    this.info.className = "rts-info";
    this.level.className = "rts-selection-level";
    this.experience.className = "rts-experience";
    this.experience.tabIndex = 0;
    this.experience.setAttribute("role", "progressbar");
    this.portraitMana.className = "rts-portrait-mana";
    this.portraitHp.className = "rts-portrait-health";
    this.hint.className = "rts-notice";
    this.hint.role = "status";
    this.cards.className = "rts-unit-cards";
    this.queues.className = "rts-recruit-queue";
    this.statuses.className = "rts-statuses";
    this.statuses.setAttribute("aria-label", "Active effects and auras");
    this.inventory.className = "rts-inventory";
    this.orders.className = "rts-order-queue";
    this.orders.setAttribute("aria-label", "Queued unit orders");
    const vitals=document.createElement("div");vitals.className="rts-vitals";
    this.activeTask.className="rts-active-task";
    this.workplaceSummary.className="rts-workplace-summary";
    vitals.append(this.statuses,this.portraitHp,this.portraitMana,this.activeTask);
    copy.append(this.heading,this.info,vitals);
    selection.append(this.level,this.experience,this.inventory,this.queues,this.workplaceSummary,this.orders,this.cards,this.hint);
    this.clockHost.className = "rts-clock-slot";
    selection.append(this.portrait, copy, this.clockHost);
    const actions = document.createElement("section");
    actions.className = "rts-actions";
    this.grid.className = "rts-command-grid declarative-commands";
    this.pages.className = "rts-command-pages";
    actions.append(this.stock, this.grid, this.pages);
    this.groupBar.className="rts-control-groups";this.groupBar.setAttribute("aria-label","Army control groups");
    dock.append(map, selection, actions,this.groupBar);
    this.root.append(this.heroes.root, dock);
    this.syncLayout();
    window.addEventListener(HUD_CHANGED,this.syncLayout);
    host.append(this.root);
    this.tooltips = new CommandTooltips(host);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener(SHORTCUTS_CHANGED,this.bindingsChanged);
    Object.assign(this.minimapHost.dataset, {
      tipName: "Tactical map",
      tipDescription:
        "Click or drag to move the camera. Bright ground is visible; dim ground is remembered.",
    });
  }
  saveControls(){return Array.from({length:10},(_,i)=>[...this.controlGroups.members(i)]);}
  restoreControls(groups:readonly (readonly number[])[]=[]){this.controlGroups.clear();groups.forEach((ids,i)=>this.controlGroups.assign(i,ids));this.groupSignature='';this.previousAlerts=null;this.alerts=[];this.current=null;this.setSelection([]);}
  setMapName(name: string) {
    this.mapLabel.textContent = name;
  }
  private navigate(category: string | null) {
    this.category = category;
    this.page = 0;
    this.clearMode();
    this.tooltips.hide();
    if (this.current) this.update(this.current, true);
  }
  private activate(binding: CommandEntry, append=false) {
    if (!binding.enabled) { this.showError(binding.reason ?? "Command unavailable"); return; }
    if ("destination" in binding) {
      this.navigate(binding.destination);
      return;
    }
    if (binding.immediate) {
      this.hooks.action(append&&binding.immediate.type==='hold'?{...binding.immediate,append:true}:binding.immediate);
      return;
    }
    this.clearMode();
    this.targeting = binding;
    this.hint.textContent = `${binding.name}: choose a ${binding.type === "build" ? "building location" : binding.type === "attack" ? "target or ground location" : "ground location"}. ${keyLabel(shortcuts.key("target.cancel"))} cancels.`;
    if (this.mode) this.placement(null);
    this.hooks.mode();
  }
  update(view: SettlementView, force = false) {
    if (this.current === view && !force) return;
    this.recordAlerts(view);
    this.current = view;
    const valid = new Set(
      view.entities
        .filter(
          (e) =>
            content.get(e.definition).selectable !== false &&
            !e.unit?.contained,
        )
        .map((e) => e.id),
    );
    const filtered = this.selectedIds.filter((id) => valid.has(id));
    if (filtered.length !== this.selectedIds.length) {
      this.selectedIds = filtered.includes(this.selectedIds[0])
        ? filtered : prioritizeSelection(filtered, view.entities, content);
      this.category = null;
      this.page = 0;
      this.clearMode();
    }
    this.heroes.update(heroShortcuts(view, this.owner, content), this.selectedIds);
    this.renderGroups(view);
    this.root.classList.toggle(
      "has-unit-selection",
      this.selectedIds.some(
        (id) => view.entities.find((e) => e.id === id)?.unit,
      ),
    );
    const selected = this.selectedIds.map((id) =>
        view.entities.find((e) => e.id === id)!,
      ),
      focus = selected[0];
    this.bindings = this.readOnly
      ? []
      : commandCard(view, this.selectedIds, this.owner, content);
    if (
      this.targeting &&
      !this.bindings.some(
        (b) =>
          b.id === this.targeting!.id &&
          b.enabled &&
          JSON.stringify(b.actors) === JSON.stringify(this.targeting!.actors),
      )
    )
      this.clearMode();
    const menu = commandMenu(this.bindings, this.category, content);
    this.category = menu.category;
    this.menuEntries = menu.entries;
    this.page = Math.max(
      0,
      Math.min(this.page, commandPageCount(this.menuEntries) - 1),
    );
    // Tick-by-tick progress updates do not recreate command icons.
    const signature = JSON.stringify([
      this.menuEntries.map(({ cooldown, reason, enabled, ...entry }) => entry),
      this.page,
      this.category,
    ]);
    if (signature !== this.commandSignature) {
      this.commandSignature = signature;
      this.grid.replaceChildren();
      for(let slot=0;slot<12;slot++){
        const well=document.createElement("span");well.className="rts-command-well";well.setAttribute("aria-hidden","true");
        well.style.gridColumn=String(1+slot%4);well.style.gridRow=String(1+Math.floor(slot/4));this.grid.append(well);
      }
      this.grid.classList.toggle("has-banner",this.menuEntries.some(b=>b.placement==="banner"));
      for (const { binding: b, column, row } of commandPage(
        this.menuEntries,
        this.page,
      )) {
        const button = document.createElement("button");
        button.className = "rts-command";
        button.setAttribute("aria-disabled", String(!b.enabled));
        button.style.gridColumn = b.placement === "banner" ? "1 / -1" : String(column);
        button.style.gridRow = String(row);
        button.innerHTML = iconArt(b.icon);
        if(b.placement==="banner"){
          button.classList.add("rts-command-banner");const label=document.createElement("span");label.className="rts-banner-label";label.textContent=b.name;button.append(label);
        }
        if (shortcuts.key(`command.${b.id}`,authoredKey(b.hotkey))) { const key = document.createElement("kbd"); key.textContent = keyLabel(shortcuts.key(`command.${b.id}`,authoredKey(b.hotkey))); button.append(key); }
        button.dataset.commandId = b.id;
        const cooldown = document.createElement("span");
        cooldown.className = "rts-command-cooldown";
        cooldown.hidden = true;
        cooldown.setAttribute("aria-hidden", "true");
        button.append(cooldown);
        if (b.type === "category") button.setAttribute("aria-haspopup", "true");
        button.setAttribute("aria-label", b.name);
        Object.assign(button.dataset, {
          tipName: b.name,
          tipDescription: [
            b.description,
            b.reason,
            b.actors.length > 1
              ? `${b.actors.length} eligible selected actors`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
          tipCosts: JSON.stringify(b.costs),
          tipKey: keyLabel(shortcuts.key(`command.${b.id}`,authoredKey(b.hotkey))),
        });
        button.onclick = (event) => {
          const current = this.menuEntries.find((entry) => entry.id === b.id);
          if (current) this.activate(current,event.shiftKey);
        };
        this.grid.append(button);
      }
      this.pages.replaceChildren();
      const pages = commandPageCount(this.menuEntries);
      if (pages > 1) {
        for (const delta of [-1, 1]) {
          const button = document.createElement("button");
          button.textContent = delta < 0 ? "‹" : "›";
          button.setAttribute(
            "aria-label",
            delta < 0 ? "Previous commands" : "Next commands",
          );
          button.onclick = () => {
            this.page = (this.page + delta + pages) % pages;
            this.update(this.current!, true);
          };
          this.pages.append(button);
        }
        this.pages.append(
          document.createTextNode(`${this.page + 1} / ${pages}`),
        );
      }
    }
    for (const button of this.grid.querySelectorAll<HTMLButtonElement>(
      "button[data-command-id]",
    )) {
      const binding = this.menuEntries.find(
          (b) => b.id === button.dataset.commandId,
        ),
        state = binding?.cooldown;
      if (binding) {
        button.setAttribute("aria-disabled", String(!binding.enabled));
        const description = [
          binding.description,
          binding.reason,
          binding.actors.length > 1
            ? `${binding.actors.length} eligible selected actors`
            : "",
        ]
          .filter(Boolean)
          .join("\n");
        if (button.dataset.tipDescription !== description) {
          button.dataset.tipDescription = description;
          this.tooltips.refresh(button);
        }
      }
      const overlay = button.querySelector<HTMLElement>(
        ".rts-command-cooldown",
      )!;
      const active = !!state && state.remainingTicks > 0;
      overlay.hidden = !active;
      button.classList.toggle("is-cooling-down", active);
      if (active) {
        overlay.style.setProperty(
          "--cooldown",
          `${Math.min(1, state.remainingTicks / Math.max(1, state.totalTicks)) * 360}deg`,
        );
        overlay.textContent = String(
          Math.ceil((state.remainingTicks * TICK_MS) / 1000),
        );
      }
    }
    this.heading.textContent = focus ? content.get(focus.definition).name : "";
    this.portrait.hidden = !focus;
    this.selection.dataset.kind=focus?content.get(focus.definition).kind:"empty";
    this.portraitHp.hidden=!focus;
    this.portraitMana.hidden=!focus;
    this.hint.hidden = !focus;
    this.level.hidden = !focus;
    this.info.hidden = !focus;
    this.experience.hidden = true;
    if (focus) {
      const d = content.get(focus.definition);
      const xp = experienceMeter(focus, d, this.current?.heroLevelCap);
      this.experience.hidden = !xp;
      if (xp) {
        this.experience.style.setProperty(
          "--experience",
          `${xp.fraction * 100}%`,
        );
        this.experience.setAttribute("aria-valuemin", "0");
        this.experience.setAttribute("aria-valuemax", "100");
        this.experience.setAttribute(
          "aria-valuenow",
          String(Math.round(xp.fraction * 100)),
        );
        this.experience.setAttribute("aria-label", xp.label);
        Object.assign(this.experience.dataset, {
          tipName: xp.label,
          tipDescription: xp.description,
        });
      }
      this.level.textContent =
        d.level === undefined ? "" : String(focus.stats?.level ?? d.level);
      this.level.hidden=d.level===undefined || d.kind==="building";
      this.level.setAttribute("aria-label",`Level ${focus.stats?.level ?? d.level ?? 1}`);
      this.portrait.dataset.kind=d.kind;
      if (this.portraitDefinition !== d.id) {
        this.portraitDefinition = d.id;
        this.portrait.innerHTML = iconArt(d.icon);

      }
      Object.assign(this.portrait.dataset, {
        tipName: d.name,
        tipDescription: d.description,
        tipCosts: JSON.stringify(costs(content, d.id)),
      });
      this.hooks.portrait?.(this.portrait,d.id,focus.owner);
      this.portrait.dataset.mana = String(!!focus.spellcasting);
      this.portraitMana.hidden = !focus.spellcasting;
      this.portraitMana.textContent = focus.spellcasting
        ? `${focus.spellcasting.mana} / ${focus.stats!.maxMana}`
        : "";
      if(focus.spellcasting)this.portraitMana.style.setProperty('--fill',`${Math.max(0,Math.min(1,focus.spellcasting.mana/Math.max(1,focus.stats!.maxMana)))*100}%`);
      this.portraitHp.hidden = !d.body;
      if (d.body) {
        this.portraitHp.textContent = `${focus.hp ?? 0} / ${focus.stats?.maxHp ?? d.body.maxHp}`;
        this.portraitHp.style.setProperty('--fill',`${Math.max(0,Math.min(1,(focus.hp??0)/Math.max(1,focus.stats?.maxHp??d.body.maxHp)))*100}%`);
        this.portraitHp.style.setProperty('--bar-color', `#${healthPipState(
          focus.hp ?? 0,
          focus.stats?.maxHp ?? d.body.maxHp,
          d.kind === "building",
        )
          .color.toString(16)
          .padStart(6, "0")}`);
      }
      const statKey = `${d.id}/${focus.stats?.damage}/${focus.stats?.armor}/${focus.stats?.cooldownTicks}`;
      if (this.info.dataset.definition !== statKey) {
        this.info.dataset.definition = statKey;
        this.info.replaceChildren();
        if (d.body) {
          const armor = content.rules.armorTypes[d.body.armorType];
          for (const stat of [
            {
              name: "Damage",
              value: focus.stats?.damage ?? d.behaviors.combat?.damage ?? 0,
              icon: "icon.action.attack",
              description: d.behaviors.combat
                ? `${content.rules.damageTypes[d.behaviors.combat.damageType].name}. ${Number(((focus.stats?.cooldownTicks ?? d.behaviors.combat.cooldownTicks) * TICK_MS / 1000).toFixed(3))}s between attacks. Damage shown before target armor and resistance.`
                : "This unit has no attack.",
            },
            {
              name: "Armor",
              value: focus.stats?.armor ?? d.body.armor,
              icon: armor.icon,
              description: `${armor.name}. Armor points reduce ordinary attack damage by ${((1-armorMultiplier(content.rules,focus.stats?.armor ?? d.body.armor))*100).toFixed(1)}%.\n${Object.entries(content.rules.damageTypes).map(([id,t]) => `${t.name}: ${content.rules.damageMultipliers[id][d.body!.armorType]/10}% class damage${t.appliesArmor ? " before armor" : "; bypasses armor points"}`).join("\n")}`,
            },
          ]) {
            if(d.kind==="building" && stat.name==="Damage")continue;
            const row = document.createElement("div");
            row.className = "rts-selection-stat";
            row.innerHTML = iconArt(stat.icon);
            row.tabIndex = 0;
            Object.assign(row.dataset, {
              tipName: stat.name,
              tipDescription: stat.description,
            });
            const text = document.createElement("div"),
              label = document.createElement("span"),
              value = document.createElement("strong");
            label.textContent = stat.name;
            value.textContent = String(Number(stat.value.toFixed(1)));
            text.append(label, value);
            row.append(text);
            this.info.append(row);
          }
        }
      }
    } else {
      this.hooks.portrait?.(this.portrait,null,this.owner);
      this.portraitDefinition = "";
      this.portrait.replaceChildren();
      for (const key of Object.keys(this.portrait.dataset))
        delete this.portrait.dataset[key];
      this.level.textContent = "";
      this.info.replaceChildren();
      delete this.info.dataset.definition;
      this.hint.textContent = "";
    }
    const cardsKey = JSON.stringify(
      selected.map((e) => [e.id, e.definition, e.hp]),
    );
    if (cardsKey !== this.cardsSignature) {
      this.cardsSignature = cardsKey;
      this.cards.replaceChildren();
      for (const e of selected) {
        const d = content.get(e.definition),
          button = document.createElement("button");
        button.innerHTML = iconArt(d.icon);
        button.setAttribute("aria-label", `Focus ${d.name}`);
        Object.assign(button.dataset, {
          tipName: d.name,
          tipDescription: d.description,
        });
        if (d.body) {
          const hp = document.createElement("span");
          hp.className = "rts-unit-hp";
          const fill = document.createElement("i");
          fill.style.width = `${(e.hp! / (e.stats?.maxHp ?? d.body.maxHp)) * 100}%`;
          fill.style.backgroundColor = `#${healthPipState(
            e.hp ?? 0,
            e.stats?.maxHp ?? d.body.maxHp,
            false,
          )
            .color.toString(16)
            .padStart(6, "0")}`;
          hp.append(fill);
          button.append(hp);
        }
        const text = document.createElement("small");
        text.textContent = d.body
          ? `${e.hp}/${e.stats?.maxHp ?? d.body.maxHp}`
          : d.name;
        button.append(text);
        button.onclick = (event) =>
          this.setSelection(
            event.shiftKey
              ? this.selectedIds.filter((id) => id !== e.id)
              : [e.id, ...this.selectedIds.filter((id) => id !== e.id)],
            event.shiftKey ? undefined : e.id,
          );
        button.ondblclick = () => this.setSelection([e.id]);
        this.cards.append(button);
      }
    }
    this.cards.hidden = selected.length < 2;
    const orders = unitOrderCard(focus, view, content), ordersKey = JSON.stringify(orders);
    this.orders.hidden = !orders.length;
    if (ordersKey !== this.ordersSignature) {
      this.ordersSignature = ordersKey;
      this.orders.replaceChildren();
      for (const order of orders) {
        const tile = document.createElement("span");
        tile.tabIndex = 0;
        tile.innerHTML = iconArt(order.icon);
        tile.setAttribute("aria-label", `${order.index}. ${order.name}`);
        Object.assign(tile.dataset, {tipName: order.name, tipDescription: order.description});
        const index = document.createElement("small");
        index.textContent = String(order.index);
        tile.append(index);
        this.orders.append(tile);
      }
    }
    const statuses = itemStatusCard(focus, view.revision, content), statusKey = JSON.stringify(statuses);
    this.statuses.hidden = !statuses.length;
    if (statusKey !== this.statusSignature) {
      this.statusSignature = statusKey;
      this.statuses.replaceChildren(...statuses.map(status => {
        const badge = document.createElement("span");
        badge.tabIndex = 0; badge.innerHTML = iconArt(status.icon);
        badge.setAttribute("aria-label", status.name);
        Object.assign(badge.dataset, {tipName:status.name, tipDescription:status.description});
        return badge;
      }));
    }
    const inventory = inventoryCard(
        view,
        focus?.id,
        this.owner,
        content,
        this.readOnly,
      ),
      inventoryKey = JSON.stringify(inventory);
    this.inventory.hidden = !inventory.length;
    if (inventoryKey !== this.inventorySignature) {
      this.inventorySignature = inventoryKey;
      this.inventory.replaceChildren();
      for (const item of inventory) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute(
          "aria-label",
          `${item.name}, slot ${item.slot + 1}`,
        );
        if (item.icon) button.innerHTML = iconArt(item.icon);
        if (item.tier) button.dataset.tier = String(item.tier);
        if (item.charges !== undefined || item.cooldown) {
          const count = document.createElement("small");
          count.textContent = item.cooldown ? `${item.cooldown}s` : String(item.charges);
          button.append(count);
        }
        Object.assign(button.dataset, {
          tipName: item.name,
          tipKey:item.use?keyLabel(shortcuts.key(`inventory.${item.slot}`)):"",
          tipDescription:
            (item.tier ? `Tier ${item.tier}. ` : "") + item.description + (item.charges !== undefined ? ` ${item.charges} charges remaining.` : "") + (item.cooldown ? ` Cooldown: ${item.cooldown}s.` : "") +
            (item.drop
              ? item.use
                ? " Click to use. Right-click to drop."
                : " Equipped. Right-click to drop."
              : ""),
        });
        button.disabled = !item.definition || !item.drop;
        button.onclick = () => {
          if (item.use) this.hooks.action(item.use);
        };
        button.oncontextmenu = (event) => {
          event.preventDefault();
          if (item.drop) this.hooks.action(item.drop);
        };
        this.inventory.append(button);
      }
    }
    const queue=queueCard(view,focus?.id,this.owner,content,this.readOnly);
    const workplace=workplaceCard(focus,queue,content);
    const taskKey=JSON.stringify([focus?.id,workplace.active?.key,queue.map(q=>({...q,progress:undefined}))]);
    this.activeTask.hidden=!workplace.active;
    this.queues.hidden=!focus || content.get(focus.definition).kind!=="building" || !(content.get(focus.definition).behaviors.production?.mode === "queued" || focus.research || focus.revival);
    this.workplaceSummary.hidden=!workplace.summary || !!workplace.active;
    this.workplaceSummary.textContent=workplace.summary;
    if(taskKey!==this.queueSignature){
      this.queueSignature=taskKey;
      this.queues.replaceChildren();this.activeTask.replaceChildren();
      const tile=(q:typeof queue[number])=>{
        const button=document.createElement("button");button.className="rts-queued-task";button.type="button";
        button.innerHTML=iconArt(q.icon);button.disabled=!q.cancel;
        button.setAttribute("aria-label",`${q.cancel?"Cancel ":""}${q.name}`);
        Object.assign(button.dataset,{tipName:q.name,tipDescription:q.cancel?"Click to cancel and refund the reserved resources.":"Queued task.",tipCosts:JSON.stringify(q.costs)});
        button.onclick=()=>{if(q.cancel)this.hooks.action(q.cancel);};return button;
      };
      if(workplace.active){
        const a=workplace.active;
        const icon=a.task?tile(a.task):document.createElement("span");
        if(!a.task){icon.innerHTML=iconArt(a.icon);icon.className="rts-queued-task";icon.tabIndex=0;icon.dataset.tipName=a.name;}
        const meter=document.createElement("div");meter.className="rts-task-meter";meter.setAttribute("role","progressbar");
        const name=document.createElement("span");name.textContent=a.name;meter.append(name);
        this.activeTask.append(icon,meter);
      }
      for(let index=0;index<Math.max(5,workplace.waiting.length);index++){
        const q=workplace.waiting[index];
        if(q)this.queues.append(tile(q));else{const well=document.createElement("span");well.className="rts-queue-well";well.setAttribute("aria-hidden","true");this.queues.append(well);}
      }
    }
    const meter=this.activeTask.querySelector<HTMLElement>('.rts-task-meter');
    if(meter && workplace.active){
      const percent=Math.floor(Math.max(0,Math.min(1,workplace.active.progress??0))*100);
      meter.style.setProperty('--fill',`${percent}%`);
      meter.classList.toggle('is-waiting',workplace.active.progress===null);
      meter.setAttribute('aria-valuenow',String(percent));meter.setAttribute('aria-valuemin','0');meter.setAttribute('aria-valuemax','100');
      meter.setAttribute('aria-label',`${workplace.active.name}: ${workplace.active.progress===null?workplace.summary:percent+'%'}`);
      Object.assign(meter.dataset,{tipName:workplace.active.name,tipDescription:workplace.summary});
    }
    const stockSignature = JSON.stringify([view.goods, view.population]);
    if (this.stockSignature !== stockSignature) {
      this.stockSignature = stockSignature;
      const shown = new Set((view.goods ?? []).map(row => row.item));
      for (const [id, badge] of this.resourceBadges) {
        if (shown.has(id)) continue;
        this.tooltips.hide();
        badge.remove();
        this.resourceBadges.delete(id);
      }
      for (const row of view.goods ?? []) {
        const item = content.get(row.item);
        let badge = this.resourceBadges.get(row.item);
        if (!badge) {
          badge = document.createElement("span");
          badge.tabIndex = 0;
          badge.innerHTML = iconArt(item.icon) + "<b></b>";
          this.resourceBadges.set(row.item, badge);
          this.stock.insertBefore(badge, this.stock.querySelector("[data-population]"));
        }
        badge.querySelector("b")!.textContent = String(row.available);
        badge.setAttribute("aria-label", `${item.name}: ${row.available} available`);
        Object.assign(badge.dataset, {
          tipName: item.name,

          tipDescription: `${item.description}\n${row.available} available · ${row.reserved} reserved\n${row.stored} stored · ${row.inTransit} being carried`,
        });
        this.tooltips.refresh(badge);
      }
    }
    // Resource and population badges share the same declarative icon/tooltip path.
    if (view.population) {
      let badge = this.stock.querySelector<HTMLElement>("[data-population]");
      if (!badge) {
        badge = document.createElement("span");
        badge.dataset.population = "true";
        badge.tabIndex = 0;
        badge.innerHTML =
          iconArt(
            content.get(
              content.rules.startingSetup.units.find(
                (u) => content.get(u.definition).behaviors.work,
              )!.definition,
            ).icon,
          ) + "<b></b>";
        this.stock.append(badge);
      }
      const reserve = workforceReserve(view.population);
      const description = `${reserve.available} ready to recruit now.\n${reserve.replenishing} more can spawn.\n${reserve.allocation} free workers after replenishment, keeping current assignments.\nAssigned workers are protected from recruitment.`;
      if (badge.dataset.tipDescription !== description) {
        badge.querySelector("b")!.textContent = `${reserve.available}/${reserve.allocation}`;
        badge.setAttribute("aria-label", `${reserve.available} workers available for recruitment, ${reserve.allocation} after replenishment`);
        badge.dataset.tipName = "Available workers";
        badge.dataset.tipDescription = description;
        this.tooltips.refresh(badge);
      }
    } else {
      const badge = this.stock.querySelector("[data-population]");
      if (badge) { this.tooltips.hide(); badge.remove(); }
    }
    this.stock.hidden = !this.stock.childElementCount;
    if (view.outcome) {
      this.info.textContent =
        view.mission ? (view.outcome.winner === this.owner ? "Mission complete" : "Mission failed") : view.outcome.winner === null
          ? "Draw — both main forts fell."
          : this.readOnly
            ? `Player ${view.outcome.winner.split(".")[1]} wins — the rival Mound fell.`
            : view.outcome.winner === this.owner
              ? "Victory — the enemy main fort fell."
              : "Defeat — your main fort fell.";
      this.clearMode();
    } else {
      const latest = view.events.filter(e => e.type === "error").at(-1);
      const key = latest ? JSON.stringify(latest) : null;
      if (latest && key !== this.lastErrorFact && view.revision - latest.tick < 5) {
        this.lastErrorFact = key;
        this.showError(latest.message);
      }
    }
  }
  destroy() {
    clearTimeout(this.errorTimer);
    window.removeEventListener(HUD_CHANGED,this.syncLayout);
    this.hooks.portrait?.(this.portrait,null,this.owner);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener(SHORTCUTS_CHANGED,this.bindingsChanged);
    this.tooltips.destroy();
    this.root.remove();
  }
}
