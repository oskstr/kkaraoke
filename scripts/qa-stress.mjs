import { chromium } from "playwright-core";

const BASE = "http://127.0.0.1:4321";
const chrome = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`;

/** @typedef {{ name: string; ok: boolean; details: string[]; errors: string[] }} ScenarioResult */

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

async function scrollLoad(page, rounds = 10, step = 2000) {
    await page.evaluate(
        async ({ rounds, step }) => {
            for (let i = 0; i < rounds; i++) {
                window.scrollTo(0, document.documentElement.scrollHeight);
                document.dispatchEvent(
                    new CustomEvent("kkaraoke:ensure-scroll-height", {
                        bubbles: true,
                        detail: {
                            minHeight: document.documentElement.scrollHeight + step,
                            root: document.documentElement,
                        },
                    }),
                );
                await new Promise((r) => setTimeout(r, 45));
            }
        },
        { rounds, step },
    );
}

function titleText(row) {
    return row.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim() ?? "";
}

function checkAzOrder(titles) {
    for (let i = 1; i < titles.length; i++) {
        if (titles[i - 1].localeCompare(titles[i], "sv", { sensitivity: "base" }) > 0) {
            return { regression: i, prev: titles[i - 1], next: titles[i] };
        }
    }
    return { regression: -1 };
}

function checkDuplicateIds(ids) {
    const seen = new Set();
    const dups = [];
    for (const id of ids) {
        if (seen.has(id)) dups.push(id);
        else seen.add(id);
    }
    return dups;
}

async function scenarioA(page, errors) {
    const details = [];
    await page.goto(`${BASE}/collections/genre/rock`, { waitUntil: "networkidle" });
    await scrollLoad(page, 12, 2000);

    const setup = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".song-row")];
        const fRow = rows.find((row) => {
            const title = row.querySelector(".text-cream, [class*='text-[15']")?.textContent?.trim() ?? "";
            return /^f/i.test(title);
        });
        if (!fRow) return { ok: false, reason: "no F-title row", rows: rows.length };
        const id = fRow.getAttribute("data-id");
        const artist = fRow.querySelector('a[href^="/artists/"]');
        const href = artist?.getAttribute("href");
        if (!href) return { ok: false, reason: "no artist link", id, rows: rows.length };
        const top = fRow.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top);
        document.dispatchEvent(
            new CustomEvent("kkaraoke:ensure-scroll-height", {
                bubbles: true,
                detail: { minHeight: 999999, root: document.documentElement, untilId: id },
            }),
        );
        return {
            ok: true,
            id,
            href,
            title: fRow.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim(),
            rows: document.querySelectorAll(".song-row").length,
            y: window.scrollY,
        };
    });
    details.push(`setup: ${JSON.stringify(setup)}`);
    if (!setup.ok) {
        return { name: "a) Rock genre scroll / artist / back / A–Z", ok: false, details, errors: [...errors] };
    }

    await Promise.all([
        page.waitForURL(/\/artists\//),
        nativeClick(page, `.song-row[data-id="${setup.id}"] a[href="${setup.href}"]`),
    ]);
    await page.waitForTimeout(400);
    details.push(`navigated to artist: ${page.url()}`);

    await Promise.all([page.waitForURL("**/collections/genre/rock**"), page.goBack()]);
    await page.waitForTimeout(800);

    const afterBack = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".song-row")];
        const titles = rows.map((row) => row.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim() ?? "");
        const ids = rows.map((r) => r.getAttribute("data-id"));
        return { titles, ids, y: window.scrollY, rows: rows.length };
    });

    let order = checkAzOrder(afterBack.titles);
    let dups = checkDuplicateIds(afterBack.ids);
    details.push(
        `after back: rows=${afterBack.rows} y=${afterBack.y} first="${afterBack.titles[0]}" last="${afterBack.titles.at(-1)}"`,
    );
    if (order.regression >= 0) {
        details.push(`A–Z regression after back @${order.regression}: "${order.prev}" > "${order.next}"`);
    }
    if (dups.length) details.push(`duplicate data-ids after back: ${dups.join(",")}`);

    await scrollLoad(page, 8, 3000);

    const afterMore = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".song-row")];
        const titles = rows.map((row) => row.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim() ?? "");
        const ids = rows.map((r) => r.getAttribute("data-id"));
        return { titles, ids, rows: rows.length };
    });
    const order2 = checkAzOrder(afterMore.titles);
    const dups2 = checkDuplicateIds(afterMore.ids);
    details.push(`after more: rows=${afterMore.rows} first="${afterMore.titles[0]}" last="${afterMore.titles.at(-1)}"`);
    if (order2.regression >= 0) {
        details.push(`A–Z regression after more @${order2.regression}: "${order2.prev}" > "${order2.next}"`);
    }
    if (dups2.length) details.push(`duplicate data-ids after more: ${dups2.join(",")}`);

    const ok =
        order.regression < 0 &&
        order2.regression < 0 &&
        dups.length === 0 &&
        dups2.length === 0 &&
        afterMore.rows > afterBack.rows;

    if (!(afterMore.rows > afterBack.rows)) {
        details.push(`expected more rows after scroll (${afterBack.rows} → ${afterMore.rows})`);
    }

    return {
        name: "a) Rock genre scroll / artist / back / A–Z + no dup ids",
        ok,
        details,
        errors: [...errors],
    };
}

async function scenarioB(page, errors) {
    const details = [];
    await page.goto(`${BASE}/collections/genre/pop-rock`, { waitUntil: "networkidle" });

    const found = await page.evaluate(async () => {
        for (let i = 0; i < 25; i++) {
            document.dispatchEvent(
                new CustomEvent("kkaraoke:ensure-scroll-height", {
                    bubbles: true,
                    detail: {
                        minHeight: 999999,
                        root: document.documentElement,
                        untilId: "3345",
                    },
                }),
            );
            if (document.querySelector('.song-row[data-id="3345"]')) break;
            window.scrollTo(0, document.documentElement.scrollHeight);
            await new Promise((r) => setTimeout(r, 50));
        }
        const row = document.querySelector('.song-row[data-id="3345"]');
        if (!row) {
            return {
                ok: false,
                reason: "Say Say Say (3345) missing",
                rows: document.querySelectorAll(".song-row").length,
            };
        }
        const top = row.getBoundingClientRect().top + window.scrollY;
        window.scrollTo(0, top);
        return {
            ok: true,
            y: window.scrollY,
            rows: document.querySelectorAll(".song-row").length,
            title: row.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim(),
        };
    });
    details.push(`positioned: ${JSON.stringify(found)}`);
    if (!found.ok) {
        return { name: "b) Pop Rock deep Say Say Say → MJ → back", ok: false, details, errors: [...errors] };
    }

    await Promise.all([
        page.waitForURL("**/artists/michael-jackson**"),
        nativeClick(page, '.song-row[data-id="3345"] a[href="/artists/michael-jackson"]'),
    ]);
    await page.waitForTimeout(400);
    details.push(`on artist: ${page.url()}`);

    await Promise.all([page.waitForURL("**/collections/genre/pop-rock**"), page.goBack()]);
    await page.waitForTimeout(900);

    const after = await page.evaluate(() => {
        const row = document.querySelector('.song-row[data-id="3345"]');
        if (!row) {
            return {
                ok: false,
                reason: "missing after back",
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
        };
    });
    details.push(`after back: ${JSON.stringify(after)}`);
    return {
        name: "b) Pop Rock deep Say Say Say → MJ → back (row near top)",
        ok: Boolean(after.ok),
        details,
        errors: [...errors],
    };
}

async function scenarioC(page, errors) {
    const details = [];
    await page.goto(`${BASE}/search`, { waitUntil: "networkidle" });
    const input = page.locator("#catalog-search-input, [data-search-input]");
    const inputCount = await input.count();
    details.push(`search input count: ${inputCount}`);
    if (inputCount === 0) {
        return { name: "c) Search page + coldplay", ok: false, details, errors: [...errors] };
    }

    await input.first().fill("coldplay");
    await page.waitForTimeout(600);

    const result = await page.evaluate(() => {
        const text = document.body.innerText;
        const hasColdplay = /coldplay/i.test(text);
        const songSection = [...document.querySelectorAll("div")].some((el) =>
            /^Songs$/i.test(el.textContent?.trim() ?? ""),
        );
        const artistSection = [...document.querySelectorAll("div")].some((el) =>
            /^Artists$/i.test(el.textContent?.trim() ?? ""),
        );
        const creamTitles = document.querySelectorAll(".text-cream").length;
        return { hasColdplay, songSection, artistSection, creamTitles };
    });
    details.push(`results: ${JSON.stringify(result)}`);
    const ok = result.hasColdplay && (result.songSection || result.artistSection || result.creamTitles > 2);
    return { name: "c) Search page loads, type coldplay, results appear", ok, details, errors: [...errors] };
}

async function scenarioD(page, errors) {
    const details = [];
    await page.goto(`${BASE}/artists`, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(200);

    const before = await page.evaluate(() => ({
        y: window.scrollY,
        path: location.pathname,
    }));
    details.push(`before: ${JSON.stringify(before)}`);

    const mid = await page.evaluate(() => {
        const link = [...document.querySelectorAll("a[href^='/artists/']")].find((a) => {
            const r = a.getBoundingClientRect();
            return r.top > 120 && r.top < 600 && a.hasAttribute("data-astro-reload");
        });
        return link ? { href: link.getAttribute("href"), hasReload: link.hasAttribute("data-astro-reload") } : null;
    });
    details.push(`click target: ${JSON.stringify(mid)}`);
    if (!mid?.href) {
        return { name: "d) /artists scroll deep → artist → back", ok: false, details, errors: [...errors] };
    }

    await Promise.all([page.waitForURL(/\/artists\/.+/), nativeClick(page, `a[href="${mid.href}"]`)]);
    await page.waitForTimeout(400);
    details.push(`on artist: ${page.url()}`);

    await Promise.all([page.waitForURL("**/artists"), page.goBack()]);
    await page.waitForTimeout(700);

    const after = await page.evaluate(() => ({
        y: window.scrollY,
        path: location.pathname,
    }));
    details.push(`after: ${JSON.stringify(after)}`);
    const delta = Math.abs((after.y ?? 0) - (before.y ?? 0));
    const ok = after.path === "/artists" && after.y != null && delta < 200;
    details.push(`scroll delta: ${delta} (limit 200)`);
    return {
        name: "d) /artists scroll deep → artist (data-astro-reload) → back restore",
        ok,
        details,
        errors: [...errors],
    };
}

async function scenarioE(page, errors) {
    const details = [];
    const routes = [`${BASE}/browse/genres`, `${BASE}/collections/genre/rock`, `${BASE}/artists/coldplay`];

    let crashed = false;
    let lastUrl = "";
    for (let i = 0; i < 5; i++) {
        for (const url of routes) {
            try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
                lastUrl = page.url();
            } catch (e) {
                crashed = true;
                details.push(`nav fail iter ${i} ${url}: ${e.message}`);
            }
        }
    }
    details.push(`last url: ${lastUrl}`);

    // Still interactive: find a clickable control and click it
    let interactive = false;
    try {
        await page.goto(`${BASE}/browse/genres`, { waitUntil: "networkidle" });
        const link = await page.evaluate(() => {
            const a = document.querySelector('a[href^="/collections/"]');
            return a?.getAttribute("href") ?? null;
        });
        if (link) {
            await Promise.all([
                page.waitForURL(/\/collections\//, { timeout: 10000 }),
                nativeClick(page, `a[href="${link}"]`),
            ]);
            interactive = /\/collections\//.test(page.url());
            details.push(`post-rapid click → ${page.url()}`);
        } else {
            details.push("no collection tile link found on /browse/genres");
        }
    } catch (e) {
        details.push(`interactive check failed: ${e.message}`);
    }

    const ok = !crashed && interactive;
    return {
        name: "e) Rapid alternate navigate ×5 (genres/collection/artist)",
        ok,
        details,
        errors: [...errors],
    };
}

async function scenarioF(page, errors) {
    const details = [];
    // Clear favorites first
    await page.goto(`${BASE}/collections/genre/rock`, { waitUntil: "networkidle" });
    await page.evaluate(() => {
        localStorage.removeItem("kkaraoke:favorites");
        window.dispatchEvent(new Event("kkaraoke:favorites"));
    });
    await page.reload({ waitUntil: "networkidle" });

    const song = await page.evaluate(() => {
        const row = document.querySelector(".song-row[data-id]");
        if (!row) return null;
        const id = row.getAttribute("data-id");
        const title = row.querySelector(".text-cream, [class*='15.5']")?.textContent?.trim() ?? "";
        const btn = row.querySelector("[data-fav-toggle]");
        return { id, title, hasBtn: Boolean(btn) };
    });
    details.push(`song: ${JSON.stringify(song)}`);
    if (!song?.id || !song.hasBtn) {
        return { name: "f) Favorites toggle heart", ok: false, details, errors: [...errors] };
    }

    await nativeClick(page, `.song-row[data-id="${song.id}"] [data-fav-toggle]`);
    await page.waitForTimeout(200);

    const favState = await page.evaluate((id) => {
        const raw = localStorage.getItem("kkaraoke:favorites");
        const list = raw ? JSON.parse(raw) : [];
        const pressed = document
            .querySelector(`.song-row[data-id="${id}"] [data-fav-toggle]`)
            ?.getAttribute("aria-pressed");
        return { list, pressed };
    }, song.id);
    details.push(`after toggle on: ${JSON.stringify(favState)}`);
    const toggledOn = Array.isArray(favState.list) && favState.list.map(String).includes(String(song.id));

    await page.goto(`${BASE}/favorites`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    const onFavs = await page.evaluate((title) => {
        const body = document.body.innerText;
        const empty = /Nothing saved yet/i.test(body);
        const hasTitle = title ? body.includes(title) : false;
        const removeBtn = document.querySelector('button[aria-label="Remove from favorites"]');
        return { empty, hasTitle, hasRemove: Boolean(removeBtn), bodySnippet: body.slice(0, 200) };
    }, song.title);
    details.push(`favorites page: ${JSON.stringify(onFavs)}`);

    if (onFavs.hasRemove) {
        await nativeClick(page, 'button[aria-label="Remove from favorites"]');
        await page.waitForTimeout(300);
    } else if (onFavs.hasTitle) {
        // fallback: click any heart
        await page.evaluate(() => {
            const btn = document.querySelector('button[aria-pressed="true"]');
            btn?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        });
        await page.waitForTimeout(300);
    }

    const afterOff = await page.evaluate(() => {
        const raw = localStorage.getItem("kkaraoke:favorites");
        const list = raw ? JSON.parse(raw) : [];
        const empty = /Nothing saved yet/i.test(document.body.innerText);
        return { list, empty };
    });
    details.push(`after toggle off: ${JSON.stringify(afterOff)}`);

    const ok =
        toggledOn &&
        onFavs.hasTitle &&
        !onFavs.empty &&
        (afterOff.empty || (Array.isArray(afterOff.list) && afterOff.list.length === 0));

    return { name: "f) Favorites: toggle on → /favorites → toggle off", ok, details, errors: [...errors] };
}

async function main() {
    // Quick uptime check
    try {
        const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) {
            console.error(`FAIL: ${BASE} returned HTTP ${res.status}`);
            process.exit(1);
        }
        console.log(`Server OK: ${BASE} → ${res.status}\n`);
    } catch (e) {
        console.error(`FAIL: ${BASE} is not reachable (${e.message})`);
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true, executablePath: chrome });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();

    /** @type {string[]} */
    let consoleErrors = [];
    page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(`[console.error] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
        consoleErrors.push(`[pageerror] ${err.message}`);
    });

    const results = [];
    const runners = [
        ["a", scenarioA],
        ["b", scenarioB],
        ["c", scenarioC],
        ["d", scenarioD],
        ["e", scenarioE],
        ["f", scenarioF],
    ];

    for (const [key, fn] of runners) {
        consoleErrors = [];
        console.log(`\n── Scenario ${key} ──`);
        try {
            const result = await fn(page, consoleErrors);
            // attach any errors captured during the scenario
            result.errors = [...consoleErrors];
            results.push(result);
            for (const d of result.details) console.log(`  · ${d}`);
            if (result.errors.length) {
                for (const e of result.errors) console.log(`  ! ${e}`);
            }
            console.log(result.ok ? `  → PASS` : `  → FAIL`);
        } catch (e) {
            const result = {
                name: `scenario ${key}`,
                ok: false,
                details: [`threw: ${e.message}`],
                errors: [...consoleErrors],
            };
            results.push(result);
            console.log(`  · threw: ${e.message}`);
            console.log(`  → FAIL`);
        }
    }

    await browser.close();

    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║           QA STRESS REPORT (390×844)             ║");
    console.log("╚══════════════════════════════════════════════════╝");
    let failed = 0;
    for (const r of results) {
        const mark = r.ok ? "PASS" : "FAIL";
        if (!r.ok) failed++;
        console.log(`\n[${mark}] ${r.name}`);
        for (const d of r.details) console.log(`       ${d}`);
        if (r.errors.length) {
            console.log(`       console/page errors (${r.errors.length}):`);
            for (const e of r.errors) console.log(`         ${e}`);
        }
    }
    console.log(`\n── Summary: ${results.length - failed}/${results.length} passed, ${failed} failed ──`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
