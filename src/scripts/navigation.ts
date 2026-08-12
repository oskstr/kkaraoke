/** In-app back, search focus, and scroll-root restoration for ClientRouter. */

export {};

const SCROLL_PREFIX = "kkaraoke:scroll:";
const FOCUS_SEARCH_KEY = "kkaraoke:focus-search";
const NAVIGATED_KEY = "kkaraoke:navigated";

function sameOriginReferrer(): boolean {
    const ref = document.referrer;
    if (!ref) return false;
    try {
        return new URL(ref).origin === location.origin;
    } catch {
        return false;
    }
}

function canGoBackInApp(): boolean {
    const nav = (window as unknown as { navigation?: { canGoBack?: boolean } }).navigation;
    if (nav && typeof nav.canGoBack === "boolean") {
        return nav.canGoBack;
    }
    if (sessionStorage.getItem(NAVIGATED_KEY) === "1") {
        return true;
    }
    return sameOriginReferrer();
}

function onSmartBackClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[data-smart-back]");
    if (!link) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
    }
    if (!canGoBackInApp()) return;

    event.preventDefault();
    history.back();
}

function markNavigated(): void {
    sessionStorage.setItem(NAVIGATED_KEY, "1");
}

function getScrollRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>("[data-scroll-root]");
}

interface ScrollPayload {
    top: number;
    anchor?: string;
}

type HistoryState = {
    index?: number;
    scrollX?: number;
    scrollY?: number;
    kkScroll?: ScrollPayload;
} | null;

function readSessionPayload(pathname: string): ScrollPayload | null {
    const raw = sessionStorage.getItem(SCROLL_PREFIX + pathname);
    if (raw == null) return null;
    try {
        const parsed = JSON.parse(raw) as ScrollPayload | number;
        if (typeof parsed === "number") return { top: parsed };
        if (parsed && typeof parsed.top === "number") return parsed;
    } catch {
        const asNumber = Number(raw);
        if (Number.isFinite(asNumber)) return { top: asNumber };
    }
    return null;
}

function writeSessionPayload(pathname: string, payload: ScrollPayload): void {
    sessionStorage.setItem(SCROLL_PREFIX + pathname, JSON.stringify(payload));
}

/** Prefer a song row id; on artists A–Z use the first in-view artist link. */
function firstVisibleAnchor(root: HTMLElement): string | undefined {
    const rootBox = root.getBoundingClientRect();
    const songs = root.querySelectorAll<HTMLElement>(".song-row[data-id]");
    for (const node of songs) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom > rootBox.top + 8 && rect.top < rootBox.bottom) {
            return `id:${node.dataset.id}`;
        }
    }
    const artists = root.querySelectorAll<HTMLAnchorElement>(":scope > section a[href^='/artists/'], :scope > a[href^='/artists/']");
    for (const node of artists) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom > rootBox.top + 8 && rect.top < rootBox.bottom) {
            const href = node.getAttribute("href");
            if (href) return `href:${href}`;
        }
    }
    // Artists page nests links in sections — broader fallback without song-row artist chips.
    if (songs.length === 0) {
        for (const node of root.querySelectorAll<HTMLAnchorElement>("a[href^='/artists/']")) {
            if (node.closest(".song-row")) continue;
            const rect = node.getBoundingClientRect();
            if (rect.bottom > rootBox.top + 8 && rect.top < rootBox.bottom) {
                const href = node.getAttribute("href");
                if (href) return `href:${href}`;
            }
        }
    }
    return undefined;
}

function captureScrollPayload(): ScrollPayload | null {
    const root = getScrollRoot();
    if (!root) return null;
    const anchor = firstVisibleAnchor(root);
    return {
        top: root.scrollTop,
        ...(anchor ? { anchor } : {}),
    };
}

/** Persist onto the current history entry + sessionStorage for reload/bfcache. */
function persistCurrentScroll(): void {
    const payload = captureScrollPayload();
    if (!payload) return;
    // Skip useless overwrites when the root isn't the active scroller yet.
    writeSessionPayload(location.pathname, payload);
    const state = (history.state ?? {}) as NonNullable<HistoryState>;
    history.replaceState({ ...state, kkScroll: payload }, "");
}

function applyScroll(root: HTMLElement, payload: ScrollPayload): void {
    root.scrollTop = payload.top;

    if (payload.anchor?.startsWith("id:")) {
        const id = payload.anchor.slice(3);
        const el = root.querySelector<HTMLElement>(`.song-row[data-id="${CSS.escape(id)}"]`);
        if (el) {
            const rootTop = root.getBoundingClientRect().top;
            const elTop = el.getBoundingClientRect().top;
            root.scrollTop += elTop - rootTop;
        }
    } else if (payload.anchor?.startsWith("href:")) {
        const href = payload.anchor.slice(5);
        const el = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
            (a) => a.getAttribute("href") === href && !a.closest(".song-row"),
        );
        if (el) {
            const rootTop = root.getBoundingClientRect().top;
            const elTop = el.getBoundingClientRect().top;
            root.scrollTop += elTop - rootTop - 8;
        }
    }

    // Pixel target wins when content height matches what we left.
    if (root.scrollHeight >= payload.top + root.clientHeight - 1) {
        root.scrollTop = payload.top;
    }
}

function ensureScrollHeight(root: HTMLElement, minHeight: number): void {
    window.dispatchEvent(
        new CustomEvent("kkaraoke:ensure-scroll-height", { detail: { minHeight, root } }),
    );
}

function resolvePayload(): ScrollPayload | null {
    const state = history.state as HistoryState;
    if (state?.kkScroll && typeof state.kkScroll.top === "number") {
        return state.kkScroll;
    }
    return readSessionPayload(location.pathname);
}

function restoreScrollPosition(direction: "forward" | "back" | null): void {
    const root = getScrollRoot();
    if (!root) return;

    if (direction === "back") {
        const payload = resolvePayload();
        if (!payload) return;

        const run = () => {
            ensureScrollHeight(root, payload.top + root.clientHeight + 80);
            applyScroll(root, payload);
        };
        run();
        requestAnimationFrame(run);
        return;
    }

    if (direction === "forward") {
        root.scrollTop = 0;
    }
}

/** astro:page-load fires before the view transition finishes — re-apply then. */
function restoreAfterViewTransition(direction: "forward" | "back" | null): void {
    restoreScrollPosition(direction);
    if (direction !== "back") return;

    const apply = () => restoreScrollPosition("back");
    const html = document.documentElement;

    if (!html.hasAttribute("data-astro-transition")) {
        requestAnimationFrame(apply);
        window.setTimeout(apply, 50);
        window.setTimeout(apply, 300);
        return;
    }

    const obs = new MutationObserver(() => {
        if (!html.hasAttribute("data-astro-transition")) {
            obs.disconnect();
            apply();
            requestAnimationFrame(apply);
            window.setTimeout(apply, 50);
        }
    });
    obs.observe(html, { attributes: true, attributeFilter: ["data-astro-transition"] });
    window.setTimeout(() => {
        obs.disconnect();
        apply();
    }, 700);
}

function focusSearchInput(): void {
    if (!location.pathname.startsWith("/search")) return;
    const input = document.querySelector<HTMLInputElement>("[data-search-input]");
    if (!input) return;
    input.focus({ preventScroll: true });
}

function scheduleSearchFocus(): void {
    if (!location.pathname.startsWith("/search")) return;
    focusSearchInput();
    requestAnimationFrame(() => {
        focusSearchInput();
        requestAnimationFrame(() => focusSearchInput());
    });
    window.setTimeout(() => focusSearchInput(), 50);
    window.setTimeout(() => focusSearchInput(), 200);
}

function onSearchLaunch(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-search-launch]")) return;
    persistCurrentScroll();
    sessionStorage.setItem(FOCUS_SEARCH_KEY, "1");
}

function onLeavingLinkPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.hasAttribute("data-smart-back")) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    // Capture while the list scroller still has its offset.
    persistCurrentScroll();
}

/** Full-reload links (`data-astro-reload`) may not get pointerdown in all cases. */
function onLeavingLinkClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href][data-astro-reload]");
    if (!link || link.hasAttribute("data-smart-back")) return;
    persistCurrentScroll();
}

type PreparationEvent = Event & {
    direction?: "forward" | "back";
    from?: URL;
    to?: URL;
};

declare global {
    interface Window {
        __kkaraokeNavInit?: boolean;
    }
}

let lastNavDirection: "forward" | "back" | null = null;

if (!window.__kkaraokeNavInit) {
    window.__kkaraokeNavInit = true;
    document.addEventListener("click", onSmartBackClick);
    document.addEventListener("pointerdown", onSearchLaunch, true);
    document.addEventListener("pointerdown", onLeavingLinkPointerDown, true);
    document.addEventListener("click", onLeavingLinkClick, true);

    document.addEventListener("astro:before-preparation", (event) => {
        const prep = event as PreparationEvent;
        lastNavDirection = prep.direction === "back" ? "back" : "forward";

        if (lastNavDirection === "forward") {
            // DOM is still the page we're leaving; location may already match `to`.
            const payload = captureScrollPayload();
            if (payload) {
                const fromPath = prep.from?.pathname ?? location.pathname;
                writeSessionPayload(fromPath, payload);
                const state = (history.state ?? {}) as NonNullable<HistoryState>;
                history.replaceState({ ...state, kkScroll: payload }, "");
            }
        }
        // On back: do NOT overwrite the destination's saved scroll with the
        // detail page's ~0 offset (location is already the destination).
    });

    document.addEventListener("astro:after-swap", () => {
        markNavigated();
        restoreAfterViewTransition(lastNavDirection);

        if (
            sessionStorage.getItem(FOCUS_SEARCH_KEY) === "1" ||
            location.pathname.startsWith("/search")
        ) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            scheduleSearchFocus();
        }
    });

    document.addEventListener("astro:page-load", () => {
        const navEntry = performance.getEntriesByType("navigation")[0] as
            | PerformanceNavigationTiming
            | undefined;
        const direction =
            lastNavDirection ??
            (navEntry?.type === "back_forward" ? "back" : null);
        restoreAfterViewTransition(direction);

        if (
            sessionStorage.getItem(FOCUS_SEARCH_KEY) === "1" ||
            location.pathname.startsWith("/search")
        ) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            scheduleSearchFocus();
        }
    });

    window.addEventListener("pageshow", (event) => {
        if (event.persisted) {
            restoreAfterViewTransition("back");
            return;
        }
        const navEntry = performance.getEntriesByType("navigation")[0] as
            | PerformanceNavigationTiming
            | undefined;
        if (navEntry?.type === "back_forward") {
            restoreAfterViewTransition("back");
        }
    });
}
