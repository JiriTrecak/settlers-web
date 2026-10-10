// Small, offline-only extraction adapter. Build with build-extractor.py.
#include <CascLib.h>
#include <cstdio>
#include <vector>
int main(int argc, char** argv) {
    if (argc != 4) { std::fprintf(stderr, "Usage: casc-extract <.build.info> <archive path> <output>\n"); return 2; }
    HANDLE storage = nullptr, file = nullptr;
    if (!CascOpenStorage(argv[1], 0, &storage)) { std::fprintf(stderr, "Cannot read installed CASC storage (%u)\n", GetCascError()); return 1; }
    if (!CascOpenFile(storage, argv[2], 0, CASC_OPEN_BY_NAME, &file)) {
        std::fprintf(stderr, "Missing CASC entry %s (%u)\n", argv[2], GetCascError()); CascCloseStorage(storage); return 1;
    }
    ULONGLONG size = 0;
    if (!CascGetFileSize64(file, &size) || size > 256 * 1024 * 1024) { CascCloseFile(file); CascCloseStorage(storage); return 3; }
    std::vector<unsigned char> bytes(static_cast<size_t>(size)); DWORD count = 0;
    const bool read = CascReadFile(file, bytes.data(), static_cast<DWORD>(size), &count);
    CascCloseFile(file); CascCloseStorage(storage);
    if (!read || count != size) { std::fprintf(stderr, "Incomplete CASC entry\n"); return 4; }
    FILE* output = std::fopen(argv[3], "wb"); if (!output) return 5;
    const bool written = std::fwrite(bytes.data(), 1, count, output) == count;
    const bool closed = std::fclose(output) == 0;
    return written && closed ? 0 : 5;
}
