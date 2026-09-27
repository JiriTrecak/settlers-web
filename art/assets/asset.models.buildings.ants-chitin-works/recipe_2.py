"""Derive an ownership mask without changing reference RGB."""
from pathlib import Path
import runpy
P=Path(__file__).resolve().parent
runpy.run_path(str(P.parents[3]/"experiments/building-studio/tripo_texture.py"),init_globals={"ASSET_DIR":str(P)})
