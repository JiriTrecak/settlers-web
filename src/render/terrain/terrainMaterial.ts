import {bakeGroundLights,type GroundLamp} from './groundLightMap';
import roadUrl from '../../../assets/textures/roads/road-albedo.png?url';
import mossUrl from '../../../assets/textures/materials/ants/moss-surface.png?url';
import type {CoverPatch} from '../../shared/landscape/curve';
import forestFloorUrl from '../../../assets/textures/terrain/forest-floor.png?url';
import heartwoodUrl from '../../../assets/textures/terrain/heartwood-floor.png?url';
import wallWoodUrl from '../../../assets/textures/terrain/heartwood-grain.png?url';
import { DataTexture, RGFormat, LinearFilter, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Color } from 'three';
import { HEIGHT_ORIGIN, MAP_SIZE, MAP_HALO, type HeightField } from '../../shared';
import { rasterizeCurve, sampleCurve, type TerrainStroke } from '../../shared/landscape/curve';
import pebbleUrl from '../../../assets/textures/terrain/pebbles.png?url';
import snowUrl from '../../../assets/textures/terrain/snow.png?url';
import sandUrl from '../../../assets/textures/terrain/sand.png?url';
import mudUrl from '../../../assets/textures/terrain/mud.png?url';
import rockUrl from '../../../assets/textures/terrain/rock.png?url';
export class TerrainMaterial extends MeshStandardMaterial {
  private readonly moss=new TextureLoader().load(mossUrl,t=>{t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;});
  private readonly forestFloor=new TextureLoader().load(forestFloorUrl,t=>{t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;});
  private readonly heartwood=new TextureLoader().load(heartwoodUrl,t=>{t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;});
  private readonly wallWood=new TextureLoader().load(wallWoodUrl,t=>{t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=8;});
  private readonly interiorFloor={value:0};
  private readonly soilAtlas={value:this.forestFloor};
  setFloor(material:'forest'|'heartwood'='forest'){this.interiorFloor.value=material==='heartwood'?1:0;this.soilAtlas.value=material==='heartwood'?this.heartwood:this.forestFloor;this.rockAtlas.value=material==='heartwood'?this.wallWood:this.textures[2]!;}
  private contactRevision=-1;
  private readonly contacts=new DataTexture(new Uint8Array(1024*1024*4),1024,1024);
  private readonly weights:DataTexture;
  private readonly roadMask:DataTexture;
  private readonly verts:number;
  private readonly seasonTint = { value: new Color(0xffffff) };
  private readonly level = { value: 0 };
  private readonly textures = [sandUrl,mudUrl,rockUrl,snowUrl,pebbleUrl,roadUrl].map(url=> {
    const t=new TextureLoader().load(url); t.wrapS=t.wrapT=RepeatWrapping; t.colorSpace=SRGBColorSpace; t.anisotropy=8; return t;
  });
  private readonly rockAtlas={value:this.textures[2]!};
  constructor(size=MAP_SIZE) {
    super({color:0xffffff,roughness:0.95});
    this.verts=size+MAP_HALO*2+1;
    this.weights=new DataTexture(new Uint8Array(this.verts*this.verts*4),this.verts,this.verts);
    this.roadMask=new DataTexture(new Uint8Array(this.verts*this.verts*2),this.verts,this.verts,RGFormat);
    this.roadMask.minFilter=this.roadMask.magFilter=LinearFilter;this.roadMask.needsUpdate=true;
    this.contacts.minFilter=this.contacts.magFilter=LinearFilter;this.contacts.needsUpdate=true;
    this.weights.minFilter=this.weights.magFilter=LinearFilter;
    this.weights.needsUpdate=true;
    this.customProgramCacheKey=()=>`terrain-${this.verts}`;
    this.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,{uHeartwoodFloor:this.interiorFloor,uRoad:{value:this.textures[5]},uRoadMask:{value:this.roadMask},uMoss:{value:this.moss},uSoilAtlas:this.soilAtlas,uContact:{value:this.contacts},uPaint:{value:this.weights},uSand:{value:this.textures[0]},uMud:{value:this.textures[1]},uRock:this.rockAtlas,uSnow:{value:this.textures[3]},uPebbles:{value:this.textures[4]},uSoilTint:this.seasonTint,uSea:this.level});
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain; varying vec3 vTerrainNormal; varying float vSlope;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position; vTerrainNormal=normal; vSlope=1.0-normal.y;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vTerrain; varying vec3 vTerrainNormal; varying float vSlope;
      uniform sampler2D uRoad,uRoadMask,uMoss,uSoilAtlas,uContact,uPaint,uSand,uMud,uRock,uSnow,uPebbles;
      uniform vec3 uSoilTint; uniform float uSea;
      uniform float uHeartwoodFloor;
      float hashTerrain(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noiseTerrain(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashTerrain(i),hashTerrain(i+vec2(1,0)),f.x),mix(hashTerrain(i+vec2(0,1)),hashTerrain(i+vec2(1)),f.x),f.y);}
      `).replace('#include <map_fragment>',`
      vec2 uv=vTerrain.xz*0.12;
      vec4 paint=texture2D(uPaint,(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)})+0.5)/${this.verts.toFixed(1)});
      float n=noiseTerrain(vTerrain.xz*0.18);
      float micro=noiseTerrain(vTerrain.xz*5.0);
      vec3 sand=vec3(.48,.285,.12)*(.82+.30*n+.13*micro);
      sand*=.90+.22*texture2D(uSand,uv*2.5).r;
      vec3 pebbleTex=texture2D(uPebbles,vTerrain.xz*.22).rgb;
      float pebble=dot(pebbleTex,vec3(.3,.59,.11));
      float pebbleMask=smoothstep(-.018,.004,pebbleTex.r-pebbleTex.g)*smoothstep(.4,.65,noiseTerrain(vTerrain.xz*.4));
      sand*=.91+pebble*.20;
      vec3 mud=texture2D(uMud,uv).rgb*1.3;
      // Triplanar rock mapping keeps steep banks from stretching an XZ texture vertically.
      vec3 rockBlend=pow(abs(normalize(vTerrainNormal)),vec3(4.0));
      rockBlend/=max(.001,rockBlend.x+rockBlend.y+rockBlend.z);
      vec3 rockTex=texture2D(uRock,vTerrain.yz*.22).rgb*rockBlend.x
        +texture2D(uRock,vTerrain.xz*.22).rgb*rockBlend.y
        +texture2D(uRock,vTerrain.xy*.22).rgb*rockBlend.z;
      if(uHeartwoodFloor>.5)rockTex=texture2D(uRock,vTerrain.zy*vec2(.14,.09)).rgb*rockBlend.x+texture2D(uRock,vTerrain.xz*.09).rgb*rockBlend.y+texture2D(uRock,vTerrain.xy*vec2(.14,.09)).rgb*rockBlend.z;
      float rockValue=dot(rockTex,vec3(.3,.59,.11));
      vec3 rock=vec3(.19,.205,.18)*(.68+rockValue*1.25);
      // Irregular sediment and vertical fractures, not regular masonry courses.
      float faceU=abs(vTerrainNormal.x)>abs(vTerrainNormal.z)?vTerrain.z:vTerrain.x;
      float strata=vTerrain.y*.55+noiseTerrain(vec2(faceU*.24,vTerrain.y*.04))*1.5;
      float seam=abs(fract(strata)-.5);
      float fracture=abs(fract(faceU*.23+noiseTerrain(vec2(faceU*.19,vTerrain.y*.22))*1.3)-.5);
      float joint=(1.0-smoothstep(.008,.04+fwidth(strata),seam))*.23
        +(1.0-smoothstep(.012,.045+fwidth(fracture),fracture))*.32;
      rock*=.88+.24*noiseTerrain(vec2(faceU*.5,vTerrain.y*.7));
      rock*=1.0-joint;
      if(uHeartwoodFloor>.5){rock=rockTex*1.35;joint=0.0;}
      float shore=1.0-smoothstep(uSea+0.02,uSea+0.65+n*.15,vTerrain.y);
      float cliff=smoothstep(.15,.5,vSlope);
      float earthCrack=0.0; // Fine fissures are already baked into the soil atlas.
      // Exposed earth continues beneath the moss-like cover. Green belongs to
      // the foliage layer, while clods and shallow fissures remain visible in gaps.
      float soilGrain=noiseTerrain(vTerrain.xz*24.0);
      sand*= (.87+.23*soilGrain)*(1.0-earthCrack*.08*smoothstep(.35,.68,noiseTerrain(vTerrain.xz*1.1)));
      vec3 wornEarth=sand*(.92+.08*n);
      // Two differently oriented scales break up repeated leaf/pebble motifs.
      vec2 soilUv=abs(fract(vTerrain.xz*.065)*2.0-1.0);
      vec2 soilUvB=abs(fract(vec2(vTerrain.z,-vTerrain.x)*.041+vec2(.37,.19))*2.0-1.0);
      vec3 soilTexture=mix(texture2D(uSoilAtlas,soilUv).rgb,texture2D(uSoilAtlas,soilUvB).rgb,.28);
      if(uHeartwoodFloor>.5){
        vec2 grainUv=vTerrain.xz*vec2(.052,.052)+vec2(noiseTerrain(vTerrain.xz*.025)*.12,0.);
        vec3 grain=texture2D(uSoilAtlas,grainUv).rgb;
        // A worn, broad-grained walking surface; preserve strong relief on walls.
        soilTexture=mix(grain,vec3(.23,.145,.074),.5);
      }
      float soilValue=dot(soilTexture,vec3(.3,.59,.11));
      vec3 base=soilTexture*1.45*(.87+.22*n);
      float colony=noiseTerrain(vTerrain.xz*.28)*.45+noiseTerrain(vTerrain.xz*.91)*.35+noiseTerrain(vTerrain.xz*2.1)*.2;
      float mossMask=texture2D(uRoadMask,(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)})+.5)/${this.verts.toFixed(1)}).g*smoothstep(.29,.61,colony);
      mossMask*=smoothstep(uSea+.25,uSea+.65,vTerrain.y)*(1.0-cliff);
      vec3 mossColor=texture2D(uMoss,vTerrain.xz*.20).rgb;
      base=mix(base,mossColor*.85,mossMask*.94);
      base=mix(base,sand,shore*.94*(1.-uHeartwoodFloor));
      base=mix(base,rock,cliff);
      base=mix(base,texture2D(uRoad,vTerrain.xz*.25).rgb*(.9+.15*n),texture2D(uRoadMask,(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)})+0.5)/${this.verts.toFixed(1)}).r);
      base=mix(base,sand,paint.r); base=mix(base,mud,paint.g); base=mix(base,rock,paint.b); base=mix(base,mix(vec3(.78,.76,.83),texture2D(uSnow,uv).rgb,.15),paint.a);
      base=mix(base,vec3(.52,.38,.36)*(0.65+pebble*2.0),pebbleMask*.08*(1.0-paint.a)*(1.0-cliff));
      // Rounded stones belong to the riverbed, so water coverage reveals them naturally.
      vec2 bedCell=vTerrain.xz*1.4;
      vec2 bedId=floor(bedCell),bedUv=fract(bedCell)-.5;
      float bedSeed=hashTerrain(bedId+vec2(37.2,11.8));
      bedUv-=vec2(hashTerrain(bedId+2.7),hashTerrain(bedId+8.3))*.24-.12;
      float bedRadius=.27+.16*bedSeed;
      float bedDist=length(bedUv*vec2(1.0,1.35));
      float bedAA=max(.015,fwidth(bedDist));
      float bedStone=(1.0-smoothstep(bedRadius-bedAA,bedRadius+bedAA,bedDist))*step(.68,bedSeed);
      bedStone*=smoothstep(.48,.72,noiseTerrain(vTerrain.xz*.34));
      bedStone*=exp(-max(0.0,uSea-vTerrain.y-.25)*.65);
      float submerged=1.0-smoothstep(uSea-.20,uSea+.02,vTerrain.y);
      vec3 bedColor=mix(vec3(.12,.16,.17),vec3(.47,.51,.45),bedStone*(.8+.2*bedSeed));
      base=mix(base,bedColor,submerged*.75);
      base*=mix(.68,1.0,smoothstep(uSea-.6,uSea+.25,vTerrain.y));
      vec4 contact=texture2D(uContact,(vTerrain.xz-vec2(${HEIGHT_ORIGIN.toFixed(1)}))/${(this.verts-1).toFixed(1)});
      diffuseColor.rgb*=base*uSoilTint*(1.0-contact.r);
      `).replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\n totalEmissiveRadiance+=base*contact.gba*uHeartwoodFloor*.8;').replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      // Relief follows the same authored soil detail as its color. Derivative
      // gradients avoid an unrelated grass normal map and extra texture reads.
      float soilRelief=(soilValue*.035+soilGrain*.006)*(1.0-paint.a)*(1.0-cliff)*(1.0-submerged)+(rockValue*.08-joint*.035)*cliff;
      vec3 surfaceX=dFdx(-vViewPosition),surfaceY=dFdy(-vViewPosition);
      vec3 r1=cross(surfaceY,normal),r2=cross(normal,surfaceX);
      float determinant=dot(surfaceX,r1);
      vec3 gradient=sign(determinant)*(dFdx(soilRelief)*r1+dFdy(soilRelief)*r2);
      normal=normalize(abs(determinant)*normal-gradient);
      `);
    };
    this.customProgramCacheKey=()=> 'landscape-terrain-heartwood-v10';
  }
  private groundLamps:readonly GroundLamp[]|undefined;
  setGroundLights(lamps:readonly GroundLamp[],field:HeightField):void {
    if(this.groundLamps===lamps)return;
    this.groundLamps=lamps;
    bakeGroundLights(this.contacts.image.data as Uint8Array,1024,HEIGHT_ORIGIN,this.verts-1,(x,z)=>field.sample(x,z),lamps);
    this.contacts.needsUpdate=true;
  }
  setContacts(revision:number,contacts:readonly {x:number;z:number;radiusX:number;radiusZ:number;strength:number}[]):void {
    if(this.contactRevision===revision)return;this.contactRevision=revision;
    const data=this.contacts.image.data as Uint8Array;for(let i=0;i<data.length;i+=4)data[i]=0;const size=1024,scale=size/(this.verts-1);
    for(const c of contacts){
      const cx=(c.x-HEIGHT_ORIGIN)*scale,cz=(c.z-HEIGHT_ORIGIN)*scale,rx=c.radiusX*scale*1.5,rz=c.radiusZ*scale*1.5;
      for(let z=Math.max(0,Math.floor(cz-rz));z<=Math.min(size-1,cz+rz);z++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(size-1,cx+rx);x++){
        const d=((x-cx)/rx)**2+((z-cz)/rz)**2;if(d>=1)continue;
        const w=c.strength*(1-d)**2,i=(z*size+x)*4;data[i]=Math.max(data[i]!,Math.round(w*255));
      }
    }this.contacts.needsUpdate=true;
  }
  setCover(patches:readonly CoverPatch[]):void {
    // R = road blend, G = moss coverage. One mask sampler leaves room for fog,
    // shadows and observed-unit cutaways on WebGL's 16-sampler baseline.
    const size=this.verts,data=this.roadMask.image.data as Uint8Array;
    for(let i=1;i<data.length;i+=2)data[i]=0;
    for(const p of patches){
      if(p.palette!=='forest')continue;
      const loX=Math.max(0,Math.floor(p.x-p.radius-HEIGHT_ORIGIN)),hiX=Math.min(size-1,Math.ceil(p.x+p.radius-HEIGHT_ORIGIN));
      const loZ=Math.max(0,Math.floor(p.z-p.radius-HEIGHT_ORIGIN)),hiZ=Math.min(size-1,Math.ceil(p.z+p.radius-HEIGHT_ORIGIN));
      for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++){
        const x=ix+HEIGHT_ORIGIN,z=iz+HEIGHT_ORIGIN;
        if((p.exclusions??[]).some(e=>Math.hypot(x-e.x,z-e.z)<e.radius))continue;
        const edge=Math.max(0,Math.min(1,(1-Math.hypot(x-p.x,z-p.z)/p.radius)*6));
        const i=(iz*size+ix)*2+1;data[i]=Math.max(data[i]!,Math.round(255*edge*Math.min(1,p.density)));
      }
    }this.roadMask.needsUpdate=true;
  }
  setSeason(season:string):void { this.seasonTint.value.set(season==='autumn'?0xfff0dc:0xffffff); }
  update(field:HeightField,strokes:readonly TerrainStroke[]):void {
    this.groundLamps=undefined;
    this.level.value=field.waterLevel;
    const data=this.weights.image.data as Uint8Array; data.fill(0);
    const roads=this.roadMask.image.data as Uint8Array;for(let i=0;i<roads.length;i+=2)roads[i]=0;
    for(const s of strokes){
      const curve=sampleCurve(s.points,s.radius,1);
      const channel={sand:0,mud:1,rock:2,snow:3,grass:-1,road:-1}[s.layer];
      const distances=rasterizeCurve(curve,this.verts,HEIGHT_ORIGIN);
      for(let z=0;z<this.verts;z++)for(let x=0;x<this.verts;x++){
        const d=distances[z*this.verts+x]!;
        if(d>=1)continue;
        const w=s.opacity*(1-smooth(.55,1,d)); const i=(z*this.verts+x)*4;
        roads[i/2]=Math.round(roads[i/2]!*(1-w)+(s.layer==='road'?255*w:0));
        for(let c=0;c<4;c++)data[i+c]=Math.round(data[i+c]!*(1-w)+(c===channel?255*w:0));
      }
    }
    this.weights.needsUpdate=true;this.roadMask.needsUpdate=true;
  }
  override dispose():void{ this.roadMask.dispose(); this.moss.dispose();this.forestFloor.dispose();this.heartwood.dispose();this.wallWood.dispose();this.weights.dispose();this.contacts.dispose();this.textures.forEach(t=>t.dispose());super.dispose(); }
}
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
