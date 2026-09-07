import { DataTexture, LinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Color } from 'three';
import { HEIGHT_ORIGIN, HEIGHT_VERTS, type HeightField } from '../../shared';
import { curveDistance, sampleCurve, type TerrainStroke } from '../../shared/landscape/curve';
import snowUrl from '../../../assets/terrain/snow.png?url';
import grassUrl from '../../../assets/terrain/grass.png?url';
import sandUrl from '../../../assets/terrain/sand.png?url';
import mudUrl from '../../../assets/terrain/mud.png?url';
import rockUrl from '../../../assets/terrain/rock.png?url';
export class TerrainMaterial extends MeshStandardMaterial {
  private readonly weights = new DataTexture(new Uint8Array(HEIGHT_VERTS*HEIGHT_VERTS*4),HEIGHT_VERTS,HEIGHT_VERTS);
  private readonly seasonTint = { value: new Color(0xb4d77b) };
  private readonly level = { value: 0 };
  private readonly textures = [grassUrl,sandUrl,mudUrl,rockUrl,snowUrl].map(url=> {
    const t=new TextureLoader().load(url); t.wrapS=t.wrapT=RepeatWrapping; t.colorSpace=SRGBColorSpace; t.anisotropy=8; return t;
  });
  constructor() {
    super({color:0xffffff,roughness:0.95});
    this.weights.minFilter=this.weights.magFilter=LinearFilter;
    this.weights.needsUpdate=true;
    this.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{uPaint:{value:this.weights},uGrass:{value:this.textures[0]},uSand:{value:this.textures[1]},uMud:{value:this.textures[2]},uRock:{value:this.textures[3]},uSnow:{value:this.textures[4]},uGrassTint:this.seasonTint,uSea:this.level});
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain; varying float vSlope;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position; vSlope=1.0-normal.y;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vTerrain; varying float vSlope;
      uniform sampler2D uPaint,uGrass,uSand,uMud,uRock,uSnow;
      uniform vec3 uGrassTint; uniform float uSea;
      float hashTerrain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noiseTerrain(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashTerrain(i),hashTerrain(i+vec2(1,0)),f.x),mix(hashTerrain(i+vec2(0,1)),hashTerrain(i+vec2(1)),f.x),f.y);}
      `).replace('#include <map_fragment>',`
      vec2 uv=vTerrain.xz*0.12;
      vec4 paint=texture2D(uPaint,(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)})+0.5)/${HEIGHT_VERTS.toFixed(1)});
      float n=noiseTerrain(vTerrain.xz*0.18);
      float micro=noiseTerrain(vTerrain.xz*5.0);
      vec3 g=texture2D(uGrass,uv).rgb;
      float value=dot(g,vec3(.3,.59,.11));
      g=uGrassTint*(0.66+value*1.1)*(0.86+0.23*n+0.035*micro);
      vec3 sand=mix(vec3(.67,.55,.46),texture2D(uSand,uv*2.5).rgb*vec3(1.9,1.75,1.95),.38);
      vec3 mud=texture2D(uMud,uv).rgb*1.3;
      vec3 rock=texture2D(uRock,uv).rgb;
      float shore=1.0-smoothstep(uSea+0.02,uSea+0.65+n*.15,vTerrain.y);
      float cliff=smoothstep(.15,.5,vSlope);
      vec3 base=mix(g,sand,shore*.94);
      base=mix(base,rock,cliff);
      base=mix(base,sand,paint.r); base=mix(base,mud,paint.g); base=mix(base,rock,paint.b); base=mix(base,mix(vec3(.78,.76,.83),texture2D(uSnow,uv).rgb,.15),paint.a);
      base*=mix(.68,1.0,smoothstep(uSea-.6,uSea+.25,vTerrain.y));
      diffuseColor.rgb*=base;
      `);
    };
    this.customProgramCacheKey=()=> 'landscape-terrain-v1';
  }
  setSeason(season:string):void { this.seasonTint.value.set(season==='autumn'?0xb9b382:season==='spring'?0xb8cf96:0xa8b47e); }
  update(field:HeightField,strokes:readonly TerrainStroke[]):void {
    this.level.value=field.waterLevel;
    const data=this.weights.image.data as Uint8Array; data.fill(0);
    for(const s of strokes){
      const curve=sampleCurve(s.points,s.radius,1);
      const channel={sand:0,mud:1,rock:2,snow:3,grass:-1}[s.layer];
      for(let z=0;z<HEIGHT_VERTS;z++)for(let x=0;x<HEIGHT_VERTS;x++){
        const d=curveDistance(x+HEIGHT_ORIGIN,z+HEIGHT_ORIGIN,curve);
        if(d>=1)continue;
        const w=s.opacity*(1-smooth(.55,1,d)); const i=(z*HEIGHT_VERTS+x)*4;
        for(let c=0;c<4;c++)data[i+c]=Math.round(data[i+c]!*(1-w)+(c===channel?255*w:0));
      }
    }
    this.weights.needsUpdate=true;
  }
  override dispose():void{ this.weights.dispose();this.textures.forEach(t=>t.dispose());super.dispose(); }
}
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
