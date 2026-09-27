"""Rebuild the editable source using the shared Tripo building adapter."""
from pathlib import Path
import runpy
P=Path(__file__).resolve().parent
runpy.run_path(str(P.parents[3]/"experiments/building-studio/tripo_building.py"),init_globals={"ASSET_DIR":str(P)})
