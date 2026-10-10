"""Build the optional offline CASC reader in the ignored asset work directory.

Requires git, a C++ compiler and system zlib (macOS/Linux). The game installation
is never patched. Only the disposable, pinned library checkout is modified.
"""
from pathlib import Path
import os
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
WORK = ROOT / '.asset-work/tools/casc-reader'
LIB = WORK / 'CascLib'
REVISION = '38a34665624b8775bb875274b36191b21c38d97b'

def run(args, **kwargs):
    subprocess.run([str(a) for a in args], check=True, **kwargs)

WORK.mkdir(parents=True, exist_ok=True)
if not LIB.exists():
    run(['git', 'clone', 'https://github.com/ladislav-zezula/CascLib.git', LIB])
head = subprocess.check_output(['git', '-C', str(LIB), 'rev-parse', 'HEAD'], text=True).strip()
if head != REVISION:
    run(['git', '-C', LIB, 'checkout', '--detach', REVISION])
stream = LIB / 'src/common/FileStream.cpp'
text = stream.read_text()
# Upstream may open local streams read/write by default. Enforce read-only even
# when no caller flag is forwarded by a format-specific storage handler.
pattern = r'int oflag = [^;]+;'
if len(re.findall(pattern, text)) != 1:
    raise RuntimeError('CascLib stream implementation changed; review read-only patch')
text = re.sub(pattern, 'int oflag = O_RDONLY;', text)
stream.write_text(text)
cmake = (LIB / 'CMakeLists.txt').read_text()
sources = re.search(r'set\(SRC_FILES\s+([^)]+)\)', cmake).group(1).split()
target = WORK / 'casc-extract'
run([os.environ.get('CXX', 'c++'), '-std=c++17', '-O2', '-DCASC_USE_SYSTEM_ZLIB',
     '-DCASCLIB_NO_AUTO_LINK_LIBRARY', '-DCASCLIB_NODEBUG', '-DLPDWORD=PDWORD',
     '-I', LIB / 'src', *[LIB / s for s in sources],
     ROOT / 'scripts/assets/warcraft/casc-extract.cpp', '-lz', '-o', target])
print(target)
