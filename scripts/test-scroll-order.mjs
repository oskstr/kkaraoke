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

    console.log("=== Rock: scroll to F → artist → back → keep scrolling (no early letters) ===");
    await page.goto(`${BASE}/collections/genre/rock`, { waitUntil: "networkidle" });

    // Load until we have an F title near the viewport, click its artist.
    const setup = await page.evaluate(async () => {
        const ensure = (untilId) =>
            document.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    bubbles: true,
                    detail: { minHeight: 999999, root: document.documentElement, untilId },
                }),
            );

        // Grow list a fair way into the alphabet
        for (let i = 0; i < 12; i++) {
            window.scrollTo(0, document.documentElement.scrollHeight);
            document.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    bubbles: true,
                    detail: { minHeight: document.documentElement.scrollHeight + 2000, root: document.documentElement },
                }),
            );
            await new Promise((r) => setTimeout(r, 40));
        }

        const rows = [...document.querySelectorAll(".song-row")];
        const fRow = rows.find((row) => {
            const title = row.querySelector(".text-cream, [class*='text-[15']")?.textContent?.trim() ?? "";
            return /^f/i.test(title);
        });
        if (!fRow) {
            return { ok: false, reason: "no F row", rows: rows.length };
        }
        const id = fRow.getAttribute("data-id");
        const title = fRow.textContent?.replace(/\s+/g, " ").trim().slice(0, 80);
        const artist = fRow.querySelector('a[href^="/artists/"]');
        const href = artist?.getAttribute("href");
        const top = fRow.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top);
        ensure(id);
        return { ok: true, id, title, href, rows: document.querySelectorAll(".song-row").length, y: window.scrollY };
    });
    console.log("setup", setup);
    if (!setup.ok || !setup.href) {
        await browser.close();
        process.exit(1);
    }

    await Promise.all([
        page.waitForURL(/\/artists\//),
        nativeClick(page, `.song-row[data-id="${setup.id}"] a[href="${setup.href}"]`),
    ]);
    await page.waitForTimeout(400);
    await Promise.all([
        page.waitForURL("**/collections/genre/rock**"),
        nativeClick(page, "a[data-smart-back]"),
    ]);
    await page.waitForTimeout(800);

    const afterBack = await page.evaluate(() => {
        const titles = [...document.querySelectorAll(".song-row")].map((row) => {
            const t = row.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim() ?? "";
            return t;
        });
        return {
            rows: titles.length,
            first: titles[0],
            last: titles[titles.length - 1],
            // Find first place where sort order goes backwards (e.g. F… then B…)
            regression: titles.findIndex((t, i) => {
                if (i === 0) return false;
                const a = titles[i - 1].localeCompare(t, "sv", { sensitivity: "base" });
                return a > 0;
            }),
            y: window.scrollY,
        };
    });
    console.log("after back", afterBack);

    // Keep scrolling / loading more and check order again
    await page.evaluate(async () => {
        for (let i = 0; i < 8; i++) {
            window.scrollTo(0, document.documentElement.scrollHeight);
            document.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    bubbles: true,
                    detail: {
                        minHeight: document.documentElement.scrollHeight + 3000,
                        root: document.documentElement,
                    },
                }),
            );
            await new Promise((r) => setTimeout(r, 50));
        }
    });

    const afterMore = await page.evaluate(() => {
        const titles = [...document.querySelectorAll(".song-row")].map((row) => {
            return row.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim() ?? "";
        });
        let regression = -1;
        let detail = null;
        for (let i = 1; i < titles.length; i++) {
            if (titles[i - 1].localeCompare(titles[i], "sv", { sensitivity: "base" }) > 0) {
                regression = i;
                detail = { prev: titles[i - 1], next: titles[i] };
                break;
            }
        }
        return {
            rows: titles.length,
            first: titles[0],
            last: titles[titles.length - 1],
            regression,
            detail,
        };
    });
    console.log("after more scroll", afterMore);

    const ok = afterBack.regression < 0 && afterMore.regression < 0;
    console.log(ok ? "PASS no A–Z regression" : "FAIL A–Z regression");
    await browser.close();
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
