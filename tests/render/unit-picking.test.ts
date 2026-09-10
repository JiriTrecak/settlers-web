import { expect, it } from "vitest";
import { OrthographicCamera, Vector3 } from "three";
import { pickUnitBody } from "../../src/render/settlement/unitPicking";

it("selects beside a small body without pixel hunting, rejects far clicks and chooses the nearest crowd member", () => {
  const camera = new OrthographicCamera(-20, 20, 20, -20, .1, 100);
  camera.position.set(0, 30, 30); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const viewport = {left: 0, top: 0, width: 800, height: 800};
  const body = {id: 1, position: new Vector3(), height: 2};
  const midpoint = new Vector3(0, 1, 0).project(camera);
  const y = (1 - midpoint.y) * 400;
  expect(pickUnitBody([body], camera, viewport, 412, y)).toBe(1);
  expect(pickUnitBody([body], camera, viewport, 440, y)).toBeNull();
  const other = {...body, id: 2, position: new Vector3(1, 0, 0)};
  expect(pickUnitBody([body, other], camera, viewport, 418, y)).toBe(2);
  expect(pickUnitBody([other, body], camera, viewport, 402, y)).toBe(1);
  expect(pickUnitBody([], camera, viewport, 400, y)).toBeNull();
});
