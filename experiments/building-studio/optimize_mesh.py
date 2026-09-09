"""Per-part preview simplification; only call inside a disposable Blender process."""
import re

import bpy


def optimize_objects(objects):
    for obj in objects:
        name=re.sub(r'\.\d+$','',obj.name)
        # These subpixel roundovers do not need a second bevel ring in the realtime asset.
        for mod in obj.modifiers:
            if mod.type=='BEVEL' and mod.width<=.035:
                mod.segments=1
        ratio=None
        if obj.type=='CURVE':
            obj.data=obj.data.copy()
            obj.data.bevel_resolution=0
        elif name in {'Ancient spreading buttress','Forked root finger','Gate root knuckle',
                      'Long curling lateral root','Rear structural root','Massive door jamb'}:
            ratio=.55
        elif name in {'Curved redwood shingle','Lower tier hewn redwood','Porch curved red plank'}:
            ratio=.65
        elif name=='Tattered crimson cloth':
            ratio=.6
        if ratio and obj.type=='MESH':
            mod=obj.modifiers.new('Preview surface simplification','DECIMATE')
            mod.ratio=ratio
            mod.use_collapse_triangulate=True
