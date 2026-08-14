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

    console.log("\n=== 80s → artist → genre tag → back (keep artist header) ===");
    await page.goto(`${BASE}/collections/decade/1980`, { waitUntil: "networkidle" });
    const psb = await page.evaluate(() => {
        const link = document.querySelector('a[href="/artists/pet-shop-boys"]');
        const row = link?.closest(".song-row");
        if (!link || !row) return { ok: false };
        row.scrollIntoView({ block: "center" });
        return { ok: true, y: window.scrollY, id: row.getAttribute("data-id") };
    });
    console.log("80s setup", psb);
    if (!psb.ok) {
        failed = true;
    } else {
        await Promise.all([
            page.waitForURL("**/artists/pet-shop-boys**"),
            nativeClick(page, 'a[href="/artists/pet-shop-boys"]'),
        ]);
        await page.waitForTimeout(400);
        const onArtist = await page.evaluate(() => {
            const title = document.querySelector("[data-artist-title]");
            const r = title?.getBoundingClientRect();
            return {
                y: window.scrollY,
                headerVisible: r ? r.bottom > 0 && r.top < window.innerHeight : false,
                headerTop: r?.top ?? null,
            };
        });
        console.log("on artist", onArtist);
        const genreHref = await page.evaluate(() => {
            const tag = [...document.querySelectorAll("a[href^='/collections/genre/']")].find((a) =>
                /electropop/i.test(a.getAttribute("href") ?? ""),
            );
            return tag?.getAttribute("href");
        });
        console.log("genre", genreHref);
        if (!genreHref) {
            failed = true;
        } else {
            await Promise.all([
                page.waitForURL("**/collections/genre/**"),
                nativeClick(page, `a[href="${genreHref}"]`),
            ]);
            await page.waitForTimeout(400);
            await Promise.all([page.waitForURL("**/artists/pet-shop-boys**"), nativeClick(page, "a[data-smart-back]")]);
            await page.waitForTimeout(700);
            const backArtist = await page.evaluate(() => {
                const title = document.querySelector("[data-artist-title]");
                const r = title?.getBoundingClientRect();
                const firstRow = document.querySelector(".song-row");
                const fr = firstRow?.getBoundingClientRect();
                return {
                    path: location.pathname,
                    y: window.scrollY,
                    headerVisible: r ? r.top >= 0 && r.bottom > 40 && r.top < 200 : false,
                    headerTop: r?.top ?? null,
                    firstRowTop: fr?.top ?? null,
                    marker: sessionStorage.getItem("kkaraoke:return-marker"),
                };
            });
            console.log("back to artist", backArtist);
            const headerOk =
                backArtist.path.includes("/artists/pet-shop-boys") && backArtist.headerVisible && backArtist.y < 80;
            console.log(headerOk ? "PASS artist header restored" : "FAIL artist header restored");
            if (!headerOk) failed = true;
        }
    }

    console.log("\n=== Pop year-sort load more stays chronological ===");
    await page.goto(`${BASE}/collections/genre/pop`, { waitUntil: "networkidle" });
    await nativeClick(page, '[data-sort="year"]');
    const chrono = await page.evaluate(async () => {
        const firstId = document.querySelector(".song-row")?.getAttribute("data-id");
        const snapshots = [];
        let prevBottom = 0;
        for (let i = 0; i < 5; i++) {
            const rows = [...document.querySelectorAll(".song-row")];
            const years = rows.map((el) => Number(el.getAttribute("data-year") || 0));
            const top = years[0] ?? 0;
            const bottom = years[years.length - 1] ?? 0;
            const ordered = years.every((y, idx) => idx === 0 || y >= years[idx - 1]);
            const firstStill = rows[0]?.getAttribute("data-id") === firstId;
            snapshots.push({ top, bottom, n: rows.length, ordered, firstStill });
            if (!ordered || !firstStill) {
                return { ok: false, reason: !ordered ? "not sorted" : "prefix shifted", snapshots };
            }
            if (i > 0 && bottom < prevBottom) {
                return { ok: false, reason: "bottom year went backwards", snapshots };
            }
            prevBottom = bottom;
            window.scrollTo(0, document.documentElement.scrollHeight);
            document.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    bubbles: true,
                    detail: {
                        minHeight: document.documentElement.scrollHeight + 8000,
                        root: document.documentElement,
                    },
                }),
            );
            await new Promise((r) => setTimeout(r, 50));
        }
        return { ok: true, snapshots };
    });
    console.log("chrono", chrono);
    console.log(chrono.ok ? "PASS year-sort chronological load more" : "FAIL year-sort chronological load more");
    if (!chrono.ok) failed = true;

    console.log("\n=== Pop year-sort deep → artist → folk → back to Pop ===");
    await page.goto(`${BASE}/collections/genre/pop`, { waitUntil: "networkidle" });
    await nativeClick(page, '[data-sort="year"]');
    const yearSetup = await page.evaluate(async () => {
        for (let i = 0; i < 40; i++) {
            const hit = [...document.querySelectorAll(".song-row")].find(
                (el) => el.getAttribute("data-year") === "2017" && el.querySelector('a[href="/artists/ed-sheeran"]'),
            );
            if (hit) break;
            window.scrollTo(0, document.documentElement.scrollHeight);
            document.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    bubbles: true,
                    detail: {
                        minHeight: document.documentElement.scrollHeight + 8000,
                        root: document.documentElement,
                    },
                }),
            );
            await new Promise((r) => setTimeout(r, 40));
        }
        const yearOn = document.querySelector('[data-sort="year"]')?.getAttribute("aria-pressed") === "true";
        const row = [...document.querySelectorAll(".song-row")].find(
            (el) => el.getAttribute("data-year") === "2017" && el.querySelector('a[href="/artists/ed-sheeran"]'),
        );
        const link = row?.querySelector('a[href="/artists/ed-sheeran"]');
        if (row) {
            const r = row.getBoundingClientRect();
            window.scrollBy({ top: r.top - 140, left: 0, behavior: "instant" });
        }
        const visible = [...document.querySelectorAll(".song-row")].find((el) => {
            const r = el.getBoundingClientRect();
            return r.top >= 90 && r.top < 280;
        });
        return {
            ok: Boolean(link && row && yearOn && visible?.getAttribute("data-year") === "2017"),
            yearOn,
            y: window.scrollY,
            rows: document.querySelectorAll(".song-row").length,
            href: link?.getAttribute("href") ?? null,
            id: row?.getAttribute("data-id") ?? null,
            visibleYear: visible?.getAttribute("data-year") ?? row?.getAttribute("data-year") ?? null,
            visibleId: visible?.getAttribute("data-id") ?? row?.getAttribute("data-id") ?? null,
        };
    });
    console.log("year setup", yearSetup);
    if (!yearSetup.ok || !yearSetup.href) {
        failed = true;
    } else {
        await Promise.all([
            page.waitForURL(/\/artists\//),
            nativeClick(page, `.song-row[data-id="${yearSetup.id}"] a[href="${yearSetup.href}"]`),
        ]);
        await page.waitForTimeout(400);
        const folk = await page.evaluate(() => {
            const tag = [...document.querySelectorAll("a[href^='/collections/genre/']")].find(
                (a) => a.getAttribute("href") === "/collections/genre/folk",
            );
            return tag?.getAttribute("href");
        });
        if (!folk) {
            console.log("no folk tag, skip remaining");
            failed = true;
        } else {
            await Promise.all([page.waitForURL("**/collections/genre/**"), nativeClick(page, `a[href="${folk}"]`)]);
            await page.waitForTimeout(300);
            await page.evaluate(() => window.scrollTo(0, 400));
            await page.waitForTimeout(150);
            await Promise.all([page.waitForURL(/\/artists\//), nativeClick(page, "a[data-smart-back]")]);
            await page.waitForTimeout(400);
            await Promise.all([page.waitForURL("**/collections/genre/pop**"), nativeClick(page, "a[data-smart-back]")]);
            await page.waitForTimeout(800);
            const backPop = await page.evaluate(() => {
                const visible = [...document.querySelectorAll(".song-row")].find((el) => {
                    const r = el.getBoundingClientRect();
                    return r.top >= 90 && r.top < 280;
                });
                return {
                    y: window.scrollY,
                    rows: document.querySelectorAll(".song-row").length,
                    yearOn: document.querySelector('[data-sort="year"]')?.getAttribute("aria-pressed") === "true",
                    visibleYear: visible?.getAttribute("data-year") ?? null,
                    visibleId: visible?.getAttribute("data-id") ?? null,
                };
            });
            console.log("back to pop", backPop, "from", yearSetup.y, "year", yearSetup.visibleYear);
            const extraRows = backPop.rows - yearSetup.rows;
            const okPop =
                backPop.yearOn &&
                extraRows >= 0 &&
                extraRows <= 240 &&
                backPop.visibleYear === yearSetup.visibleYear &&
                (yearSetup.visibleId == null || backPop.visibleId === yearSetup.visibleId);
            console.log(okPop ? "PASS pop year-sort restore" : "FAIL pop year-sort restore");
            if (!okPop) failed = true;
        }
    }

    console.log("\n=== Genres tile → collection starts at the first song ===");
    await page.goto(`${BASE}/browse/genres`, { waitUntil: "networkidle" });
    await page.waitForTimeout(200);
    await Promise.all([
        page.waitForURL("**/collections/genre/alternative-rock"),
        nativeClick(page, 'a[href="/collections/genre/alternative-rock"]'),
    ]);
    await page.waitForTimeout(700);
    const opened = await page.evaluate(() => {
        const chrome = document.querySelector("[data-collection-chrome]");
        const first = document.querySelector(".song-row");
        const chromeBottom = chrome?.getBoundingClientRect().bottom ?? 0;
        const firstBox = first?.getBoundingClientRect();
        return {
            y: window.scrollY,
            firstTitle: first?.getAttribute("data-title") ?? null,
            firstTop: firstBox ? Math.round(firstBox.top) : null,
            chromeBottom: Math.round(chromeBottom),
            tucked: firstBox ? firstBox.top + 8 < chromeBottom : true,
        };
    });
    console.log("opened alt-rock", opened);
    const okOpen = opened.y < 8 && opened.firstTitle != null && opened.tucked === false;
    console.log(okOpen ? "PASS collection opens at top" : "FAIL collection opens at top");
    if (!okOpen) failed = true;

    await browser.close();
    process.exit(failed ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
