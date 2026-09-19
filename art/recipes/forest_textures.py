"""Deterministic, tileable low-contrast grain for the forest construction kit.

Run with the studio Python (Pillow + NumPy). These are unlit material textures,
not photographs with baked shadows. Large waves survive the RTS camera.
"""
from pathlib import Path
import numpy as np
from PIL import Image

DEST=Path(__file__).resolve().parents[1]/'sources/textures/forest-warfare'
DEST.mkdir(parents=True,exist_ok=True)
N=256
y,x=np.mgrid[:N,:N]/N
phase=x*2*np.pi*9+.65*np.sin(y*2*np.pi)+.18*np.sin(y*6*np.pi)
grain=.86+.07*np.sin(phase)+.025*np.sin(phase*2+.4)
bark=.82+.10*np.sin(x*2*np.pi*6+.32*np.sin(y*4*np.pi))+.025*np.cos(y*8*np.pi+x*2*np.pi)
# Flattened painterly leaf: broad fold variation and paired veins, neutral so
# the material factor can recolor it to any player color without tint leakage.
vein=np.abs((y*7-np.abs(x-.5)*2.6+.5)%1-.5)
leaf=.80+.13*np.cos((x-.5)*np.pi)+.025*np.sin(y*2*np.pi)
leaf-=.10*np.exp(-(vein/.06)**2)
leaf+=.12*np.exp(-((vein-.07)/.028)**2)
leaf-=.12*np.exp(-((x-.49)/.022)**2)
leaf+=.13*np.exp(-((x-.52)/.016)**2)
for name,values in [('wood',grain),('bark',bark),('leaf',leaf)]:
    # Neutral modulation. The recipe multiplies this with each calibrated color
    # into a packed albedo, so the game needs only a standard base-color texture.
    a=np.repeat(np.clip(values[...,None],0,1),3,axis=2)
    Image.fromarray(np.uint8(a*255)).save(DEST/(name+'.png'))
