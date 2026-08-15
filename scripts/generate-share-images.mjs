/**
 * Raster share images for iMessage / Open Graph / the home screen.
 *
 * Chrome draws the HTML; ffmpeg encodes the JPEG and scales the icons.
 * Re-run after the mark, palette, or collection photos change:
 *
 *   node scripts/generate-share-images.mjs
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public");
const workDir = join(root, ".cache/share-images");

const chrome = [
    process.env.CHROME_PATH,
    `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) {
    console.error("No Chrome binary found");
    process.exit(1);
}

const mark = `<svg viewBox="0 0 36 36" fill="none" aria-hidden="true">
  <path fill="#f2ede4" d="M22.25 4h-8.5a1 1 0 0 0-.96.73l-5.54 19.4a.5.5 0 0 0 .62.62l5.05-1.44a2 2 0 0 0 1.38-1.4l3.22-11.66a.5.5 0 0 1 .96 0l3.22 11.67a2 2 0 0 0 1.38 1.39l5.05 1.44a.5.5 0 0 0 .62-.62l-5.54-19.4a1 1 0 0 0-.96-.73Z"/>
  <path fill="url(#flame)" d="M18 28a7.63 7.63 0 0 1-5-2c-1.4 2.1-.35 4.35.6 5.55.14.17.41.07.47-.15.44-1.8 2.93-1.22 2.93.6 0 2.28.87 3.4 1.72 3.81.34.16.59-.2.49-.56-.31-1.05-.29-2.46 1.29-3.25 3-1.5 3.17-4.83 2.5-6-.67.67-2.6 2-5 2Z"/>
  <defs>
    <linearGradient id="flame" x1="16" x2="16" y1="32" y2="24" gradientUnits="userSpaceOnUse">
      <stop stop-color="#e9b44c"/>
      <stop offset="1" stop-color="#e9b44c" stop-opacity="0"/>
    </linearGradient>
  </defs>
</svg>`;

const photos = ["80s.webp", "disney.webp", "swedish.webp"];

const ogHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html, body {
    margin: 0;
    width: 1200px;
    height: 630px;
    overflow: hidden;
    background: #0a0a09;
  }
  .photos {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 3px;
    width: 1200px;
    height: 630px;
    background: #0a0a09;
  }
  .photos img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
</head>
<body>
  <div class="photos">
    ${photos.map((file) => `<img src="${file}" alt="">`).join("\n    ")}
  </div>
</body>
</html>`;

const iconHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  html, body {
    margin: 0;
    width: 512px;
    height: 512px;
    overflow: hidden;
    background: #0a0a09;
  }
  .icon {
    box-sizing: border-box;
    width: 512px;
    height: 512px;
    display: grid;
    place-items: center;
    background: #100f0e;
  }
  svg { width: 288px; height: 288px; }
</style>
</head>
<body>
  <div class="icon">${mark}</div>
</body>
</html>`;

function run(cmd, args) {
    const result = spawnSync(cmd, args, { encoding: "utf8" });
    if (result.status !== 0) {
        console.error(result.stderr || result.stdout);
        process.exit(result.status ?? 1);
    }
    return result;
}

function shot(htmlName, html, width, height, dest, scale = 1) {
    const htmlPath = join(workDir, htmlName);
    writeFileSync(htmlPath, html);
    const pngPath = join(workDir, dest);
    run(chrome, [
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--hide-scrollbars",
        "--allow-file-access-from-files",
        `--force-device-scale-factor=${scale}`,
        `--window-size=${width},${height}`,
        `--screenshot=${pngPath}`,
        `file://${htmlPath}`,
    ]);
    return pngPath;
}

mkdirSync(workDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
for (const file of photos) {
    run("cp", [join(root, "public/collections", file), workDir]);
}

const ogSrc = shot("og.html", ogHtml, 1200, 630, "og.png", 2);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", ogSrc, "-q:v", "3", join(outDir, "og.jpg")]);

const iconSrc = shot("icon.html", iconHtml, 512, 512, "icon-512.png");
run("cp", [iconSrc, join(outDir, "icon-512.png")]);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", iconSrc, "-vf", "scale=192:192", join(outDir, "icon-192.png")]);
run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    iconSrc,
    "-vf",
    "scale=180:180",
    join(outDir, "apple-touch-icon.png"),
]);
run("ffmpeg", ["-y", "-loglevel", "error", "-i", iconSrc, "-vf", "scale=32:32", join(outDir, "favicon-32.png")]);

console.log("wrote public/og.jpg, icon-512.png, icon-192.png, apple-touch-icon.png, favicon-32.png");
