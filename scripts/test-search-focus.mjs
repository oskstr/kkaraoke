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

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });

    const home = await page.evaluate(() => {
        const input = document.querySelector("[data-search-input]");
        const rect = input?.getBoundingClientRect();
        return {
            launch: Boolean(document.querySelector("[data-search-launch]")),
            input: Boolean(input),
            persist: input?.getAttribute("data-astro-transition-persist"),
            brandPersist: document.querySelector("[data-brand-mark]")?.getAttribute("data-astro-transition-persist"),
            reload: document.querySelector("[data-search-launch]")?.hasAttribute("data-astro-reload"),
            top: rect ? Math.round(rect.top) : null,
            left: rect ? Math.round(rect.left) : null,
        };
    });
    console.log("home", home);
    if (!home.launch || !home.input) fail("home search field missing");
    if (home.reload) fail("search launch should not full-reload");
    if (home.persist !== "catalogue-search-input") fail("search input should persist");
    if (home.brandPersist !== "catalogue-brand") fail("brand mark should persist");

    await page.evaluate(() => {
        const brand = document.querySelector("[data-brand-mark]");
        if (brand) brand.dataset.keep = "1";
    });

    await page.evaluate(() => {
        window.__swapFocus = null;
        document.addEventListener(
            "astro:after-swap",
            () => {
                const el = document.activeElement;
                window.__swapFocus = {
                    path: location.pathname,
                    tag: el?.tagName ?? null,
                    id: el?.id ?? "",
                    search: el instanceof HTMLElement && el.hasAttribute("data-search-input"),
                };
            },
            true,
        );
    });

    await page.click("[data-search-launch]");
    await page.waitForURL("**/search", { timeout: 15000 });
    await page.waitForTimeout(200);

    const swap = await page.evaluate(() => window.__swapFocus);
    const settled = await page.evaluate(() => {
        const el = document.activeElement;
        const input = document.querySelector("[data-search-input]");
        const rect = input?.getBoundingClientRect();
        return {
            path: location.pathname,
            tag: el?.tagName,
            id: el?.id,
            inputIsActive: el === input,
            persist: input?.getAttribute("data-astro-transition-persist"),
            top: rect ? Math.round(rect.top) : null,
            left: rect ? Math.round(rect.left) : null,
            hasCancel: Boolean(document.querySelector("[data-search-cancel]")),
            hasLaunch: Boolean(document.querySelector("[data-search-launch]")),
            brandKept: document.querySelector("[data-brand-mark]")?.dataset.keep === "1",
            brandPersist: document.querySelector("[data-brand-mark]")?.getAttribute("data-astro-transition-persist"),
        };
    });
    console.log("after-swap", swap);
    console.log("settled", settled);

    if (!swap?.search) fail(`focus lost during swap: ${JSON.stringify(swap)}`);
    if (!settled.inputIsActive) fail(`search input not focused after transition: ${JSON.stringify(settled)}`);
    if (!settled.hasCancel) fail("search page missing Cancel");
    if (settled.hasLaunch) fail("search page should not be a search launch target");
    if (!settled.brandKept) fail("brand mark was replaced instead of persisted");
    if (settled.brandPersist !== "catalogue-brand") fail("brand persist dropped on search");
    // iOS caret overlay is painted at the focus-time rect; the field must not move.
    if (home.top !== settled.top) fail(`search field moved vertically: home=${home.top} search=${settled.top}`);
    if (home.left !== settled.left) fail(`search field moved horizontally: home=${home.left} search=${settled.left}`);

    // Type without clicking the field again — caret must still be in the input.
    await page.keyboard.type("coldplay", { delay: 20 });
    await page.waitForTimeout(700);
    const typed = await page.evaluate(() => {
        const input = document.querySelector("[data-search-input]");
        const text = document.body.innerText;
        return {
            value: input instanceof HTMLInputElement ? input.value : null,
            active: document.activeElement === input,
            hasColdplay: /coldplay/i.test(text),
        };
    });
    console.log("typed", typed);
    if (typed.value !== "coldplay") fail(`typed into wrong target, value=${typed.value}`);
    if (!typed.active) fail("input lost focus while typing");
    if (!typed.hasColdplay) fail("search results did not update");

    // Search/Enter is a commit: drop focus so the mobile keyboard can close.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
    const afterEnter = await page.evaluate(() => {
        const input = document.querySelector("[data-search-input]");
        const text = document.body.innerText;
        return {
            path: location.pathname,
            value: input instanceof HTMLInputElement ? input.value : null,
            active: document.activeElement === input,
            hasColdplay: /coldplay/i.test(text),
        };
    });
    console.log("after enter", afterEnter);
    if (afterEnter.path !== "/search") fail(`Enter left search: ${afterEnter.path}`);
    if (afterEnter.value !== "coldplay") fail(`Enter cleared the query: ${afterEnter.value}`);
    if (afterEnter.active) fail("search input stayed focused after Search/Enter");
    if (!afterEnter.hasColdplay) fail("search results gone after Enter");

    // Search → artist page must not leave a persisted input behind.
    const artistHref = await page.evaluate(() => {
        const link = document.querySelector('a[href^="/artists/"]');
        return link?.getAttribute("href") ?? null;
    });
    if (!artistHref) {
        fail("no artist result link to leave search");
    } else {
        await page.click(`a[href="${artistHref}"]`);
        await page.waitForURL(`**${artistHref}`, { timeout: 15000 });
        await page.waitForTimeout(300);
        const leftover = await page.evaluate(() => ({
            path: location.pathname,
            searchInput: Boolean(document.querySelector("[data-search-input]")),
            brand: Boolean(document.querySelector("[data-brand-mark]")),
            brandKept: document.querySelector("[data-brand-mark]")?.dataset.keep === "1",
            brandPersist: document.querySelector("[data-brand-mark]")?.getAttribute("data-astro-transition-persist"),
        }));
        console.log("artist page", leftover);
        if (leftover.searchInput) fail("persisted search input leaked onto artist page");
        if (!leftover.brand) fail("artist page missing brand mark");
        if (!leftover.brandKept) fail("brand mark was replaced instead of persisted onto artist page");
        if (leftover.brandPersist !== "catalogue-brand") fail("brand persist dropped on artist page");

        await page.click("[data-brand-mark]");
        await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
        await page.waitForTimeout(300);
        const afterBrand = await page.evaluate(() => ({
            path: location.pathname,
            brandCurrent: document.querySelector("[data-brand-mark]")?.getAttribute("aria-current"),
        }));
        console.log("brand home", afterBrand);
        if (afterBrand.path !== "/") fail(`brand mark did not return home: ${afterBrand.path}`);
        if (afterBrand.brandCurrent !== "page") fail("home brand mark should be the current page");
    }

    // Cancel from a fresh search must return home without bouncing back.
    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await page.click("[data-search-launch]");
    await page.waitForURL("**/search", { timeout: 15000 });
    await page.keyboard.type("beatles");
    await page.click("[data-search-cancel]");
    await page.waitForURL((url) => url.pathname === "/", { timeout: 15000 });
    await page.waitForTimeout(400);
    const afterCancel = await page.evaluate(() => {
        const input = document.querySelector("[data-search-input]");
        return {
            path: location.pathname,
            input: Boolean(input),
            focused: document.activeElement === input,
            value: input instanceof HTMLInputElement ? input.value : null,
        };
    });
    console.log("after cancel", afterCancel);
    if (afterCancel.path !== "/") fail(`cancel did not return home: ${afterCancel.path}`);
    if (!afterCancel.input) fail("home search input missing after cancel");
    if (afterCancel.focused) fail("search input stayed focused on home after cancel");
    if (afterCancel.value) fail(`home search still has query after cancel: ${afterCancel.value}`);

    await browser.close();
    if (failed) process.exit(1);
    console.log("PASS");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
