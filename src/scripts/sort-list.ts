/** Collection list sort. SSR is always A–Z; this reorders loaded rows in the DOM. */

export type SortKey = "az" | "artist" | "year";

const SORT_STORE = "kkaraoke:sort:";
const collator = new Intl.Collator("sv");

export function parseSort(value: string | null | undefined): SortKey {
    if (value === "artist" || value === "year" || value === "az") return value;
    return "az";
}

export function readSavedSort(path: string): SortKey {
    return parseSort(sessionStorage.getItem(`${SORT_STORE}${path}`));
}

export function saveSort(path: string, sort: SortKey): void {
    const key = `${SORT_STORE}${path}`;
    if (sort === "az") sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, sort);
}

export function sortSongList(list: HTMLElement, sort: SortKey): void {
    const rows = [...list.querySelectorAll<HTMLElement>(".song-row")];
    rows.sort((a, b) => {
        const titleA = a.dataset.title ?? "";
        const titleB = b.dataset.title ?? "";
        const artistA = a.dataset.artist ?? "";
        const artistB = b.dataset.artist ?? "";
        const yearA = Number(a.dataset.year || 9999);
        const yearB = Number(b.dataset.year || 9999);
        const idA = Number(a.dataset.id || 0);
        const idB = Number(b.dataset.id || 0);
        if (sort === "artist") {
            return collator.compare(artistA, artistB) || collator.compare(titleA, titleB) || idA - idB;
        }
        if (sort === "year") {
            return yearA - yearB || collator.compare(titleA, titleB) || idA - idB;
        }
        return collator.compare(titleA, titleB) || idA - idB;
    });
    for (const row of rows) list.appendChild(row);
}

export function paintSortTabs(root: ParentNode, sort: SortKey): void {
    root.querySelectorAll<HTMLElement>("[data-sort]").forEach((btn) => {
        const on = btn.dataset.sort === sort;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.classList.toggle("bg-white/92", on);
        btn.classList.toggle("text-[#17150F]", on);
        btn.classList.toggle("bg-black/22", !on);
        btn.classList.toggle("text-white/85", !on);
    });
}

type ViewAnchor = { id: string; top: number };

function captureAnchor(list: HTMLElement): ViewAnchor | null {
    if (list.ownerDocument !== document) return null;
    const rows = [...list.querySelectorAll<HTMLElement>(".song-row")];
    const row =
        rows.find((el) => {
            const top = el.getBoundingClientRect().top;
            return top >= 80 && top < window.innerHeight - 80;
        }) ??
        rows.find((el) => {
            const r = el.getBoundingClientRect();
            return r.bottom > 80 && r.top < window.innerHeight;
        });
    const id = row?.dataset.id;
    if (!row || !id) return null;
    return { id, top: row.getBoundingClientRect().top };
}

function restoreAnchor(anchor: ViewAnchor | null): void {
    if (!anchor) return;
    const row = document.querySelector<HTMLElement>(`.song-row[data-id="${CSS.escape(anchor.id)}"]`);
    if (!row) return;
    const delta = row.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 1) {
        window.scrollBy({ top: delta, left: 0, behavior: "instant" });
    }
}

/** Reorder a collection list to the saved sort. Returns true if the DOM order changed. */
export function applySavedSort(root: ParentNode, path: string, opts: { preserveView?: boolean } = {}): boolean {
    const sort = readSavedSort(path);
    const list = root.querySelector<HTMLElement>("[data-song-list]");
    const tabs = root.querySelector("[data-sort-tabs]");
    if (!list) return false;
    if (tabs) paintSortTabs(tabs, sort);
    if (sort === "az") return false;
    const anchor = opts.preserveView === true ? captureAnchor(list) : null;
    sortSongList(list, sort);
    restoreAnchor(anchor);
    return true;
}

function onSortClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLElement>("[data-sort]");
    if (!btn || !btn.dataset.sort) return;
    const tabs = btn.closest("[data-sort-tabs]");
    const list = document.querySelector<HTMLElement>("[data-song-list]");
    if (!list || !tabs) return;
    const sort = parseSort(btn.dataset.sort);
    saveSort(location.pathname, sort);
    paintSortTabs(tabs, sort);
    sortSongList(list, sort);
}

declare global {
    interface Window {
        __kkaraokeSortInit?: boolean;
    }
}

if (!window.__kkaraokeSortInit) {
    window.__kkaraokeSortInit = true;
    document.addEventListener("click", onSortClick);
    document.addEventListener("astro:page-load", () => {
        applySavedSort(document, location.pathname, { preserveView: window.scrollY > 80 });
    });
}
