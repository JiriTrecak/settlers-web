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
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vTerrain; varying vec3 vTerrainNormal; varying float vSlope;').replace('#include <begin_vertex>','#include <begin_vertex>\nvTerrain=position; vTerrainNormal=normal; vSlope=1.0-normal.y;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vTerrain; varying vec3 vTerrainNormal; varying float vSlope;
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
      g=uGrassTint*(0.66+value*1.1)*(0.78+0.30*n+0.08*micro);
      g*=mix(vec3(1.0),vec3(1.17,1.01,.82),smoothstep(.35,.78,n)*.65);
      // Fine painted leaf flecks break up the broad color fields without extra geometry.
      vec2 grassCell=vTerrain.xz*2.8;
      grassCell+=vec2(noiseTerrain(vTerrain.xz*1.1),noiseTerrain(vTerrain.zx*1.3+7.0))*1.4;
      vec2 cellId=floor(grassCell),cellUv=fract(grassCell)-.5;
      float seed=hashTerrain(cellId);
      cellUv-=vec2(hashTerrain(cellId+3.7),hashTerrain(cellId+9.1))*.48-.24;
      float angle=seed*6.28318;
      vec2 leafUv=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*cellUv;
      leafUv*=vec2(1.0,1.9);
      float leafDistance=length(leafUv);
      float leafAA=max(.025,fwidth(leafDistance));
      float leafRadius=.16+.16*hashTerrain(cellId+18.1);
      float leafFleck=1.0-smoothstep(leafRadius-leafAA,leafRadius+leafAA,leafDistance);
      float detailVisibility=1.0-smoothstep(.55,1.2,length(fwidth(grassCell)));
      float fleckClusters=smoothstep(.25,.72,noiseTerrain(vTerrain.xz*.85));
      g*=1.0+leafFleck*(seed>.48?.42:-.48)*detailVisibility*(.25+.75*fleckClusters)*step(.16,hashTerrain(cellId+22.3));
      // Sparse three-leaf ground clumps give the painted surface readable shapes.
      vec2 clumpCell=vTerrain.xz*1.05;
      vec2 clumpId=floor(clumpCell),clumpUv=fract(clumpCell)-.5;
      float clumpSeed=hashTerrain(clumpId+41.3);
      clumpUv-=vec2(hashTerrain(clumpId+7.1),hashTerrain(clumpId+13.7))*.25-.125;
      float clumpMask=0.0,clumpLight=0.0;
      for(int blade=0;blade<3;blade++){
        float a=clumpSeed*6.28318+float(blade)*2.0944;
        vec2 q=mat2(cos(a),-sin(a),sin(a),cos(a))*clumpUv;
        q.x-=.13;
        float d=length(q*vec2(1.0,1.8));
        float aa=max(.008,fwidth(d));
        float leaf=1.0-smoothstep(.14-aa,.14+aa,d);
        clumpMask=max(clumpMask,leaf);
        clumpLight=max(clumpLight,leaf*smoothstep(-.025,.045,q.y));
      }
      float clumpVisibility=step(.68,clumpSeed)*smoothstep(.35,.65,fleckClusters)
        *(1.0-smoothstep(.3,.8,length(fwidth(clumpCell))));
      g=mix(g,g*vec3(.62,.79,.48),clumpMask*clumpVisibility*.65);
      g+=uGrassTint*clumpLight*clumpVisibility*.16;
      vec3 sand=mix(vec3(.64,.65,.48),texture2D(uSand,uv*2.5).rgb*vec3(1.8,1.85,1.65),.38);
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
      float rockValue=dot(rockTex,vec3(.3,.59,.11));
      vec3 rock=vec3(.32,.43,.48)*(.78+rockValue*.95);
      // Staggered rock joints break long exposed banks into readable slate faces.
      float faceU=abs(vTerrainNormal.x)>abs(vTerrainNormal.z)?vTerrain.z:vTerrain.x;
      float course=vTerrain.y*.85+noiseTerrain(vec2(faceU*.45,0.0))*.65;
      float row=floor(course);
      vec2 jointUv=vec2(faceU*.85+hashTerrain(vec2(row,9.3))*.8,course);
      jointUv.x+=sin(vTerrain.y*2.1+row)*.09;
      vec2 edge=min(fract(jointUv),1.0-fract(jointUv));
      vec2 jointAA=max(fwidth(jointUv),vec2(.008));
      float verticalJoint=1.0-smoothstep(.008,.026+jointAA.x,edge.x);
      float crossJoint=(1.0-smoothstep(.005,.018+jointAA.y,edge.y))*smoothstep(.35,.75,hashTerrain(floor(jointUv)));
      float joint=max(verticalJoint,crossJoint);
      float faceTone=.87+.24*hashTerrain(floor(jointUv));
      rock*=mix(1.0,faceTone*(1.0-joint*.24),smoothstep(.25,.65,vSlope));
      float shore=1.0-smoothstep(uSea+0.02,uSea+0.65+n*.15,vTerrain.y);
      float cliff=smoothstep(.15,.5,vSlope);
      // Irregular worn islands sit beneath the fine grass rather than a uniform lawn.
      vec2 wearUv=vTerrain.xz*.26+vec2(noiseTerrain(vTerrain.xz*.43),noiseTerrain(vTerrain.zx*.39))*.65;
      float wearField=noiseTerrain(wearUv)*.72+noiseTerrain(vTerrain.xz*.87)*.28;
      float worn=smoothstep(.51,.73,wearField)*.56;
      vec2 earthUv=vTerrain.xz*.75,earthCell=floor(earthUv),earthLocal=fract(earthUv);
      float nearest=10.0,second=10.0;
      for(int ez=-1;ez<=1;ez++)for(int ex=-1;ex<=1;ex++){
        vec2 offset=vec2(float(ex),float(ez));
        vec2 id=earthCell+offset;
        vec2 point=offset+.15+.70*vec2(hashTerrain(id),hashTerrain(id+19.7));
        float dist=length(point-earthLocal);
        if(dist<nearest){second=nearest;nearest=dist;}else second=min(second,dist);
      }
      float crackAA=max(.007,fwidth(second-nearest));
      float earthCrack=1.0-smoothstep(.008,.018+crackAA,second-nearest);
      vec3 wornEarth=vec3(.27,.30,.16)*(.80+value*.65)*(1.0-earthCrack*.20);
      vec3 base=mix(g,wornEarth,worn);
      base=mix(base,sand,shore*.94);
      base=mix(base,rock,cliff);
      base=mix(base,sand,paint.r); base=mix(base,mud,paint.g); base=mix(base,rock,paint.b); base=mix(base,mix(vec3(.78,.76,.83),texture2D(uSnow,uv).rgb,.15),paint.a);
      base=mix(base,vec3(.52,.38,.36)*(0.65+pebble*2.0),pebbleMask*.30*(1.0-paint.a)*(1.0-cliff));
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
      vec3 bedColor=mix(vec3(.30,.36,.23),vec3(.85,.88,.65),bedStone*(.8+.2*bedSeed));
      base=mix(base,bedColor,submerged*.75);
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
  setSeason(season:string):void { this.seasonTint.value.set(season==='autumn'?0xb9b382:season==='spring'?0x9bd56a:0xa5e078); }
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
