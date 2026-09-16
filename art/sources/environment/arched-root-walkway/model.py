from pathlib import Path
import sys
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parent/'crossing-kit'))
from recipe import build
build(A)
