import { readFileSync, statSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

function tryFiles(base) {
  // Files only: "@/server/listings" is a folder whose module is its index.ts.
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) if (statSync(cand, { throwIfNoEntry: false })?.isFile()) return cand;
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    const hit = tryFiles(resolvePath(root, "src", specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  if (specifier === "server-only") return { url: "data:text/javascript,export {}", shortCircuit: true };
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !/\.[a-z]+$/.test(specifier)) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const hit = tryFiles(base);
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (url.startsWith("file:") && /\.tsx?$/.test(url)) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    const code = stripTypeScriptTypes(source, { mode: "strip" });
    return { format: "module", source: code, shortCircuit: true };
  }
  return next(url, context);
}
