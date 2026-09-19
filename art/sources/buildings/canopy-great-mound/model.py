"""Reference-based great-mound; editable parts are authored by the shared forest kit."""
import sys
from pathlib import Path
ASSET=Path(__file__).resolve().parent
sys.path.insert(0,str(ASSET.parents[2]/"recipes"))
from forest_warfare import building
building(ASSET,'great-mound')
