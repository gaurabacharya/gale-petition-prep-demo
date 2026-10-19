import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "./vite.config";

// The GitHub Pages build: the API runs inside the page, so the site works with no server.
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO = "gale-petition-prep-demo";

/** Uses the browser OCR (src/browser/ocr.ts) wherever the server code imports the Node one. */
function browserOcr(): Plugin {
  const nodeOcr = resolve(here, "../src/api/ocr.ts");
  const browser = resolve(here, "../src/browser/ocr.ts");
  return {
    name: "browser-ocr",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!importer || !source.endsWith("/ocr")) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      return resolved?.id === nodeOcr ? browser : null;
    },
  };
}

/** Copies the OCR worker, engine and English model into the site under fixed names, so nothing comes from a CDN. */
function tesseractFiles(): Plugin {
  const core = dirname(require.resolve("tesseract.js-core/package.json"));
  const files: Record<string, string> = {
    "tesseract/worker.min.js": require.resolve("tesseract.js/dist/worker.min.js"),
    "tessdata/eng.traineddata.gz": require.resolve("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"),
  };
  for (const v of ["lstm", "simd-lstm", "relaxedsimd-lstm"]) {
    files[`tesseract/tesseract-core-${v}.wasm.js`] = resolve(core, `tesseract-core-${v}.wasm.js`);
  }
  return {
    name: "tesseract-files",
    generateBundle() {
      for (const [fileName, from] of Object.entries(files)) {
        this.emitFile({ type: "asset", fileName, source: readFileSync(from) });
      }
    },
  };
}

export default mergeConfig(
  base,
  defineConfig({
    base: `/${REPO}/`,
    plugins: [browserOcr(), tesseractFiles()],
    define: { "import.meta.env.VITE_IN_BROWSER": JSON.stringify("true") },
    // PGlite loads its own WASM and data files, which Vite's dependency pre-bundling would break.
    optimizeDeps: { exclude: ["@electric-sql/pglite"] },
    build: { outDir: "dist-pages", emptyOutDir: true, target: "es2022", chunkSizeWarningLimit: 4000 },
  }),
);
