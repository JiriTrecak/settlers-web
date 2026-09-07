import grassNormalUrl from '../../../assets/terrain/grass-normal.png?url';
import sandNormalUrl from '../../../assets/terrain/sand-normal.png?url';
import { DataTexture, RedFormat, LinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Color } from 'three';
import { HEIGHT_ORIGIN, HEIGHT_VERTS, type HeightField } from '../../shared';
import { curveDistance, sampleCurve, type TerrainStroke } from '../../shared/landscape/curve';
import pebbleUrl from '../../../assets/terrain/pebbles.png?url';
import snowUrl from '../../../assets/terrain/snow.png?url';
import grassUrl from '../../../assets/terrain/grass.png?url';
import sandUrl from '../../../assets/terrain/sand.png?url';
import mudUrl from '../../../assets/terrain/mud.png?url';
import rockUrl from '../../../assets/terrain/rock.png?url';
export class TerrainMaterial extends MeshStandardMaterial {
  private contactRevision=-1;
  private readonly contacts=new DataTexture(new Uint8Array(1024*1024),1024,1024,RedFormat);
  private readonly weights = new DataTexture(new Uint8Array(HEIGHT_VERTS*HEIGHT_VERTS*4),HEIGHT_VERTS,HEIGHT_VERTS);
  private readonly seasonTint = { value: new Color(0xb4d77b) };
  private readonly level = { value: 0 };
  private readonly textures = [grassUrl,sandUrl,mudUrl,rockUrl,snowUrl,pebbleUrl].map(url=> {
    const t=new TextureLoader().load(url); t.wrapS=t.wrapT=RepeatWrapping; t.colorSpace=SRGBColorSpace; t.anisotropy=8; return t;
  });
  private readonly normalTextures=[grassNormalUrl,sandNormalUrl].map(url=>{const t=new TextureLoader().load(url);t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;return t;});
  constructor() {
    super({color:0xffffff,roughness:0.95});
    this.contacts.minFilter=this.contacts.magFilter=LinearFilter;this.contacts.needsUpdate=true;
    this.weights.minFilter=this.weights.magFilter=LinearFilter;
    this.weights.needsUpdate=true;
    this.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{uContact:{value:this.contacts},uGrassNormal:{value:this.normalTextures[0]},uSandNormal:{value:this.normalTextures[1]},uPaint:{value:this.weights},uGrass:{value:this.textures[0]},uSand:{value:this.textures[1]},uMud:{value:this.textures[2]},uRock:{value:this.textures[3]},uSnow:{value:this.textures[4]},uPebbles:{value:this.textures[5]},uGrassTint:this.seasonTint,uSea:this.level});
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain; varying float vSlope;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position; vSlope=1.0-normal.y;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vTerrain; varying float vSlope;
      uniform sampler2D uContact,uPaint,uGrass,uSand,uMud,uRock,uSnow,uPebbles,uGrassNormal,uSandNormal;
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
      g=uGrassTint*(0.66+value*1.1)*(0.69+0.55*n+0.05*micro);
      vec3 sand=mix(vec3(.72,.55,.52),texture2D(uSand,uv*2.5).rgb*vec3(1.95,1.65,2.0),.38);
      vec3 pebbleTex=texture2D(uPebbles,vTerrain.xz*.22).rgb;
      float pebble=dot(pebbleTex,vec3(.3,.59,.11));
      float pebbleMask=smoothstep(-.018,.004,pebbleTex.r-pebbleTex.g)*smoothstep(.4,.65,noiseTerrain(vTerrain.xz*.4));
      sand*=.91+pebble*.20;
      vec3 mud=texture2D(uMud,uv).rgb*1.3;
      vec3 rock=texture2D(uRock,uv).rgb;
      float shore=1.0-smoothstep(uSea+0.02,uSea+0.65+n*.15,vTerrain.y);
      float cliff=smoothstep(.15,.5,vSlope);
      float worn=smoothstep(.45,.9,noiseTerrain(vTerrain.xz*.6))*0.14;
      vec3 base=mix(g,sand,max(shore*.94,worn));
      base=mix(base,rock,cliff);
      base=mix(base,sand,paint.r); base=mix(base,mud,paint.g); base=mix(base,rock,paint.b); base=mix(base,mix(vec3(.78,.76,.83),texture2D(uSnow,uv).rgb,.15),paint.a);
      base=mix(base,vec3(.52,.38,.36)*(0.65+pebble*2.0),pebbleMask*.65*(1.0-paint.a));
      base*=mix(.68,1.0,smoothstep(uSea-.6,uSea+.25,vTerrain.y));
      float contact=texture2D(uContact,(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)}))/${(HEIGHT_VERTS-1).toFixed(1)}).r;
      diffuseColor.rgb*=base*(1.0-contact);
      `).replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 grassN=texture2D(uGrassNormal,vTerrain.xz*.38).xyz*2.0-1.0;
      vec3 sandN=texture2D(uSandNormal,vTerrain.xz*.34).xyz*2.0-1.0;
      vec3 groundN=mix(grassN,sandN,paint.r);
      normal=normalize(normal+mat3(viewMatrix)*vec3(groundN.x,0.0,groundN.y)*.18);
      `);
    };
    this.customProgramCacheKey=()=> 'landscape-terrain-v1';
  }
  setContacts(revision:number,contacts:readonly {x:number;z:number;radiusX:number;radiusZ:number;strength:number}[]):void {
    if(this.contactRevision===revision)return;this.contactRevision=revision;
    const data=this.contacts.image.data as Uint8Array;data.fill(0);const size=1024,scale=size/(HEIGHT_VERTS-1);
    for(const c of contacts){
      const cx=(c.x-HEIGHT_ORIGIN)*scale,cz=(c.z-HEIGHT_ORIGIN)*scale,rx=c.radiusX*scale*1.5,rz=c.radiusZ*scale*1.5;
      for(let z=Math.max(0,Math.floor(cz-rz));z<=Math.min(size-1,cz+rz);z++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(size-1,cx+rx);x++){
        const d=((x-cx)/rx)**2+((z-cz)/rz)**2;if(d>=1)continue;
        const w=c.strength*(1-d)**2,i=z*size+x;data[i]=Math.max(data[i]!,Math.round(w*255));
      }
    }this.contacts.needsUpdate=true;
  }
  setSeason(season:string):void { this.seasonTint.value.set(season==='autumn'?0xb9b382:season==='spring'?0xb8cf96:0x978e56); }
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
  override dispose():void{ this.weights.dispose();this.contacts.dispose();this.textures.forEach(t=>t.dispose());this.normalTextures.forEach(t=>t.dispose());super.dispose(); }
}
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
