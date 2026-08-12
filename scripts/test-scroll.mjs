import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4321";
const chrome = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`;

async function nativeClick(page, selector) {
    const ok = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
    }, selector);
    if (!ok) throw new Error(`missing ${selector}`);
}

async function measure(page) {
    return page.evaluate(() => ({
        y: window.scrollY,
        path: location.pathname,
        histY: history.state?.scrollY ?? null,
    }));
}

async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: chrome });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let failed = false;

    console.log("=== Document scroller ===");
    await page.goto(`${BASE}/collections/lang/eng`, { waitUntil: "networkidle" });
    const sanity = await page.evaluate(() => {
        window.scrollTo(0, 900);
        return { y: window.scrollY, ok: window.scrollY > 100 };
    });
    console.log(sanity);
    if (!sanity.ok) failed = true;

    console.log("\n=== Collection → artist → back (Astro window scroll) ===");
    await page.goto(`${BASE}/collections/genre/alternative-rock`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 1200));
    await page.waitForTimeout(150);
    const before = await measure(page);
    const href = await page.evaluate(() => {
        const link = [...document.querySelectorAll("a[href^='/artists/']")].find((a) => {
            const r = a.getBoundingClientRect();
            return r.top > 80 && r.top < 700 && a.closest(".song-row");
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
    const okCollection = after.y != null && Math.abs(after.y - before.y) < 160;
    console.log(okCollection ? "PASS" : "FAIL");
    if (!okCollection) failed = true;

    console.log("\n=== 80s mid-viewport artist → back (must not snap row to top) ===");
    await page.goto(`${BASE}/collections/decade/1980`, { waitUntil: "networkidle" });
    const midSetup = await page.evaluate(() => {
        window.scrollTo(0, 900);
        const link = [...document.querySelectorAll("a[href^='/artists/']")].find((a) => {
            const r = a.getBoundingClientRect();
            return r.top > 180 && r.top < 620 && a.closest(".song-row");
        });
        const row = link?.closest(".song-row");
        if (!link || !row) {
            return { ok: false, reason: "no mid-viewport artist link", y: window.scrollY };
        }
        const r = row.getBoundingClientRect();
        return {
            ok: true,
            y: window.scrollY,
            href: link.getAttribute("href"),
            id: row.getAttribute("data-id"),
            viewportTop: r.top,
        };
    });
    console.log("mid setup", midSetup);
    if (!midSetup.ok || !midSetup.href) {
        failed = true;
    } else {
        await Promise.all([page.waitForURL(/\/artists\//), nativeClick(page, `a[href="${midSetup.href}"]`)]);
        await page.waitForTimeout(400);
        await Promise.all([page.waitForURL("**/collections/decade/1980"), nativeClick(page, "a[data-smart-back]")]);
        await page.waitForTimeout(700);
        const midAfter = await page.evaluate((id) => {
            const row = document.querySelector(`.song-row[data-id="${CSS.escape(id)}"]`);
            const r = row?.getBoundingClientRect();
            return {
                y: window.scrollY,
                viewportTop: r?.top ?? null,
                visible: r ? r.top < window.innerHeight && r.bottom > 0 : false,
            };
        }, midSetup.id);
        console.log("mid after", midAfter);
        const restoredY = Math.abs(midAfter.y - midSetup.y) < 80;
        const stillMid =
            midAfter.visible &&
            midAfter.viewportTop != null &&
            Math.abs(midAfter.viewportTop - midSetup.viewportTop) < 120;
        const notSnappedToTop = midSetup.viewportTop > 160 && midAfter.viewportTop != null && midAfter.viewportTop > 80;
        const okMid = restoredY && stillMid && notSnappedToTop;
        console.log(okMid ? "PASS mid-viewport restore" : "FAIL mid-viewport restore", {
            restoredY,
            stillMid,
            notSnappedToTop,
        });
        if (!okMid) failed = true;
    }

    console.log("\n=== Artists → artist → back ===");
    await page.goto(`${BASE}/artists`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(150);
    const artistsBefore = await measure(page);
    const mid = await page.evaluate(() => {
        const link = [...document.querySelectorAll("a[href^='/artists/']")].find((a) => {
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
    // artists uses data-astro-reload — full navigation; browser back_forward restore
    const okArtists = artistsAfter.y != null && Math.abs(artistsAfter.y - artistsBefore.y) < 200;
    console.log(okArtists ? "PASS" : "FAIL");
    if (!okArtists) failed = true;

    await browser.close();
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
