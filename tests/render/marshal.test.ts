import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SkinnedMesh, Vector3 } from "three";
import { createCharacterInstance, type AntState } from "../../src/render/characters/character-player.js";
import { game } from "../game/helpers";

it("loads the actual marshal rig and all declared poses, including mace and cast",async()=>{
  const bytes=readFileSync("assets/ant-colony/characters/marshal.glb");
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
  const a=createCharacterInstance(gltf,"marshal"), b=createCharacterInstance(gltf,"marshal");
  let triangles=0;
  a.root.traverse(o=>{if(o instanceof SkinnedMesh) triangles+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3;});
  expect(triangles).toBe(6512);
  const hand=a.root.getObjectByName("handR")!;expect(hand).toBeTruthy();
  a.root.updateMatrixWorld(true);const before=hand.getWorldPosition(new Vector3());
  for(const state of ["idle","walk","run","carry","attack","cast","hit","death"] as AntState[]) {
    a.player.setState(state,{restart:true});a.player.seek(.4);a.root.updateMatrixWorld(true);
    a.root.traverse(o=>expect(o.matrixWorld.elements.every(Number.isFinite)).toBe(true));
  }
  a.player.setState("attack");a.player.seek(.35);a.root.updateMatrixWorld(true);
  expect(hand.getWorldPosition(new Vector3()).distanceTo(before)).toBeGreaterThan(.3);
  const events:string[]=[];a.player.onEvent=e=>events.push(e.type);
  a.player.setState("attack",{restart:true});a.player.update(2);expect(events).toEqual(["hit"]);
  a.player.setState("cast");a.player.update(3);expect(a.player.state).toBe("idle");expect(events).toEqual(["hit"]);
  a.player.setTeamColor("#2878df");expect(b.player.state).toBe("idle");
  a.dispose();b.dispose();
});

it("starts each player with one stronger, level-one hero",()=>{
  const g=game(),heroes=g.entities.filter(e=>g.registry.get(e.definition).hero);
  expect(heroes).toHaveLength(2);
  for(const hero of heroes){expect(hero.progression?.experience).toBe(0);expect(g.context.stats(hero).level).toBe(1);expect(g.context.stats(hero).damage).toBeGreaterThan(g.registry.get("unit.ants.warrior").behaviors.combat!.damage*2);}
});
