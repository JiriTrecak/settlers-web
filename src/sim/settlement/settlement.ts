import { COMBAT_UNITS, isCombatant, neutralKindForAsset, type NeutralKind } from '../../shared/settlement/rules';
import { formationOffset } from '../../shared/settlement/selection';
import { SOLDIERS, RECRUIT_QUEUE_LIMIT, isSoldier, unitMaxHealth, type SoldierKind } from '../../shared/settlement/rules';
import { resourceKindForAsset } from '../../shared/settlement/resourceAssets';
import { Visibility, VISION_STEP, type FogView } from "../visibility/visibility";
import {
  decodeHeight,
  HEIGHT_ORIGIN,
  HEIGHT_VERTS,
  type UtcMap,
  type Slot,
  type Action,
} from "../../shared";
import { validAction } from "../../shared/types/types";
import {
  BUILDINGS,
  CARRY_CAPACITY,
  GATHER_TICKS,
  MAX_BUILDINGS,
  MAX_WORKERS,
  WORKER_STEP_TICKS,
  type BuildingKind,
  type ResourceKind,
  type ItemStock,
  type ItemKind,
  STOCKPILE_LIMIT,
} from "../../shared/settlement/rules";
import { Navigation } from "./navigation";
/** `wood` retains the v1 field name but now means spendable sawn planks. Logs live in building inventories. */
export type Stock = { wood: number; stone: number };
export type Building = {
  queue: SoldierKind[];
  recruit: number;
  training: number;
  rally: { x: number; z: number } | null;
  remembered?: boolean;
  id: number;
  owner: number;
  kind: BuildingKind;
  x: number;
  z: number;
  complete: boolean;
  progress: number;
  escrow: Stock;
  delivered: Stock;
  inventory: ItemStock;
  health: number;
};
export type ResourceNode = {
  id: number;
  stampId: string;
  kind: ResourceKind;
  x: number;
  z: number;
  amount: number;
  claimed: number;
  growth: number;
};
export type WorkerJob =
  | "to-barracks"
  | "training"
  | "attack"
  | "pickup"
  | "dropoff"
  | "idle"
  | "to-depot"
  | "to-site"
  | "build"
  | "to-resource"
  | "gather"
  | "deliver"
  | "move"
  | "to-stock"
  | "haul-stock"
  | "mill-source"
  | "mill-input"
  | "mill-process"
  | "mill-output"
  | "plant";
export type Worker = {
  camp?: {x:number;z:number};
  attackDestination: number | null;
  pendingMove: number | null;
  forceAttack: boolean;
  health: number;
  target: number;
  attackCooldown: number;
  id: number;
  owner: number;
  x: number;
  z: number;
  role:
    NeutralKind | SoldierKind | "builder" | "carrier" | "lumberjack" | "stonemason" | "sawyer" | "forester";
  job: WorkerJob;
  building: number;
  resource: number;
  timer: number;
  path: number[];
  shipment: { source: number; target: number; item: ItemKind; amount: number; construction: boolean } | null;
  carry: ResourceKind | null;
  quantity: number;
};
export type SettlementView = {
  fog?: FogView;
  /** Observed real borders; fogged cells retain their last observation. */
  territoryBorders?: Uint8Array;
  outcome: { winner: number | null; defeated: number[] } | null;
  revision: number;
  buildings: readonly Building[];
  workers: readonly Worker[];
  resources: readonly ResourceNode[];
  colonies: readonly { owner: number; stock: Stock; home: number }[];
  territory: Int16Array;
  events: readonly { tick: number; owner: number; message: string }[];
};

/** Authoritative fixed-step economy. No renderer, wall clock or floating movement state. */
export class Settlement {
  outcome: { winner: number | null; defeated: number[] } | null = null;
  readonly size = 256;
  readonly visibility: Visibility;
  readonly buildings: Building[] = [];
  readonly workers: Worker[] = [];
  readonly resources: ResourceNode[] = [];
  readonly colonies: { owner: number; stock: Stock; home: number }[] = [];
  readonly territory = new Int16Array(256 * 256).fill(-1);
  readonly heights = new Int16Array(256 * 256);
  private readonly terrain = new Uint8Array(256 * 256);
  private readonly occupied = new Int32Array(256 * 256);
  private readonly resourceCells = new Int32Array(256 * 256);
  private readonly navigation: Navigation;
  private nextId = 1;
  private revision = 0;
  private now = 0;
  private readonly events: { tick: number; owner: number; message: string }[] =
    [];
  constructor(
    readonly map: UtcMap,
    slots: readonly Slot[],
  ) {
    const heights = map.height ? decodeHeight(map.height) : null,
      sea = Math.round((map.waterLevel ?? 0) * 100);
    for (let z = 0; z < 256; z++)
      for (let x = 0; x < 256; x++) {
        const i = z * 256 + x,
          h = Math.round(
            (heights?.[
              (z - HEIGHT_ORIGIN) * HEIGHT_VERTS + x - HEIGHT_ORIGIN
            ] ?? 0) * 100,
          );
        this.heights[i] = h;
        this.terrain[i] = h > sea + 10 ? 1 : 0;
      }
    const ordered = slots.slice().sort((a, b) => a.player - b.player);
    for (const slot of ordered) {
      const start = map.playerStarts?.find(
        (s) => s.player === slot.player + 1,
      );
      if(!start) throw new Error(`Map is missing the start for player ${slot.player+1}`);
      const home = this.addBuilding(
        slot.player,
        "fort",
        Math.round(start.x),
        Math.round(start.z),
        true,
      );
      this.colonies.push({
        owner: slot.player,
        stock: { wood: 40, stone: 30 },
        home: home.id,
      });
      for (let i = 0; i < 8; i++)
        this.spawnWorker(
          slot.player,
          home.x + (i % 4) - 1,
          home.z + BUILDINGS[home.kind].radius + 2 + Math.floor(i / 4),
          i < 2 ? "builder" : "carrier",
        );
      for (let i=0;i<2;i++) this.spawnWorker(slot.player,home.x-2+i*4,home.z+7,'warrior');
    }
    for (const stamp of map.stamps) {
      const kind = resourceKindForAsset(stamp.asset);
      if (!kind) continue;
      const x = Math.round(stamp.x + 0.5),
        z = Math.round(stamp.y + 0.5);
      if (x < 0 || z < 0 || x >= 256 || z >= 256 || !this.terrain[z * 256 + x])
        continue;
      if (this.resourceCells[z * 256 + x]) continue;
      const id = this.nextId++;
      this.resources.push({
        id,
        stampId: stamp.id,
        kind,
        x,
        z,
        amount: kind === "wood" ? 24 : 48,
        claimed: 0,
        growth: 0,
      });
      this.resourceCells[z * 256 + x] = id;
    }
    this.navigation = new Navigation(
      256,
      (a, b) =>
        this.walkable(b) && Math.abs(this.heights[a]! - this.heights[b]!) <= 90,
    );
    for(const stamp of map.stamps) {
      const kind=neutralKindForAsset(stamp.asset);if(!kind)continue;
      const before=this.workers.length;
      this.spawnWorker(-1,Math.round(stamp.x+.5),Math.round(stamp.y+.5),kind);
      if(this.workers.length>before){const unit=this.workers.at(-1)!;unit.camp={x:unit.x,z:unit.z};}
    }
    this.updateTerritory();
    this.visibility = new Visibility(this.colonies.map(c=>c.owner));
    this.visibility.update(this.buildings,this.workers,this.resources,this.territory);
  }
  private spawnWorker(
    owner: number,
    x: number,
    z: number,
    role: Worker["role"],
  ) {
    if (this.workers.length >= MAX_WORKERS) return;
    // Stable nearest-free placement keeps new residents out of water, buildings and one another.
    let found = false;
    for (let r = 0; r <= 12 && !found; r++)
      for (let dz = -r; dz <= r && !found; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dz) !== r) continue;
          const nx = x + dx,
            nz = z + dz;
          if (
            nx < 0 ||
            nz < 0 ||
            nx >= 256 ||
            nz >= 256 ||
            !this.walkable(nz * 256 + nx) ||
            this.workers.some((w) => w.x === nx && w.z === nz)
          )
            continue;
          x = nx;
          z = nz;
          found = true;
          break;
        }
    if (!found) return;
    this.workers.push({
      id: this.nextId++,
      owner,
      x,
      z,
      role,
      health: unitMaxHealth(role), target: 0, attackCooldown: 0, attackDestination: null, pendingMove: null, forceAttack: false,
      job: "idle",
      building: 0,
      resource: 0,
      timer: 0,
      path: [],
      shipment: null,
      carry: null,
      quantity: 0,
    });
  }
  private addBuilding(
    owner: number,
    kind: BuildingKind,
    x: number,
    z: number,
    complete = false,
  ): Building {
    const b: Building = {
      id: this.nextId++,
      owner,
      kind,
      x,
      z,
      complete,
      progress: complete ? BUILDINGS[kind].work : 0,
      escrow: { wood: 0, stone: 0 },
      delivered: { wood: 0, stone: 0 },
      inventory: { log: 0, plank: 0, stone: 0 },
      health: complete ? (BUILDINGS[kind].health ?? 250) : Math.ceil((BUILDINGS[kind].health ?? 250)*.1),
      queue: [], recruit: 0, training: 0, rally: null,
    };
    this.buildings.push(b);
    this.footprint(b, b.id);
    this.revision++;
    return b;
  }
  private footprint(b: Building, value: number) {
    const r = BUILDINGS[b.kind].radius;
    for (let z = b.z - r; z <= b.z + r; z++)
      for (let x = b.x - r; x <= b.x + r; x++)
        if (x >= 0 && x < 256 && z >= 0 && z < 256)
          this.occupied[z * 256 + x] = value;
  }
  private walkable(i: number): boolean {
    return (
      i >= 0 &&
      i < 65536 &&
      !!this.terrain[i] &&
      !this.occupied[i] &&
      !this.resourceCells[i]
    );
  }
  private entrance(b: Building): number {
    return (b.z + BUILDINGS[b.kind].radius + 1) * 256 + b.x;
  }
  private colony(owner: number) {
    return this.colonies.find((c) => c.owner === owner);
  }
  private home(owner: number) {
    return this.buildings.find((b) => b.id === this.colony(owner)?.home)!;
  }
  private feedback(owner: number, message: string) {
    this.events.push({ tick: this.now, owner, message });
    if (this.events.length > 16) this.events.shift();
  }
  canBuild(
    owner: number,
    kind: BuildingKind,
    x: number,
    z: number,
  ): string | null {
    const rule = BUILDINGS[kind],
      colony = this.colony(owner);
    if (this.outcome) return "The match has ended";
    if (rule?.buildable === false)
      return "Each player has one unique main fort";
    if (!rule || !colony) return "Unknown building or player";
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(z) ||
      x < 4 ||
      z < 4 ||
      x > 251 ||
      z > 250
    )
      return "Outside the map";
    if (this.buildings.length >= MAX_BUILDINGS) return "Building limit reached";
    if (
      rule.population &&
      this.workers.length +
        this.buildings
          .filter((b) => !b.complete)
          .reduce((n, b) => n + BUILDINGS[b.kind].population, 0) +
        rule.population >
        MAX_WORKERS
    )
      return "Settler limit reached";
    if (colony.stock.wood < rule.wood || colony.stock.stone < rule.stone)
      return "Not enough planks or stone";
    let lo = 32767,
      hi = -32768;
    for (let dz = -rule.radius - 1; dz <= rule.radius + 1; dz++)
      for (let dx = -rule.radius - 1; dx <= rule.radius + 1; dx++) {
        const i = (z + dz) * 256 + x + dx;
        if (this.visibility && !this.visibility.visible(owner,x+dx,z+dz)) return "Explore this ground before building";
        if (this.territory[i] !== owner) return "Build inside your territory";
        if (!this.walkable(i)) return "Ground is blocked or underwater";
        lo = Math.min(lo, this.heights[i]!);
        hi = Math.max(hi, this.heights[i]!);
      }
    if (
      this.workers.some(
        (w) =>
          Math.abs(w.x - x) <= rule.radius && Math.abs(w.z - z) <= rule.radius,
      )
    )
      return "A settler is standing here";
    if (hi - lo > 100) return "Choose flatter ground";
    return null;
  }
  command(owner: number, action: Action): boolean {
    if (this.outcome || !validAction(action) || !this.colony(owner))
      return false;
    if(action.type==='attack-units') {
      let accepted=false;
      for(const id of [...action.ids].sort((a,b)=>a-b))accepted=this.command(owner,{type:'attack',id,target:action.target,force:action.force})||accepted;
      return accepted;
    }
    if(action.type==='move-units') {
      const units=this.workers.filter(w=>action.ids.includes(w.id)&&w.owner===owner&&w.health>0
        && w.job!=='training' && w.job!=='to-barracks');
      units.sort((a,b)=>a.id-b.id);
      const used=new Set<number>();let accepted=false;
      for(const [index,w] of units.entries()) {
        const offset=formationOffset(index,units.length);
        const x=Math.max(0,Math.min(255,action.x+offset.x)),z=Math.max(0,Math.min(255,action.z+offset.z));
        let goal:number|null=null;
        for(let r=0;r<=8&&goal===null;r++)for(let dz=-r;dz<=r&&goal===null;dz++)for(let dx=-r;dx<=r;dx++) {
          if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
          const nx=x+dx,nz=z+dz,i=nz*256+nx;
          if(nx<0||nz<0||nx>=256||nz>=256||used.has(i)||!this.walkable(i))continue;
          goal=i;break; // Choose the nearest free slot; run A* once per unit below.
        }
        if(goal===null)continue;
        used.add(goal);
        if(this.command(owner,{type:'move-worker',id:w.id,x:goal%256,z:Math.floor(goal/256)})) {
          accepted=true;
          if(action.attackMove&&isSoldier(w.role)){w.attackDestination=goal;w.job='idle';}
        }
      }
      return accepted;
    }
    if (action.type === 'recruit'  || action.type === 'cancel-recruit' || action.type === 'rally') {
      const b=this.buildings.find(b=>b.id===action.id && b.owner===owner && b.kind==='barracks' && b.complete && b.health>0);
      if(!b)return false;
      if(action.type==='recruit') {
        if(b.queue.length>=RECRUIT_QUEUE_LIMIT)return false;
        b.queue.push(action.kind);
      } else if(action.type==='cancel-recruit') {
        if(action.index>=b.queue.length)return false;
        b.queue.splice(action.index,1);
        if(action.index===0){const w=this.workers.find(w=>w.id===b.recruit);if(w)this.resetWorker(w);b.recruit=0;b.training=0;}
      } else {
        if(!this.walkable(action.z*256+action.x) || this.navigation.path(this.entrance(b),action.z*256+action.x)===null)return false;
        b.rally={x:action.x,z:action.z};
      }
      this.revision++;return true;
    }
    if(action.type==='attack' || action.type==='stop-unit') {
      const w=this.workers.find(w=>w.id===action.id && w.owner===owner && isSoldier(w.role));
      if(!w)return false;
      if(action.type==='stop-unit'){this.resetWorker(w);w.pendingMove=null;return true;}
      const target=this.workers.find(t=>t.id===action.target)??this.buildings.find(t=>t.id===action.target);
      if(!target || target.id===w.id || (target.owner===owner&&!action.force) || target.health<=0 || !this.targetVisible(owner,target))return false;
      this.resetWorker(w);w.target=target.id;w.forceAttack=action.force===true;w.job='attack';w.timer=0;return true;
    }
    if (action.type === "build") {
      const error = this.canBuild(owner, action.kind, action.x, action.z);
      if (error) {
        this.feedback(owner, error);
        return false;
      }
      const goal =
        (action.z + BUILDINGS[action.kind].radius + 1) * 256 + action.x;
      if (!this.navigation.path(this.entrance(this.home(owner)), goal)) {
        this.feedback(owner, "No route from the fort");
        return false;
      }
      const b = this.addBuilding(owner, action.kind, action.x, action.z),
        rule = BUILDINGS[action.kind],
        stock = this.colony(owner)!.stock;
      stock.wood -= rule.wood;
      stock.stone -= rule.stone;
      b.escrow = { wood: rule.wood, stone: rule.stone };
      this.feedback(owner, `${rule.name}: construction ordered`);
      return true;
    }
    if (action.type === "cancel-building") {
      const b = this.buildings.find(
        (b) => b.id === action.id && b.owner === owner && !b.complete,
      );
      if (!b) return false;
      const stock = this.colony(owner)!.stock;
      for (const k of ["wood", "stone"] as const)
        stock[k] += b.escrow[k] + b.delivered[k];
      for (const w of this.workers)
        if (w.building === b.id) {
          if (w.carry) stock[w.carry] += w.quantity;
          this.resetWorker(w);
        }
      this.footprint(b, 0);
      this.buildings.splice(this.buildings.indexOf(b), 1);
      this.revision++;
      this.feedback(owner, "Construction cancelled; materials returned");
      return true;
    }
    if (action.type === "move-worker") {
      const w = this.workers.find(
        (w) => w.id === action.id && w.owner === owner && w.job!=="training" && w.job!=="to-barracks",
      );
      if (!w) return false;
      const goal=action.z*256+action.x;
      if(!this.walkable(goal))return false;
      const path=this.navigation.path(w.z*256+w.x,goal);if(path===null)return false;
      // Loaded carriers finish their delivery before obeying a manual move; no goods vanish.
      if(w.shipment||w.quantity){w.pendingMove=goal;return true;}
      w.path=path;w.job='move';w.timer=WORKER_STEP_TICKS;
      const node=this.resources.find(n=>n.id===w.resource);if(node?.claimed===w.id)node.claimed=0;
      w.resource=0;w.pendingMove=null;
      w.target=0;w.forceAttack=false;w.attackDestination=null;return true;
    }
    return false;
  }
  private resetWorker(w: Worker) {
    const node = this.resources.find((n) => n.id === w.resource);
    if (node?.claimed === w.id) node.claimed = 0;
    w.target = 0;
    w.forceAttack=false;w.attackDestination=null;
    w.shipment = null;
    w.job = "idle";
    w.building = 0;
    w.resource = 0;
    w.path = [];
    w.carry = null;
    w.quantity = 0;
    w.timer = 20;
  }
  private travel(w: Worker, goal: number, job: WorkerJob): boolean {
    if (!this.walkable(goal)) return false;
    const path = this.navigation.path(w.z * 256 + w.x, goal);
    if (path === null) return false;
    w.path = path;
    w.job = job;
    w.timer = WORKER_STEP_TICKS;
    return true;
  }
  tick(tick: number) {
    if (this.outcome) return;
    this.now = tick;
    for (const node of this.resources)
      if (
        node.growth > 0 &&
        node.growth <= tick &&
        !this.occupied[node.z * 256 + node.x] &&
        !this.workers.some((w) => w.x === node.x && w.z === node.z)
      ) {
        node.amount = 24;
        node.growth = 0;
        this.resourceCells[node.z * 256 + node.x] = node.id;
        this.revision++;
      }
    // All entity traversal follows stable creation order; first claimant wins a resource job.
    for (const b of this.buildings) {
      if (
        !b.complete ||
        b.health <= 0 ||
        (!BUILDINGS[b.kind].job &&
          b.kind !== "sawmill" &&
          b.kind !== "forester") ||
        this.workers.some((w) => w.building === b.id && w.role !== "builder" && w.role !== "carrier")
      )
        continue;
      const w = this.workers.find(
        (w) => w.owner === b.owner && w.role === "carrier" && w.pendingMove===null && !w.shipment && !w.quantity && w.job === "idle",
      );
      if (w) {
        w.role =
          b.kind === "sawmill"
            ? "sawyer"
            : b.kind === "forester"
              ? "forester"
              : b.kind === "lumberjack"
                ? "lumberjack"
                : "stonemason";
        w.building = b.id;
      }
    }
    for(const b of this.buildings)if(b.kind==='barracks' && b.complete && b.health>0)this.recruitTick(b);
    for (const w of [...this.workers]) {
      if(w.health<=0)continue;
      if(this.outcome)break;
      this.workerTick(w);
    }
    if(tick % VISION_STEP === 0)this.visibility.update(this.buildings,this.workers,this.resources,this.territory);
  }
  private workerTick(w: Worker) {
    if(w.pendingMove!==null&&!w.shipment&&!w.quantity){
      const goal=w.pendingMove;w.pendingMove=null;
      this.command(w.owner,{type:'move-worker',id:w.id,x:goal%256,z:Math.floor(goal/256)});
    }
    if(isCombatant(w.role)){this.soldierTick(w);return;}
    const assigned = this.buildings.find((b) => b.id === w.building);
    if (assigned && assigned.health <= 0) {
      const role = w.role;
      this.resetWorker(w);
      w.role = role === "builder" || role === "carrier" ? role : "carrier";
      // Destruction loses materials assigned to the destroyed workplace, as it does its stored inventory.
      w.timer = 20;
      return;
    }
    if(w.job==='training')return;
    if (w.timer > 0) {
      w.timer--;
      return;
    }
    if (w.path.length) {
      const next = w.path[0]!;
      if (!this.walkable(next)) {
        const goal = w.path[w.path.length - 1]!;
        if (!this.travel(w, goal, w.job)) {
          w.timer = 40;
        }
        return;
      }
      w.path.shift();
      w.x = next % 256;
      w.z = Math.floor(next / 256);
      w.timer = WORKER_STEP_TICKS;
      return;
    }
    if(w.job==='to-barracks') {
      if(!assigned || assigned.recruit!==w.id){this.resetWorker(w);return;}
      if(this.at(w,assigned,'to-barracks'))w.job='training';
      return;
    }
    if (w.job === "move") {
      w.job = "idle";
      return;
    }
    if (w.role === "carrier") {
      this.carrierTick(w);
      return;
    }
    if (w.role === "sawyer") {
      this.sawyerTick(w);
      return;
    }
    if (w.role === "forester") {
      this.foresterTick(w);
      return;
    }
    if (w.role === "builder") {
      this.builderTick(w);
      return;
    }
    if (w.role === "lumberjack" || w.role === "stonemason") {
      this.gathererTick(w);
      return;
    }
    w.timer = 20;
  }
  private builderTick(w: Worker) {
    let b = this.buildings.find((b) => b.id === w.building);
    if (!b || (b.complete && b.health >= (BUILDINGS[b.kind].health??250)) || b.health <= 0) {
      w.building = 0;
      w.job = "idle";
      b = this.buildings.find(
        (b) =>
          b.owner === w.owner &&
          (!b.complete || b.health < (BUILDINGS[b.kind].health??250)) &&
          b.health > 0 &&
          this.workers.filter(
            (v) => v.role === "builder" && v.building === b.id,
          ).length < 2,
      );
      if (!b) {
        w.timer = 20;
        return;
      }
      w.building = b.id;
    }
    const rule = BUILDINGS[b.kind];
    if (w.job === "idle") {
      if (!this.travel(w, this.entrance(b), "to-site")) w.timer = 40;
      return;
    }
    if (w.job === "to-site") {
      if (w.z * 256 + w.x !== this.entrance(b)) {
        if (!this.travel(w, this.entrance(b), "to-site")) w.timer = 40;
        return;
      }
      if (w.carry) {
        b.delivered[w.carry] += w.quantity;
        w.carry = null;
        w.quantity = 0;
      }
      w.job =
        b.complete || (b.delivered.wood >= rule.wood && b.delivered.stone >= rule.stone)
          ? "build"
          : "idle";
      return;
    }
    if (w.job === "build") {
      if(b.complete){b.health=Math.min(rule.health??250,b.health+1);w.timer=3;return;}
      const max=rule.health??250;
      const oldCap=Math.ceil(max*(.1+.9*b.progress/rule.work));
      b.progress++;
      b.health+=Math.ceil(max*(.1+.9*b.progress/rule.work))-oldCap;
      if (b.progress >= rule.work) {
        b.complete = true;
        this.revision++;
        this.feedback(b.owner, `${rule.name} completed`);
        if (rule.territory) this.updateTerritory();
        for (let i = 0; i < rule.population; i++)
          this.spawnWorker(b.owner, b.x + i - 1, b.z + 4, "carrier");
        w.building = 0;
        w.job = "idle";
      }
    }
  }
  private gathererTick(w: Worker) {
    const b = this.buildings.find((b) => b.id === w.building);
    if (!b) {
      w.role = "carrier";
      this.resetWorker(w);
      return;
    }
    const kind = BUILDINGS[b.kind].job!;
    if (w.job === "idle") {
      if (this.inventorySize(b) >= STOCKPILE_LIMIT) {
        w.timer = 40;
        return;
      }
      const candidates = this.resources
        .filter(
          (n) =>
            n.kind === kind &&
            n.amount > 0 &&
            !n.claimed &&
            this.territory[n.z * 256 + n.x] === w.owner &&
            (n.x - b.x) ** 2 + (n.z - b.z) ** 2 <= 40 ** 2,
        )
        .sort(
          (a, c) =>
            (a.x - w.x) ** 2 +
              (a.z - w.z) ** 2 -
              ((c.x - w.x) ** 2 + (c.z - w.z) ** 2) || a.id - c.id,
        );
      for (const n of candidates) {
        const goals = [
          (n.z - 1) * 256 + n.x,
          n.z * 256 + n.x - 1,
          n.z * 256 + n.x + 1,
          (n.z + 1) * 256 + n.x,
        ]
          .filter(
            (i) =>
              i >= 0 &&
              i < 65536 &&
              Math.abs((i % 256) - n.x) +
                Math.abs(Math.floor(i / 256) - n.z) ===
                1,
          )
          .sort(
            (a, c) =>
              Math.abs((a % 256) - w.x) +
                Math.abs(Math.floor(a / 256) - w.z) -
                Math.abs((c % 256) - w.x) -
                Math.abs(Math.floor(c / 256) - w.z) || a - c,
          );
        for (const goal of goals)
          if (this.travel(w, goal, "to-resource")) {
            w.resource = n.id;
            n.claimed = w.id;
            return;
          }
      }
      w.timer = 80;
      return;
    }
    const node = this.resources.find((n) => n.id === w.resource);
    if (w.job === "to-resource") {
      w.job = "gather";
      w.timer = GATHER_TICKS;
      return;
    }
    if (w.job === "gather") {
      if (node && node.claimed === w.id && node.amount > 0) {
        w.quantity = Math.min(
          CARRY_CAPACITY,
          node.amount,
          STOCKPILE_LIMIT - this.inventorySize(b),
        );
        w.carry = kind;
        node.amount -= w.quantity;
        node.claimed = 0;
        if (!node.amount) {
          this.resourceCells[node.z * 256 + node.x] = 0;
          this.revision++;
        }
      }
      w.resource = 0;
      if (!this.travel(w, this.entrance(b), "to-stock")) {
        w.job = "to-stock";
        w.timer = 40;
      }
      return;
    }
    if (w.job === "to-stock") {
      if (!this.at(w, b, "to-stock")) return;
      const item = w.carry === "wood" ? "log" : "stone";
      const amount = Math.min(
        w.quantity,
        STOCKPILE_LIMIT - this.inventorySize(b),
      );
      b.inventory[item] += amount;
      w.quantity -= amount;
      if (w.quantity) {
        w.timer = 40;
        return;
      }
      w.carry = null;
      w.job = "idle";
      w.timer = 80;
      return;
    }
  }
  private inventorySize(b: Building) {
    return b.inventory.log + b.inventory.plank + b.inventory.stone;
  }
  private at(w: Worker, b: Building, job: WorkerJob): boolean {
    if (w.z * 256 + w.x === this.entrance(b)) return true;
    if (!this.travel(w, this.entrance(b), job)) {
      w.job = job;
      w.timer = 40;
    }
    return false;
  }
  private sawyerTick(w: Worker) {
    const b = this.buildings.find(b => b.id === w.building);
    if (!b || !this.at(w,b,w.job)) return;
    if (w.job === "mill-process") {
      const amount = Math.min(CARRY_CAPACITY,b.inventory.log);
      b.inventory.log -= amount;
      b.inventory.plank += amount;
      w.job = "idle";
      w.timer = 40;
    } else if(b.inventory.log > 0) {
      w.job = "mill-process";
      w.timer = 120;
    } else w.timer = 40;
  }

  /** Reservations live on workers and are part of the lockstep checksum. Goods move only at pickup/delivery. */
  private carrierTick(w: Worker) {
    const task = w.shipment;
    if (task) {
      const source = this.buildings.find(b => b.id === task.source && b.health > 0);
      const target = this.buildings.find(b => b.id === task.target && b.health > 0);
      if (!target || (!source && w.quantity === 0)) { this.resetWorker(w); return; }
      const key = task.item === "stone" ? "stone" : "wood";
      if (w.job === "pickup") {
        if (!source || !this.at(w,source,"pickup")) return;
        const available = task.construction ? target.escrow[key] : source.kind === "fort" ? this.colony(w.owner)!.stock[key] : source.inventory[task.item];
        w.quantity = Math.min(task.amount,available);
        if(task.construction) target.escrow[key] -= w.quantity;
        else if(source.kind === "fort")this.colony(w.owner)!.stock[key]-=w.quantity;
        else source.inventory[task.item] -= w.quantity;
        if(!w.quantity) { this.resetWorker(w); return; }
        task.amount = w.quantity;
        w.carry = key;
        w.job = "dropoff";
      }
      if (!this.at(w,target,"dropoff")) return;
      if(task.construction) target.delivered[key] += w.quantity;
      else if(target.kind === "fort") this.colony(w.owner)!.stock[key] += w.quantity;
      else target.inventory[task.item] += w.quantity;
      this.resetWorker(w);
      return;
    }
    const home = this.home(w.owner);
    const own = this.buildings.filter(b => b.owner === w.owner && b.health > 0);
    const tasks: NonNullable<Worker["shipment"]>[] = [];
    const reserved = (predicate: (t: NonNullable<Worker["shipment"]>,v: Worker) => boolean) =>
      this.workers.reduce((n,v) => n + (v.shipment && predicate(v.shipment,v) ? v.shipment.amount : 0),0);
    const offer = (source: Building,target: Building,item: ItemKind,available: number,construction=false,demand=Infinity) => {
      const outgoing = reserved((t,v) => v.quantity === 0 && t.source === source.id && t.item === item && t.construction === construction && (!construction || t.target === target.id));
      const incoming = reserved(t => t.target === target.id);
      const room = target.complete && target.kind !== "fort" ? STOCKPILE_LIMIT-this.inventorySize(target)-incoming : CARRY_CAPACITY;
      const amount = Math.min(CARRY_CAPACITY,available-outgoing,room,demand-incoming);
      if(amount > 0) tasks.push({source:source.id,target:target.id,item,amount,construction});
    };
    // Materials already paid for take priority; then clear producer outputs, then supply mills.
    for(const b of own.filter(b => !b.complete)) {
      offer(home,b,"plank",b.escrow.wood,true);
      offer(home,b,"stone",b.escrow.stone,true);
    }
    for(const b of own.filter(b=>b.complete && b.kind==='barracks'))
      offer(home,b,'plank',this.colony(w.owner)!.stock.wood,false,Math.min(2,b.queue.length)-b.inventory.plank);
    for(const b of own.filter(b=>b.complete && b.kind==='barracks'))
      offer(b,home,'plank',Math.max(0,b.inventory.plank-Math.min(2,b.queue.length)));
    for(const b of own.filter(b => b.complete && b.kind !== "fort" && b.kind !== 'barracks')) {
      offer(b,home,"plank",b.inventory.plank);
      offer(b,home,"stone",b.inventory.stone);
    }
    for(const mill of own.filter(b => b.complete && b.kind === "sawmill"))
      for(const source of own.filter(b => b.complete && b.kind === "lumberjack" && (b.x-mill.x)**2+(b.z-mill.z)**2 <= 64**2)
        .sort((a,b) => (a.x-mill.x)**2+(a.z-mill.z)**2-((b.x-mill.x)**2+(b.z-mill.z)**2) || a.id-b.id))
        offer(source,mill,"log",source.inventory.log);
    for(const t of tasks) {
      const source = own.find(b => b.id === t.source)!, target=own.find(b => b.id === t.target)!;
      if(this.navigation.path(this.entrance(source),this.entrance(target)) === null) continue;
      if(!this.travel(w,this.entrance(source),"pickup")) continue;
      w.shipment=t; w.building=target.id;
      return;
    }
    w.timer=40;
  }
  private foresterTick(w: Worker) {
    const b = this.buildings.find((b) => b.id === w.building);
    if (!b) return;
    if (w.job === "plant") {
      const n = this.resources.find((n) => n.id === w.resource);
      if (
        n &&
        n.claimed === w.id &&
        n.amount === 0 &&
        this.walkable(n.z * 256 + n.x)
      ) {
        n.growth = this.now + 1600;
        n.claimed = 0;
        this.revision++;
      }
      w.resource = 0;
      w.job = "idle";
      this.travel(w, this.entrance(b), "idle");
      w.timer = 80;
      return;
    }
    const nodes = this.resources
      .filter(
        (n) =>
          n.kind === "wood" &&
          n.amount === 0 &&
          !n.growth &&
          !n.claimed &&
          this.territory[n.z * 256 + n.x] === w.owner &&
          (n.x - b.x) ** 2 + (n.z - b.z) ** 2 <= 32 ** 2,
      )
      .sort(
        (a, c) =>
          (a.x - b.x) ** 2 +
            (a.z - b.z) ** 2 -
            ((c.x - b.x) ** 2 + (c.z - b.z) ** 2) || a.id - c.id,
      );
    for (const n of nodes)
      if (this.travel(w, n.z * 256 + n.x, "plant")) {
        n.claimed = w.id;
        w.resource = n.id;
        return;
      }
    w.timer = 80;
  }
  /** Deterministic damage hook for the forthcoming combat system; never a trusted client payload. */
  private recruitTick(b: Building) {
    let w=this.workers.find(w=>w.id===b.recruit && w.health>0);
    if(b.recruit && !w){b.recruit=0;b.training=0;}
    if(!b.queue.length || b.inventory.plank<SOLDIERS[b.queue[0]!].planks)return;
    if(!w) {
      w=this.workers.find(w=>w.owner===b.owner && w.role==='carrier' && w.pendingMove===null && w.job==='idle' && !w.building && !w.shipment && !w.quantity
        && this.navigation.path(w.z*256+w.x,this.entrance(b))!==null);
      if(!w)return;
      this.resetWorker(w);w.building=b.id;b.recruit=w.id;
      this.travel(w,this.entrance(b),'to-barracks');return;
    }
    if(w.job!=='training')return;
    const kind=b.queue[0]!, rule=SOLDIERS[kind];
    b.training++;
    if(b.training<rule.training)return;
    b.inventory.plank-=rule.planks;b.queue.shift();b.training=0;b.recruit=0;
    this.resetWorker(w);w.role=kind;w.health=rule.health;w.timer=0;
    if(b.rally)this.travel(w,b.rally.z*256+b.rally.x,'move');
    this.revision++;this.feedback(b.owner,`${rule.name} trained`);
  }
  private targetVisible(owner:number,target:Worker|Building) {
    if('role' in target && target.job==='training')return false;
    if(owner===-1)return true;
    const r='kind' in target?BUILDINGS[target.kind].radius:0;
    for(let z=Math.max(0,target.z-r);z<=Math.min(255,target.z+r);z++)
      for(let x=Math.max(0,target.x-r);x<=Math.min(255,target.x+r);x++)if(this.visibility.visible(owner,x,z))return true;
    return false;
  }
  private targetDistance(w:Worker,target:Worker|Building) {
    const r='kind' in target?BUILDINGS[target.kind].radius:0;
    return Math.max(0,Math.abs(w.x-target.x)-r)**2+Math.max(0,Math.abs(w.z-target.z)-r)**2;
  }
  private soldierTick(w:Worker) {
    if(!isCombatant(w.role))return;
    if(w.camp && w.target){
      const target=this.workers.find(t=>t.id===w.target)??this.buildings.find(t=>t.id===w.target);
      if(!target || Math.hypot(target.x-w.camp.x,target.z-w.camp.z)>18 || Math.hypot(w.x-w.camp.x,w.z-w.camp.z)>18){
        this.resetWorker(w);this.travel(w,w.camp.z*256+w.camp.x,'move');
      }
    }
    if(w.attackCooldown>0)w.attackCooldown--;
    if(w.timer>0){w.timer--;return;}
    const step=()=>{
      const next=w.path.shift();
      if(next!==undefined && this.walkable(next)){w.x=next%256;w.z=Math.floor(next/256);}
      else w.path=[];
      w.timer=WORKER_STEP_TICKS;
    };
    if(w.job==='move') {
      if(w.path.length){step();return;}
      w.job='idle';
    }
    let target=this.workers.find(t=>t.id===w.target)??this.buildings.find(t=>t.id===w.target);
    if(target && (target.health<=0 || (target.owner===w.owner&&!w.forceAttack) || !this.targetVisible(w.owner,target))){target=undefined;w.target=0;w.path=[];}
    if(!target) {
      target=([...this.workers,...this.buildings] as (Worker|Building)[])
        .filter(t=>t.owner!==w.owner && t.health>0 && this.targetDistance(w,t)<=(w.role==='wolf'?8:w.role==='ogre'?10:10)**2 && (!w.camp||Math.hypot(t.x-w.camp.x,t.z-w.camp.z)<=18) && this.targetVisible(w.owner,t))
        .sort((a,b)=>this.targetDistance(w,a)-this.targetDistance(w,b)||a.id-b.id)[0];
      w.target=target?.id??0;w.forceAttack=false;
      if(target)w.path=[];
    }
    if(!target){
      w.job='idle';
      if(w.attackDestination!==null) {
        if(w.z*256+w.x===w.attackDestination){w.attackDestination=null;w.path=[];}
        else {
          if(!w.path.length)w.path=this.navigation.path(w.z*256+w.x,w.attackDestination)??[];
          if(w.path.length){step();return;}
          w.attackDestination=null;
        }
      }
      w.timer=12;return;
    }
    const rule=COMBAT_UNITS[w.role];w.job='attack';
    if(this.targetDistance(w,target)<=rule.range**2) {
      w.path=[];
      if(!w.attackCooldown) {
        if('kind' in target)this.damageBuilding(target.id,rule.damage);
        else this.damageUnit(target.id,rule.damage);
        w.attackCooldown=rule.cooldown;
      }
      w.timer=3;return;
    }
    // Replan only after exhausting a short path segment, so moving targets are followed
    // without running navigation every frame. Integer grid + stable ordering on every peer.
    if(!w.path.length) {
      const r='kind' in target?BUILDINGS[target.kind].radius+1:1;
      const candidates:number[]=[];
      for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++) {
        if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
        const x=target.x+dx,z=target.z+dz;
        if(x>=0&&z>=0&&x<256&&z<256&&this.walkable(z*256+x))candidates.push(z*256+x);
      }
      candidates.sort((a,b)=>(a%256-w.x)**2+(Math.floor(a/256)-w.z)**2-((b%256-w.x)**2+(Math.floor(b/256)-w.z)**2)||a-b);
      for(const goal of candidates){const path=this.navigation.path(w.z*256+w.x,goal);if(path){w.path=path.slice(0,6);break;}}
    }
    if(w.path.length)step();else w.timer=40;
  }
  damageUnit(id:number,amount:number):boolean {
    if(this.outcome || !Number.isSafeInteger(amount) || amount<=0)return false;
    const w=this.workers.find(w=>w.id===id && w.health>0);
    if(!w)return false;
    w.health=Math.max(0,w.health-amount);
    if(!w.health){
      this.resetWorker(w);
      this.workers.splice(this.workers.indexOf(w),1);
      this.revision++;
    }
    return true;
  }
  damageBuilding(id: number, amount: number): boolean {
    if (this.outcome || !Number.isSafeInteger(amount) || amount <= 0)
      return false;
    const b = this.buildings.find((b) => b.id === id && b.health > 0);
    if (!b) return false;
    b.health = Math.max(0, b.health - amount);
    if (b.health > 0) return true;
    this.footprint(b, 0);
    b.inventory = { log: 0, plank: 0, stone: 0 };
    b.queue=[];b.recruit=0;b.training=0;
    this.revision++;
    if (b.kind === "fort") {
      const survivors = this.colonies.filter((c) => c.owner !== b.owner);
      this.outcome = {
        winner: survivors.length === 1 ? survivors[0]!.owner : null,
        defeated: [b.owner],
      };
      this.feedback(b.owner, "Your main fort has fallen");
    }
    this.updateTerritory();
    return true;
  }
  /** A small deterministic economy opponent. The same planner runs on every peer. */
  planAI(owner: number): Action | null {
    if (this.outcome) return null;
    const own = this.buildings.filter((b) => b.owner === owner && b.health > 0);
    if (own.some((b) => !b.complete)) return null;
    const home = this.home(owner);
    if (!home) return null;
    const count = (kind: BuildingKind) =>
      own.filter((b) => b.kind === kind).length;
    const barracks=own.find(b=>b.kind==='barracks' && b.complete);
    const army=this.workers.filter(w=>w.owner===owner && isSoldier(w.role));
    if(barracks && barracks.queue.length<2 && army.length<10 && this.colony(owner)!.stock.wood>2
      && this.workers.filter(w=>w.owner===owner && w.role==='carrier').length>2)
      return {type:'recruit',id:barracks.id,kind:army.filter(w=>w.role==='warrior').length>army.filter(w=>w.role==='archer').length*2?'archer':'warrior'};
    const kind: BuildingKind =
      count("lumberjack") < 1
        ? "lumberjack"
        : count("sawmill") < 1
          ? "sawmill"
          : count("stonemason") < 1
            ? "stonemason"
            : count("house") < 1
              ? "house"
              : count("barracks") < 1
                ? "barracks"
              : count("lumberjack") < 2
                ? "lumberjack"
                : count("stonemason") < 2
                  ? "stonemason"
                  : "tower";
    const stock = this.colony(owner)!.stock,
      rule = BUILDINGS[kind];
    if (stock.wood < rule.wood || stock.stone < rule.stone) return null;
    const nodes = this.resources.filter(
      (n) =>
        n.amount > 0 &&
        n.kind === rule.job &&
        this.territory[n.z * 256 + n.x] === owner,
    );
    const candidates: { x: number; z: number; score: number }[] = [];
    for (let z = 8; z < 248; z += 4)
      for (let x = 8; x < 248; x += 4) {
        if (
          this.territory[z * 256 + x] !== owner ||
          this.canBuild(owner, kind, x, z)
        )
          continue;
        const score =
          kind === "tower"
            ? (x - 128) ** 2 + (z - 128) ** 2
            : nodes.length
              ? Math.min(...nodes.map((n) => (x - n.x) ** 2 + (z - n.z) ** 2)) +
                (x - home.x) ** 2 / 8 +
                (z - home.z) ** 2 / 8
              : (x - home.x) ** 2 + (z - home.z) ** 2;
        candidates.push({ x, z, score });
      }
    candidates.sort((a, b) => a.score - b.score || a.z - b.z || a.x - b.x);
    const target = candidates.find(
      (c) =>
        this.navigation.path(
          this.entrance(home),
          (c.z + rule.radius + 1) * 256 + c.x,
        ) !== null,
    );
    return target ? { type: "build", kind, x: target.x, z: target.z } : null;
  }

  private updateTerritory() {
    this.territory.fill(-1);
    const distance = new Int32Array(65536).fill(2147483647);
    for (const b of this.buildings) {
      const r = b.complete && b.health > 0 ? BUILDINGS[b.kind].territory : 0;
      if (!r) continue;
      for (let z = Math.max(0, b.z - r); z <= Math.min(255, b.z + r); z++)
        for (let x = Math.max(0, b.x - r); x <= Math.min(255, b.x + r); x++) {
          const d = (x - b.x) ** 2 + (z - b.z) ** 2,
            i = z * 256 + x;
          if (d > r * r) continue;
          if (d < distance[i]!) {
            distance[i] = d;
            this.territory[i] = b.owner;
          } else if (d === distance[i] && this.territory[i] !== b.owner)
            this.territory[i] = -2;
        }
    }
    this.revision++;
  }
  view(owner?: number): SettlementView {
    const state: SettlementView = {
      outcome: this.outcome
        ? { winner: this.outcome.winner, defeated: [...this.outcome.defeated] }
        : null,
      revision: this.revision,
      buildings: this.buildings.map((b) => ({
        ...b,
        queue: [...b.queue], rally: b.rally ? {...b.rally} : null,
        escrow: { ...b.escrow },
        delivered: { ...b.delivered },
        inventory: { ...b.inventory },
      })),
      workers: this.workers.map((w) => ({ ...w, ...(w.camp?{camp:{...w.camp}}:{}), shipment: w.shipment ? {...w.shipment} : null, path: [] })),
      resources: this.resources.map((n) => ({ ...n })),
      colonies: this.colonies.map((c) => ({ ...c, stock: { ...c.stock } })),
      territory: this.territory,
      events: this.events.slice(),
    };
    return owner === undefined ? state : this.visibility.project(state,owner);
  }
  checksum(): number {
    // Includes in-flight cargo, job timers and routes, so future-divergent states cannot hash equal merely because positions match.
    let h = 2166136261;
    const mix = (n: number) => {
      h = Math.imul(h ^ n, 16777619);
    };
    const text = JSON.stringify({
      outcome: this.outcome,
      nextId: this.nextId,
      now: this.now,
      buildings: this.buildings,
      workers: this.workers,
      resources: this.resources,
      colonies: this.colonies,
    });
    for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
    for (let i = 0; i < 65536; i++) {
      mix(this.heights[i]!);
      mix(this.territory[i]!);
      mix(this.occupied[i]!);
      mix(this.resourceCells[i]!);
    }
    mix(this.visibility.checksum());
    return h >>> 0;
  }
}
