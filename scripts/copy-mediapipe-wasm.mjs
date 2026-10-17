// Copies the installed MediaPipe tasks-vision WASM runtime into public/mediapipe/wasm
// so local detection can load without a CDN. Safe to run when the package is absent.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const dest = join(root, "public", "mediapipe", "wasm");

if (!existsSync(src)) {
  console.log("[mediapipe] runtime not installed yet; skipping wasm copy");
  process.exit(0);
}
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`[mediapipe] copied wasm runtime → ${dest}`);
