/**
 * Run the tools Tauri CLI with cwd = this folder so it finds `src-tauri/`,
 * not the game's crate at the repo root.
 *
 *   npm run tauri:tools        → tauri dev
 *   npm run pack:tools         → tauri build
 */
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const cwd = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2] ?? "dev";
const extra = process.argv.slice(3);
const result = spawnSync("npx", ["tauri", mode, ...extra], { cwd, stdio: "inherit" });
process.exit(result.status ?? 1);
