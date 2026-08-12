/** In-app back + search-field focus helpers for ClientRouter navigations. */

export {};

import { navigate } from "astro:transitions/client";

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
    if (sessionStorage.getItem("kkaraoke:navigated") === "1") {
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
    sessionStorage.setItem("kkaraoke:navigated", "1");
}

async function waitForViewTransitions(): Promise<void> {
    const animations = document.getAnimations?.() ?? [];
    if (animations.length === 0) return;
    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
}

function unlockSearchInput(): void {
    const input = document.querySelector<HTMLInputElement>("[data-search-input]");
    if (!input) return;
    if (location.pathname.startsWith("/search")) {
        input.removeAttribute("readonly");
    } else {
        input.setAttribute("readonly", "");
    }
}

async function focusSearchInput(): Promise<void> {
    if (!location.pathname.startsWith("/search")) return;
    const input = document.querySelector<HTMLInputElement>("[data-search-input]");
    if (!input) return;

    unlockSearchInput();
    await waitForViewTransitions();

    for (const delay of [0, 40, 120, 280]) {
        if (delay > 0) {
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        input.focus({ preventScroll: true });
        if (document.activeElement === input) {
            const len = input.value.length;
            try {
                input.setSelectionRange(len, len);
            } catch {
                /* type=search */
            }
            return;
        }
    }
}

let openingSearch = false;

function openSearchFromBrowse(event: Event): void {
    if (location.pathname.startsWith("/search") || openingSearch) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const launch = target.closest<HTMLElement>("[data-search-launch], [data-search-input]");
    if (!launch) return;

    // Keep the persisted input focused across the route change.
    event.preventDefault();
    openingSearch = true;
    sessionStorage.setItem("kkaraoke:focus-search", "1");
    void navigate("/search").finally(() => {
        openingSearch = false;
    });
}

async function maybeFocusAfterNav(): Promise<void> {
    unlockSearchInput();
    const forced = sessionStorage.getItem("kkaraoke:focus-search") === "1";
    if (forced) sessionStorage.removeItem("kkaraoke:focus-search");
    if (forced || location.pathname.startsWith("/search")) {
        await focusSearchInput();
    }
}

declare global {
    interface Window {
        __kkaraokeNavInit?: boolean;
    }
}

if (!window.__kkaraokeNavInit) {
    window.__kkaraokeNavInit = true;
    document.addEventListener("click", onSmartBackClick);
    document.addEventListener("pointerdown", openSearchFromBrowse, true);
    document.addEventListener("focusin", openSearchFromBrowse, true);
    document.addEventListener("astro:after-swap", markNavigated);
    document.addEventListener("astro:page-load", () => {
        unlockSearchInput();
        void maybeFocusAfterNav();
    });
    document.addEventListener("astro:after-swap", () => {
        unlockSearchInput();
        void maybeFocusAfterNav();
    });
}
