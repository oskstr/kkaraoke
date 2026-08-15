/** Collection list sort. SSR is always A–Z; windowed lists re-window in this order. */

export type SortKey = "az" | "artist" | "year";

export type SortableSong = { title: string; artist: string; year: string; id: number };

export type RewindowOpts = {
    minRows?: number;
    untilId?: string;
    minHeight?: number;
    resetScroll?: boolean;
    preserveView?: boolean;
};

const SORT_STORE = "kkaraoke:sort:";
const collator = new Intl.Collator("sv");

type RewindowFn = (doc: Document, sort: SortKey, opts?: RewindowOpts) => boolean;

let rewindowFn: RewindowFn | null = null;

export function registerListRewindow(fn: RewindowFn): void {
    rewindowFn = fn;
}

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

export function compareSortable(a: SortableSong, b: SortableSong, sort: SortKey): number {
    const yearA = Number(a.year || 9999);
    const yearB = Number(b.year || 9999);
    if (sort === "artist") {
        return collator.compare(a.artist, b.artist) || collator.compare(a.title, b.title) || a.id - b.id;
    }
    if (sort === "year") {
        return yearA - yearB || collator.compare(a.title, b.title) || a.id - b.id;
    }
    return collator.compare(a.title, b.title) || a.id - b.id;
}

export function sortSongList(list: HTMLElement, sort: SortKey): void {
    const rows = [...list.querySelectorAll<HTMLElement>(".song-row")];
    rows.sort((a, b) =>
        compareSortable(
            {
                title: a.dataset.title ?? "",
                artist: a.dataset.artist ?? "",
                year: a.dataset.year ?? "",
                id: Number(a.dataset.id || 0),
            },
            {
                title: b.dataset.title ?? "",
                artist: b.dataset.artist ?? "",
                year: b.dataset.year ?? "",
                id: Number(b.dataset.id || 0),
            },
            sort,
        ),
    );
    for (const row of rows) list.appendChild(row);
}

export function paintSortTabs(root: ParentNode, sort: SortKey): void {
    root.querySelectorAll<HTMLElement>("[data-sort]").forEach((btn) => {
        const on = btn.dataset.sort === sort;
        btn.setAttribute("aria-pressed", on ? "true" : "false");
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

function documentOf(root: ParentNode): Document | null {
    return root instanceof Document ? root : root.ownerDocument;
}

/** Reorder a collection list to the saved sort. Returns true if the DOM order changed. */
export function applySavedSort(root: ParentNode, path: string, opts: RewindowOpts = {}): boolean {
    const sort = readSavedSort(path);
    const list = root.querySelector<HTMLElement>("[data-song-list]");
    const tabs = root.querySelector("[data-sort-tabs]");
    if (!list) return false;
    if (tabs) paintSortTabs(tabs, sort);
    const doc = documentOf(root);
    if (rewindowFn && doc && root.querySelector("[data-more-songs]")) {
        return rewindowFn(doc, sort, opts);
    }
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
    if (sort === readSavedSort(location.pathname) && btn.getAttribute("aria-pressed") === "true") return;
    saveSort(location.pathname, sort);
    paintSortTabs(tabs, sort);
    if (rewindowFn && document.querySelector("[data-more-songs]")) {
        rewindowFn(document, sort, { resetScroll: true });
        return;
    }
    sortSongList(list, sort);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
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
