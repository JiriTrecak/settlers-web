/**
 * Iso diamond minimap. Own WebGL context — points for stamps, drag looks the camera.
 */
import { OrthographicCamera, Plane, Ray, Vector3 } from "three";
import { MAP_SIZE, type MapStamp } from "../../shared";
import type { Camera } from "../camera/camera";

const PX = 176;
const DOT = 3.5;
const LAND = [0.14, 0.16, 0.18] as const;
const VIEW = [0.95, 0.93, 0.88] as const;

const VERT = `
attribute vec2 a_cell;
attribute vec3 a_color;
uniform float u_size;
uniform float u_dot;
varying vec3 v_color;
void main() {
  float nx = (a_cell.x / u_size) * 2.0 - 1.0;
  float nz = (a_cell.y / u_size) * 2.0 - 1.0;
  gl_Position = vec4((nx - nz) * 0.5, (nx + nz) * 0.5, 0.0, 1.0);
  gl_PointSize = u_dot;
  v_color = a_color;
}
`;

const FRAG = `
precision mediump float;
varying vec3 v_color;
void main() {
  gl_FragColor = vec4(v_color, 1.0);
}
`;

export function worldToNdc(x: number, z: number, size: number): [number, number] {
  const nx = (x / size) * 2 - 1;
  const nz = (z / size) * 2 - 1;
  return [(nx - nz) * 0.5, (nx + nz) * 0.5];
}

export function ndcToWorld(ndcX: number, ndcY: number, size: number): [number, number] {
  return [((ndcX + ndcY + 1) * 0.5) * size, ((ndcY - ndcX + 1) * 0.5) * size];
}

export class Minimap {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly program: WebGLProgram;
  private readonly stampsBuf: WebGLBuffer;
  private readonly lineBuf: WebGLBuffer;
  private readonly uSize: WebGLUniformLocation;
  private readonly uDot: WebGLUniformLocation;
  private readonly aCell: number;
  private readonly aColor: number;
  private readonly viewCam = new OrthographicCamera();
  private readonly ground = new Plane(new Vector3(0, 1, 0), 0);
  private readonly ray = new Ray();
  private readonly hit = new Vector3();
  private readonly a = new Vector3();
  private readonly b = new Vector3();
  private count = 0;
  private dragging = false;
  private readonly onDown: (e: PointerEvent) => void;
  private readonly onMove: (e: PointerEvent) => void;
  private readonly onUp: (e: PointerEvent) => void;

  constructor(
    host: HTMLElement,
    private readonly spec: {
      camera: Camera;
      size?: number;
      aspect: () => number;
      onLookAt: (x: number, z: number) => void;
    },
  ) {
    this.root = document.createElement("div");
    this.root.className =
      "pointer-events-auto absolute top-4 right-4 z-10 h-44 w-44 cursor-grab touch-none bg-black p-px [clip-path:polygon(50%_0%,100%_50%,50%_100%,0%_50%)]";
    this.root.setAttribute("aria-label", "Minimap");
    this.canvas = document.createElement("canvas");
    this.canvas.className = "block h-full w-full";
    this.root.append(this.canvas);
    host.append(this.root);
    const gl = this.canvas.getContext("webgl", { alpha: false, antialias: false, depth: false });
    if (!gl) throw new Error("minimap: WebGL unavailable");
    this.gl = gl;
    this.program = compile(gl, VERT, FRAG);
    this.uSize = gl.getUniformLocation(this.program, "u_size")!;
    this.uDot = gl.getUniformLocation(this.program, "u_dot")!;
    this.aCell = gl.getAttribLocation(this.program, "a_cell");
    this.aColor = gl.getAttribLocation(this.program, "a_color");
    this.stampsBuf = gl.createBuffer()!;
    this.lineBuf = gl.createBuffer()!;
    this.syncSize();
    this.onDown = (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.root.style.cursor = "grabbing";
      this.root.setPointerCapture(e.pointerId);
      this.scrub(e);
    };
    this.onMove = (e) => {
      if (this.dragging) this.scrub(e);
    };
    this.onUp = (e) => {
      this.dragging = false;
      this.root.style.cursor = "grab";
      if (this.root.hasPointerCapture(e.pointerId)) this.root.releasePointerCapture(e.pointerId);
    };
    this.root.addEventListener("pointerdown", this.onDown);
    this.root.addEventListener("pointermove", this.onMove);
    this.root.addEventListener("pointerup", this.onUp);
    this.root.addEventListener("pointercancel", this.onUp);
    this.paint();
  }

  setStamps(stamps: readonly MapStamp[]): void {
    const data = new Float32Array(stamps.length * 5);
    let i = 0;
    for (const s of stamps) {
      const [r, g, b] = tint(s.asset);
      data[i++] = s.x + 0.5;
      data[i++] = s.y + 0.5;
      data[i++] = r;
      data[i++] = g;
      data[i++] = b;
    }
    this.count = stamps.length;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.stampsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
  }

  paint(): void {
    this.syncSize();
    const gl = this.gl;
    const size = this.spec.size ?? MAP_SIZE;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(LAND[0], LAND[1], LAND[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniform1f(this.uSize, size);
    gl.uniform1f(this.uDot, DOT * (this.canvas.width / PX));
    if (this.count > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.stampsBuf);
      gl.enableVertexAttribArray(this.aCell);
      gl.vertexAttribPointer(this.aCell, 2, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(this.aColor);
      gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 20, 8);
      gl.drawArrays(gl.POINTS, 0, this.count);
    }
    this.drawView();
  }

  destroy(): void {
    this.root.removeEventListener("pointerdown", this.onDown);
    this.root.removeEventListener("pointermove", this.onMove);
    this.root.removeEventListener("pointerup", this.onUp);
    this.root.removeEventListener("pointercancel", this.onUp);
    this.gl.deleteBuffer(this.stampsBuf);
    this.gl.deleteBuffer(this.lineBuf);
    this.gl.deleteProgram(this.program);
    this.root.remove();
  }

  private scrub(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const size = this.spec.size ?? MAP_SIZE;
    const [x, z] = ndcToWorld(ndcX, ndcY, size);
    const max = size - 0.01;
    this.spec.onLookAt(clamp(x, 0, max), clamp(z, 0, max));
  }

  private drawView(): void {
    const corners = this.viewCorners();
    const data = new Float32Array(4 * 5);
    let i = 0;
    for (const c of corners) {
      data[i++] = c.x;
      data[i++] = c.z;
      data[i++] = VIEW[0];
      data[i++] = VIEW[1];
      data[i++] = VIEW[2];
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.aCell);
    gl.vertexAttribPointer(this.aCell, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 3, gl.FLOAT, false, 20, 8);
    gl.drawArrays(gl.LINE_LOOP, 0, 4);
  }

  private viewCorners(): { x: number; z: number }[] {
    const aspect = Math.max(0.2, this.spec.aspect());
    this.spec.camera.applyTo(this.viewCam, aspect, 1);
    this.viewCam.updateMatrixWorld();
    const ndc = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const;
    const out: { x: number; z: number }[] = [];
    for (const [x, y] of ndc) {
      this.a.set(x, y, -1).unproject(this.viewCam);
      this.b.set(x, y, 1).unproject(this.viewCam).sub(this.a).normalize();
      this.ray.set(this.a, this.b);
      if (this.ray.intersectPlane(this.ground, this.hit)) out.push({ x: this.hit.x, z: this.hit.z });
      else out.push({ x: this.spec.camera.targetX, z: this.spec.camera.targetZ });
    }
    return out;
  }

  private syncSize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, (this.canvas.clientWidth || PX) * dpr);
    const h = Math.max(1, (this.canvas.clientHeight || PX) * dpr);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
  }
}

function tint(id: string): [number, number, number] {
  if (id === "pine") return [0.42, 0.78, 0.16];
  if (id === "boulder") return [0.78, 0.72, 0.42];
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return [0.35 + ((h >>> 16) & 255) / 800, 0.55 + ((h >>> 8) & 255) / 900, 0.22 + (h & 255) / 700];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function compile(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
  const vs = shader(gl, gl.VERTEX_SHADER, vert);
  const fs = shader(gl, gl.FRAGMENT_SHADER, frag);
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "minimap link");
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function shader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "minimap shader");
  return s;
}
