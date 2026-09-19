import {GpuTimings} from './gpuTimings';
import {AtmospherePass,type AtmosphereFrame} from '../atmosphere/atmospherePass';
import {SHADOW_KEY,SHADOWS_CHANGED,readShadowMode} from '../../shared/settings/graphics';
import {RESOLUTION_KEY,GRAPHICS_CHANGED,readResolutionScale,renderPixelRatio,type ResolutionScale} from '../../shared/settings/graphics';
import {perf} from '../../debug/performance';
/**
 * Canvas + WebGLRenderer. GameApp owns the canvas for the page lifetime;
 * each match builds a Renderer on it. Shadows on. Output is sRGB.
 */
import { ACESFilmicToneMapping, PCFShadowMap, VSMShadowMap, SRGBColorSpace, WebGLRenderer, type Camera, type Scene } from "three";

export class Display {
  readonly gl: WebGLRenderer;
  private atmosphere:AtmospherePass|null=null;
  private readonly gpu:GpuTimings;
  private scale=readResolutionScale();
  private readonly graphicsChanged=(e:Event)=>{if(e instanceof StorageEvent&&e.key&&e.key!==RESOLUTION_KEY)return;if(e instanceof CustomEvent)this.scale=e.detail as ResolutionScale;else this.scale=readResolutionScale();this.onResize();};
  private readonly shadowsChanged=(event:Event)=>{
    if(event instanceof StorageEvent&&event.key&&event.key!==SHADOW_KEY)return;
    this.applyShadows();
    this.onResize();
  };
  private applyShadows():void {
    const mode=readShadowMode();
    this.gl.shadowMap.enabled=mode!=='off';
    this.gl.shadowMap.type=mode==='soft'?VSMShadowMap:PCFShadowMap;
    this.gl.shadowMap.needsUpdate=true;
  }
  private readonly onResize: () => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    onResize?: () => void,
  ) {
    this.gl = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.gl.info.autoReset=false;
    perf.attach();
    this.gpu=new GpuTimings(this.gl.getContext() as WebGL2RenderingContext);
    this.gl.setClearColor(0x1a2430, 1);
    this.gl.outputColorSpace = SRGBColorSpace;
    this.gl.toneMapping = ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.15;
    this.gl.setPixelRatio(renderPixelRatio(this.scale,window.devicePixelRatio));
    this.applyShadows();
    this.onResize = () => {
      this.syncSize();
      onResize?.();
    };
    this.syncSize();
    window.addEventListener("resize", this.onResize);
    window.addEventListener(SHADOWS_CHANGED,this.shadowsChanged);
    window.addEventListener("storage",this.shadowsChanged);
    window.addEventListener(GRAPHICS_CHANGED,this.graphicsChanged);
    window.addEventListener("storage",this.graphicsChanged);
  }

  get width(): number {
    return Math.max(1, this.canvas.clientWidth | 0);
  }

  get height(): number {
    return Math.max(1, this.canvas.clientHeight | 0);
  }

  syncSize(): void {
    this.gl.setPixelRatio(renderPixelRatio(this.scale,window.devicePixelRatio));
    this.gl.setSize(this.width, this.height, false);
  }

  render(scene: Scene, camera: Camera, after?:()=>void, atmosphere?:AtmosphereFrame): void {
    // Hidden multiplayer tabs keep simulating, but need no GPU presentation.
    if(document.hidden)return;
    this.gpu.begin();
    const start=perf.start();
    this.gl.info.reset();
    perf.resetCounts();
    try{
      this.drawWorld(scene,camera,atmosphere,(label,draw)=>this.gpu.measure(label,draw));
      if(after)this.gpu.measure('GPU portrait',after);
    }finally{this.gpu.end();}
    perf.finishCounts();
    perf.end('WebGL submit (CPU)',start);
    if(perf.enabled){
      perf.value('Shadows',readShadowMode());
      perf.value('GPU timer',this.gpu.supported?'Supported':'Unavailable in this browser');
      perf.value('Draw calls',this.gl.info.render.calls);perf.value('Triangles (all passes)',this.gl.info.render.triangles.toLocaleString());
      perf.value('Textures',this.gl.info.memory.textures);perf.value('Geometries',this.gl.info.memory.geometries);
      perf.value('Canvas',`${this.canvas.width} × ${this.canvas.height} @ ${this.gl.getPixelRatio()} DPR`);

    }
  }

  /** Also used by editor captures; the caller owns the destination target. */
  drawWorld(scene:Scene,camera:Camera,atmosphere?:AtmosphereFrame,measure:(label:string,draw:()=>void)=>void=(_,draw)=>draw()){
    // Imported HDR multipliers stay literal; exposure is the renderer adapter,
    // shared by every phase, never an automatic day/night brightness correction.
    const exposure=this.gl.toneMappingExposure;
    if(atmosphere?.daytime)this.gl.toneMappingExposure=.28;
    try {
    if(atmosphere?.settings?.enabled||atmosphere?.daytime){this.atmosphere??=new AtmospherePass();this.atmosphere.render(this.gl,scene,camera,atmosphere,measure);}
    else {perf.value('Atmosphere','Off');perf.sample('GPU atmosphere',0);perf.sample('Atmosphere submit (CPU)',0);measure('GPU scene',()=>this.gl.render(scene,camera));}
    }finally{this.gl.toneMappingExposure=exposure;}
  }

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener(SHADOWS_CHANGED,this.shadowsChanged);
    window.removeEventListener("storage",this.shadowsChanged);
    window.removeEventListener(GRAPHICS_CHANGED,this.graphicsChanged);
    window.removeEventListener("storage",this.graphicsChanged);
    this.gpu.dispose();
    perf.detach();
    this.atmosphere?.dispose();
    this.gl.dispose();
  }
}
