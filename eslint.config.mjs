import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "website/**", "ios/**", "public/mediapipe/**", "next-env.d.ts"]),
  {
    // A .cjs file is CommonJS by definition, so require() is its native import
    // syntax rather than a lapse. The TypeScript preset bans it project-wide.
    files: ["**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
]);
