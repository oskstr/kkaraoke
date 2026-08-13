/** Keep iOS Safari’s status bar in sync with the page.
 *
 *  A bare `theme-color` meta is ignored in dark mode — Safari then samples
 *  `background-color` on the header. Media-queried tags plus a replace (Safari
 *  does not notice in-place `content` updates after ClientRouter) is what
 *  sticks. Removing the meta during a view transition lets Safari sample the
 *  morphing art (lighter) and then we snap to the fallback (darker) — skip
 *  no-ops, swap without a gap, and apply the destination color before swap.
 */

const FALLBACK = "#0a0a09";

let current: string | undefined;

function themeFrom(root: ParentNode): string {
    const marked = root.querySelector<HTMLElement>("[data-collection-chrome][data-theme-color]");
    if (marked?.dataset.themeColor) return marked.dataset.themeColor;
    const shell = root.querySelector<HTMLElement>(".app-shell[data-theme-color]");
    return shell?.dataset.themeColor ?? FALLBACK;
}

function applyThemeColor(color: string): void {
    if (current === undefined) {
        current = document.querySelector('meta[name="theme-color"]')?.getAttribute("content") ?? undefined;
    }
    if (color === current) return;
    current = color;

    const next: HTMLMetaElement[] = [];
    for (const media of ["(prefers-color-scheme: dark)", "(prefers-color-scheme: light)"]) {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        meta.setAttribute("media", media);
        meta.setAttribute("content", color);
        next.push(meta);
    }
    const old = [...document.querySelectorAll('meta[name="theme-color"]')];
    const first = old[0];
    for (const meta of next) {
        if (first) document.head.insertBefore(meta, first);
        else document.head.appendChild(meta);
    }
    for (const meta of old) meta.remove();
    document.documentElement.style.backgroundColor = color;
}

document.addEventListener("astro:before-swap", (event) => {
    const newDoc = (event as Event & { newDocument?: Document }).newDocument;
    if (newDoc) applyThemeColor(themeFrom(newDoc));
});
document.addEventListener("astro:page-load", () => {
    applyThemeColor(themeFrom(document));
});
