/** In-app back + search focus. Scroll restore is Astro ClientRouter’s job
 *  (window scroll). We only help windowed song lists grow tall enough on back. */

import { navigate } from "astro:transitions/client";

const FOCUS_SEARCH_KEY = "kkaraoke:focus-search";
const NAVIGATED_KEY = "kkaraoke:navigated";
const SEARCH_PERSIST = "catalogue-search-input";

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

/** Remember which song row was clicked so windowed lists can expand to it on back. */
function onSongArtistPointerDown(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest<HTMLAnchorElement>("a[href^='/artists/']");
    const row = link?.closest<HTMLElement>(".song-row");
    if (!row?.dataset.id) return;
    sessionStorage.setItem("kkaraoke:return-song", row.dataset.id);
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

function expandWindowedListForBack(): void {
    if (expandingForBack) return;
    expandingForBack = true;
    try {
        const root = document.documentElement;
        const state = history.state as { scrollY?: number } | null;
        const targetY = state?.scrollY ?? window.scrollY;
        const untilId = sessionStorage.getItem("kkaraoke:return-song") ?? undefined;

        document.dispatchEvent(
            new CustomEvent("kkaraoke:ensure-scroll-height", {
                bubbles: true,
                detail: {
                    minHeight: targetY + window.innerHeight + 80,
                    root,
                    ...(untilId ? { untilId } : {}),
                },
            }),
        );

        if (untilId) {
            const el = document.querySelector<HTMLElement>(`.song-row[data-id="${CSS.escape(untilId)}"]`);
            if (el) {
                const top = el.getBoundingClientRect().top + window.scrollY;
                if (Math.abs(window.scrollY - top) > 48) {
                    window.scrollTo({ top, left: 0, behavior: "instant" });
                }
                sessionStorage.removeItem("kkaraoke:return-song");
                return;
            }
        }

        // Re-assert Astro’s restored window scroll after rows were inserted.
        if (typeof targetY === "number" && targetY > 0) {
            window.scrollTo({ top: targetY, left: 0, behavior: "instant" });
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

function closestVtPair(event: Event): { chrome: HTMLElement | null; title: HTMLElement | null } {
    const target = event.target;
    if (!(target instanceof Element)) return { chrome: null, title: null };
    const chrome = target.closest<HTMLElement>("[data-vt-chrome]");
    const title = target.closest<HTMLElement>("[data-vt-title]") ?? chrome?.querySelector("[data-vt-title]") ?? null;
    return { chrome, title };
}

/** Only the activated tile participates in the shared-element morph. */
function onCollectionTileActivate(event: Event): void {
    if (event instanceof MouseEvent && event.button !== 0) return;
    const { chrome, title } = closestVtPair(event);
    if (!chrome && !title) return;

    document.querySelectorAll<HTMLElement>("[data-vt-chrome], [data-vt-title]").forEach((el) => {
        if (el !== chrome && el !== title) {
            el.style.viewTransitionName = "none";
        }
    });
    const chromeName = chrome?.dataset.vtChrome;
    if (chrome && chromeName) chrome.style.viewTransitionName = chromeName;
    const titleName = title?.dataset.vtTitle;
    if (title && titleName) title.style.viewTransitionName = titleName;
}

type SwapEvent = Event & { newDocument?: Document };

/** On back, name the matching tile in the incoming grid so the header can morph into it. */
function prepareIncomingTileMorph(event: Event): void {
    const newDoc = (event as SwapEvent).newDocument;
    if (!newDoc) return;
    const chromeName = document.querySelector<HTMLElement>("[data-collection-chrome]")?.dataset.vtChrome;
    const titleName = document.querySelector<HTMLElement>("[data-collection-title]")?.dataset.vtTitle;
    if (chromeName) {
        const incoming = newDoc.querySelector<HTMLElement>(`[data-vt-chrome="${CSS.escape(chromeName)}"]`);
        if (incoming) incoming.style.viewTransitionName = chromeName;
    }
    if (titleName) {
        const incoming = newDoc.querySelector<HTMLElement>(`[data-vt-title="${CSS.escape(titleName)}"]`);
        if (incoming) incoming.style.viewTransitionName = titleName;
    }
}

function clearBrowseViewTransitionNames(): void {
    if (document.querySelector("[data-collection-chrome]")) return;
    document.querySelectorAll<HTMLElement>("[data-vt-chrome], [data-vt-title]").forEach((el) => {
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
    document.addEventListener("pointerdown", onCollectionTileActivate, true);
    document.addEventListener("click", onCollectionTileActivate, true);
    document.addEventListener("astro:before-swap", prepareIncomingTileMorph);

    document.addEventListener("astro:before-preparation", (event) => {
        lastNavDirection = (event as PreparationEvent).direction === "back" ? "back" : "forward";
        const dest = (event as PreparationEvent).to?.pathname ?? "";
        if (!keepSearchInput(dest)) {
            searchInputEl()?.removeAttribute("data-astro-transition-persist");
        } else {
            searchInputEl()?.setAttribute("data-astro-transition-persist", SEARCH_PERSIST);
        }
    });

    document.addEventListener("astro:after-swap", () => {
        markNavigated();
        if (lastNavDirection === "back") {
            expandWindowedListForBack();
        }
        if (wantsSearchFocus()) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            void scheduleSearchFocus();
        } else if (!location.pathname.startsWith("/search")) {
            resetBrowseSearchInput();
        }
    });

    document.addEventListener("astro:page-load", () => {
        clearBrowseViewTransitionNames();
        if (lastNavDirection === "back") {
            expandWindowedListForBack();
            requestAnimationFrame(expandWindowedListForBack);
        }
        if (wantsSearchFocus()) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            void scheduleSearchFocus();
        }
    });

    // Do not expand on kkaraoke:list-ready — bindInfiniteScroll used to emit that
    // from inside ensure-scroll-height, which would recurse into expand again.
}
