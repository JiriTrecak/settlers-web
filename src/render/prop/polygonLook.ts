/**
 * Play back Unity Nature materials on imported Synty glTFs.
 * FBX slots are Maya leftovers (lambert1 / Leave / Trunk). The look table is
 * prefab → non-LOD .mat, keyed by catalogue id. Wrapped Lambert foliage
 * and faceted surfaces share the scene lighting and shadows.
 */
import {
  Float32BufferAttribute,
  CanvasTexture,
  Color,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderChunk,
  Texture,
  type Material,
  type Object3D,
} from "three";
import looks from "../../../assets/synty/looks.json";

type SlotKind = "leaf" | "trunk" | "vine" | "dead" | "plant" | "atlas";
type SlotLook = {
  tint: [number, number, number];
  emit: [number, number, number];
  luma: boolean;
  vertex: boolean;
  flipV: boolean;
};
type AssetLook = Partial<Record<SlotKind, SlotLook>>;

const TABLE = looks as unknown as Record<string, AssetLook>;
const FALLBACK: SlotLook = { tint: [1, 1, 1], emit: [0, 0, 0], luma: false, vertex: false, flipV: false };
const lumaCache = new WeakMap<Texture, Texture>();
const willowLumaCache = new WeakMap<Texture, Texture>();
const willowContrastCache = new WeakMap<Texture, Texture>();

export function flattenPolygon(root: Object3D, hint = "", variant?:string): void {
  const asset = TABLE[lookId(hint)];
  const extraLeaves:Mesh[]=[];
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    const kinds = mats.map((mat) => /plant-bush-leaves|plant-fern|plant-undergrowth|plant-reeds/.test(hint) ? "leaf" as const : kindOfGltf(mat.name ?? ""));
    if(hint==='synty-tree-generic-giant-01-open')bendLowerBranch(node,kinds.every(k=>k==='leaf'||k==='dead'));
    if(hint==='synty-tree-generic-giant-01-open' && kinds.every(k=>k==='dead'))node.geometry.setDrawRange(0,0);
    if (kinds.some((k) => slotOf(asset, k).flipV) || /tree-pine/.test(hint)) flipLeafUv(node);
    const next = mats.map((mat, i) => asPainted(mat, slotOf(asset, kinds[i]!), kinds[i]!, /willow/.test(hint), hint==='synty-tree-generic-giant-01-open', /willow/.test(hint) && (!variant || variant==='green')));
    node.material = Array.isArray(node.material) ? next : next[0]!;
    if(variant==='pink' && /willow/.test(hint) && kinds.every(k=>k==='leaf')) {
      for(const m of next){
        const compile=m.onBeforeCompile,cache=m.customProgramCacheKey();
        m.onBeforeCompile=(shader,renderer)=>{
          compile.call(m,shader,renderer);
          shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', `
            float pinkHighlight=smoothstep(.55,.95,outgoingLight.r);
            outgoingLight.r+=.12*smoothstep(0.0,.25,outgoingLight.r)*(1.0-smoothstep(.25,.6,outgoingLight.r))-.05*pinkHighlight;
            outgoingLight.gb+=vec2(.16,.12)*pinkHighlight;
            #include <opaque_fragment>`);
        };
        m.customProgramCacheKey=()=>cache+'-pink-tones-v1';
      }
    }
    if(hint==='synty-tree-generic-giant-01-open' && kinds.every(k=>k==='leaf')) {
      node.userData.skipCanopyShadow=true;
      node.position.y+=1.2;
      const p=node.geometry.getAttribute('position'),colors=new Float32Array(p.count*3);
      for(let i=0;i<p.count;i++){
        const t=Math.max(0,Math.min(1,(p.getY(i)-2)/6)),v=.55+t*t*(3-2*t);
        colors.set([v,v*1.07,v*.86],i*3);
      }
      node.geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
      for(const m of next){(m as MeshLambertMaterial).vertexColors=true;m.needsUpdate=true;}
    }
    if(hint==='synty-plant-flowers-01') {
      // This modeled flower uses three constant atlas UV swatches: stem,
      // leaves and blossom. Recover their colors without dark imported tint.
      const g=node.geometry,uv=g.getAttribute('uv'),colors=new Float32Array(uv.count*3);
      for(let i=0;i<uv.count;i++){
        const c=new Color(uv.getX(i)>.5?0xba8fd7:uv.getX(i)<.05?0x738257:0x879866);
        colors.set([c.r,c.g,c.b],i*3);
      }
      g.setAttribute('color',new Float32BufferAttribute(colors,3));
      for(const m of next){const lit=m as MeshLambertMaterial;lit.map=null;lit.color.set(0xffffff);lit.vertexColors=true;lit.needsUpdate=true;}
    }
    if (hint === 'synty-plant-grass-02') {
      // Authored blades are geometry; the imported cutout UVs would erase them.
      const g=node.geometry;g.computeBoundingBox();
      const p=g.getAttribute('position'),colors=new Float32Array(p.count*3);
      const low=g.boundingBox!.min.y,span=Math.max(.001,g.boundingBox!.max.y-low);
      for(let i=0;i<p.count;i++){
        const h=(p.getY(i)-low)/span,v=.72+.28*Math.sqrt(h);
        colors.set([v,v,v],i*3);
      }
      g.setAttribute('color',new Float32BufferAttribute(colors,3));
      for(const m of next){
        const lit=m as MeshLambertMaterial;lit.map=null;lit.alphaTest=0;lit.color.set(0xc8bd83);lit.vertexColors=true;
        lit.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',
            '#include <normal_fragment_begin>\nnormal=normalize(normal*.35+normalize(mat3(viewMatrix)*vec3(0.0,1.0,0.0))*.65);');
        };
        lit.customProgramCacheKey=()=> 'grass-blade-sky-fill-v1';lit.needsUpdate=true;
      }
    }
    if (/synty-plant-lillypad/.test(hint)) {
      for (const m of next) {
        const pad = m as MeshLambertMaterial;
        pad.map = null;
        pad.color.set(0x696b58);
        pad.vertexColors = false;
      }
    }
    if(/willow-large-01-full/.test(hint) && kinds.every(k=>k==="leaf"))extraLeaves.push(node);
    if (/synty-prop-(bridge|fence|roadsign)/.test(hint)) {
      for (const m of next) {
        const wood = m as MeshLambertMaterial;
        wood.map = null; wood.color.set(0x977564); wood.vertexColors = false;
      }
    }
    // The reed imports contain modeled blades, but their UVs sample a flat
    // palette swatch. Applying the grass cutout there erases whole blades.
    if (/synty-plant-reeds/.test(hint)) {
      const g=node.geometry;g.computeBoundingBox();
      const p=g.getAttribute('position'),colors=new Float32Array(p.count*3);
      const low=g.boundingBox!.min.y,span=Math.max(.001,g.boundingBox!.max.y-low);
      for(let i=0;i<p.count;i++){
        const h=(p.getY(i)-low)/span,v=.34+.66*Math.sqrt(h);
        colors.set([v,v,v],i*3);
      }
      g.setAttribute('color',new Float32BufferAttribute(colors,3));
      for(const m of next){
        const lit=m as MeshLambertMaterial;
        lit.map=null;lit.vertexColors=true;lit.alphaTest=0;lit.transparent=false;
        // Thin upright blades receive a little sky-facing fill, including when
        // an authored heightScale makes their geometric normals more horizontal.
        lit.onBeforeCompile=shader=>{
          shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',
            '#include <normal_fragment_begin>\nnormal=normalize(normal*.65+normalize(mat3(viewMatrix)*vec3(0.0,1.0,0.0))*.35);');
        };
        lit.customProgramCacheKey=()=> 'reed-sky-fill-v1';
      }
    }
    // Recover clean faceted surfaces from the pack's collapsed-UV rock imports.
    if (/synty-(rock-|terrain-(grassedge|mountain|riverside)|prop-(pillar|stonewall))/.test(hint)) {
      const g=node.geometry;g.computeBoundingBox();
      const p=g.getAttribute('position'),n=g.getAttribute('normal'),colors=new Float32Array(p.count*3);
      const top=g.boundingBox!.max.y,bottom=g.boundingBox!.min.y;
      const grassy=/grassedge|riverside|moss/.test(hint);
      for(let i=0;i<p.count;i++){
        const green=grassy&&n.getY(i)>.55&&p.getY(i)>bottom+(top-bottom)*.48;
        const c=new Color(green?0x9ba979:0xb4989a);
        const v=.92+.06*Math.sin(Math.round(p.getX(i)*1.3)+Math.round(p.getY(i)*2.1)+Math.round(p.getZ(i)*1.4));
        c.multiplyScalar(v);colors.set([c.r,c.g,c.b],i*3);
      }
      g.setAttribute('color',new Float32BufferAttribute(colors,3));
      for(const m of next){const lit=m as MeshLambertMaterial;lit.map=null;lit.color.set(0xffffff);lit.userData.stonePalette=true;lit.vertexColors=true;lit.transparent=false;lit.alphaTest=0;lit.needsUpdate=true;}
    }
  });
  // An authored fuller crown reuses the existing leaf mesh in the same instance
  // batch. Apply this after material/UV repair so the shared geometry flips once.
  for(const leaf of extraLeaves){
    const crown=leaf.clone(false);crown.name+='-inner-crown';
    crown.rotation.y+=.5;crown.scale.multiplyScalar(.92);
    leaf.parent?.add(crown);
  }
}

/** Wrapped foliage normals preserve canopy readability under changing light. */
function asPainted(mat: Material, look: SlotLook, kind: SlotKind, willow=false, importedNormals=false, willowContrast=false): Material {
  const src =
    mat instanceof MeshStandardMaterial || mat instanceof MeshLambertMaterial || mat instanceof MeshBasicMaterial
      ? mat
      : null;
  const card = kind === "leaf" || kind === "vine" || kind === "dead";
  const living = kind === "leaf" || kind === "vine";
  const next = new MeshLambertMaterial();
  if (src) {
    next.map = src.map;
    next.transparent = src.transparent;
    next.opacity = src.opacity;
    next.alphaTest = src.alphaTest;
    next.side = src.side;
    next.depthWrite = src.depthWrite;
  }
  if(living && willow)next.alphaTest=.2;
  next.vertexColors = card ? false : look.vertex;
  // Use the renderer's MSAA samples at cutout edges instead of a binary
  // pixel discard. This preserves the fine hanging willow strands in motion.
  next.alphaToCoverage = card && next.alphaTest > 0;
  if(living && !willow && !importedNormals) {
    next.onBeforeCompile = shader => {
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n#ifdef DOUBLE_SIDED\nnormal*=faceDirection;\n#endif');
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        objectNormal = normalize(vec3(objectNormal.x * .75, (objectNormal.y + .6) * .65, objectNormal.z * .75));`);
    };
    next.customProgramCacheKey = () => 'canopy-wrap-v1';
  }
  if(card && (willow || importedNormals)) {
    next.onBeforeCompile = shader => {
      shader.fragmentShader=shader.fragmentShader.replace('#include <lights_lambert_pars_fragment>',
        ShaderChunk.lights_lambert_pars_fragment.replace(
          'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );',
          'float leafDot = dot( geometryNormal, directLight.direction ); float dotNL = saturate((leafDot + .4) / 1.4) + .3 * saturate(-leafDot);'));
    };
    if(importedNormals){
      const compile=next.onBeforeCompile;
      next.onBeforeCompile=(shader,renderer)=>{
        compile.call(next,shader,renderer);
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\nnormal=normalize(normal+normalize(mat3(viewMatrix)*vec3(0.0,1.0,0.0))*.45);');
      };
    }
    next.customProgramCacheKey = () => importedNormals?'open-canopy-fill-v1':'willow-translucent-v1';
  }
  const tint = paint(look);
  next.color.setRGB(...tint);
  if(kind==="trunk"){next.map=null;next.color.set(0x93765d);next.emissive.set(0x654b39).multiplyScalar(.025); }
  if (living || kind === "plant") { next.userData.foliageBase = tint; next.emissive.setRGB(...tint).multiplyScalar(.025); }
  if (next.map) {
    next.map = next.map.clone();
    next.map.wrapS = RepeatWrapping;
    next.map.wrapT = RepeatWrapping;
    if (card) next.map.anisotropy = 8;
    // Mips of a painted wall tile sparkle into grain on big rocks.
    if (!card) {
      next.map.minFilter = LinearFilter;
      next.map.magFilter = LinearFilter;
      next.map.generateMipmaps = false;
    }
    next.map.needsUpdate = true;
  }
  if ((look.luma || living) && next.map) next.map = lumaOf(next.map, willow, willowContrast);
  if (kind === "dead") {
    // Branch cards use the texture silhouette with the same bark color as the
    // modeled trunk; multiplying its brown swatch by the Unity tint goes black.
    if (next.map) next.map = bake(next.map, () => [1, 1, 1]);
    next.color.set(0x93765d);
  }
  if (src) src.map = null;
  mat.dispose();
  return next;
}

/** Unlit stand-in for Unity `albedo × tint + emission`. */
function paint(look: SlotLook): [number, number, number] {
  return [
    Math.min(1, look.tint[0] + look.emit[0]),
    Math.min(1, look.tint[1] + look.emit[1]),
    Math.min(1, look.tint[2] + look.emit[2]),
  ];
}

function slotOf(asset: AssetLook | undefined, kind: SlotKind): SlotLook {
  if (!asset) return FALLBACK;
  return asset[kind] ?? (kind === "vine" ? asset.leaf : undefined) ?? asset.atlas ?? asset.plant ?? FALLBACK;
}

function kindOfGltf(name: string): SlotKind {
  const n = name.toLowerCase();
  // Maya leftover `lambert2` contains "leave" — that is not foliage.
  if (/lambert/.test(n)) return "atlas";
  if (/texture_0109/.test(n)) return "vine";
  if (/dead/.test(n) && /leave|leaf/.test(n)) return "dead";
  if (/leave|leaf/.test(n)) return "leaf";
  if (/trunk/.test(n)) return "trunk";
  return "atlas";
}

function lookId(hint: string): string {
  if (TABLE[hint]) return hint;
  const file = hint.split(/[\\/]/).pop() ?? hint;
  const id = file.replace(/\.gltf$/i, "").split("?")[0] ?? hint;
  if (TABLE[id]) return id;
  for (const key of Object.keys(TABLE).sort((a, b) => b.length - a.length)) {
    if (hint.includes(key)) return key;
  }
  return id;
}

/** Willow / vine cards share no verts with the trunk — flip V so strands hang. */
function flipLeafUv(node: Mesh): void {
  const list = Array.isArray(node.material) ? node.material : [node.material];
  const geo = node.geometry;
  const uv = geo.getAttribute("uv");
  if (!uv) return;
  const idx = geo.getIndex();
  const groups = geo.groups.length > 0 ? geo.groups : [{ start: 0, count: idx?.count ?? uv.count, materialIndex: 0 }];
  const seen = new Set<number>();
  for (const g of groups) {
    const mat = list[g.materialIndex ?? 0] ?? list[0];
    const kind = kindOfGltf(mat?.name ?? "");
    if (kind !== "leaf" && kind !== "vine") continue;
    if (idx) {
      for (let i = g.start; i < g.start + g.count; i++) {
        const vi = idx.getX(i);
        if (seen.has(vi)) continue;
        seen.add(vi);
        uv.setY(vi, 1 - uv.getY(vi));
      }
    } else {
      for (let i = g.start; i < g.start + g.count; i++) uv.setY(i, 1 - uv.getY(i));
    }
  }
  if (seen.size) uv.needsUpdate = true;
}

/** Olive leaf cards become a value map so a chromatic tint can be any hue. */
function lumaOf(tex: Texture, willow = false, contrast = false): Texture {
  const cache = contrast ? willowContrastCache : willow ? willowLumaCache : lumaCache;
  const hit = cache.get(tex);
  if (hit) return hit;
  const next = bake(tex, (r, g, b) => {
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    // Willow source leaves are much brighter than the generic leaf atlas.
    // The generic gain clips most willow texels, flattening their painted veins.
    const v = contrast ? Math.min(1,.04+1.25*Math.pow(y,2.7)) : willow ? 0.25 + 0.75 * y : Math.min(1, 0.2 + 1.3 * y);
    return [v, v, v];
  });
  cache.set(tex, next);
  return next;
}

function bake(tex: Texture, pix: (r: number, g: number, b: number) => [number, number, number]): Texture {
  const img = tex.image as { width?: number; height?: number } | undefined;
  const w = img?.width ?? 0;
  const h = img?.height ?? 0;
  if (!w || !h) return tex;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return tex;
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const p = data.data;
  for (let i = 0; i < p.length; i += 4) {
    const [r, g, b] = pix(p[i]! / 255, p[i + 1]! / 255, p[i + 2]! / 255);
    p[i] = Math.round(r * 255);
    p[i + 1] = Math.round(g * 255);
    p[i + 2] = Math.round(b * 255);
  }
  ctx.putImageData(data, 0, 0);
  const next = new CanvasTexture(canvas);
  next.colorSpace = SRGBColorSpace;
  next.flipY = tex.flipY;
  next.wrapS = tex.wrapS;
  next.wrapT = tex.wrapT;
  next.magFilter = tex.magFilter;
  next.minFilter = tex.minFilter;
  next.anisotropy = tex.anisotropy;
  next.needsUpdate = true;
  return next;
}

/** Preserve each leaf card while bending the branch that supports its colony. */
function bendLowerBranch(node:Mesh,rigidCards:boolean):void {
  const g=node.geometry=node.geometry.clone(),p=g.getAttribute('position');
  const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
  const weight=(x:number,y:number,z:number)=>smooth((-x-2)/2)*smooth((z+2)/1.5)*smooth((2.5-z)/1.5)*smooth((6.5-y)/2);
  const weights=new Float32Array(p.count);
  if(rigidCards){
    const indices=g.index?.array??Array.from({length:p.count},(_,i)=>i);
    const parent=new Int32Array(p.count);for(let i=0;i<p.count;i++)parent[i]=i;
    const root=(i:number):number=>{while(parent[i]!==i){parent[i]=parent[parent[i]!]!;i=parent[i]!;}return i;};
    const join=(a:number,b:number)=>{parent[root(a)]=root(b);};
    const used=new Set<number>(indices),weld=new Map<string,number>();
    for(const i of used){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(5)).join(',');const prev=weld.get(key);if(prev!==undefined)join(i,prev);else weld.set(key,i);}
    for(let i=0;i<indices.length;i+=3){join(indices[i]!,indices[i+1]!);join(indices[i]!,indices[i+2]!);}
    const centers=new Map<number,{x:number;y:number;z:number;n:number}>();
    for(const i of used){const id=root(i),c=centers.get(id)??{x:0,y:0,z:0,n:0};c.x+=p.getX(i);c.y+=p.getY(i);c.z+=p.getZ(i);c.n++;centers.set(id,c);}
    for(const i of used){const c=centers.get(root(i))!;weights[i]=weight(c.x/c.n,c.y/c.n,c.z/c.n);}
  }else for(let i=0;i<p.count;i++)weights[i]=weight(p.getX(i),p.getY(i),p.getZ(i));
  for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i)-.25*weights[i]!,p.getY(i),p.getZ(i)+.5*weights[i]!);
  p.needsUpdate=true;if(!rigidCards)g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
}
