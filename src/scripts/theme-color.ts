/** Keep iOS Safari’s status bar in sync with the page.
 *
 *  A bare `theme-color` meta is ignored in dark mode — Safari then samples
 *  `background-color` on the header, which used to be the old hashed tile tint
 *  sitting under the art. Media-queried tags plus a replace-on-swap (Safari
 *  does not notice in-place `content` updates after ClientRouter) is the
 *  combination that actually sticks.
 */

const FALLBACK = "#0a0a09";

function themeFromPage(): string {
    const marked = document.querySelector<HTMLElement>("[data-collection-chrome][data-theme-color]");
    if (marked?.dataset.themeColor) return marked.dataset.themeColor;
    const shell = document.querySelector<HTMLElement>("[data-theme-color]");
    return shell?.dataset.themeColor ?? FALLBACK;
}

function applyThemeColor(color: string): void {
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
    for (const media of ["(prefers-color-scheme: dark)", "(prefers-color-scheme: light)"]) {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "theme-color");
        meta.setAttribute("media", media);
        meta.setAttribute("content", color);
        document.head.appendChild(meta);
    }
    document.documentElement.style.backgroundColor = color;
}

function syncThemeColor(): void {
    applyThemeColor(themeFromPage());
}

document.addEventListener("astro:after-swap", syncThemeColor);
document.addEventListener("astro:page-load", syncThemeColor);
