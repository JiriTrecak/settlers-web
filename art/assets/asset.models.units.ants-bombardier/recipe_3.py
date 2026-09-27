from pathlib import Path
P=Path(__file__).resolve().parent
exec(compile((P.parents[3]/'experiments/building-studio/tripo_texture.py').read_text(),'tripo_texture.py','exec'),{'ASSET_DIR':str(P)})
