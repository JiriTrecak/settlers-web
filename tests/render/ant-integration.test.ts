import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Group, Scene, SkinnedMesh, InstancedMesh, Matrix4, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SettlementLayer } from "../../src/render/settlement/settlementLayer";
import { HeightField } from "../../src/shared/map/height";
import { game } from "../game/helpers";
afterEach(() => vi.restoreAllMocks());

it("keeps real animation clips and combat effects on simulation time through stalls, pauses and catch-up", async () => {
  const bytes = readFileSync('assets/models/units/ants/warrior/model.glb');
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url =>
    url.includes('units/ants/warrior/model.glb') ? gltf : {scene:new Group(),animations:[]} as any);
  let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
  const scene=new Scene(),layer=new SettlementLayer(scene);
  await layer.ready;
  const view=structuredClone(game().view()),field=new HeightField();
  const warrior=view.entities.find(e=>e.definition==='unit.ants.warrior')!;
  view.entities=[warrior];warrior.unit!.moving=true;
  layer.update(view,field,0);
  const player=(layer as any).characters.get(warrior.id).player;
  now=10;layer.update(view,field,0);
  expect(player.mixer.time).toBeCloseTo(.01*player.speed);
  now=100;layer.update(view,field,0);
  const stalled=player.action.time;
  now=10_000;layer.update(view,field,0);
  expect(player.action.time).toBe(stalled);
  layer.update(view,field,400);
  expect(player.mixer.time).toBeCloseTo(10*player.speed);

  warrior.unit!.moving=false;
  warrior.unit!.attack={target:99,started:400,impact:412,ends:424,cycleTicks:40,released:false};
  layer.update(view,field,400);
  now+=75;layer.update(view,field,403);
  const shells=vi.spyOn((layer as any).shells,'update');
  const spells=vi.spyOn((layer as any).spellEffects,'update');
  const arrows=vi.spyOn((layer as any).projectiles,'update');
  now+=10;layer.update(view,field,403);
  expect(player.action.time/player.action.getClip().duration).toBeCloseTo(player.attackContact()*3.4/12);
  expect(shells.mock.calls[0][2]).toBeCloseTo(403.4);
  expect(spells.mock.calls[0][2]).toBeCloseTo(403.4);
  expect(arrows.mock.calls[0][0]).toBeCloseTo(403.4);
  const attackPose=player.action.time;
  now+=1000;layer.update(view,field,403,0);
  expect(player.action.time).toBe(attackPose);

  view.entities=[];view.deaths=[warrior];
  layer.update(view,field,404);
  expect(player.state).toBe('death');expect(player.action.time).toBe(0);
  now+=100;layer.update(view,field,404);
  const deathPose=player.action.time;
  now+=10_000;layer.update(view,field,404);
  expect(player.action.time).toBe(deathPose);
  expect((layer as any).characters.has(warrior.id)).toBe(true);
  layer.update(view,field,484);
  expect((layer as any).characters.has(warrior.id)).toBe(false);
  layer.destroy(scene);
});

it("uses independent animated game variants, reacts once per strike, and distinguishes fog removal from death", async () => {
  const loader = new GLTFLoader();
  const variants = await Promise.all(["base", "warrior", "archer", "marshal"].map(async variant => {
    const bytes = readFileSync(`assets/models/units/ants/${variant==='base'?'worker':variant}/model.glb`);
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
  }));
  vi.spyOn(GLTFLoader.prototype, "loadAsync").mockImplementation(async url => {
    const index = ["base", "warrior", "archer", "marshal"].findIndex(v => url.includes(`units/ants/${v==='base'?'worker':v}/model.glb`));
    return index >= 0 ? variants[index] : {scene: new Group(), animations: []} as any;
  });
  const scene = new Scene(), layer = new SettlementLayer(scene);
  await layer.ready;
  const view = structuredClone(game().view()), field = new HeightField();
  layer.update(view, field, 0);
  const units = view.entities.filter(e => e.unit && e.definition.startsWith("unit.ants."));
  const warrior = units.find(e => e.definition === "unit.ants.warrior")!;
  const worker = units.find(e => e.definition === "unit.ants.settler")!;
  const characters = (layer as any).characters as Map<number, any>;
  expect(characters.get(warrior.id).player.variant).toBe("warrior");
  expect(characters.get(worker.id).player.variant).toBe("base");
  let skins = 0;
  characters.get(warrior.id).root.traverse((o: any) => { if (o instanceof SkinnedMesh) skins++; });
  expect(skins).toBeGreaterThan(0);
  warrior.unit!.moving = true;
  worker.unit!.moving = true;
  layer.update(view, field, 1);
  expect(characters.get(warrior.id).player.state).toBe("run");
  expect(characters.get(worker.id).player.state).toBe("run");
  worker.unit!.strolling = true;
  layer.update(view, field, 1);
  expect(characters.get(worker.id).player.state).toBe("walk");
  layer.select(warrior.id);
  warrior.unit!.target = worker.id;
  layer.update(view, field, 1);
  const targetOutline = (layer as any).entities.get(worker.id).getObjectByName("Selection");
  expect(targetOutline.visible).toBe(false); // Automatic aggro is not an explicit order.
  warrior.unit!.commandedTarget = worker.id;
  layer.update(view, field, 1);
  expect(targetOutline.visible).toBe(true);
  expect(targetOutline.children[0].material.color.getHex()).toBe(0xff3636);
  layer.select(null);
  layer.update(view, field, 1);
  expect(targetOutline.visible).toBe(false);
  const workerHealth = (layer as any).entities.get(worker.id).getObjectByName("Health");
  const fullHp = worker.hp!;
  expect(workerHealth.visible).toBe(false);
  worker.hp = fullHp - 1;
  layer.update(view, field, 1);
  expect(workerHealth.visible).toBe(true);
  worker.hp = fullHp;
  layer.update(view, field, 1);
  expect(workerHealth.visible).toBe(false);
  layer.select(worker.id);
  layer.update(view, field, 1);
  expect(workerHealth.visible).toBe(true);
  layer.select(null);
  // Render the authoritative turn, not a new yaw inferred from small position deltas.
  worker.unit!.moving = false; worker.unit!.strolling = true;
  worker.x -= .01; worker.y += .02;worker.rotation=0;
  layer.update(view, field, 1);
  const workerRoot = (layer as any).entities.get(worker.id);
  expect(workerRoot.rotation.y).toBe(0);
  worker.rotation=45;
  let now=performance.now()+100;vi.spyOn(performance,"now").mockImplementation(()=>now);
  layer.update(view,field,2);now+=100;layer.update(view,field,2);
  expect(workerRoot.rotation.y).toBeCloseTo(Math.PI/4,3);
  worker.rotation=90;worker.x+=1;layer.update(view,field,2,0);
  expect(workerRoot.rotation.y).toBeCloseTo(Math.PI/2,8);expect(workerRoot.position.x).toBe(worker.x);
  const attack = vi.spyOn(characters.get(warrior.id).player, "setState");
  warrior.unit!.moving = false;
  warrior.unit!.cooldown = 40;
  warrior.unit!.attack = {target:worker.id,cycleTicks:40,started:2,impact:14,ends:24,released:false};
  layer.update(view, field, 2);
  layer.update(view, field, 2);
  expect(attack.mock.calls.filter(([state, options]) => state === "attack" && (options as any)?.restart)).toHaveLength(1);
  // A disappeared worker is removed; only an explicitly observed death leaves a corpse.
  const next = {...view, entities: view.entities.filter(e => e.id !== warrior.id && e.id !== worker.id), deaths: [warrior]};
  layer.update(next, field, 3);
  expect(characters.has(worker.id)).toBe(false);
  expect(characters.get(warrior.id).player.state).toBe("death");
  expect((layer as any).entities.has(warrior.id)).toBe(false);
  layer.destroy(scene);
  expect(characters.size).toBe(0);
});

for (const windup of [20,40]) it(`locks the real Marshal cast to a ${windup}-tick windup, release and interruptible recovery`,async()=>{
 const bytes=readFileSync('assets/models/units/ants/marshal/model.glb');
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>url.includes('units/ants/marshal/model.glb')?gltf:{scene:new Group(),animations:[]} as any);
 let now=0;vi.spyOn(performance,'now').mockImplementation(()=>now);
 const simulation=game(),checksum=simulation.checksum(),view=structuredClone(simulation.view());
 const hero=view.entities.find(e=>e.definition==='unit.ants.marshal')!;
 view.entities=[hero];hero.unit!.moving=false;
 const scene=new Scene(),layer=new SettlementLayer(scene),field=new HeightField();await layer.ready;
 const start=100,release=start+windup;
 hero.unit!.casting={ability:'spell.marshal.faultline',startTick:start,resolveTick:release};
 layer.update(view,field,start);
 const player=(layer as any).characters.get(hero.id).player;
 const phase=()=>player.action.time/player.action.getClip().duration;
 expect(player.state).toBe('cast');expect(phase()).toBe(0);
 const states=vi.spyOn(player,'setState');
 now+=windup/2*25;layer.update(view,field,start+windup/2);
 expect(phase()).toBeCloseTo(.34);
 // Wall time without simulation progress may interpolate only one unconfirmed tick.
 now+=2000;layer.update(view,field,start+windup/2);
 const stalled=phase();expect(stalled).toBeLessThan(.68*(windup/2+1)/windup);
 now+=2000;layer.update(view,field,start+windup/2);expect(phase()).toBe(stalled);
 now+=2000;layer.update(view,field,start+windup/2,0);expect(phase()).toBe(stalled);
 expect(states.mock.calls.filter(([s])=>s==='cast')).toHaveLength(0);
 // Native casting disappears on resolution; render the release pose at that tick.
 delete hero.unit!.casting;layer.update(view,field,release);
 expect(player.state).toBe('cast');expect(phase()).toBeCloseTo(.68);
 layer.update(view,field,release+2);expect(phase()).toBeGreaterThan(.68);
 hero.unit!.moving=true;layer.update(view,field,release+3);expect(player.state).toBe('run');
 hero.unit!.moving=false;layer.update(view,field,release+4);expect(player.state).toBe('idle');
 // A late observation seeks into the same timeline rather than restarting windup.
 hero.unit!.casting={ability:'spell.marshal.faultline',startTick:200,resolveTick:200+windup};
 layer.update(view,field,200+windup/2);expect(phase()).toBeCloseTo(.34);
 // Stop/turning after a replacement command has no translation yet.
 delete hero.unit!.casting;layer.update(view,field,200+windup/2+1);expect(player.state).toBe('idle');
 // An uninterrupted cast recovers fully, including after a catch-up observation.
 hero.unit!.casting={ability:'spell.marshal.faultline',startTick:300,resolveTick:300+windup};
 layer.update(view,field,300);delete hero.unit!.casting;
 layer.update(view,field,300+windup);expect(phase()).toBeCloseTo(.68);
 layer.update(view,field,400+windup);expect(player.state).toBe('idle');
 expect(simulation.checksum()).toBe(checksum);layer.destroy(scene);
});


it('launches an actual archer projectile from its posed bow socket after world transforms',async()=>{
 const bytes=readFileSync('assets/models/units/ants/archer/model.glb');
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 vi.spyOn(GLTFLoader.prototype,'loadAsync').mockImplementation(async url=>url.includes('units/ants/archer/model.glb')?gltf:{scene:new Group(),animations:[]} as any);
 const scene=new Scene(),layer=new SettlementLayer(scene),field=new HeightField();await layer.ready;
 const view=structuredClone(game().view()),archer=view.entities.find(e=>e.definition==='unit.ants.warrior')!;
 archer.definition='unit.ants.archer';archer.rotation=137;archer.x=100;archer.y=101;archer.unit!.moving=false;
 archer.unit!.attack={target:99,started:100,impact:110,ends:120,cycleTicks:40,released:true};
 view.entities=[archer];view.missiles=[{id:1,source:archer.id,target:99,definition:archer.definition,owner:archer.owner,origin:{x:100,y:101},destination:{x:108,y:102},launched:110,impact:130,damage:10,damageType:'piercing',viewers:['player.1'],resolved:false}];
 layer.update(view,field,110);
 const ant=(layer as any).characters.get(archer.id),bow=ant.root.getObjectByName('socket_handL').getWorldPosition(new Vector3());
 expect(ant.player.state).toBe('attack');expect(ant.player.action.time/ant.player.action.getClip().duration).toBeCloseTo(.65);
 const mesh=(layer as any).projectiles.root.getObjectByName('projectiles.arrow') as InstancedMesh,matrix=new Matrix4();mesh.getMatrixAt(0,matrix);
 expect(new Vector3().setFromMatrixPosition(matrix).distanceTo(bow)).toBeLessThan(.00001);
 expect(bow.distanceTo(new Vector3(100,field.walkSample(100,101)+1.5,101))).toBeGreaterThan(.2);
 view.entities=[];layer.update(view,field,120);mesh.getMatrixAt(0,matrix);
 expect(new Vector3().setFromMatrixPosition(matrix).x).toBeCloseTo((bow.x+108)/2,4);
 layer.destroy(scene);
});
