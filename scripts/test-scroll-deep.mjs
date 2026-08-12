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

async function main() {
    const browser = await chromium.launch({ headless: true, executablePath: chrome });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

    console.log("=== Deep Pop Rock → Say Say Say → Michael Jackson → back ===");
    await page.goto(`${BASE}/collections/genre/pop-rock`, { waitUntil: "networkidle" });

    // Scroll/load until Say Say Say (id 3345) exists, then put it at the top of the scroller.
    const found = await page.evaluate(async () => {
        const root = document.querySelector("[data-scroll-root]");
        const list = document.querySelector("[data-song-list]");
        if (!root || !list) return { ok: false, reason: "no root" };

        const ensure = () =>
            window.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    detail: { minHeight: 999999, root, untilId: "3345" },
                }),
            );

        for (let i = 0; i < 20; i++) {
            ensure();
            if (list.querySelector('.song-row[data-id="3345"]')) break;
            root.scrollTop = root.scrollHeight;
            await new Promise((r) => setTimeout(r, 50));
        }

        const row = list.querySelector('.song-row[data-id="3345"]');
        if (!row) return { ok: false, reason: "row missing", rows: list.querySelectorAll(".song-row").length };

        const rootTop = root.getBoundingClientRect().top;
        const elTop = row.getBoundingClientRect().top;
        root.scrollTop += elTop - rootTop;
        return {
            ok: true,
            top: root.scrollTop,
            rows: list.querySelectorAll(".song-row").length,
            title: row.querySelector(".text-cream, .text-\\[15\\.5px\\]")?.textContent ?? row.textContent?.slice(0, 40),
        };
    });
    console.log("positioned at Say Say Say", found);
    if (!found.ok) {
        await browser.close();
        process.exit(1);
    }

    await Promise.all([
        page.waitForURL("**/artists/michael-jackson**"),
        nativeClick(page, '.song-row[data-id="3345"] a[href="/artists/michael-jackson"]'),
    ]);
    await page.waitForTimeout(400);
    console.log("on artist", await page.evaluate(() => location.pathname));

    await Promise.all([
        page.waitForURL("**/collections/genre/pop-rock**"),
        nativeClick(page, "a[data-smart-back]"),
    ]);
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => {
        const root = document.querySelector("[data-scroll-root]");
        const row = document.querySelector('.song-row[data-id="3345"]');
        if (!root || !row) {
            return {
                ok: false,
                reason: "missing after back",
                rows: document.querySelectorAll(".song-row").length,
                stored: sessionStorage.getItem("kkaraoke:scroll:/collections/genre/pop-rock"),
            };
        }
        const rootBox = root.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const visible = rowBox.top < rootBox.bottom && rowBox.bottom > rootBox.top;
        const nearTop = Math.abs(rowBox.top - rootBox.top) < 120;
        // First fully visible song title for debug
        const firstVisible = [...root.querySelectorAll(".song-row")].find((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom > rootBox.top + 8 && r.top < rootBox.bottom;
        });
        return {
            ok: visible && nearTop,
            visible,
            nearTop,
            offsetFromTop: rowBox.top - rootBox.top,
            top: root.scrollTop,
            rows: root.querySelectorAll(".song-row").length,
            firstVisibleId: firstVisible?.getAttribute("data-id"),
            firstVisibleText: firstVisible?.textContent?.replace(/\s+/g, " ").trim().slice(0, 60),
            stored: sessionStorage.getItem("kkaraoke:scroll:/collections/genre/pop-rock"),
        };
    });
    console.log("after back", after);
    console.log(after.ok ? "PASS deep restore" : "FAIL deep restore");

    await browser.close();
    process.exit(after.ok ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
