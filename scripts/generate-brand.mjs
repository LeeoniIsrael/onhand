import { Buffer } from "node:buffer";
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
const hand =
  '<g fill="none" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10V5.5a1.5 1.5 0 0 1 3 0V12M17 10V8.5a1.5 1.5 0 0 1 3 0V15c0 4-2.8 7-6.5 7-2.1 0-3.8-.8-5.1-2.6L4.2 14a1.6 1.6 0 0 1 2.4-2.1L9 14"/><path d="M11 15h3"/></g>';
const svg = (background = true) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background ? '<rect width="1024" height="1024" fill="#214DD8"/>' : ""}<g transform="translate(156 115) scale(30)">${hand}</g></svg>`;
await mkdir("assets/brand", { recursive: true });
await writeFile("assets/brand/onhand-mark.svg", svg());
await sharp(Buffer.from(svg()))
  .resize(1024, 1024)
  .flatten({ background: "#214DD8" })
  .removeAlpha()
  .png()
  .toFile("assets/brand/icon.png");
await sharp(Buffer.from(svg()))
  .resize(64, 64)
  .png()
  .toFile("assets/brand/favicon.png");
await sharp(Buffer.from(svg(false)))
  .resize(1024, 1024)
  .png()
  .toFile("assets/brand/foreground.png");
await sharp(Buffer.from(svg()))
  .resize(256, 256)
  .png()
  .toFile("assets/brand/splash.png");
