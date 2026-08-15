/**
 * Raster share images for iMessage / Open Graph / the home screen.
 *
 * Chrome draws the HTML; ffmpeg scales the icon. Re-run after the mark or
 * palette changes:
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

const tiles = ["#7A4B3A", "#3F5A6B", "#5B4A72", "#6B6238", "#41684F", "#7A3F4F", "#3E4A6B", "#6B5230"]
    .map((c) => `<span class="tile" style="background:${c}"></span>`)
    .join("");

const ogHtml = `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  @font-face {
    font-family: Inter;
    src: url("Inter-Bold.ttf") format("truetype");
    font-weight: 700;
  }
  @font-face {
    font-family: Inter;
    src: url("Inter-Regular.ttf") format("truetype");
    font-weight: 400;
  }
  html, body {
    margin: 0;
    width: 1200px;
    height: 630px;
    overflow: hidden;
    background: #0a0a09;
  }
  .card {
    position: relative;
    box-sizing: border-box;
    width: 1200px;
    height: 630px;
    padding: 88px 96px 80px;
    background: #100f0e;
    color: #f2ede4;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
  .glow {
    position: absolute;
    right: -80px;
    top: -120px;
    width: 520px;
    height: 520px;
    background: radial-gradient(circle, rgba(233,180,76,0.16) 0%, rgba(233,180,76,0) 68%);
    pointer-events: none;
  }
  .glow-2 {
    position: absolute;
    left: -60px;
    bottom: -160px;
    width: 480px;
    height: 480px;
    background: radial-gradient(circle, rgba(63,90,107,0.18) 0%, rgba(63,90,107,0) 70%);
    pointer-events: none;
  }
  .brand {
    position: relative;
    display: flex;
    align-items: center;
    gap: 22px;
  }
  .brand svg { width: 72px; height: 72px; }
  .name {
    font-size: 72px;
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 1;
  }
  .tag {
    position: relative;
    margin: 36px 0 0;
    max-width: 760px;
    font-size: 32px;
    font-weight: 400;
    line-height: 1.35;
    letter-spacing: -0.02em;
    color: #c8c0b4;
  }
  .tiles {
    position: absolute;
    left: 96px;
    bottom: 80px;
    display: flex;
    gap: 10px;
  }
  .tile {
    width: 44px;
    height: 44px;
    border-radius: 12px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="glow"></div>
    <div class="glow-2"></div>
    <div class="brand">${mark}<span class="name">kkaraoke</span></div>
    <p class="tag">Browse the karaoke catalogue by artist, decade, genre, and more.</p>
    <div class="tiles">${tiles}</div>
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

function shot(htmlName, html, width, height, dest) {
    const htmlPath = join(workDir, htmlName);
    writeFileSync(htmlPath, html);
    const pngPath = join(workDir, dest);
    const result = spawnSync(
        chrome,
        [
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--hide-scrollbars",
            "--allow-file-access-from-files",
            `--window-size=${width},${height}`,
            `--screenshot=${pngPath}`,
            `file://${htmlPath}`,
        ],
        { encoding: "utf8" },
    );
    if (result.status !== 0) {
        console.error(result.stderr || result.stdout);
        process.exit(result.status ?? 1);
    }
    return pngPath;
}

function scale(src, dest, size) {
    const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-vf", `scale=${size}:${size}`, dest], {
        encoding: "utf8",
    });
    if (result.status !== 0) {
        console.error(result.stderr || result.stdout);
        process.exit(result.status ?? 1);
    }
}

mkdirSync(workDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
spawnSync("cp", [
    "/usr/share/fonts/truetype/macos/Inter-Bold.ttf",
    "/usr/share/fonts/truetype/macos/Inter-Regular.ttf",
    workDir,
]);

const ogSrc = shot("og.html", ogHtml, 1200, 630, "og.png");
spawnSync("cp", [ogSrc, join(outDir, "og.png")]);

const iconSrc = shot("icon.html", iconHtml, 512, 512, "icon-512.png");
spawnSync("cp", [iconSrc, join(outDir, "icon-512.png")]);
scale(iconSrc, join(outDir, "icon-192.png"), 192);
scale(iconSrc, join(outDir, "apple-touch-icon.png"), 180);
scale(iconSrc, join(outDir, "favicon-32.png"), 32);

console.log("wrote public/og.png, icon-512.png, icon-192.png, apple-touch-icon.png, favicon-32.png");
