/**
 * Offscreen iso snapshot of a glTF. One WebGL context, cached by URL.
 */
import {
  AmbientLight,
  Box3,
  DirectionalLight,
  Mesh,
  OrthographicCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ISO_PITCH, ISO_YAW } from "../camera/camera";

const SIZE = 256;
const PAD = 1.16;

export class PreviewCache {
  private readonly gl: WebGLRenderer;
  private readonly loader = new GLTFLoader();
  private readonly shots = new Map<string, Promise<string | null>>();
  private dead = false;

  constructor() {
    this.gl = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.gl.setSize(SIZE, SIZE, false);
    this.gl.setPixelRatio(1);
    this.gl.setClearColor(0x000000, 0);
    this.gl.outputColorSpace = SRGBColorSpace;
  }

  paint(url: string, dest: HTMLImageElement): void {
    if (this.dead) return;
    const pending = this.shots.get(url) ?? this.render(url);
    this.shots.set(url, pending);
    void pending.then((src) => {
      if (!src || this.dead || !dest.isConnected) return;
      dest.src = src;
    });
  }

  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    this.shots.clear();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }

  private async render(url: string): Promise<string | null> {
    let root: Object3D | null = null;
    try {
      const gltf = await this.loader.loadAsync(url);
      if (this.dead) return null;
      root = gltf.scene;
      const box = new Box3().setFromObject(root);
      if (box.isEmpty()) return null;
      const center = box.getCenter(new Vector3());
      const span = box.getSize(new Vector3());
      const dist = Math.max(span.length(), 0.4) * 2.4;
      const cosP = Math.cos(ISO_PITCH);
      const dir = new Vector3(Math.sin(ISO_YAW) * cosP, Math.sin(ISO_PITCH), Math.cos(ISO_YAW) * cosP);
      const scene = new Scene();
      scene.add(new AmbientLight(0x8aa0b8, 0.45));
      const sun = new DirectionalLight(0xfff2d6, 2.2);
      sun.position.copy(center).addScaledVector(dir, 6).add(new Vector3(-3, 5, 1));
      sun.target.position.copy(center);
      scene.add(sun);
      scene.add(sun.target);
      scene.add(root);
      const cam = new OrthographicCamera();
      cam.position.copy(center).addScaledVector(dir, dist);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      fitIso(cam, box, dist + span.length() * 2);
      this.gl.render(scene, cam);
      if (this.dead) return null;
      return this.gl.domElement.toDataURL("image/png");
    } catch {
      return null;
    } finally {
      if (root) disposeTree(root);
    }
  }
}

/** Square ortho frustum from the AABB in camera space — tall props don't get letterboxed. */
function fitIso(cam: OrthographicCamera, box: Box3, far: number): void {
  const inv = cam.matrixWorldInverse;
  const p = new Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        p.set(x, y, z).applyMatrix4(inv);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  const half = Math.max(maxX - minX, maxY - minY, 0.01) * 0.5 * PAD;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0.1;
  cam.far = Math.max(far, 4);
  cam.updateProjectionMatrix();
}

function disposeTree(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) mat.dispose();
  });
}
