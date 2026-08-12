const STORAGE_KEY = "kkaraoke:favorites";

export function readFavorites(): number[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
    } catch {
        return [];
    }
}

export function writeFavorites(ids: number[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    window.dispatchEvent(new Event("kkaraoke:favorites"));
}

export function toggleFavorite(id: number): number[] {
    const current = readFavorites();
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    writeFavorites(next);
    return next;
}

export function paintFavoriteButtons(root: ParentNode = document): void {
    const favs = new Set(readFavorites());
    root.querySelectorAll<HTMLElement>("[data-fav-toggle]").forEach((btn) => {
        const id = Number(btn.getAttribute("data-fav-toggle"));
        const on = favs.has(id);
        btn.style.color = on ? "#E9B44C" : "#3B3733";
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
    });
}

export function paintFavoritesNav(root: ParentNode = document): void {
    const count = readFavorites().length;
    root.querySelectorAll<HTMLElement>("[data-fav-nav]").forEach((el) => {
        const on = count > 0;
        el.classList.toggle("border-[rgba(233,180,76,0.4)]", on);
        el.classList.toggle("bg-[rgba(233,180,76,0.14)]", on);
        el.classList.toggle("text-gold", on);
        el.classList.toggle("border-line-strong", !on);
        el.classList.toggle("bg-panel", !on);
        el.classList.toggle("text-[#9A9086]", !on);
    });
}

function onClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLElement>("[data-fav-toggle]");
    if (!btn) return;
    event.preventDefault();
    const id = Number(btn.getAttribute("data-fav-toggle"));
    if (!Number.isFinite(id)) return;
    toggleFavorite(id);
    paintFavoriteButtons();
    paintFavoritesNav();
}

export function initFavorites(): void {
    paintFavoriteButtons();
    paintFavoritesNav();
}

declare global {
    interface Window {
        __kkaraokeFavInit?: boolean;
    }
}

if (typeof window !== "undefined" && !window.__kkaraokeFavInit) {
    window.__kkaraokeFavInit = true;
    document.addEventListener("click", onClick);
    document.addEventListener("astro:page-load", initFavorites);
    window.addEventListener("kkaraoke:favorites", () => {
        paintFavoriteButtons();
        paintFavoritesNav();
    });
    initFavorites();
}
