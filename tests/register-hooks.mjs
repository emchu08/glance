// Test/script loader: resolves the `@/*` alias to ./src and strips TypeScript types
// using Node's built-in transformer, so tests run on Node 22.13+ without a build step.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./loader-hooks.mjs", import.meta.url), pathToFileURL("./"));
