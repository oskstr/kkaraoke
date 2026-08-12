/** In-app back + search-field focus helpers for ClientRouter navigations. */

export {};

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

function focusSearchInput(): void {
    if (!location.pathname.startsWith("/search")) return;
    const input = document.querySelector<HTMLInputElement>("[data-search-input]");
    if (!input) return;
    // Sync focus inside after-swap keeps iOS user-gesture context better than delayed retries.
    input.focus({ preventScroll: true });
}

function onSearchLaunch(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-search-launch]")) return;
    sessionStorage.setItem("kkaraoke:focus-search", "1");
}

declare global {
    interface Window {
        __kkaraokeNavInit?: boolean;
    }
}

if (!window.__kkaraokeNavInit) {
    window.__kkaraokeNavInit = true;
    document.addEventListener("click", onSmartBackClick);
    document.addEventListener("pointerdown", onSearchLaunch, true);

    document.addEventListener("astro:after-swap", () => {
        markNavigated();
        if (
            sessionStorage.getItem("kkaraoke:focus-search") === "1" ||
            location.pathname.startsWith("/search")
        ) {
            sessionStorage.removeItem("kkaraoke:focus-search");
            focusSearchInput();
        }
    });

    document.addEventListener("astro:page-load", () => {
        if (location.pathname.startsWith("/search")) {
            focusSearchInput();
        }
    });
}
