from pathlib import Path
import sys
A=Path(__file__).resolve().parent
sys.path.insert(0,str(A.parents[2]/"recipes"))
from forest_environment import environment
environment(A,'mushroom-cluster')
