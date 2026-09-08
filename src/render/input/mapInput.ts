/**
 * RTS drag selection, arrow-key pan and wheel zoom. Editor also orbits (Alt-LMB, MMB, RMB).
 * Play leaves `orbit` off so the perspective stays fixed. Home / Gamecam is an editor hook.
 */
import type { Camera } from "../camera/camera";

const PAN_SPEED = 28;
const CLICK_PX = 5;
const EDGE_PX = 20; // CSS pixels: independent of render resolution / Retina scale.

export type MapInputHooks = {
  onChanged(): void;
  onClick?(clientX: number, clientY: number, shift: boolean): void;
  onRightClick?(clientX: number, clientY: number): void;
  rts?: boolean;
  onSelectArea?(rect: {left:number;top:number;right:number;bottom:number}, shift:boolean): void;
  onHome?: () => void;
  /** Editor brush / clean. LMB paints or wipes; Shift erases the mask; Shift/Ctrl+wheel tweak. */
  paint?: {
    on(): boolean;
    hover(clientX: number, clientY: number): void;
    stroke(clientX: number, clientY: number, erase: boolean): void;
    beginStroke(): void;
    endStroke?(): void;
    sizeBy(steps: number): void;
    densityBy(steps: number): void;
  };
  /** Select tool. LMB on a stamp grabs; Shift-drag / Shift+wheel yaws. */
  grab?: {
    on(): boolean;
    down(clientX: number, clientY: number, shift: boolean): boolean;
    move(clientX: number, clientY: number): void;
    up(): void;
    rotateBy(steps: number): void;
  };
};

type Drag = "command" | "select" | "pan" | "orbit" | "stroke" | "grab";

export class MapInput {
  private startX=0;
  private startY=0;
  private readonly selectionBox=document.createElement('div');
  private edgePointer: { x: number; y: number } | null = null;
  private readonly onEdgePointer = (e: PointerEvent) => {
    this.edgePointer = e.pointerType === "touch" ? null : { x: e.clientX, y: e.clientY };
  };
  private readonly onPointerOut = (e: PointerEvent) => {
    if (!e.relatedTarget) this.edgePointer = null;
  };
  private readonly onBlur=()=>{this.keys.clear();this.edgePointer=null;this.drag=null;this.selectionBox.hidden=true;};
  private readonly onContext=(e:Event)=>e.preventDefault();
  private readonly keys = new Set<string>();
  private drag: Drag | null = null;
  private moved = 0;
  private lastX = 0;
  private lastY = 0;
  private readonly orbit: boolean;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;
  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: (e: PointerEvent) => void;
  private readonly onPointerCancel: (e: PointerEvent) => void;
  private readonly onWheel: (e: WheelEvent) => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly camera: Camera,
    private readonly hooks: MapInputHooks & { orbit?: boolean },
  ) {
    this.orbit = hooks.orbit === true;
    Object.assign(this.selectionBox.style,{position:'fixed',border:'1px solid #d8efb0',background:'#b9df8030',pointerEvents:'none',zIndex:'50'});
    this.selectionBox.className='rts-selection-box';this.selectionBox.hidden=true;
    if(hooks.rts)document.body.append(this.selectionBox);
    this.onKeyDown = (e) => {
      if (typing(e)) return;
      if (e.code === "Space") {
        e.preventDefault();
        this.keys.add(" ");
        return;
      }
      if (e.key === "Home" && (this.orbit || this.hooks.onHome)) {
        e.preventDefault();
        if (this.hooks.onHome) this.hooks.onHome();
        else {
          this.camera.resetView();
          this.hooks.onChanged();
        }
        return;
      }
      if(e.key.startsWith("Arrow"))e.preventDefault();
      this.keys.add(e.key.toLowerCase());
    };
    this.onKeyUp = (e) => {
      if (e.code === "Space") this.keys.delete(" ");
      this.keys.delete(e.key.toLowerCase());
    };
    this.onPointerDown = (e) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      if (this.hooks.rts && e.button === 2) {
        this.drag = "command";
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      if(this.hooks.rts && e.button===0 && !this.keys.has(' ')){
        this.drag='select';this.startX=e.clientX;this.startY=e.clientY;this.moved=0;
        this.canvas.setPointerCapture(e.pointerId);return;
      }
      const paint = this.hooks.paint;
      const grab = this.hooks.grab;
      if (paint?.on() && e.button === 0 && !e.altKey && !this.keys.has(" ")) {
        this.drag = "stroke";
        this.moved = 0;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        paint.beginStroke();
        paint.stroke(e.clientX, e.clientY, e.shiftKey);
        this.canvas.setPointerCapture(e.pointerId);
        this.hooks.onChanged();
        return;
      }
      if (grab?.on() && e.button === 0 && !e.altKey && !this.keys.has(" ")) {
        this.moved = 0;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        if (grab.down(e.clientX, e.clientY, e.shiftKey)) {
          this.drag = "grab";
          this.canvas.setPointerCapture(e.pointerId);
          this.hooks.onChanged();
          return;
        }
      }
      this.drag = this.orbit && !this.camera.locked && (e.button === 1 || e.button === 2 || e.altKey) ? "orbit" : "pan";
      this.moved = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    };
    this.onPointerMove = (e) => {
      if (!this.drag) {
        if (this.hooks.paint?.on()) this.hooks.paint.hover(e.clientX, e.clientY);
        return;
      }
      if (this.drag === "command") return;
      if(this.drag==='select'){
        this.moved=Math.hypot(e.clientX-this.startX,e.clientY-this.startY);
        this.selectionBox.hidden=this.moved<CLICK_PX;
        Object.assign(this.selectionBox.style,{left:Math.min(this.startX,e.clientX)+'px',top:Math.min(this.startY,e.clientY)+'px',width:Math.abs(e.clientX-this.startX)+'px',height:Math.abs(e.clientY-this.startY)+'px'});
        return;
      }
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.moved += Math.hypot(dx, dy);
      if (this.drag === "stroke") this.hooks.paint?.stroke(e.clientX, e.clientY, e.shiftKey);
      else if (this.drag === "grab") this.hooks.grab?.move(e.clientX, e.clientY);
      else if (this.drag === "orbit") this.camera.orbitScreen(dx, dy);
      else this.camera.panScreen(dx, dy, this.canvas.clientHeight);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      this.hooks.onChanged();
    };
    this.onPointerUp = (e) => {
      if (this.drag === "command") {
        if (e.button !== 2) return;
        this.drag = null;
        if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
        this.hooks.onRightClick?.(e.clientX, e.clientY);
        return;
      }
      if(this.drag==='select'){
        this.drag=null;this.selectionBox.hidden=true;
        if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);
        if(this.moved<CLICK_PX)this.hooks.onClick?.(e.clientX,e.clientY,e.shiftKey);
        else this.hooks.onSelectArea?.({left:Math.min(this.startX,e.clientX),top:Math.min(this.startY,e.clientY),right:Math.max(this.startX,e.clientX),bottom:Math.max(this.startY,e.clientY)},e.shiftKey);
        return;
      }
      const stroking = this.drag === "stroke";
      const grabbing = this.drag === "grab";
      const clicked = this.drag === "pan" && e.button === 0 && this.moved < CLICK_PX;
      this.drag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (stroking) this.hooks.paint?.endStroke?.();
      if (grabbing) this.hooks.grab?.up();
      if (clicked) this.hooks.onClick?.(e.clientX, e.clientY, e.shiftKey);
    };
    this.onPointerCancel = (e) => {
      this.selectionBox.hidden=true;
      const stroking = this.drag === "stroke";
      const grabbing = this.drag === "grab";
      this.drag = null;
      if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
      if (stroking) this.hooks.paint?.endStroke?.();
      if (grabbing) this.hooks.grab?.up();
    };
    this.onWheel = (e) => {
      e.preventDefault();
      const paint = this.hooks.paint;
      const steps = e.deltaY > 0 ? -1 : 1;
      if (this.hooks.grab?.on() && e.shiftKey) {
        this.hooks.grab.rotateBy(steps);
        this.hooks.onChanged();
        return;
      }
      if (paint?.on() && e.shiftKey) {
        paint.sizeBy(steps);
        this.hooks.onChanged();
        return;
      }
      if (paint?.on() && (e.ctrlKey || e.metaKey)) {
        paint.densityBy(steps);
        this.hooks.onChanged();
        return;
      }
      this.camera.zoomBy(e.deltaY > 0 ? 1.1 : 1 / 1.1);
      this.hooks.onChanged();
    };
    window.addEventListener("blur",this.onBlur);
    if (hooks.rts) {
      // Track the whole viewport so HUD overlays do not create holes in the edge band.
      window.addEventListener("pointermove", this.onEdgePointer);
      window.addEventListener("pointerout", this.onPointerOut);
    }
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.canvas.addEventListener("pointermove", this.onPointerMove);
    this.canvas.addEventListener("pointerup", this.onPointerUp);
    this.canvas.addEventListener("pointercancel", this.onPointerCancel);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.onContext);
  }

  tick(dtMs: number): void {
    const step = (PAN_SPEED * Math.min(dtMs,50)) / 1000;
    let right = 0;
    let forward = 0;
    if (this.keys.has("arrowleft")) right -= 1;
    if (this.keys.has("arrowright")) right += 1;
    if (this.keys.has("arrowup")) forward += 1;
    if (this.keys.has("arrowdown")) forward -= 1;
    if (this.hooks.rts && this.edgePointer) {
      if (document.hidden || !document.hasFocus() || document.querySelector("dialog[open]")) {
        this.edgePointer = null;
      } else if (!this.drag || this.drag === "select") {
        const { x, y } = this.edgePointer;
        const bounds = this.canvas.getBoundingClientRect();
        if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
          if (x < bounds.left + EDGE_PX) right -= 1;
          if (x > bounds.right - EDGE_PX) right += 1;
          if (y < bounds.top + EDGE_PX) forward += 1;
          if (y > bounds.bottom - EDGE_PX) forward -= 1;
        }
      }
    }
    if (!right && !forward) return;
    const length=Math.hypot(right,forward);
    this.camera.panWorld(right / length * step, forward / length * step);
    this.hooks.onChanged();
  }

  destroy(): void {
    this.selectionBox.remove();
    window.removeEventListener("blur",this.onBlur);
    window.removeEventListener("pointermove", this.onEdgePointer);
    window.removeEventListener("pointerout", this.onPointerOut);
    this.canvas.removeEventListener("contextmenu",this.onContext);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel);
    this.canvas.removeEventListener("wheel", this.onWheel);
  }
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target;
  return t instanceof HTMLElement && (t.matches('input,textarea,select') || t.isContentEditable || !!t.closest('dialog[open]'));
}
