import {
  DataTexture,
  LinearFilter,
  Mesh,
  type Material,
  type Scene,
} from "three";
import type { FogView } from "../../sim/game/observation";

/** One map-sized texture; shader sampling darkens terrain, water, props and buildings together. */
export class FogOfWar {
  private readonly pixels:Uint8Array;
  readonly texture:DataTexture;
  private readonly uniform:{value:DataTexture};
  private readonly patched = new WeakSet<Material>();
  private revision = -1;
  private owner: number | undefined;
  private readonly horizontal:Float32Array;
  private readonly previous:Uint8Array;
  constructor(readonly size=256) {
    this.previous=new Uint8Array(size*size);this.pixels=new Uint8Array(size*size*4);this.horizontal=new Float32Array(size*size);
    this.texture=new DataTexture(this.pixels,size,size);this.uniform={value:this.texture};
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate=true;
  }
  update(fog: FogView, scene: Scene) {
    if (this.revision !== fog.revision || this.owner !== fog.owner) {
      this.owner = fog.owner;
      this.revision = fog.revision;
      let loX=this.size,hiX=-1,loZ=this.size,hiZ=-1;
      for(let i=0;i<fog.cells.length;i++)if(this.previous[i]!==fog.cells[i]){
        this.previous[i]=fog.cells[i]!;const x=i%this.size,z=Math.floor(i/this.size);
        loX=Math.min(loX,x);hiX=Math.max(hiX,x);loZ=Math.min(loZ,z);hiZ=Math.max(hiZ,z);
      }
      if(hiX>=0){
        loX=Math.max(0,loX-2);hiX=Math.min(this.size-1,hiX+2);
        // Only changed rows affect the horizontal pass; expand vertically for the second pass.
        const brightness=(i:number)=>fog.cells[i]===2?255:fog.cells[i]===1?90:0;
        for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
          let sum=0;for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<this.size)sum+=brightness(z*this.size+x+dx);
          this.horizontal[z*this.size+x]=sum/5;
        }
        loZ=Math.max(0,loZ-2);hiZ=Math.min(this.size-1,hiZ+2);
        for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
          let sum=0;for(let dz=-2;dz<=2;dz++)if(z+dz>=0&&z+dz<this.size)sum+=this.horizontal[(z+dz)*this.size+x]!;
          const i=(z*this.size+x)*4,value=Math.round(sum/5);
          this.pixels[i]=this.pixels[i+1]=this.pixels[i+2]=value;this.pixels[i+3]=255;
        }
        this.texture.needsUpdate=true;
      }
    }
    scene.traverse((o) => {
      if (o instanceof Mesh)
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          this.patch(m);
    });
  }
  private patch(material: Material) {
    if (this.patched.has(material)) return;
    this.patched.add(material);
    const before = material.onBeforeCompile,
      key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      before.call(material, shader, renderer);
      if (
        !shader.vertexShader.includes("#include <project_vertex>") ||
        !shader.fragmentShader.includes("#include <fog_fragment>")
      )
        return;
      shader.uniforms.utcVisibility = this.uniform;
      shader.vertexShader =
        "varying vec2 utcFogPosition;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec4 utcFogWorld=vec4(transformed,1.0);
        #ifdef USE_BATCHING
          utcFogWorld=batchingMatrix*utcFogWorld;
        #endif
        #ifdef USE_INSTANCING
          utcFogWorld=instanceMatrix*utcFogWorld;
        #endif
        utcFogPosition=(modelMatrix*utcFogWorld).xz;`,
      );
      shader.fragmentShader =
        "uniform sampler2D utcVisibility; varying vec2 utcFogPosition;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
        vec2 utcUv=(utcFogPosition+0.5)/${this.size.toFixed(1)};
        float inside=step(0.0,utcUv.x)*step(0.0,utcUv.y)*step(utcUv.x,1.0)*step(utcUv.y,1.0);
        float utcLight=texture2D(utcVisibility,clamp(utcUv,0.0,1.0)).r*inside;
        float utcGray=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));
        gl_FragColor.rgb=mix(vec3(utcGray)*vec3(0.82,0.91,1.0),gl_FragColor.rgb,smoothstep(0.25,0.85,utcLight))*utcLight;
      `,
      );
    };
    material.customProgramCacheKey = () => key + `|utc-fog-v2-${this.size}`;
    material.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
  }
}
