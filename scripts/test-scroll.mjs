import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4321";
const chrome = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`;

async function measure(page) {
    return page.evaluate(() => {
        const root = document.querySelector("[data-scroll-root]");
        return {
            top: root?.scrollTop ?? null,
            path: location.pathname,
            stored: sessionStorage.getItem("kkaraoke:scroll:" + location.pathname),
            windowY: window.scrollY,
            clientHeight: root?.clientHeight ?? null,
            scrollHeight: root?.scrollHeight ?? null,
        };
    });
}

async function nativeClick(page, selector) {
    const clicked = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
    }, selector);
    if (!clicked) throw new Error(`No element for ${selector}`);
}

async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: chrome });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let failed = false;

    console.log("=== Inner scroller ===");
    await page.goto(`${BASE}/collections/lang/eng`, { waitUntil: "networkidle" });
    const sanity = await page.evaluate(() => {
        const root = document.querySelector("[data-scroll-root]");
        root.scrollTop = 900;
        return { top: root.scrollTop, windowY: window.scrollY, ok: root.scrollTop > 100 && window.scrollY === 0 };
    });
    console.log(sanity);
    if (!sanity.ok) failed = true;

    console.log("\n=== Collection → artist → back ===");
    await page.goto(`${BASE}/collections/genre/alternative-rock`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
        document.querySelector("[data-scroll-root]").scrollTop = 1200;
    });
    await page.waitForTimeout(150);
    const before = await measure(page);
    const href = await page.evaluate(() => {
        const root = document.querySelector("[data-scroll-root]");
        const link = [...root.querySelectorAll("a[href^='/artists/']")].find((a) => {
            const r = a.getBoundingClientRect();
            return r.top > 80 && r.top < 700;
        });
        return link?.getAttribute("href");
    });
    console.log("before", before, "click", href);
    await Promise.all([page.waitForURL(/\/artists\//), nativeClick(page, `a[href="${href}"]`)]);
    await page.waitForTimeout(400);
    await Promise.all([
        page.waitForURL("**/collections/genre/alternative-rock"),
        nativeClick(page, "a[data-smart-back]"),
    ]);
    await page.waitForTimeout(700);
    const after = await measure(page);
    console.log("after", after);
    const okCollection = after.top != null && Math.abs(after.top - before.top) < 160;
    console.log(okCollection ? "PASS" : "FAIL");
    if (!okCollection) failed = true;

    console.log("\n=== Artists → artist → back ===");
    await page.goto(`${BASE}/artists`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
        document.querySelector("[data-scroll-root]").scrollTop = 2500;
    });
    await page.waitForTimeout(150);
    const artistsBefore = await measure(page);
    const mid = await page.evaluate(() => {
        const root = document.querySelector("[data-scroll-root]");
        const link = [...root.querySelectorAll("a[href^='/artists/']")].find((a) => {
            const r = a.getBoundingClientRect();
            return r.top > 120 && r.top < 600;
        });
        return link?.getAttribute("href");
    });
    console.log("before", artistsBefore, "click", mid);
    await Promise.all([page.waitForURL(/\/artists\//), nativeClick(page, `a[href="${mid}"]`)]);
    await page.waitForTimeout(400);
    await Promise.all([page.waitForURL("**/artists"), nativeClick(page, "a[data-smart-back]")]);
    await page.waitForTimeout(700);
    const artistsAfter = await measure(page);
    console.log("after", artistsAfter);
    const okArtists = artistsAfter.top != null && Math.abs(artistsAfter.top - artistsBefore.top) < 80;
    console.log(okArtists ? "PASS" : "FAIL");
    if (!okArtists) failed = true;

    await browser.close();
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
