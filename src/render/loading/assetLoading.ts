import {DefaultLoadingManager} from 'three';
import type {LoadProgress} from '../../shared/loading';

/** Observe the shared manager used by existing Three loaders, including texture
 * dependencies inside GLTFs. Overlapping/cancelled sessions cannot steal callbacks. */
const scopes = new Set<AssetLoading>();
let busy = false;
let uninstall: (() => void) | undefined;
function install() {
  const m = DefaultLoadingManager, previous = {start:m.onStart,progress:m.onProgress,load:m.onLoad,error:m.onError};
  m.onStart = (url, loaded, total) => {busy=true;previous.start?.(url,loaded,total);for(const s of scopes)s.progress(loaded,total);};
  m.onProgress = (url, loaded, total) => {busy=loaded<total;previous.progress?.(url,loaded,total);for(const s of scopes)s.progress(loaded,total);};
  m.onError = url => {previous.error?.(url);for(const s of scopes)s.errors.add(url);};
  m.onLoad = () => {busy=false;previous.load?.();for(const s of scopes)s.flush();};
  uninstall=()=>{m.onStart=previous.start;m.onProgress=previous.progress;m.onLoad=previous.load;m.onError=previous.error;busy=false;};
}
export class AssetLoading {
  readonly errors = new Set<string>();
  private readonly waits = new Set<() => void>();
  private closed = false;
  private baseline: number | undefined;
  constructor(private readonly report: (progress: LoadProgress) => void) {if(!scopes.size)install();scopes.add(this);}
  progress(loaded:number,total:number) {
    this.baseline ??= loaded;
    this.report({stage:'Loading models and textures',loaded:loaded-this.baseline,total:total-this.baseline});
  }
  flush() {for(const resolve of this.waits)resolve();this.waits.clear();}
  async ready() {
    if(busy&&!this.closed)await new Promise<void>(resolve=>this.waits.add(resolve));
    if(this.errors.size)throw Error(`Unable to load ${this.errors.size} required asset(s). Check your connection and try again.\n${[...this.errors].join('\n')}`);
  }
  close() {if(this.closed)return;this.closed=true;this.flush();scopes.delete(this);if(!scopes.size){uninstall?.();uninstall=undefined;}}
}
/** Give the progress overlay a paint before starting the next synchronous stage.
 * Timer fallback also allows a background multiplayer tab to finish loading. */
export const loadingPaint = () => new Promise<void>(resolve => {
  let done=false;
  const finish=()=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(frame);resolve();};
  const timer=setTimeout(finish,50),frame=requestAnimationFrame(()=>requestAnimationFrame(finish));
});
