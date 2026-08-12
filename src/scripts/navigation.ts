/** In-app back + search focus. Scroll restore is Astro ClientRouter’s job
 *  (window scroll). We only help windowed song lists grow tall enough on back. */

export {};

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

function focusSearchInput(): void {
    if (!location.pathname.startsWith("/search")) return;
    const input = document.querySelector<HTMLInputElement>("[data-search-input]");
    if (!input) return;
    input.focus({ preventScroll: true });
}

function scheduleSearchFocus(): void {
    if (!location.pathname.startsWith("/search")) return;
    focusSearchInput();
    requestAnimationFrame(() => focusSearchInput());
}

function onSearchLaunch(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-search-launch]")) return;
    sessionStorage.setItem(FOCUS_SEARCH_KEY, "1");
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
            const el = document.querySelector<HTMLElement>(
                `.song-row[data-id="${CSS.escape(untilId)}"]`,
            );
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

let lastNavDirection: "forward" | "back" | null = null;

declare global {
    interface Window {
        __kkaraokeNavInit?: boolean;
    }
}

if (!window.__kkaraokeNavInit) {
    window.__kkaraokeNavInit = true;
    document.addEventListener("click", onSmartBackClick);
    document.addEventListener("pointerdown", onSearchLaunch, true);
    document.addEventListener("pointerdown", onSongArtistPointerDown, true);

    document.addEventListener("astro:before-preparation", (event) => {
        lastNavDirection = (event as PreparationEvent).direction === "back" ? "back" : "forward";
    });

    document.addEventListener("astro:after-swap", () => {
        markNavigated();
        if (lastNavDirection === "back") {
            expandWindowedListForBack();
        }
        if (
            sessionStorage.getItem(FOCUS_SEARCH_KEY) === "1" ||
            location.pathname.startsWith("/search")
        ) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            scheduleSearchFocus();
        }
    });

    document.addEventListener("astro:page-load", () => {
        if (lastNavDirection === "back") {
            expandWindowedListForBack();
            requestAnimationFrame(expandWindowedListForBack);
        }
        if (
            sessionStorage.getItem(FOCUS_SEARCH_KEY) === "1" ||
            location.pathname.startsWith("/search")
        ) {
            sessionStorage.removeItem(FOCUS_SEARCH_KEY);
            scheduleSearchFocus();
        }
    });

    // Do not expand on kkaraoke:list-ready — bindInfiniteScroll used to emit that
    // from inside ensure-scroll-height, which would recurse into expand again.
}
