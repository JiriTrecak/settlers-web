/** Art-direction fixture: the saved map and the game's renderer, without editor chrome. */
import { perf } from "./debug/performance";
import { GRAPHICS_CHANGED, readResolutionScale, readShadowMode, setShadowMode } from "./shared/settings/graphics";
const mapSources = import.meta.glob('../assets/maps/**/*.utcmap', {query:'?raw', import:'default', eager:true}) as Record<string,string>;
import { parseUtcMap, decodeHeight, HeightField } from "./shared";
import { emptyLandscape } from "./shared/landscape/curve";
import { projectCatalogue, projectMeshUrl } from "./shared/assets/project";
import { Renderer } from "./render";
import {
  authoredScene,
  editorEntities,
  resourceStamps,
} from "./presentation/scenery";
async function start() {
  const params = new URLSearchParams(location.search);
  const mapId=params.get('map') ?? 'worldroot-hollow';
  const raw=Object.entries(mapSources).find(([path])=>path.endsWith('/'+mapId+'.utcmap'))?.[1];
  if(!raw)throw Error('Unknown authored map: '+mapId);
  const x = Number(params.get("x") ?? 128),
    z = Number(params.get("z") ?? 127),
    zoom = Math.max(0.5, Math.min(2, Number(params.get("zoom") ?? 0.8)));
  const map = parseUtcMap(JSON.parse(raw));
  if (!map) throw Error("Invalid Ant comparison map");
  const sites=document.createElement('details');sites.style.cssText='position:fixed;z-index:10;right:12px;top:12px;background:#101820ee;color:white;padding:10px;font:14px system-ui;max-height:80vh;overflow:auto';
  const label=document.createElement('summary');label.textContent='Inspect Root sites';sites.append(label);
  const seenMaps=new Set<string>();
  for(const [path,raw] of Object.entries(mapSources)){
    const id=path.split('/').at(-1)!.replace('.utcmap','');
    const authored=parseUtcMap(JSON.parse(raw));if(!authored||seenMaps.has(id))continue;seenMaps.add(id);
    for(const site of authored.entities.filter(e=>e.definition==='building.neutral.corrupted-root')){
      const a=document.createElement('a');a.style.cssText='display:block;color:#dce6c7;padding:5px';
      a.textContent=authored.name+' · '+site.position.x+', '+site.position.y;
      a.href='?'+new URLSearchParams({map:id,x:String(site.position.x),z:String(site.position.y),zoom:'1'});sites.append(a);
    }
  }
  document.body.append(sites);
  const catalog = projectCatalogue();
  const urls = new Map(
    catalog.assets.flatMap((a) => {
      const url = projectMeshUrl(a.file);
      return url ? [[a.id, url] as [string, string]] : [];
    }),
  );
  const renderer = new Renderer(
    document.querySelector<HTMLCanvasElement>("#scene")!,
    urls,
  );
  renderer.setKinds(new Map(catalog.assets.map((a) => [a.id, a.type])));
  const field = new HeightField(map.size);
  field.load(map.height ? decodeHeight(map.height,map.size)! : [], map.waterLevel ?? 0);
  renderer.setTerrain(field);
  renderer.setLandscape(map.landscape ?? emptyLandscape());
  renderer.setGridMode("none");
  renderer.camera.setGame(true,map.size);
  renderer.camera.pose({
    x,
    z,
    yaw: 0,
    pitch: (42 * Math.PI) / 180,
    gameZoom: zoom,
  });
  const entities = editorEntities(map),
    snapshot = { tick: 0, size: map.size, settlement: authoredScene(entities) },
    stamps = [...map.stamps, ...resourceStamps(entities)];
  renderer.draw(snapshot, stamps);
  await Promise.all([renderer.ready(), renderer.gameReady()]);
  renderer.draw(snapshot, stamps);
  // Repeat the same instant: asynchronous texture arrival can repaint without
  // changing wind/water phase or advancing the map's locked daytime clock.
  const benchmark=params.has('benchmark');
  let frames=0,lastFrame=0, intervals:number[]=[];
  const results:{scale:number;shadow:string;fps:number;frameP95:number|undefined;report:ReturnType<typeof perf.report>}[]=[];
  const summary=()=>results.map(r=>({scale:r.scale,shadows:r.shadow,fps:Math.round(r.fps),frameP95:r.frameP95,GPU:r.report.timings['GPU frame'],CPU:r.report.timings['Present total (CPU)']}));
  const modes=[{scale:1,shadow:'soft'},{scale:.5,shadow:'soft'},{scale:1,shadow:'filtered'},{scale:.5,shadow:'filtered'}] as const;
  const original={scale:readResolutionScale(),shadow:readShadowMode(),debug:perf.enabled};
  let mode=0,finished=false;
  const output=document.createElement('pre');
  if(benchmark){
    output.style.cssText='position:fixed;left:12px;top:12px;background:#101820ee;color:white;padding:12px;font:13px monospace;max-height:85vh;overflow:auto';
    document.body.append(output);renderer.sky.setPlaying(false);renderer.sky.setHour(11);
    if(!perf.enabled)perf.toggle();
  }
  const apply=()=>{
    window.dispatchEvent(new CustomEvent(GRAPHICS_CHANGED,{detail:modes[mode]!.scale}));
    setShadowMode(modes[mode]!.shadow);
  };
  const restore=()=>{
    window.dispatchEvent(new CustomEvent(GRAPHICS_CHANGED,{detail:original.scale}));
    setShadowMode(original.shadow);
    if(perf.enabled!==original.debug)perf.toggle();
  };
  if(benchmark){apply();window.addEventListener('beforeunload',restore,{once:true})}
  let previewPaused=false;
  const pause=document.createElement('button');pause.textContent='Pause preview';pause.style.cssText='position:fixed;left:12px;bottom:12px;z-index:10;background:#101820ee;color:white;border:1px solid #6b7966;padding:8px 12px';
  pause.onclick=()=>{previewPaused=!previewPaused;pause.textContent=previewPaused?'Resume preview':'Pause preview';};
  if(!benchmark)document.body.append(pause);
  const frame = (now:number) => {
    if(!benchmark&&(document.hidden||previewPaused)){requestAnimationFrame(frame);return;}

    perf.frame(now);renderer.present(12_000);
    if(benchmark&&!finished){
      if(document.hidden){frames=0;intervals=[];lastFrame=0;}
      else {
        frames++;if(frames>120&&lastFrame)intervals.push(now-lastFrame);lastFrame=now;
        output.textContent='Fixed scene · 11:00 · '+map.name+'\n'+JSON.stringify(modes[mode])+' · '+frames+'/360 frames\n'+JSON.stringify(summary(),null,2);
        if(frames>=360){
          const sorted=intervals.slice().sort((a,b)=>a-b),mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
          results.push({...modes[mode],fps:1000/mean,frameP95:sorted[Math.ceil(sorted.length*.95)-1],report:perf.report()});
          frames=0;intervals=[];lastFrame=0;mode++;
          if(mode===modes.length){finished=true;restore();output.textContent='Complete · original settings restored\n'+JSON.stringify(summary(),null,2);document.body.dataset.benchmark=JSON.stringify(results)}else apply();
        }
      }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  document.body.dataset.ready = "true";
  document.body.dataset.map = map.name;
  document.body.dataset.capture = JSON.stringify({
    x,
    z,
    yaw: 0,
    pitch: 42,
    gameZoom: zoom,
    animationTime: 12,
    stamps: map.stamps.length,
  });
}
void start().catch((error) => {
  const el = document.querySelector<HTMLElement>("#error")!;
  el.hidden = false;
  el.textContent = String(error?.stack ?? error);
  document.body.dataset.error = String(error);
});
