import {Quaternion,Euler,Vector3} from 'three';
import { describe, expect, it } from "vitest";
import { nearestStamp, stepYaw, SelectTool, withPose, wrapYaw } from "../../src/editor/select/select";

describe("select", () => {
  it("picks the nearest stamp in range", () => {
    const stamps = [
      { id: "a", asset: "pine", x: 10, y: 10 },
      { id: "b", asset: "pine", x: 12, y: 10 },
    ];
    expect(nearestStamp(stamps, 10.4, 10.4)?.id).toBe("a");
    expect(nearestStamp(stamps, 20, 20)).toBeNull();
  });

  it("moves on drag and yaws on shift-drag", () => {
    const tool = new SelectTool();
    const stamp = { id: "b", asset: "bridge-16", x: 8, y: 4, yaw: 0 };
    tool.begin(stamp, { x: 14, z: 5 }, false);
    expect(tool.drag({ x: 14, z: 5 })).toEqual({ x: 8, y: 4, yaw: 0 });
    expect(tool.drag({ x: 16, z: 6 })).toEqual({ x: 10, y: 5, yaw: 0 });
    tool.begin(stamp, { x: 10.5, z: 4.5 }, true);
    const rot = tool.drag({ x: 8.5, z: 2.5 });
    expect(rot?.x).toBe(8);
    expect(rot?.y).toBe(4);
    expect(rot?.yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it("preserves elevation and seasonal variant while transforming a stamp",()=>{
    const s={id:'a',asset:'willow',x:2,y:3,elevation:2.5,pitch:.15,roll:-.1,heightScale:.86,variant:'pink' as const};
    expect(withPose(s,4,5,0)).toEqual({...s,x:4,y:5});
  });

  it("keeps scale and drops zero yaw", () => {
    const s = { id: "a", asset: "pine", x: 1, y: 2, scale: 1.4, yaw: 0.4 };
    const next = withPose(s, 3, 4, 0);
    expect(next).toEqual({ id: "a", asset: "pine", x: 3, y: 4, scale: 1.4 });
    expect(wrapYaw(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2, 5);
  });
});

describe('rotation steps and source transforms',()=>{
  it('snaps in either direction rather than preserving an off-grid offset',()=>{
    const rad=(n:number)=>n*Math.PI/180,deg=(n:number)=>n*180/Math.PI;
    expect(deg(stepYaw(rad(13),rad(15)))).toBeCloseTo(15);
    expect(deg(stepYaw(rad(15),rad(15)))).toBeCloseTo(30);
    expect(deg(stepYaw(rad(30),rad(15)))).toBeCloseTo(45);
    expect(deg(stepYaw(rad(13),rad(-15)))).toBeCloseTo(0);
    expect(deg(stepYaw(rad(15),rad(-15)))).toBeCloseTo(0);
    expect(deg(stepYaw(0,rad(-15)))).toBeCloseTo(345);
    expect(deg(stepYaw(rad(13),rad(90)))).toBeCloseTo(90);
    expect(deg(stepYaw(rad(90),rad(90)))).toBeCloseTo(180);
    expect(deg(stepYaw(rad(91),rad(-90)))).toBeCloseTo(90);
    expect(deg(stepYaw(rad(359),rad(15)))).toBeCloseTo(0);
  });
  it('rotates the rendered quaternion and deck together, retaining tilt and height',()=>{
    const q=new Quaternion().setFromEuler(new Euler(.2,.5,-.1,'ZXY'));
    const stamp={id:'bridge',asset:'leafbound-twig-bridge',x:20,y:20,yaw:.5,sourceTransform:{height:2,quaternion:q.toArray() as [number,number,number,number]}};
    const next=withPose(stamp,21,22,1)!;
    const expected=q.clone().premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.5));
    expect(new Quaternion().fromArray(next.sourceTransform!.quaternion).angleTo(expected)).toBeCloseTo(0);
    expect(next.sourceTransform!.height).toBe(2);expect(stamp.sourceTransform.quaternion).toEqual(q.toArray());
    expect(withPose(stamp,21,22,.5)!.sourceTransform).toBe(stamp.sourceTransform);
  });
});
