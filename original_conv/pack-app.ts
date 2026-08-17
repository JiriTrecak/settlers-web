/**
 * One-shot: Tauri macOS .app + Windows exe into `build/macosx` and `build/win`.
 *
 *   npm run pack:app
 *
 * Windows from a Mac uses cargo-xwin (raw .exe — NSIS OOM on this dump).
 * Native Windows still builds the NSIS installer.
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, cpSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAC_OUT = join(ROOT, "build/macosx");
const WIN_OUT = join(ROOT, "build/win");
const LLVM = "/opt/homebrew/opt/llvm/bin";
const CARGO_BIN = join(homedir(), ".cargo/bin");

function pathEnv(): NodeJS.ProcessEnv {
  const parts = [CARGO_BIN, existsSync(LLVM) ? LLVM : "", process.env.PATH ?? ""].filter(Boolean);
  return {
    ...process.env,
    PATH: parts.join(":"),
    XWIN_CACHE_DIR: process.env.XWIN_CACHE_DIR ?? join(homedir(), ".cache/cargo-xwin"),
  };
}

function cargoTarget(): string {
  return process.env.CARGO_TARGET_DIR ?? join(ROOT, "src-tauri/target");
}

function tauriCwd(): string {
  if (!ROOT.includes(" ")) return ROOT;
  const link = "/tmp/settlers-web";
  execSync(`ln -sfn "${ROOT}" "${link}"`);
  return link;
}

function run(cmd: string): void {
  execSync(cmd, { cwd: tauriCwd(), stdio: "inherit", env: pathEnv() });
}

function emptyDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

function copyMac(): void {
  const app = join(cargoTarget(), "release/bundle/macos/Settlers.app");
  if (!existsSync(app)) throw new Error(`missing mac bundle: ${app}`);
  emptyDir(MAC_OUT);
  run(`ditto "${app}" "${join(MAC_OUT, "Settlers.app")}"`);
  run(`ditto -c -k --sequesterRsrc --keepParent "${join(MAC_OUT, "Settlers.app")}" "${join(MAC_OUT, "Settlers-macos.zip")}"`);
  console.log(`mac  ${MAC_OUT}`);
}

function copyWin(): void {
  emptyDir(WIN_OUT);
  const nsis = join(cargoTarget(), "x86_64-pc-windows-msvc/release/bundle/nsis");
  const nativeNsis = join(cargoTarget(), "release/bundle/nsis");
  const nsisDir = existsSync(nsis) ? nsis : existsSync(nativeNsis) ? nativeNsis : null;
  if (nsisDir) {
    for (const name of readdirSync(nsisDir)) {
      cpSync(join(nsisDir, name), join(WIN_OUT, name), { recursive: true });
    }
  }
  const crossExe = join(cargoTarget(), "x86_64-pc-windows-msvc/release/settlers.exe");
  const nativeExe = join(cargoTarget(), "release/settlers.exe");
  const exe = existsSync(crossExe) ? crossExe : nativeExe;
  if (existsSync(exe)) cpSync(exe, join(WIN_OUT, "Settlers.exe"));
  if (!existsSync(WIN_OUT) || readdirSync(WIN_OUT).length === 0) {
    throw new Error(`missing windows build under ${cargoTarget()}`);
  }
  console.log(`win  ${WIN_OUT}`);
}

function buildMac(): void {
  console.log("tauri macOS");
  run("npx tauri build --bundles app");
  copyMac();
}

function buildWin(): void {
  console.log("tauri Windows");
  const args =
    process.platform === "win32"
      ? "npx tauri build --bundles nsis"
      : "npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle";
  run(args);
  copyWin();
}

mkdirSync(join(ROOT, "build"), { recursive: true });
buildMac();
buildWin();
console.log("done");
console.log(`  ${MAC_OUT}`);
console.log(`  ${WIN_OUT}`);
