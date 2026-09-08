import { DataTexture, LinearFilter, Mesh, type Material, type Scene } from 'three';
import type { FogView } from '../../sim/visibility/visibility';

/** One shared 256² texture; shader sampling darkens terrain, water, props and buildings together. */
export class FogOfWar {
  private readonly pixels=new Uint8Array(256*256*4);
  readonly texture=new DataTexture(this.pixels,256,256);
  private readonly uniform={value:this.texture};
  private readonly patched=new WeakSet<Material>();
  private revision=-1;
  private readonly horizontal=new Float32Array(65536);
  constructor(){this.texture.minFilter=LinearFilter;this.texture.magFilter=LinearFilter;this.texture.generateMipmaps=false;}
  update(fog:FogView,scene:Scene){
    if(this.revision!==fog.revision){
      this.revision=fog.revision;
      // Separable five-cell blur on updates, rather than nine GPU reads per rendered pixel.
      const brightness=(i:number)=>fog.cells[i]===2?255:fog.cells[i]===1?90:0;
      for(let z=0;z<256;z++)for(let x=0;x<256;x++){
        let sum=0;for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<256)sum+=brightness(z*256+x+dx);
        this.horizontal[z*256+x]=sum/5;
      }
      for(let z=0;z<256;z++)for(let x=0;x<256;x++){
        let sum=0;for(let dz=-2;dz<=2;dz++)if(z+dz>=0&&z+dz<256)sum+=this.horizontal[(z+dz)*256+x]!;
        const i=(z*256+x)*4,value=Math.round(sum/5);
        this.pixels[i]=this.pixels[i+1]=this.pixels[i+2]=value;this.pixels[i+3]=255;
      }
      this.texture.needsUpdate=true;
    }
    scene.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])this.patch(m);});
  }
  private patch(material:Material){
    if(this.patched.has(material))return;
    this.patched.add(material);
    const before=material.onBeforeCompile, key=material.customProgramCacheKey();
    material.onBeforeCompile=(shader,renderer)=>{
      before.call(material,shader,renderer);
      if(!shader.vertexShader.includes('#include <project_vertex>')||!shader.fragmentShader.includes('#include <fog_fragment>'))return;
      shader.uniforms.utcVisibility=this.uniform;
      shader.vertexShader='varying vec2 utcFogPosition;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 utcFogWorld=vec4(transformed,1.0);
        #ifdef USE_BATCHING
          utcFogWorld=batchingMatrix*utcFogWorld;
        #endif
        #ifdef USE_INSTANCING
          utcFogWorld=instanceMatrix*utcFogWorld;
        #endif
        utcFogPosition=(modelMatrix*utcFogWorld).xz;`);
      shader.fragmentShader='uniform sampler2D utcVisibility; varying vec2 utcFogPosition;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <fog_fragment>',`#include <fog_fragment>
        vec2 utcUv=(utcFogPosition+0.5)/256.0;
        float inside=step(0.0,utcUv.x)*step(0.0,utcUv.y)*step(utcUv.x,1.0)*step(utcUv.y,1.0);
        float utcLight=texture2D(utcVisibility,clamp(utcUv,0.0,1.0)).r*inside;
        float utcGray=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));
        gl_FragColor.rgb=mix(vec3(utcGray)*vec3(0.82,0.91,1.0),gl_FragColor.rgb,smoothstep(0.25,0.85,utcLight))*utcLight;
      `);
    };
    material.customProgramCacheKey=()=>key+'|utc-fog-v1';
    material.needsUpdate=true;
  }
  dispose(){this.texture.dispose();}
}
