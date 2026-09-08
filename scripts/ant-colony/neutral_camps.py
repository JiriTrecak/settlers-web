"""Idempotent, rotationally mirrored Mosswater neutral placements."""
import math

def add_camps(m):
    centers=[(90,85),(166,171),(103,145),(153,111)]
    m['stamps']=[s for s in m['stamps'] if not s['asset'].startswith('neutral-') and not any(math.hypot(s['x']+.5-x,s['y']+.5-z)<5 for x,z in centers)]
    for kind,x,z in [('wolf',88,85),('wolf',92,85),('wolf',90,88),('ogre',103,145)]:
        for side,(px,pz) in enumerate([(x,z),(256-x,256-z)]):
            m['stamps'].append(dict(id=f'camp-{kind}-{x}-{z}-{side}',asset='neutral-'+kind,x=px-.5,y=pz-.5,yaw=side*math.pi,scale=1))
    return m

if __name__=='__main__':
    import json
    from pathlib import Path
    p=Path('assets/maps/showcase/mosswater-divide.utcmap')
    p.write_text(json.dumps(add_camps(json.loads(p.read_text())),separators=(',',':'))+'\n')
