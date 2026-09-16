import {
  DataTexture,
  LinearFilter,
  Mesh,
  type Material,
  type Scene,
  type Object3D,
  Vector2,
  Vector4,
} from "three";
import type { FogView } from "../../sim/game/observation";
import {FogRaster} from './fogRaster';
import {FogAtlas} from './fogAtlas';

/** A flat overview texture plus one compact atlas for actual stacked floors. */
export class FogOfWar {
  private readonly pixels:Uint8Array;
  readonly texture:DataTexture;
  private readonly uniform:{value:DataTexture};
  private readonly patched = new WeakSet<Material>();
  private previous:Uint8Array|undefined;
  private revision=-1;
  private owner:number|undefined;
  private readonly raster:FogRaster;
  private atlas:FogAtlas|undefined;
  private readonly grid={value:new Vector2(1,1)};
  private readonly layerCount={value:1};
  private readonly heightRange={value:new Vector2(0,1)};
  private readonly bounds={value:new Vector4()};
  constructor(readonly size=256) {
    this.raster=new FogRaster(size);this.pixels=new Uint8Array(size*size*4);
    this.texture=new DataTexture(this.pixels,size,size);this.uniform={value:this.texture};
    this.texture.minFilter = LinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate=true;
  }
  update(fog: FogView, scene: Scene) {
    if(this.previous!==fog.cells||this.revision!==fog.revision||this.owner!==fog.owner){
      this.previous=fog.cells;this.revision=fog.revision;this.owner=fog.owner;
      const rect=this.raster.update(fog.cells);
      if(rect){
        for(let z=rect.loZ;z<=rect.hiZ;z++)for(let x=rect.loX;x<=rect.hiX;x++){
          const i=(z*this.size+x)*4,value=this.raster.light[z*this.size+x]!;
          this.pixels[i]=this.pixels[i+1]=this.pixels[i+2]=value;this.pixels[i+3]=255;
        }
        this.texture.needsUpdate=true;
      }
    }
    if(fog.floors){
      if(this.atlas?.decks!==fog.floors.decks){this.atlas?.dispose();this.atlas=new FogAtlas(this.size,fog.floors.decks);}
      this.atlas.update(fog.floors.cells,fog.revision);this.uniform.value=this.atlas.texture;
      this.grid.value.set(this.atlas.columns,this.atlas.rows);this.layerCount.value=this.atlas.count;this.heightRange.value.copy(this.atlas.heightRange);this.bounds.value.copy(this.atlas.bounds);
    }else{this.uniform.value=this.texture;this.grid.value.set(1,1);this.layerCount.value=1;}
    this.prepare(scene);
  }
  prepare(scene: Object3D) {
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
      shader.uniforms.utcFogGrid=this.grid;shader.uniforms.utcFogLayerCount=this.layerCount;shader.uniforms.utcFogHeight=this.heightRange;
      shader.uniforms.utcFogBounds=this.bounds;
      shader.vertexShader =
        "varying vec3 utcFogPosition;\n" + shader.vertexShader;
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
        utcFogPosition=(modelMatrix*utcFogWorld).xyz;`,
      );
      shader.fragmentShader =
        `uniform sampler2D utcVisibility; varying vec3 utcFogPosition;
        uniform vec2 utcFogGrid,utcFogHeight; uniform vec4 utcFogBounds; uniform int utcFogLayerCount;
        vec2 utcFogTile(vec2 uv,int layer){
          vec2 tile=vec2(mod(float(layer),utcFogGrid.x),floor(float(layer)/utcFogGrid.x));
          return (tile+clamp(uv,vec2(${(.5/this.size).toFixed(9)}),vec2(${(1-.5/this.size).toFixed(9)})))/utcFogGrid;
        }\n` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <fog_fragment>",
        `#include <fog_fragment>
        vec2 utcUv=(utcFogPosition.xz+0.5)/${this.size.toFixed(1)};
        float inside=step(0.0,utcUv.x)*step(0.0,utcUv.y)*step(utcUv.x,1.0)*step(utcUv.y,1.0);
        float utcLight=texture2D(utcVisibility,utcFogTile(utcUv,0)).r;
        vec2 utcCell=(floor(utcUv*${this.size.toFixed(1)})+.5)/${this.size.toFixed(1)};
        if(utcFogLayerCount>1&&utcFogPosition.y>=utcFogHeight.x-.35&&
          all(greaterThanEqual(utcFogPosition.xz,utcFogBounds.xy))&&all(lessThanEqual(utcFogPosition.xz,utcFogBounds.zw))){
          for(int layer=1;layer<utcFogLayerCount;layer++){
            vec4 floorData=texture2D(utcVisibility,utcFogTile(utcCell,layer));
            float floorY=utcFogHeight.x+dot(floorData.gb,vec2(65280.0,255.0))/65535.0*utcFogHeight.y;
            if(floorData.a>.5&&utcFogPosition.y>=floorY-.35)utcLight=texture2D(utcVisibility,utcFogTile(utcUv,layer)).r;
          }
        }
        utcLight*=inside;
        float utcGray=dot(gl_FragColor.rgb,vec3(0.2126,0.7152,0.0722));
        gl_FragColor.rgb=mix(vec3(utcGray)*vec3(0.82,0.91,1.0),gl_FragColor.rgb,smoothstep(0.25,0.85,utcLight))*utcLight;
      `,
      );
    };
    material.customProgramCacheKey = () => key + `|utc-fog-v4-${this.size}`;
    material.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
    this.atlas?.dispose();
  }
}
