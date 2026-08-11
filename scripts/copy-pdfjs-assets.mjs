// Stage the pdf.js runtime assets into public/pdfjs/ so the in-app PDF
// preview can actually decode real-world documents. pdf.js v5+ fetches these
// at render time: wasm/ (jbig2 + openjpeg + qcms — scanned/faxed documents
// and ICC color), standard_fonts/ (PDFs with non-embedded base fonts),
// cmaps/ (CJK text), iccs/ (color profiles). Serving only the worker makes
// those fetches 404 and pdf.js silently paints blank white pages.
//
// Runs on postinstall (see package.json) so the staged assets always match
// the installed pdfjs-dist version — public/pdfjs/ is gitignored on purpose.
// The worker is staged here too; keep BucketFileReviewPanel's workerSrc and
// getDocument URLs pointing at /pdfjs/.

import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(projectRoot, "package.json"));
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const pdfjsVersion = require("pdfjs-dist/package.json").version;
const target = join(projectRoot, "public", "pdfjs");

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });

const dirs = ["wasm", "standard_fonts", "cmaps", "iccs"];
for (const dir of dirs) {
  const source = join(pdfjsRoot, dir);
  if (!existsSync(source)) {
    console.error(`copy-pdfjs-assets: missing ${source} — pdfjs-dist layout changed?`);
    process.exit(1);
  }
  cpSync(source, join(target, dir), { recursive: true });
}
cpSync(join(pdfjsRoot, "legacy", "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
writeFileSync(join(target, "VERSION"), `${pdfjsVersion}\n`);
console.log(`copy-pdfjs-assets: staged pdfjs-dist ${pdfjsVersion} assets (${dirs.join(", ")}, worker) into public/pdfjs/`);
