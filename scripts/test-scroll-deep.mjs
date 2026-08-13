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

    const found = await page.evaluate(async () => {
        const ensure = () =>
            document.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    bubbles: true,
                    detail: { minHeight: 999999, root: document.documentElement, untilId: "3345" },
                }),
            );

        for (let i = 0; i < 20; i++) {
            ensure();
            if (document.querySelector('.song-row[data-id="3345"]')) break;
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise((r) => setTimeout(r, 50));
        }

        const row = document.querySelector('.song-row[data-id="3345"]');
        if (!row) {
            return { ok: false, reason: "row missing", rows: document.querySelectorAll(".song-row").length };
        }
        const top = row.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top);
        return {
            ok: true,
            y: window.scrollY,
            rows: document.querySelectorAll(".song-row").length,
        };
    });
    console.log("positioned", found);
    if (!found.ok) {
        await browser.close();
        process.exit(1);
    }

    await Promise.all([
        page.waitForURL("**/artists/michael-jackson**"),
        nativeClick(page, '.song-row[data-id="3345"] a[href="/artists/michael-jackson"]'),
    ]);
    await page.waitForTimeout(400);

    await Promise.all([page.waitForURL("**/collections/genre/pop-rock**"), nativeClick(page, "a[data-smart-back]")]);
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => {
        const row = document.querySelector('.song-row[data-id="3345"]');
        if (!row) {
            return {
                ok: false,
                reason: "missing",
                rows: document.querySelectorAll(".song-row").length,
                y: window.scrollY,
            };
        }
        const r = row.getBoundingClientRect();
        const visible = r.top < window.innerHeight && r.bottom > 0;
        const nearTop = Math.abs(r.top) < 140;
        return {
            ok: visible && nearTop,
            visible,
            nearTop,
            offsetTop: r.top,
            y: window.scrollY,
            rows: document.querySelectorAll(".song-row").length,
            marker: sessionStorage.getItem("kkaraoke:return-marker"),
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
