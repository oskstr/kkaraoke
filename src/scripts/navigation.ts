/** In-app back + search focus. Scroll restore is Astro ClientRouter’s job
 *  (window scroll). We only help windowed song lists grow tall enough on back. */

import { navigate } from "astro:transitions/client";
import { ensureWindowedRows } from "./song-window";

const FOCUS_SEARCH_KEY = "kkaraoke:focus-search";
const NAVIGATED_KEY = "kkaraoke:navigated";
const SEARCH_PERSIST = "catalogue-search-input";
const RETURN_SONG_KEY = "kkaraoke:return-song";
const RETURN_SCROLL_KEY = "kkaraoke:return-scroll";

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

function searchInputEl(): HTMLInputElement | null {
    return document.querySelector<HTMLInputElement>("[data-search-input]");
}

function focusSearchInput(): boolean {
    if (!location.pathname.startsWith("/search")) return false;
    const input = searchInputEl();
    if (!input) return false;
    if (document.activeElement !== input) {
        input.focus({ preventScroll: true });
    }
    return document.activeElement === input;
}

async function waitForViewTransitions(): Promise<void> {
    const animations = document.getAnimations?.() ?? [];
    const pending = animations.filter((animation) => animation.playState !== "finished");
    if (pending.length === 0) return;
    await Promise.all(pending.map((animation) => animation.finished.catch(() => undefined)));
}

async function scheduleSearchFocus(): Promise<void> {
    if (!location.pathname.startsWith("/search")) return;
    focusSearchInput();
    requestAnimationFrame(() => {
        focusSearchInput();
    });
    await waitForViewTransitions();
    focusSearchInput();
}

function wantsSearchFocus(): boolean {
    if (!location.pathname.startsWith("/search")) return false;
    if (sessionStorage.getItem(FOCUS_SEARCH_KEY) === "1") return true;
    // Don't pop the keyboard when returning to a previous search.
    if (lastNavDirection === "back") return false;
    return true;
}

function resetBrowseSearchInput(): void {
    const input = searchInputEl();
    if (!input) return;
    if (document.activeElement === input) input.blur();
    if (input.value !== "") {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }
}

let openingSearch = false;

function keepSearchInput(pathname: string): boolean {
    return pathname.startsWith("/search") || pathname === "/" || pathname.startsWith("/browse");
}

/** Open /search from the browse field without dropping caret/keyboard. */
function openSearchFromBrowse(event: Event): void {
    if (location.pathname.startsWith("/search") || openingSearch) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const launch = target.closest<HTMLElement>("[data-search-launch]");
    if (!launch) return;
    if (event instanceof PointerEvent && event.button !== 0) return;

    // Mark before focus() — focusin fires synchronously and would otherwise
    // start a second navigate().
    openingSearch = true;
    sessionStorage.setItem(FOCUS_SEARCH_KEY, "1");

    const input = launch.querySelector<HTMLInputElement>("[data-search-input]") ?? searchInputEl();
    input?.focus({ preventScroll: true });

    void navigate("/search").finally(() => {
        openingSearch = false;
    });
}

function artistSlugFromPath(pathname: string): string | undefined {
    const match = /^\/artists\/([^/]+)\/?$/.exec(pathname);
    return match?.[1];
}

function readReturnScroll(): number | undefined {
    const raw = sessionStorage.getItem(RETURN_SCROLL_KEY);
    if (raw == null || raw === "") return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}

function clearReturnKeys(): void {
    sessionStorage.removeItem(RETURN_SONG_KEY);
    sessionStorage.removeItem(RETURN_SCROLL_KEY);
}

/** Remember the list offset so back can restore it instead of snapping a row to the top. */
function onSongArtistPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href^='/artists/']");
    if (!link || link.hasAttribute("data-astro-reload")) return;
    const path = linkPathname(link);
    if (artistSlugFromPath(path) === undefined) return;

    const row = link.closest<HTMLElement>(".song-row");
    if (row?.dataset.id) sessionStorage.setItem(RETURN_SONG_KEY, row.dataset.id);
    sessionStorage.setItem(RETURN_SCROLL_KEY, String(window.scrollY));
}

function silenceNamedGroups(root: ParentNode, selector: string): void {
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        el.style.viewTransitionName = "none";
    });
}

/** Artist pages fade; don't let collection chrome fly off as a shared element. */
function silenceCollectionChrome(root: ParentNode): void {
    silenceNamedGroups(root, "[data-collection-chrome], [data-collection-title], [data-vt-chrome], [data-vt-title]");
}

type PreparationEvent = Event & {
    direction?: "forward" | "back";
    to?: URL;
};

/**
 * Windowed collections only ship the first chunk of rows. After Astro restores
 * window.scrollY, expand the list until that height (or return-song) exists.
 *
 * Reentrancy guard: ensure → bindInfiniteScroll used to emit list-ready which
 * called this again and blew the stack.
 */
let expandingForBack = false;

function restoreWindowScroll(targetY: number): void {
    if (!Number.isFinite(targetY) || targetY < 0) return;
    if (Math.abs(window.scrollY - targetY) > 1) {
        window.scrollTo({ top: targetY, left: 0, behavior: "instant" });
    }
}

function expandWindowedListForBack(clearKeys = false): void {
    if (expandingForBack) return;
    expandingForBack = true;
    try {
        const state = history.state as { scrollY?: number } | null;
        const saved = readReturnScroll();
        const targetY =
            typeof state?.scrollY === "number" && state.scrollY > 0 ? state.scrollY : (saved ?? window.scrollY);
        const untilId = sessionStorage.getItem(RETURN_SONG_KEY) ?? undefined;

        ensureWindowedRows(document, {
            minHeight: targetY + window.innerHeight + 80,
            ...(untilId ? { untilId } : {}),
        });

        restoreWindowScroll(targetY);

        if (untilId) {
            const el = document.querySelector<HTMLElement>(`.song-row[data-id="${CSS.escape(untilId)}"]`);
            if (el) {
                const r = el.getBoundingClientRect();
                const fullyOff = r.bottom < 0 || r.top > window.innerHeight;
                if (fullyOff) {
                    el.scrollIntoView({ block: "nearest", behavior: "instant" });
                }
            }
        }

        if (clearKeys) clearReturnKeys();
    } finally {
        expandingForBack = false;
    }
}

function onSearchCommit(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-search-input")) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter") return;
    event.preventDefault();
    if (location.pathname.startsWith("/search") || openingSearch) return;
    openingSearch = true;
    sessionStorage.setItem(FOCUS_SEARCH_KEY, "1");
    void navigate("/search").finally(() => {
        openingSearch = false;
    });
}

type SwapEvent = Event & { newDocument?: Document };

function linkPathname(link: HTMLAnchorElement): string {
    try {
        return new URL(link.href, location.origin).pathname;
    } catch {
        return link.getAttribute("href") ?? "";
    }
}

/**
 * Browse grids keep shared `transition:name`s so Featured ↔ Decades can morph
 * the tiles that exist in both. Opening a collection would otherwise animate
 * every other tile as its own group — silence those, keep the match.
 */
function scopeCollectionTileNames(root: ParentNode, keep: { href?: string; chrome?: string; title?: string }): void {
    root.querySelectorAll<HTMLElement>("[data-vt-chrome], [data-vt-title]").forEach((el) => {
        const link = el.closest("a");
        const keepThis =
            (keep.chrome !== undefined && el.dataset.vtChrome === keep.chrome) ||
            (keep.title !== undefined && el.dataset.vtTitle === keep.title) ||
            (keep.href !== undefined && link !== null && linkPathname(link) === keep.href);
        if (keepThis) {
            if (el.dataset.vtChrome) el.style.viewTransitionName = el.dataset.vtChrome;
            if (el.dataset.vtTitle) el.style.viewTransitionName = el.dataset.vtTitle;
        } else {
            el.style.viewTransitionName = "none";
        }
    });
}

function expandIncomingWindowedList(newDoc: Document): void {
    const untilId = sessionStorage.getItem(RETURN_SONG_KEY) ?? undefined;
    const saved = readReturnScroll();
    const stateY = (history.state as { scrollY?: number } | null)?.scrollY;
    const targetY = typeof stateY === "number" && stateY > 0 ? stateY : (saved ?? 0);
    if (!untilId && targetY <= 0) return;
    ensureWindowedRows(newDoc, {
        minHeight: targetY + 900,
        ...(untilId ? { untilId } : {}),
    });
}

/** On back from a collection, only the matching incoming tile should morph. */
function prepareIncomingDocument(event: Event): void {
    const newDoc = (event as SwapEvent).newDocument;
    if (!newDoc) return;
    const chromeName = document.querySelector<HTMLElement>("[data-collection-chrome]")?.dataset.vtChrome;
    const titleName = document.querySelector<HTMLElement>("[data-collection-title]")?.dataset.vtTitle;
    if (chromeName || titleName) {
        scopeCollectionTileNames(newDoc, {
            ...(chromeName ? { chrome: chromeName } : {}),
            ...(titleName ? { title: titleName } : {}),
        });
    }

    if (document.querySelector("[data-artist-title]")) {
        silenceCollectionChrome(newDoc);
    }

    if (lastNavDirection === "back") {
        expandIncomingWindowedList(newDoc);
    }
}

function clearScopedViewTransitionNames(): void {
    document
        .querySelectorAll<HTMLElement>(
            "[data-vt-chrome], [data-vt-title], [data-vt-artist], [data-collection-chrome], [data-collection-title]",
        )
        .forEach((el) => {
            el.style.removeProperty("view-transition-name");
        });
}

let lastNavDirection: "forward" | "back" | null = null;

declare global {
    interface Window {
        __kkaraokeNavInit?: boolean;
    }
}

if (!window.__kkaraokeNavInit) {
    window.__kkaraokeNavInit = true;
    document.addEventListener("click", onSmartBackClick);
    document.addEventListener("keydown", onSearchCommit);
    document.addEventListener("search", onSearchCommit);
    // focusin: keyboard / label activation. pointerdown: start the fetch as
    // soon as the finger lands, while the input is focused in the same gesture.
    document.addEventListener("pointerdown", openSearchFromBrowse, true);
    document.addEventListener("focusin", openSearchFromBrowse);
    document.addEventListener("pointerdown", onSongArtistPointerDown, true);
    document.addEventListener("click", onSongArtistPointerDown, true);
    document.addEventListener("astro:before-swap", prepareIncomingDocument);

    document.addEventListener("astro:before-preparation", (event) => {
        lastNavDirection = (event as PreparationEvent).direction === "back" ? "back" : "forward";
        const dest = (event as PreparationEvent).to?.pathname ?? "";
        if (dest.startsWith("/collections/")) {
            scopeCollectionTileNames(document, { href: dest });
        }
        if (artistSlugFromPath(dest)) {
            silenceCollectionChrome(document);
        }
        if (!keepSearchInput(dest)) {
            searchInputEl()?.removeAttribute("data-astro-transition-persist");
        } else {
            searchInputEl()?.setAttribute("data-astro-transition-persist", SEARCH_PERSIST);
        }
    });

    document.addEventListener("astro:after-swap", () => {
        markNavigated();
        if (lastNavDirection === "back") {
            expandWindowedListForBack(false);
        }
        if (wantsSearchFocus()) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            void scheduleSearchFocus();
        } else if (!location.pathname.startsWith("/search")) {
            resetBrowseSearchInput();
        }
    });

    document.addEventListener("astro:page-load", () => {
        if (lastNavDirection === "back") {
            expandWindowedListForBack(false);
            requestAnimationFrame(() => {
                expandWindowedListForBack(true);
            });
        }
        void waitForViewTransitions().then(() => {
            clearScopedViewTransitionNames();
        });
        if (wantsSearchFocus()) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            void scheduleSearchFocus();
        }
    });

    // Do not expand on kkaraoke:list-ready — bindInfiniteScroll used to emit that
    // from inside ensure-scroll-height, which would recurse into expand again.
}
