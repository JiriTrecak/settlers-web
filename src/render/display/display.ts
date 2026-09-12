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
  private timer: {TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null=null;
  private queries:WebGLQuery[]=[];
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
    this.timer=this.gl.getContext().getExtension('EXT_disjoint_timer_query_webgl2');
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

  render(scene: Scene, camera: Camera, after?:()=>void): void {
    // Hidden multiplayer tabs keep simulating, but need no GPU presentation.
    if(document.hidden)return;
    const ctx=this.gl.getContext() as WebGL2RenderingContext;
    const ext=this.timer;
    if(ext&&this.queries.length){
      const disjoint=ctx.getParameter(ext.GPU_DISJOINT_EXT);
      while(this.queries.length&&(disjoint||ctx.getQueryParameter(this.queries[0]!,ctx.QUERY_RESULT_AVAILABLE))){
        const q=this.queries.shift()!;if(!disjoint)perf.sample('GPU frame',ctx.getQueryParameter(q,ctx.QUERY_RESULT)/1e6);ctx.deleteQuery(q);
      }
    }
    const q=perf.enabled&&ext&&this.queries.length<4?ctx.createQuery():null;
    if(q)ctx.beginQuery(ext!.TIME_ELAPSED_EXT,q);
    const start=perf.start();
    this.gl.info.reset();
    perf.resetCounts();
    this.gl.render(scene, camera);
    after?.();
    perf.finishCounts();
    perf.end('WebGL submit (CPU)',start);
    if(q){ctx.endQuery(ext!.TIME_ELAPSED_EXT);this.queries.push(q);}
    if(perf.enabled){
      perf.value('Shadows',readShadowMode());
      perf.value('GPU timer',ext?'Supported':'Unavailable in this browser');
      perf.value('Draw calls',this.gl.info.render.calls);perf.value('Triangles (all passes)',this.gl.info.render.triangles.toLocaleString());
      perf.value('Textures',this.gl.info.memory.textures);perf.value('Geometries',this.gl.info.memory.geometries);
      perf.value('Canvas',`${this.canvas.width} × ${this.canvas.height} @ ${this.gl.getPixelRatio()} DPR`);

    }
  }

  destroy(): void {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener(SHADOWS_CHANGED,this.shadowsChanged);
    window.removeEventListener("storage",this.shadowsChanged);
    window.removeEventListener(GRAPHICS_CHANGED,this.graphicsChanged);
    window.removeEventListener("storage",this.graphicsChanged);
    for(const q of this.queries)(this.gl.getContext() as WebGL2RenderingContext).deleteQuery(q);
    perf.detach();
    this.gl.dispose();
  }
}
