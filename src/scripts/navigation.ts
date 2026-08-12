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

function saveScrollPosition(): void {
    const root = getScrollRoot();
    if (!root) return;
    sessionStorage.setItem(SCROLL_PREFIX + location.pathname, String(root.scrollTop));
}

function navigationType(): string | undefined {
    const entry = performance.getEntriesByType("navigation")[0] as
        | PerformanceNavigationTiming
        | undefined;
    return entry?.type;
}

function restoreScrollPosition(direction: "forward" | "back" | null): void {
    const root = getScrollRoot();
    if (!root) return;

    const back = direction === "back" || navigationType() === "back_forward";
    if (back) {
        const saved = sessionStorage.getItem(SCROLL_PREFIX + location.pathname);
        if (saved != null) {
            const top = Number(saved);
            root.scrollTop = top;
            requestAnimationFrame(() => {
                root.scrollTop = top;
            });
            return;
        }
    }

    if (direction === "forward") {
        root.scrollTop = 0;
    }
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
    window.setTimeout(() => focusSearchInput(), 400);
}

function onSearchLaunch(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-search-launch]")) return;
    // Full reload skips ClientRouter preparation — save scroll here.
    saveScrollPosition();
    sessionStorage.setItem(FOCUS_SEARCH_KEY, "1");
}

type PreparationEvent = Event & {
    direction?: "forward" | "back";
};

declare global {
    interface Window {
        __kkaraokeNavInit?: boolean;
    }
}

/** Set only during ClientRouter navigations (resets on full reload). */
let lastNavDirection: "forward" | "back" | null = null;

if (!window.__kkaraokeNavInit) {
    window.__kkaraokeNavInit = true;
    document.addEventListener("click", onSmartBackClick);
    document.addEventListener("pointerdown", onSearchLaunch, true);

    document.addEventListener("astro:before-preparation", (event) => {
        saveScrollPosition();
        lastNavDirection = (event as PreparationEvent).direction ?? "forward";
    });

    document.addEventListener("astro:after-swap", () => {
        markNavigated();
        restoreScrollPosition(lastNavDirection);

        if (
            sessionStorage.getItem(FOCUS_SEARCH_KEY) === "1" ||
            location.pathname.startsWith("/search")
        ) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            scheduleSearchFocus();
        }
    });

    document.addEventListener("astro:page-load", () => {
        restoreScrollPosition(lastNavDirection);

        if (
            sessionStorage.getItem(FOCUS_SEARCH_KEY) === "1" ||
            location.pathname.startsWith("/search")
        ) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            scheduleSearchFocus();
        }
    });

    // Full reload / bfcache back (e.g. Cancel after search launch) won’t
    // always go through ClientRouter preparation.
    window.addEventListener("pageshow", (event) => {
        if (event.persisted || navigationType() === "back_forward") {
            restoreScrollPosition("back");
        }
    });
}
