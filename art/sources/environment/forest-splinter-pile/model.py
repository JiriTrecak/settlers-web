from pathlib import Path
import sys
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parent/'canopy-kit'))
from kit_recipe import build
build(A)
