/**
 * Lit ground plane + line grid for a square map. Cell = 1 world unit.
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
} from "three";

export function addSunAndGrid(scene: Scene, size: number): void {
  scene.background = new Color(0x1a2430);
  scene.add(new AmbientLight(0x8aa0b8, 0.45));

  const sun = new DirectionalLight(0xfff2d6, 2.2);
  sun.position.set(size * 0.35, size * 0.55, size * 0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const extent = size * 0.6;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = size * 2;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  sun.target.position.set(size / 2, 0, size / 2);

  const ground = new Mesh(
    new PlaneGeometry(size, size),
    new MeshStandardMaterial({ color: 0x3d5340, roughness: 0.92, metalness: 0.02 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(size / 2, 0, size / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const helper = new GridHelper(size, size, 0x2a382c, 0x2f4033);
  helper.position.set(size / 2, 0.02, size / 2);
  scene.add(helper);
}
