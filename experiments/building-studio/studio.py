"""Local build/render queue with save watching. No Blender add-on or cloud service needed."""
import argparse
import functools
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlsplit

from palette import extract
from compare import comparison

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
ASSETS = ROOT / 'experiments/assets/buildings'


def asset_path(name):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', name):
        raise ValueError('Asset names use lowercase letters, digits and hyphens')
    path = (ASSETS / name).resolve()
    if path.parent != ASSETS.resolve():
        raise ValueError('Asset path leaves buildings folder')
    return path


def config_for(asset):
    config = json.loads((asset / 'asset.json').read_text())
    for field in ['blend', 'recipe']:
        value = config[field]
        if Path(value).name != value or not value:
            raise ValueError(f'{field} must name a file inside the asset folder')
    return config


def blender_binary():
    value = os.environ.get('BLENDER_BIN') or shutil.which('blender')
    if not value and Path('/Applications/Blender.app/Contents/MacOS/Blender').exists():
        value = '/Applications/Blender.app/Contents/MacOS/Blender'
    if not value:
        raise RuntimeError('Blender not found. Set BLENDER_BIN to its executable path.')
    return value


def atomic_json(path, data):
    temporary = path.with_name('.state-' + path.name)
    temporary.write_text(json.dumps(data, indent=2) + '\n')
    temporary.replace(path)


class Studio:
    """One coalescing worker owns Blender jobs; saves during renders schedule one follow-up."""
    def __init__(self, name, quick=False):
        self.asset = asset_path(name)
        self.config = config_for(self.asset)
        self.quick = quick
        self.lock = threading.RLock()
        self.pending = None
        self.running = False
        self.closed = threading.Event()
        self.process = None
        self.gui_process = None
        self.state = {'asset':name,'name':self.config['name'],'phase':'idle','message':'Watching Blender saves',
                      'revision':self._revision(),'view':'saved','auto_render':True}
        self.seen = self._stamp()
        self.watch_thread = None

    def _revision(self):
        p=self.asset/'render.png'
        return p.stat().st_mtime_ns if p.exists() else 0

    def _stamp(self):
        p=self.asset/self.config['blend']
        return (p.stat().st_mtime_ns,p.stat().st_size) if p.exists() else None

    def status(self):
        with self.lock:
            state=dict(self.state)
            state['revision']=self._revision()
            state['pending']=self.pending[0] if self.pending else None
        for key,file in [('palette','palette.json'),('stats','model-stats.json')]:
            p=self.asset/file
            if p.exists():
                try: state[key]=json.loads(p.read_text())
                except json.JSONDecodeError: pass
        state['history']=[{'file':str(p.relative_to(self.asset)), 'label':p.stem}
                          for p in sorted((self.asset/'history').glob('*.png'),reverse=True)[:12]]
        state['blend_file']=self.config['blend']
        state['blend_path']=str(self.asset/self.config['blend'])
        viewer=self.asset/'model.glb'
        state['viewer_revision']=viewer.stat().st_mtime_ns if viewer.exists() else 0
        return state

    def open_blender(self):
        blend=self.asset/self.config['blend']
        if not blend.is_file():raise ValueError('Build the model first')
        if self.gui_process and self.gui_process.poll() is None:
            return
        # A NEW Blender process preserves the user's existing open Blender document.
        self.gui_process=subprocess.Popen([blender_binary(),str(blend)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

    def set_state(self, **values):
        with self.lock: self.state.update(values)

    def request(self, action, view='saved'):
        if action not in ('render','build','palette'):
            raise ValueError('Unknown action')
        if view not in ('saved','reference','front','right','back'):
            raise ValueError('Unknown view')
        with self.lock:
            # A save event must never replace an explicit queued build.
            if self.pending is None or self.pending[0] != 'build':
                self.pending=(action,view)
            if not self.running:
                self.running=True
                threading.Thread(target=self._worker,daemon=True).start()

    def _worker(self):
        while not self.closed.is_set():
            with self.lock:
                job=self.pending
                self.pending=None
                if job is None:
                    self.running=False
                    return
            try:
                self.run(*job)
            except Exception as error:
                self.set_state(phase='error',message=str(error))
                print(f'ERROR: {error}',flush=True)

    def _blender(self, args, logname):
        cmd=[blender_binary(), '--background', *args[:1], '--threads','8','--python-exit-code','1',*args[1:]]
        with (self.asset/logname).open('w') as log:
            self.process=subprocess.Popen(cmd,stdout=log,stderr=subprocess.STDOUT,cwd=ROOT)
            code=self.process.wait()
            self.process=None
        if code:
            lines=(self.asset/logname).read_text(errors='replace').splitlines()[-12:]
            raise RuntimeError(f'Blender exited {code}. {logname}: ' + '\n'.join(lines))

    def run(self, action, view='saved'):
        started=time.monotonic()
        self.config=config_for(self.asset)
        if action in ('build','palette'):
            self.set_state(phase='sampling',message='Extracting exact source colors')
            extract(self.asset)
        if action=='palette':
            self.set_state(phase='idle',message='Palette updated; rebuild when ready to apply material changes')
            return
        if action=='build':
            recipe=self.asset/self.config['recipe']
            if not recipe.exists():
                raise RuntimeError('This reference needs an authored model.py recipe before it can be built.')
            self.set_state(phase='building',message='Building editable geometry in a separate Blender process')
            self._blender(['--factory-startup','--python',str(recipe)],'build.log')
            self.seen=self._stamp()
        blend=self.asset/self.config['blend']
        if not blend.exists():
            raise RuntimeError('No saved Blender model yet. Build the recipe first.')
        self.set_state(phase='rendering',message='Rendering saved Blender scene',view=view)
        stamp=self._stamp()
        output=self.asset/f'.render-{time.time_ns()}.png'
        args=[str(blend),'--python',str(HERE/'render.py'),'--','--asset',str(self.asset),'--output',str(output),'--view',view]
        if self.quick: args.append('--quick')
        try:
            self._blender(args,'render.log')
            # Publish atomically; browsers never see an incomplete PNG.
            output.with_suffix('.glb').replace(self.asset/'model.glb')
            output.with_suffix('.json').replace(self.asset/'viewer.json')
            output.replace(self.asset/'render.png')
        finally:
            output.unlink(missing_ok=True)
            output.with_suffix('.glb').unlink(missing_ok=True)
            output.with_suffix('.json').unlink(missing_ok=True)
        comparison(self.asset)
        history=self.asset/'history'
        history.mkdir(exist_ok=True)
        label=time.strftime('%Y%m%d-%H%M%S')+'-'+view
        shutil.copy2(self.asset/'render.png',history/(label+'.png'))
        metadata={'at':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'view':view,'quick':self.quick,
                  'seconds':round(time.monotonic()-started,2),'blend_mtime_ns':stamp[0],
                  'config':self.config}
        atomic_json(self.asset/'render-info.json',metadata)
        self.set_state(phase='idle',message=f'Render updated in {metadata["seconds"]:.1f}s · save Blender to refresh',revision=self._revision())
        print(f'READY {self.asset / "comparison.png"}',flush=True)

    def watch(self):
        self.watch_thread=threading.Thread(target=self._watch,daemon=True)
        self.watch_thread.start()

    def _watch(self):
        candidate=None
        while not self.closed.wait(.75):
            try: stamp=self._stamp()
            except OSError: continue
            if stamp and stamp!=self.seen:
                if candidate==stamp:
                    self.seen=stamp
                    candidate=None
                    with self.lock:
                        building=self.state['phase']=='building'
                    if not building:self.request('render')
                else: candidate=stamp
            else: candidate=None

    def close(self):
        self.closed.set()
        if self.process and self.process.poll() is None:
            self.process.terminate()


class Handler(SimpleHTTPRequestHandler):
    """Serve only the studio and selected asset, with same-origin local mutation endpoints."""
    def __init__(self,*args,studio=None,**kwargs):
        self.studio=studio
        super().__init__(*args,directory=str(HERE),**kwargs)

    def log_message(self,*args): pass

    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()

    def json(self,data,status=200):
        body=json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        route=unquote(urlsplit(self.path).path)
        if route=='/api/status':return self.json(self.studio.status())
        if route.startswith('/asset/'):
            path=(self.studio.asset/route[len('/asset/'):]).resolve()
            if not path.is_relative_to(self.studio.asset) or not path.is_file():
                return self.send_error(404)
        elif route.startswith('/vendor/three/'):
            base=(ROOT/'node_modules/three').resolve()
            path=(base/route[len('/vendor/three/'):]).resolve()
            if not path.is_relative_to(base) or not path.is_file() or path.suffix!='.js':
                return self.send_error(404)
        elif route=='/viewer.js':
            path=HERE/'viewer.js'
        elif route in ('/','/index.html'):
            path=HERE/'index.html'
        else:return self.send_error(404)
        self.send_response(200)
        self.send_header('Content-Type',mimetypes.guess_type(str(path))[0] or 'application/octet-stream')
        self.send_header('Content-Length',str(path.stat().st_size))
        self.end_headers()
        try:
            with path.open('rb') as f:shutil.copyfileobj(f,self.wfile)
        except (BrokenPipeError,ConnectionResetError):pass

    def do_POST(self):
        expected=f'http://{self.headers.get("Host","")}'
        if self.headers.get('Origin') not in (None,expected):return self.json({'error':'Origin rejected'},403)
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.json({'error':'JSON required'},415)
        try:
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=8192:raise ValueError('Invalid request size')
            data=json.loads(self.rfile.read(length))
            route=urlsplit(self.path).path
            if route=='/api/action':
                if data['action']=='open':self.studio.open_blender()
                else:self.studio.request(data['action'],data.get('view','saved'))
            elif route=='/api/sample':
                name=data['name']
                if not re.fullmatch(r'[a-z][a-z0-9_]{0,40}',name):raise ValueError('Use a simple material name')
                u,v=float(data['u']),float(data['v'])
                if not 0<=u<=1 or not 0<=v<=1:raise ValueError('Sample outside image')
                path=self.studio.asset/'samples.json'
                with self.studio.lock:
                    points=json.loads(path.read_text())
                    points[name]={'u':u,'v':v,'radius':int(data.get('radius',3))}
                    if not 0<=points[name]['radius']<=30:raise ValueError('Invalid sample radius')
                    atomic_json(path,points)
                self.studio.request('palette')
            else:return self.json({'error':'Not found'},404)
            self.json({'ok':True},202)
        except (KeyError,ValueError,TypeError) as error:self.json({'error':str(error)},400)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',nargs='?',choices=['serve','build','render','palette','init'],default='serve')
    parser.add_argument('asset',nargs='?',default='rootbound-hall')
    parser.add_argument('--port',type=int,default=8766)
    parser.add_argument('--quick',action='store_true')
    parser.add_argument('--view',choices=['saved','reference','front','right','back'],default='saved')
    parser.add_argument('--reference',type=Path)
    args=parser.parse_args()
    if args.command=='init':
        if not args.reference or not args.reference.is_file():parser.error('init requires --reference /path/image.png')
        asset=asset_path(args.asset)
        if asset.exists():parser.error('Asset already exists; choose a new name')
        asset.mkdir(parents=True)
        from PIL import Image
        im=Image.open(args.reference).convert('RGB');im.save(asset/'reference.png')
        config={'name':args.asset.replace('-',' ').title(),'blend':args.asset+'.blend','recipe':'model.py','seed':28,
                'camera':{'azimuth':19,'elevation':29,'scale':11.6,'target':[0,0,2.15]},
                'render':{'width':im.width,'height':im.height,'samples':32},
                'light':{'key_energy':1200,'fill_energy':300,'rim_energy':1000}}
        atomic_json(asset/'asset.json',config);atomic_json(asset/'samples.json',{})
        extract(asset)
        print(f'Created {asset}. Open the studio to sample colors, then author model.py for this reference.')
        return
    studio=Studio(args.asset,args.quick)
    if args.command!='serve':
        studio.run(args.command,args.view)
        return
    studio.watch()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),functools.partial(Handler,studio=studio))
    print(f'Building Studio: http://127.0.0.1:{args.port}\nAsset: {studio.asset}\nSave the .blend to render and refresh automatically.',flush=True)
    try:server.serve_forever(poll_interval=.5)
    except KeyboardInterrupt:pass
    finally:studio.close();server.server_close()


if __name__=='__main__':
    main()
