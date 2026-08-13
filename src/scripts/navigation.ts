/** In-app back + search focus. Scroll position is Astro ClientRouter’s job
 *  (`history.state.scrollY`). We only materialize windowed collection rows so
 *  that restore has a document tall enough to land on. */

import { navigate } from "astro:transitions/client";
import { ensureWindowedRows } from "./song-window";
import { applySavedSort } from "./sort-list";

const FOCUS_SEARCH_KEY = "kkaraoke:focus-search";
const NAVIGATED_KEY = "kkaraoke:navigated";
const SEARCH_PERSIST = "catalogue-search-input";
/** Which windowed list to expand on back — not a scroll offset. */
const RETURN_MARKER_KEY = "kkaraoke:return-marker";

type ReturnMarker = { path: string; songId: string };

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

function readReturnMarker(): ReturnMarker | undefined {
    const raw = sessionStorage.getItem(RETURN_MARKER_KEY);
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(raw) as ReturnMarker;
        if (typeof parsed?.path === "string" && typeof parsed.songId === "string" && parsed.songId !== "") {
            return parsed;
        }
    } catch {
        return undefined;
    }
    return undefined;
}

function returnMarkerFor(path: string): ReturnMarker | undefined {
    const marker = readReturnMarker();
    if (!marker || marker.path !== path) return undefined;
    return marker;
}

function clearReturnMarker(): void {
    sessionStorage.removeItem(RETURN_MARKER_KEY);
}

/** Remember which windowed row to materialize on back. Astro keeps scrollY. */
function onSongArtistPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href^='/artists/']");
    if (!link || link.hasAttribute("data-astro-reload")) return;
    const path = linkPathname(link);
    if (artistSlugFromPath(path) === undefined) return;
    if (!document.querySelector("[data-more-songs]")) return;

    const row = link.closest<HTMLElement>(".song-row");
    const songId = row?.dataset.id;
    if (!songId) return;
    sessionStorage.setItem(
        RETURN_MARKER_KEY,
        JSON.stringify({ path: location.pathname, songId } satisfies ReturnMarker),
    );
}

function silenceNamedGroups(root: ParentNode, selector: string): void {
    const doc = root instanceof Document ? root : root.ownerDocument;
    root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
        if (el === doc?.documentElement) return;
        el.style.setProperty("view-transition-name", "none", "important");
    });
}

const FADE_ONLY_CLASS = "vt-fade-only";

function isArtistDetailPath(pathname: string): boolean {
    return artistSlugFromPath(pathname) !== undefined;
}

function artistRelatedNav(fromPath: string, toPath: string): boolean {
    return isArtistDetailPath(fromPath) || isArtistDetailPath(toPath);
}

function setFadeOnly(doc: Document, on: boolean): void {
    doc.documentElement.classList.toggle(FADE_ONLY_CLASS, on);
}

type PreparationEvent = Event & {
    direction?: "forward" | "back";
    from?: URL;
    to?: URL;
};

/**
 * Windowed collections only ship the first chunk of rows. Expand until Astro’s
 * restored scrollY (or the originating song) exists. Do not set scroll ourselves
 * unless we grew the document after ClientRouter already ran `scrollTo`.
 */
let expandingForBack = false;

function historyScrollY(): number | undefined {
    const y = (history.state as { scrollY?: number } | null)?.scrollY;
    return typeof y === "number" && Number.isFinite(y) ? y : undefined;
}

function expandWindowedListForBack(clearKeys = false): void {
    if (expandingForBack) return;
    expandingForBack = true;
    try {
        const marker = returnMarkerFor(location.pathname);
        const untilId = marker?.songId;
        const stateY = historyScrollY();
        if (!document.querySelector("[data-more-songs]") && !untilId) {
            if (clearKeys && marker) clearReturnMarker();
            return;
        }

        const rowsBefore = document.querySelectorAll(".song-row").length;
        ensureWindowedRows(document, {
            minHeight: (stateY ?? window.scrollY) + window.innerHeight + 80,
            ...(untilId ? { untilId } : {}),
        });
        const grew = document.querySelectorAll(".song-row").length > rowsBefore;
        const resorted = applySavedSort(document, location.pathname);

        // Astro already restored. Re-apply if we un-clamped a short document or re-sorted.
        if ((grew || resorted) && stateY !== undefined) {
            window.scrollTo({ top: stateY, left: 0, behavior: "instant" });
        }

        if (clearKeys && (!readReturnMarker() || marker)) {
            clearReturnMarker();
        }
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

type SwapEvent = Event & { newDocument?: Document; from?: URL; to?: URL };

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

function expandIncomingWindowedList(newDoc: Document, destPath: string): void {
    if (!newDoc.querySelector("[data-more-songs]")) return;
    const untilId = returnMarkerFor(destPath)?.songId;
    const stateY = historyScrollY();
    const minHeight = stateY !== undefined && stateY > 0 ? stateY + 900 : undefined;
    if (!untilId && minHeight === undefined) return;
    ensureWindowedRows(newDoc, {
        ...(minHeight !== undefined ? { minHeight } : {}),
        ...(untilId ? { untilId } : {}),
    });
}

/** On back from a collection, only the matching incoming tile should morph. */
function prepareIncomingDocument(event: Event): void {
    const swap = event as SwapEvent;
    const newDoc = swap.newDocument;
    if (!newDoc) return;

    const fromPath = swap.from?.pathname ?? location.pathname;
    const toPath = swap.to?.pathname ?? "";
    const fadeOnly = artistRelatedNav(fromPath, toPath) || Boolean(document.querySelector("[data-artist-title]"));
    setFadeOnly(newDoc, fadeOnly);

    if (fadeOnly) {
        silenceNamedGroups(
            newDoc,
            ".app-shell, [data-collection-chrome], [data-collection-title], [data-vt-chrome], [data-vt-title], [data-astro-transition-scope]",
        );
    } else {
        const chromeName = document.querySelector<HTMLElement>("[data-collection-chrome]")?.dataset.vtChrome;
        const titleName = document.querySelector<HTMLElement>("[data-collection-title]")?.dataset.vtTitle;
        if (chromeName || titleName) {
            scopeCollectionTileNames(newDoc, {
                ...(chromeName ? { chrome: chromeName } : {}),
                ...(titleName ? { title: titleName } : {}),
            });
        }
    }

    if (lastNavDirection === "back") {
        expandIncomingWindowedList(newDoc, toPath);
    }
    applySavedSort(newDoc, toPath);
}

function clearScopedViewTransitionNames(): void {
    document.documentElement.classList.remove(FADE_ONLY_CLASS);
    document.querySelectorAll<HTMLElement>("[data-astro-transition-scope]").forEach((el) => {
        if (el === document.documentElement) return;
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
        const fromPath = (event as PreparationEvent).from?.pathname ?? location.pathname;
        const fadeOnly = artistRelatedNav(fromPath, dest);
        setFadeOnly(document, fadeOnly);
        if (fadeOnly) {
            silenceNamedGroups(
                document,
                ".app-shell, [data-collection-chrome], [data-collection-title], [data-vt-chrome], [data-vt-title], [data-astro-transition-scope]",
            );
        } else if (dest.startsWith("/collections/")) {
            scopeCollectionTileNames(document, { href: dest });
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
