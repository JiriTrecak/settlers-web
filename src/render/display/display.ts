import {GpuTimings} from './gpuTimings';
import {ShaderDiagnostics} from './shaderDiagnostics';
import {measureWebGLSubmission} from '../../debug/webglSubmission';
import {AtmospherePass,type AtmosphereFrame} from '../atmosphere/atmospherePass';
import {SHADOW_KEY,SHADOWS_CHANGED,readShadowMode} from '../../shared/settings/graphics';
import {RESOLUTION_KEY,GRAPHICS_CHANGED,readResolutionScale,renderPixelRatio,type ResolutionScale} from '../../shared/settings/graphics';
import {perf} from '../../debug/performance';
import {drawCensus} from '../../debug/drawCensus';
/**
 * Canvas + WebGLRenderer. GameApp owns the canvas for the page lifetime;
 * each match builds a Renderer on it. Shadows on. Output is sRGB.
 */
import { ACESFilmicToneMapping, PCFShadowMap, VSMShadowMap, SRGBColorSpace, WebGLRenderer, type Camera, type Scene } from "three";

export class Display {
  readonly gl: WebGLRenderer;
  private atmosphere:AtmospherePass|null=null;
  private readonly gpu:GpuTimings;
  private readonly shaders:ShaderDiagnostics;
  private scale=readResolutionScale();
  private programs=-1;
  private programChanges=0;
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
    // No canvas MSAA: every biome renders through the atmosphere pass, whose composite overwrites
    // the whole canvas with its own FXAA. A 4× multisampled 3200 × 1800 backbuffer only added a
    // store + resolve per frame (~117 → 147 fps). The portrait antialiases in its own target.
    this.gl = new WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.gl.debug.checkShaderErrors=false;
    this.shaders=new ShaderDiagnostics(this.gl.getContext());
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
    // Hidden/collapsed views keep simulating, but need no GPU presentation.
    // Embedded browser panels can have zero layout size while document.hidden
    // remains false; clamping the render target to 1px must not render a world.
    if(document.hidden||this.canvas.clientWidth<=0||this.canvas.clientHeight<=0)return;
    this.gpu.begin();
    const start=perf.start();
    this.gl.info.reset();
    perf.resetCounts();
    try{
      const draw=()=>this.drawWorld(scene,camera,atmosphere,(label,pass)=>this.gpu.measure(label,pass));
      if(perf.capturingSync)measureWebGLSubmission(this.gl.getContext(),draw);
      else if(perf.takeCensus()&&'isScene' in scene)perf.setCensus(drawCensus(scene,draw));else draw();
      if(after)this.gpu.measure('GPU portrait',after);
    }finally{this.gpu.end();}
    perf.finishCounts();
    perf.end('WebGL submit (CPU)',start);
    if(perf.enabled){
      perf.value('Shadows',readShadowMode());
      perf.value('GPU timer',this.gpu.supported?'Supported':'Unavailable in this browser');
      perf.value('Draw calls',this.gl.info.render.calls);perf.value('Triangles (all passes)',this.gl.info.render.triangles.toLocaleString());
      perf.value('Textures',this.gl.info.memory.textures);perf.value('Geometries',this.gl.info.memory.geometries);
      // A rising count during play means materials are recompiling (a hitch each time).
      const programs=this.gl.info.programs?.length??0;if(programs!==this.programs){if(this.programs>=0)this.programChanges++;this.programs=programs;}
      perf.value('Shader programs',programs);perf.value('Shader program changes (since debug on)',this.programChanges);
      perf.value('Canvas',`${this.canvas.width} × ${this.canvas.height} @ ${this.gl.getPixelRatio()} DPR`);

    }
  }

  /** The atmosphere pass draws the scene into a linear target (no tone mapping); otherwise it goes
   * straight to the canvas in sRGB + ACES. Programs differ between the two, so warm-up must match. */
  sceneOffscreen(atmosphere?:AtmosphereFrame):atmosphere is AtmosphereFrame{return !!(atmosphere?.settings?.enabled||atmosphere?.daytime||atmosphere?.postProcessing||atmosphere?.canopy||atmosphere?.depthOfField);}
  /** Also used by editor captures; the caller owns the destination target. */
  drawWorld(scene:Scene,camera:Camera,atmosphere?:AtmosphereFrame,measure:(label:string,draw:()=>void)=>void=(_,draw)=>draw()){
    // Imported HDR multipliers stay literal; exposure is the renderer adapter,
    // shared by every phase, never an automatic day/night brightness correction.
    const exposure=this.gl.toneMappingExposure;
    if(atmosphere?.daytime)this.gl.toneMappingExposure=.28;
    try {
    if(this.sceneOffscreen(atmosphere)){this.atmosphere??=new AtmospherePass();this.atmosphere.render(this.gl,scene,camera,atmosphere,measure);}
    else {perf.value('Atmosphere','Off');perf.sample('GPU atmosphere',0);perf.sample('Atmosphere submit (CPU)',0);measure('GPU scene',()=>this.gl.render(scene,camera));}
    }finally{
      this.gl.toneMappingExposure=exposure;
      this.shaders.check(this.gl.info.programs??[]);
      perf.value('Shader link failures',this.shaders.failures);
    }
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
