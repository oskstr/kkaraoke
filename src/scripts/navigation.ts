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

function captureScrollPayload(preferredAnchor?: string): ScrollPayload | null {
    const root = getScrollRoot();
    if (!root) return null;
    const anchor = preferredAnchor ?? firstVisibleAnchor(root);
    return {
        top: root.scrollTop,
        ...(anchor ? { anchor } : {}),
    };
}

function persistPayload(payload: ScrollPayload, pathname = location.pathname): void {
    writeSessionPayload(pathname, payload);
    const state = (history.state ?? {}) as NonNullable<HistoryState>;
    history.replaceState({ ...state, kkScroll: payload }, "");
}

/** Persist onto the current history entry + sessionStorage for reload/bfcache. */
function persistCurrentScroll(preferredAnchor?: string): void {
    const payload = captureScrollPayload(preferredAnchor);
    if (!payload) return;
    persistPayload(payload);
}

function songIdFromAnchor(anchor: string | undefined): string | undefined {
    if (!anchor?.startsWith("id:")) return undefined;
    return anchor.slice(3);
}

function ensureScrollContent(root: HTMLElement, payload: ScrollPayload): void {
    const untilId = songIdFromAnchor(payload.anchor);
    document.dispatchEvent(
        new CustomEvent("kkaraoke:ensure-scroll-height", {
            bubbles: true,
            detail: {
                minHeight: payload.top + root.clientHeight + 80,
                root,
                ...(untilId ? { untilId } : {}),
            },
        }),
    );
}

function applyScroll(root: HTMLElement, payload: ScrollPayload): void {
    ensureScrollContent(root, payload);

    const untilId = songIdFromAnchor(payload.anchor);
    if (untilId) {
        const el = root.querySelector<HTMLElement>(`.song-row[data-id="${CSS.escape(untilId)}"]`);
        if (el) {
            // Align the anchored song to the top of the list scroller.
            // Do this twice — inserting windowed rows can shift layout once.
            for (let i = 0; i < 2; i++) {
                const delta = el.getBoundingClientRect().top - root.getBoundingClientRect().top;
                if (Math.abs(delta) < 1) break;
                root.scrollTop += delta;
            }
            return;
        }
    }

    if (payload.anchor?.startsWith("href:")) {
        const href = payload.anchor.slice(5);
        const el = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
            (a) => a.getAttribute("href") === href && !a.closest(".song-row"),
        );
        if (el) {
            const delta = el.getBoundingClientRect().top - root.getBoundingClientRect().top - 8;
            root.scrollTop += delta;
            return;
        }
    }

    root.scrollTop = payload.top;
}

function anchorIsSettled(payload: ScrollPayload): boolean {
    const root = getScrollRoot();
    if (!root) return false;
    const untilId = songIdFromAnchor(payload.anchor);
    if (!untilId) {
        return Math.abs(root.scrollTop - payload.top) < 40;
    }
    const el = root.querySelector<HTMLElement>(`.song-row[data-id="${CSS.escape(untilId)}"]`);
    if (!el) return false;
    const delta = el.getBoundingClientRect().top - root.getBoundingClientRect().top;
    return Math.abs(delta) < 48;
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
        applyScroll(root, payload);
        return;
    }

    if (direction === "forward") {
        root.scrollTop = 0;
    }
}

/** astro:page-load fires before the view transition finishes — re-apply then. */
function restoreAfterViewTransition(direction: "forward" | "back" | null): void {
    if (direction !== "back") {
        restoreScrollPosition(direction);
        return;
    }

    const payload = resolvePayload();
    const apply = () => restoreScrollPosition("back");
    apply();

    // Windowed lists finish binding after page-load listeners start — listen for ready.
    const onReady = () => apply();
    document.addEventListener("kkaraoke:list-ready", onReady, { once: true });

    let attempts = 0;
    const settle = () => {
        apply();
        attempts += 1;
        if (payload && !anchorIsSettled(payload) && attempts < 20) {
            requestAnimationFrame(settle);
            return;
        }
        document.removeEventListener("kkaraoke:list-ready", onReady);
    };

    const html = document.documentElement;
    const startSettle = () => {
        requestAnimationFrame(settle);
        window.setTimeout(settle, 50);
        window.setTimeout(settle, 200);
        window.setTimeout(settle, 450);
    };

    if (!html.hasAttribute("data-astro-transition")) {
        startSettle();
        return;
    }

    const obs = new MutationObserver(() => {
        if (!html.hasAttribute("data-astro-transition")) {
            obs.disconnect();
            startSettle();
        }
    });
    obs.observe(html, { attributes: true, attributeFilter: ["data-astro-transition"] });
    window.setTimeout(() => {
        obs.disconnect();
        startSettle();
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

function preferredAnchorFromLink(link: HTMLAnchorElement): string | undefined {
    const row = link.closest<HTMLElement>(".song-row");
    if (row?.dataset.id) return `id:${row.dataset.id}`;
    return undefined;
}

function onLeavingLinkPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href]");
    if (!link || link.hasAttribute("data-smart-back")) return;
    if (link.target === "_blank" || link.hasAttribute("download")) return;
    const href = link.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    persistCurrentScroll(preferredAnchorFromLink(link));
}

/** Full-reload links (`data-astro-reload`) may not get pointerdown in all cases. */
function onLeavingLinkClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href][data-astro-reload]");
    if (!link || link.hasAttribute("data-smart-back")) return;
    persistCurrentScroll(preferredAnchorFromLink(link));
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
            const payload = captureScrollPayload();
            if (payload) {
                const fromPath = prep.from?.pathname ?? location.pathname;
                // Keep a more specific anchor already stored on this history entry
                // (e.g. the song row that was clicked) when it exists.
                const existing = (history.state as HistoryState)?.kkScroll;
                const merged: ScrollPayload = {
                    top: payload.top,
                    anchor: existing?.anchor ?? payload.anchor,
                };
                // If the click handler already wrote a fresher top+anchor for this path, prefer higher top.
                const session = readSessionPayload(fromPath);
                if (session && session.top >= merged.top) {
                    merged.top = session.top;
                    merged.anchor = session.anchor ?? merged.anchor;
                }
                persistPayload(merged, fromPath);
            }
        }
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
            lastNavDirection ?? (navEntry?.type === "back_forward" ? "back" : null);
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
