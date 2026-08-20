/** Search focus, windowed back-restore, and the brand home link.
 *  Scroll position is Astro ClientRouter’s job (`history.state.scrollY`).
 *  We only materialize windowed collection rows so that restore has a
 *  document tall enough to land on. */

import { navigate } from "astro:transitions/client";
import { ensureWindowedRows, setWindowedRestoreLock } from "./song-window";
import { applySavedSort, readSavedSort } from "./sort-list";

const FOCUS_SEARCH_KEY = "kkaraoke:focus-search";
const NAVIGATED_KEY = "kkaraoke:navigated";
const SEARCH_PERSIST = "catalog-search-input";
/** Which windowed list to expand on back — not a scroll offset. */
const RETURN_MARKER_KEY = "kkaraoke:return-marker";

type ReturnMarker = { path: string; songId: string; rows: number };

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

function setSearchPersist(on: boolean): void {
    const input = searchInputEl();
    if (on) {
        input?.setAttribute("data-astro-transition-persist", SEARCH_PERSIST);
    } else {
        input?.removeAttribute("data-astro-transition-persist");
    }
}

/** Logo always goes to `/`. Do not swap if we are already there. */
function onBrandHomeClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[data-brand-mark]");
    if (!link) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
    }
    if (location.pathname === "/") {
        event.preventDefault();
    }
}

function syncBrandCurrent(): void {
    const brand = document.querySelector("[data-brand-mark]");
    if (!(brand instanceof HTMLElement)) return;
    if (location.pathname === "/") {
        brand.setAttribute("aria-current", "page");
    } else {
        brand.removeAttribute("aria-current");
    }
}

function syncStickyHeadOffset(): void {
    if (!window.matchMedia("(min-width: 768px)").matches) {
        document.documentElement.style.setProperty("--sticky-head-top", "0px");
        return;
    }
    const header = document.querySelector<HTMLElement>(".desktop-appbar, .browse-header");
    const sticky =
        header instanceof HTMLElement && getComputedStyle(header).position === "sticky"
            ? header.getBoundingClientRect().height
            : 0;
    document.documentElement.style.setProperty("--sticky-head-top", `${Math.round(sticky)}px`);
}

function focusSearchInput(): boolean {
    if (searchKeyCommitted) return false;
    if (!location.pathname.startsWith("/search")) return false;
    const input = searchInputEl();
    if (!input) return false;
    if (document.activeElement !== input) {
        input.focus({ preventScroll: true });
    }
    return document.activeElement === input;
}

/** Nudge WebKit to push a new caret rect after persist reparents the input. */
function refreshSearchCaret(): void {
    const input = searchInputEl();
    if (!input || document.activeElement !== input) return;
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    input.setSelectionRange(start, end);
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
    refreshSearchCaret();
}

function wantsSearchFocus(): boolean {
    if (searchKeyCommitted) return false;
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
/** Search/Enter committed — don't steal focus back and reopen the keyboard. */
let searchKeyCommitted = false;

function keepSearchInput(pathname: string): boolean {
    return pathname.startsWith("/search") || pathname === "/" || pathname.startsWith("/browse");
}

/** Open /search from the browse field without dropping caret/keyboard.
 *  The field itself must not move: iOS Safari's caret overlay stays at the
 *  focus-time rect, even when the persisted <input> is reparented. */
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
    searchKeyCommitted = false;
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
        if (
            typeof parsed?.path === "string" &&
            typeof parsed.songId === "string" &&
            parsed.songId !== "" &&
            typeof parsed.rows === "number" &&
            Number.isFinite(parsed.rows) &&
            parsed.rows > 0
        ) {
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
        JSON.stringify({
            path: location.pathname,
            songId,
            rows: document.querySelectorAll(".song-row").length,
        } satisfies ReturnMarker),
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

function windowedRestoreOpts(path: string): { untilId?: string; minRows?: number; minHeight?: number } {
    const marker = returnMarkerFor(path);
    const untilId = marker?.songId;
    const minRows = marker?.rows;
    const stateY = historyScrollY();
    if (minRows !== undefined) {
        return { ...(untilId ? { untilId } : {}), minRows };
    }
    const minHeight = stateY !== undefined && stateY > 0 ? stateY + window.innerHeight + 80 : undefined;
    return {
        ...(untilId ? { untilId } : {}),
        ...(minHeight !== undefined ? { minHeight } : {}),
    };
}

function expandWindowedListForBack(clearKeys = false): void {
    if (expandingForBack) return;
    expandingForBack = true;
    try {
        const marker = returnMarkerFor(location.pathname);
        const opts = windowedRestoreOpts(location.pathname);
        if (!document.querySelector("[data-more-songs]") && !opts.untilId && !opts.minRows) {
            if (clearKeys && marker) clearReturnMarker();
            setWindowedRestoreLock(false);
            return;
        }

        setWindowedRestoreLock(true);
        const rowsBefore = document.querySelectorAll(".song-row").length;
        ensureWindowedRows(document, opts);
        const grew = document.querySelectorAll(".song-row").length > rowsBefore;
        applySavedSort(document, location.pathname);
        const stateY = historyScrollY();

        // Astro already restored. Re-apply if we un-clamped a short document.
        // Skip if a later year-sort chunk already kept the visible song in view.
        if (stateY !== undefined) {
            const y = window.scrollY;
            const stillAtRestore = Math.abs(y - stateY) < 80;
            const clamped = y < stateY - 80;
            if (grew || stillAtRestore || clamped) {
                window.scrollTo({ top: stateY, left: 0, behavior: "instant" });
            }
        }

        if (clearKeys && (!readReturnMarker() || marker)) {
            clearReturnMarker();
        }
    } finally {
        expandingForBack = false;
        if (clearKeys) setWindowedRestoreLock(false);
    }
}

/**
 * Search/Enter commits the query. The spec only labels that key; the keyboard
 * stays up while the field is focused, so a live-search page has to blur.
 */
function onSearchCommit(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.hasAttribute("data-search-input")) return;
    if (event instanceof KeyboardEvent && event.key !== "Enter") return;
    event.preventDefault();
    searchKeyCommitted = true;
    sessionStorage.removeItem(FOCUS_SEARCH_KEY);
    target.blur();
    if (location.pathname.startsWith("/search") || openingSearch) return;
    openingSearch = true;
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
    const opts = windowedRestoreOpts(destPath);
    if (!opts.untilId && !opts.minRows && !opts.minHeight) return;
    ensureWindowedRows(newDoc, { ...opts, path: destPath, sort: readSavedSort(destPath) });
}

const FACET_TABS = "[data-facet-tabs]";
const FACET_TAB_PAD = 12;

/** Horizontal offset of the browse tab strip. Kept across ClientRouter swaps. */
let lastFacetTabScroll = 0;

function facetTabsEl(root: ParentNode): HTMLElement | null {
    return root.querySelector(FACET_TABS);
}

function rememberFacetTabScroll(): void {
    const nav = facetTabsEl(document);
    if (nav) lastFacetTabScroll = nav.scrollLeft;
}

function scrollFacetTabIntoView(nav: HTMLElement, tab: HTMLElement): void {
    if (nav.clientWidth <= 0) return;
    const navRect = nav.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    if (tabRect.right > navRect.right - FACET_TAB_PAD) {
        nav.scrollLeft += tabRect.right - navRect.right + FACET_TAB_PAD;
    } else if (tabRect.left < navRect.left + FACET_TAB_PAD) {
        nav.scrollLeft += tabRect.left - navRect.left - FACET_TAB_PAD;
    }
}

/** Restore the tab strip’s scroll, then nudge so the selected tab is on screen. */
function placeFacetTabs(root: ParentNode, restore = true): void {
    const nav = facetTabsEl(root);
    if (!nav) return;
    if (restore) nav.scrollLeft = lastFacetTabScroll;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) scrollFacetTabIntoView(nav, active);
    // Incoming documents are not laid out yet — don't clobber the saved offset.
    if (nav.clientWidth > 0) lastFacetTabScroll = nav.scrollLeft;
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

    applySavedSort(newDoc, toPath);
    if (lastNavDirection === "back") {
        expandIncomingWindowedList(newDoc, toPath);
    }
    placeFacetTabs(newDoc);
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
    document.addEventListener("click", onBrandHomeClick);
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
        rememberFacetTabScroll();
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
        setSearchPersist(keepSearchInput(dest));
    });

    document.addEventListener("astro:after-swap", () => {
        placeFacetTabs(document);
        markNavigated();
        syncBrandCurrent();
        syncStickyHeadOffset();
        if (lastNavDirection === "back") {
            expandWindowedListForBack(false);
        } else {
            setWindowedRestoreLock(false);
        }
        if (wantsSearchFocus()) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            void scheduleSearchFocus();
        } else if (!location.pathname.startsWith("/search")) {
            resetBrowseSearchInput();
        }
    });

    document.addEventListener("astro:page-load", () => {
        placeFacetTabs(document, false);
        syncBrandCurrent();
        syncStickyHeadOffset();
        requestAnimationFrame(() => {
            placeFacetTabs(document, false);
        });
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

    placeFacetTabs(document);
    syncBrandCurrent();
    syncStickyHeadOffset();
    window.addEventListener("resize", syncStickyHeadOffset);

    // Do not expand on kkaraoke:list-ready — bindInfiniteScroll used to emit that
    // from inside ensure-scroll-height, which would recurse into expand again.
}
