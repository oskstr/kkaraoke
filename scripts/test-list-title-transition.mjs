import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4321";
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

function nativeClick(page, selector) {
    return page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return true;
    }, selector);
}

async function main() {
    const browser = await chromium.launch({
        headless: true,
        executablePath: chrome,
        args: ["--no-sandbox", "--disable-gpu"],
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let failed = false;
    const fail = (msg) => {
        console.log(`FAIL: ${msg}`);
        failed = true;
    };

    for (const [facet, label] of [
        ["/browse/films", "Beauty and the Beast"],
        ["/browse/languages", "English"],
    ]) {
        await page.goto(`${BASE}${facet}`, { waitUntil: "networkidle" });
        const row = await page.evaluate((text) => {
            const links = [...document.querySelectorAll("a.collection-tile")];
            const link = links.find((a) => a.querySelector("[data-vt-title]")?.textContent?.trim() === text);
            if (!link) return { ok: false, reason: `no row for ${text}` };
            const title = link.querySelector("[data-vt-title]");
            return {
                ok: true,
                href: link.getAttribute("href"),
                chrome: link.dataset.vtChrome ?? "",
                title: title?.dataset.vtTitle ?? "",
                titleNested: title !== null && link.contains(title),
            };
        }, label);
        console.log(facet, row);
        if (!row.ok) {
            fail(row.reason);
            continue;
        }
        if (!row.chrome.startsWith("coll-")) fail(`${facet}: row missing chrome name`);
        if (!row.title.startsWith("coll-title-")) fail(`${facet}: row missing title name`);
        if (!row.titleNested) fail(`${facet}: title must nest inside named chrome`);

        const clicked = await nativeClick(page, `a.collection-tile[href="${row.href}"]`);
        if (!clicked) {
            fail(`${facet}: click failed`);
            continue;
        }
        await page.waitForURL((url) => url.pathname.startsWith("/collections/"), { timeout: 10_000 });
        const collection = await page.evaluate(() => {
            const chromeEl = document.querySelector("[data-collection-chrome]");
            const titleEl = document.querySelector("[data-collection-title]");
            return {
                chrome: chromeEl?.dataset.vtChrome ?? "",
                title: titleEl?.dataset.vtTitle ?? "",
                titleNested: Boolean(chromeEl && titleEl && chromeEl.contains(titleEl)),
                heading: titleEl?.textContent?.trim() ?? "",
            };
        });
        console.log("collection", collection);
        if (collection.heading !== label) fail(`${facet}: heading ${collection.heading} != ${label}`);
        if (collection.chrome !== row.chrome)
            fail(`${facet}: chrome name mismatch ${row.chrome} vs ${collection.chrome}`);
        if (collection.title !== row.title) fail(`${facet}: title name mismatch ${row.title} vs ${collection.title}`);
        if (!collection.titleNested) fail(`${facet}: collection title must nest inside chrome`);
    }

    await browser.close();
    if (failed) process.exit(1);
    console.log("ok");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
