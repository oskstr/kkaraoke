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

function readScrollPayload(pathname: string): ScrollPayload | null {
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

function writeScrollPayload(pathname: string, payload: ScrollPayload): void {
    sessionStorage.setItem(SCROLL_PREFIX + pathname, JSON.stringify(payload));
}

function firstVisibleAnchor(root: HTMLElement): string | undefined {
    const rootTop = root.getBoundingClientRect().top;
    const nodes = root.querySelectorAll<HTMLElement>("[data-id], a[href^='/artists/']");
    for (const node of nodes) {
        const rect = node.getBoundingClientRect();
        if (rect.bottom > rootTop + 8) {
            if (node.dataset.id) return `id:${node.dataset.id}`;
            const href = node.getAttribute("href");
            if (href) return `href:${href}`;
        }
    }
    return undefined;
}

function saveScrollPositionFor(pathname: string): void {
    const root = getScrollRoot();
    if (!root) return;
    const anchor = firstVisibleAnchor(root);
    writeScrollPayload(pathname, {
        top: root.scrollTop,
        ...(anchor ? { anchor } : {}),
    });
}

function saveScrollPosition(): void {
    saveScrollPositionFor(location.pathname);
}

function applyScroll(root: HTMLElement, payload: ScrollPayload): void {
    root.scrollTop = payload.top;

    if (payload.anchor) {
        if (payload.anchor.startsWith("id:")) {
            const id = payload.anchor.slice(3);
            const el = root.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
            el?.scrollIntoView({ block: "start" });
        } else if (payload.anchor.startsWith("href:")) {
            const href = payload.anchor.slice(5);
            const el = [...root.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
                (a) => a.getAttribute("href") === href,
            );
            el?.scrollIntoView({ block: "center" });
        }
        // scrollIntoView can overshoot sticky headers — re-apply pixel target after.
        root.scrollTop = payload.top;
    }
}

function ensureScrollHeight(root: HTMLElement, minHeight: number): void {
    window.dispatchEvent(
        new CustomEvent("kkaraoke:ensure-scroll-height", { detail: { minHeight, root } }),
    );
}

function restoreScrollPosition(direction: "forward" | "back" | null): void {
    const root = getScrollRoot();
    if (!root) return;

    if (direction === "back") {
        const payload = readScrollPayload(location.pathname);
        if (payload) {
            ensureScrollHeight(root, payload.top + root.clientHeight + 80);
            const run = () => {
                ensureScrollHeight(root, payload.top + root.clientHeight + 80);
                applyScroll(root, payload);
            };
            run();
            requestAnimationFrame(run);
            window.setTimeout(run, 50);
            window.setTimeout(run, 250);
            window.setTimeout(run, 450);
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

/** Save list scroll when leaving for an artist detail page. */
function onArtistLinkPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href^='/artists/']");
    if (!link) return;
    if (link.hasAttribute("data-smart-back")) return;
    // Only when we're currently on a scrollable list page.
    if (!getScrollRoot()) return;
    saveScrollPosition();
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

/** Set only during ClientRouter navigations (resets on full reload). */
let lastNavDirection: "forward" | "back" | null = null;

if (!window.__kkaraokeNavInit) {
    window.__kkaraokeNavInit = true;
    document.addEventListener("click", onSmartBackClick);
    document.addEventListener("pointerdown", onSearchLaunch, true);
    document.addEventListener("pointerdown", onArtistLinkPointerDown, true);

    document.addEventListener("astro:before-preparation", (event) => {
        const prep = event as PreparationEvent;
        // On back, location is already the destination — key by the page we're leaving.
        const fromPath = prep.from?.pathname ?? location.pathname;
        saveScrollPositionFor(fromPath);
        lastNavDirection = prep.direction === "back" ? "back" : "forward";
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
        if (event.persisted) {
            restoreScrollPosition("back");
        }
    });
}
