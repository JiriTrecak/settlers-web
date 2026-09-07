/**
 * Canvas + WebGLRenderer. GameApp owns the canvas for the page lifetime;
 * each match builds a Renderer on it. Shadows on. Output is sRGB.
 */
import { PCFSoftShadowMap, SRGBColorSpace, WebGLRenderer, type Camera, type Scene } from "three";

export class Display {
  readonly gl: WebGLRenderer;
  private readonly onResize: () => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    onResize?: () => void,
  ) {
    this.gl = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.gl.setClearColor(0x1a2430, 1);
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = PCFSoftShadowMap;
    this.onResize = () => {
      this.syncSize();
      onResize?.();
    };
    this.syncSize();
    window.addEventListener("resize", this.onResize);
  }

  get width(): number {
    return Math.max(1, this.canvas.clientWidth | 0);
  }

  get height(): number {
    return Math.max(1, this.canvas.clientHeight | 0);
  }

  syncSize(): void {
    this.gl.setSize(this.width, this.height, false);
  }

  render(scene: Scene, camera: Camera): void {
    this.gl.render(scene, camera);
  }

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    this.gl.dispose();
  }
}
