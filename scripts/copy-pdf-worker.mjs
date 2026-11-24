// Copies pdf.js's worker into /public so the browser can load it (kept in step with the installed version).
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/pdfjs", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdfjs/pdf.worker.min.mjs");
