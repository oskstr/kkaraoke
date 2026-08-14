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

function tabMetricsScript() {
    return () => {
        const nav = document.querySelector("[data-facet-tabs]");
        const active = nav?.querySelector("[aria-current='page']");
        if (!nav || !(active instanceof HTMLElement)) {
            return { ok: false, reason: "missing tabs" };
        }
        const navRect = nav.getBoundingClientRect();
        const tabRect = active.getBoundingClientRect();
        const visible = tabRect.left >= navRect.left - 1 && tabRect.right <= navRect.right + 1;
        return {
            ok: true,
            path: location.pathname,
            label: active.textContent?.trim() ?? "",
            scrollLeft: nav.scrollLeft,
            scrollWidth: nav.scrollWidth,
            clientWidth: nav.clientWidth,
            overflows: nav.scrollWidth > nav.clientWidth + 1,
            visible,
            tabLeft: Math.round(tabRect.left),
            tabRight: Math.round(tabRect.right),
            navLeft: Math.round(navRect.left),
            navRight: Math.round(navRect.right),
        };
    };
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
    const home = await page.evaluate(tabMetricsScript());
    console.log("home", home);
    if (!home.ok) fail("home tabs missing");
    if (!home.overflows) fail("tabs should overflow on a 390px phone");

    const scrollToEnd = async () => {
        await page.evaluate(() => {
            const nav = document.querySelector("[data-facet-tabs]");
            if (nav) nav.scrollLeft = nav.scrollWidth;
        });
    };

    for (const [facet, path, label] of [
        ["film", "/browse/films", "Film & musical"],
        ["lang", "/browse/languages", "Language"],
    ]) {
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await scrollToEnd();
        const before = await page.evaluate(tabMetricsScript());
        console.log(`before click ${facet}`, before);
        if (before.scrollLeft < 10) fail(`could not scroll tabs before clicking ${facet}`);

        await Promise.all([page.waitForURL(`**${path}`), nativeClick(page, `a[data-facet="${facet}"]`)]);
        await page.waitForTimeout(400);
        const after = await page.evaluate(tabMetricsScript());
        console.log(`after click ${facet}`, after);
        if (after.path !== path) fail(`expected ${path}, got ${after.path}`);
        if (after.label !== label) fail(`active tab is "${after.label}", expected "${label}"`);
        if (!after.visible) fail(`selected "${label}" tab is off-screen after click`);
    }

    for (const [path, label] of [
        ["/browse/films", "Film & musical"],
        ["/browse/languages", "Language"],
    ]) {
        await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(100);
        const cold = await page.evaluate(tabMetricsScript());
        console.log(`cold load ${path}`, cold);
        if (cold.label !== label) fail(`cold load ${path}: active is "${cold.label}"`);
        if (!cold.visible) fail(`cold load ${path}: selected tab is off-screen`);
    }

    await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
    await scrollToEnd();
    await Promise.all([page.waitForURL("**/browse/languages"), nativeClick(page, 'a[data-facet="lang"]')]);
    await page.waitForTimeout(300);
    await Promise.all([page.waitForURL((url) => url.pathname === "/"), nativeClick(page, 'a[data-facet="featured"]')]);
    await page.waitForTimeout(300);
    const backHome = await page.evaluate(tabMetricsScript());
    console.log("back to featured", backHome);
    if (backHome.label !== "Featured") fail(`expected Featured, got "${backHome.label}"`);
    if (!backHome.visible) fail("Featured tab is off-screen after returning from Language");

    await browser.close();
    if (failed) process.exit(1);
    console.log("PASS");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
