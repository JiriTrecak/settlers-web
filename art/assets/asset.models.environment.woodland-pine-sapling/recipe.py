from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[4]
sys.path.insert(0,str(ROOT/'art/recipes'))
from woodland_originals import build
build(Path(__file__).resolve().parent)
