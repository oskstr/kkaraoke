/** Windowed song lists for large collections.
 *
 *  The JSON payload is the full collection (including SSR rows). Remaining
 *  songs are “not in the DOM”. Load more takes the next chunk in the active
 *  sort (A–Z / artist / year) so year-sort does not flash A–Z songs at the
 *  bottom and then reshuffle them above the viewport.
 */

import { compareSortable, readSavedSort, registerListRewindow, type RewindowOpts, type SortKey } from "./sort-list";

type MoreSong = {
    id: number;
    ids: number[];
    title: string;
    artist: string;
    year: string;
    from: string;
    categories: string;
    artists: { name: string; slug: string }[];
};

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function escapeAttr(value: string): string {
    return escapeHtml(value).replaceAll("'", "&#39;");
}

function rowHtml(song: MoreSong): string {
    const title = escapeHtml(song.title);
    const meta = [song.from, song.year].filter(Boolean);
    let subtitle = "";
    if (song.artists.length > 0) {
        subtitle = song.artists
            .map(
                (a, i) =>
                    `${i > 0 ? ", " : ""}<a href="/artists/${escapeAttr(a.slug)}" class="song-artist-link" data-vt-artist="${escapeAttr(a.slug)}">${escapeHtml(a.name)}</a>`,
            )
            .join("");
        if (meta.length > 0) subtitle += ` · ${escapeHtml(meta.join(" · "))}`;
    } else {
        const bits = [song.categories, ...meta].filter(Boolean);
        subtitle = escapeHtml(bits.join(" · "));
    }
    const artistCol =
        song.artists.length > 0
            ? song.artists
                  .map(
                      (a, i) =>
                          `${i > 0 ? ", " : ""}<a href="/artists/${escapeAttr(a.slug)}" class="song-artist-link" data-vt-artist="${escapeAttr(a.slug)}">${escapeHtml(a.name)}</a>`,
                  )
                  .join("")
            : escapeHtml(song.categories);
    const ids = song.ids.length > 0 ? song.ids : [song.id];
    const idsAttr = ids.join(",");
    const numbersLabel = ids.length === 1 ? `Number ${ids[0]}` : `Numbers ${ids.join(", ")}`;
    const numbers = ids.map((id) => `<span aria-hidden="true">${id}</span>`).join("");
    return `<div class="song-row flex items-start gap-2.5 border-b border-line py-3" data-title="${escapeAttr(song.title)}" data-artist="${escapeAttr(song.artist)}" data-year="${escapeAttr(song.year)}" data-id="${ids[0]}">
        <span class="song-num flex w-11 shrink-0 flex-col items-end gap-0.5 pt-1 font-mono text-[12px] leading-none text-gold tabular-nums" aria-label="${escapeAttr(numbersLabel)}">${numbers}</span>
        <div class="song-body flex min-h-11 min-w-0 flex-1 flex-col justify-center">
          <div class="song-title text-[15.5px] leading-snug text-cream">${title}</div>
          <div class="song-sub mt-0.5 text-[13px] text-muted">${subtitle}</div>
        </div>
        <div class="song-col song-col-artist">${artistCol}</div>
        <div class="song-col">${escapeHtml(song.from)}</div>
        <div class="song-col song-col-year">${escapeHtml(song.year)}</div>
        <button type="button" data-fav-toggle="${idsAttr}" class="min-w-11 self-center bg-transparent px-1 py-2.5 text-[17px]" style="border:0" aria-label="Add to favorites" aria-pressed="false"><span aria-hidden="true">♥</span></button>
      </div>`;
}

function renderedSongIds(list: Element): Set<string> {
    const seen = new Set<string>();
    list.querySelectorAll<HTMLElement>(".song-row[data-id]").forEach((row) => {
        if (row.dataset.id) seen.add(row.dataset.id);
    });
    return seen;
}

function songIds(song: MoreSong): number[] {
    return song.ids.length > 0 ? song.ids : [song.id];
}

function primaryId(song: MoreSong): string {
    return String(songIds(song)[0] ?? song.id);
}

function notYetRendered(song: MoreSong, seen: Set<string>): boolean {
    return songIds(song).every((id) => !seen.has(String(id)));
}

function songHasId(song: MoreSong, id: string): boolean {
    return songIds(song).some((songId) => String(songId) === id);
}

function sortableOf(song: MoreSong) {
    return { title: song.title, artist: song.artist, year: song.year, id: song.id };
}

function parseAllSongs(json: HTMLElement): MoreSong[] {
    try {
        return JSON.parse(json.textContent || "[]") as MoreSong[];
    } catch {
        return [];
    }
}

function songsInSortOrder(songs: MoreSong[], sort: SortKey): MoreSong[] {
    // Payload is stored A–Z; don’t pay for a no-op sort on that path.
    if (sort === "az") return songs;
    return [...songs].sort((a, b) => compareSortable(sortableOf(a), sortableOf(b), sort));
}

function remainingInSortOrder(all: MoreSong[], list: Element, sort: SortKey): MoreSong[] {
    const seen = renderedSongIds(list);
    return songsInSortOrder(all, sort).filter((song) => notYetRendered(song, seen));
}

function matchedPrefixLength(list: Element, sorted: MoreSong[]): number {
    const rows = [...list.querySelectorAll<HTMLElement>(".song-row")];
    let i = 0;
    while (i < rows.length && i < sorted.length && rows[i]?.dataset.id === primaryId(sorted[i]!)) {
        i += 1;
    }
    return i;
}

let observer: IntersectionObserver | null = null;
let loadMoreFn: (() => void) | null = null;
let listEl: Element | null = null;
/** Pause infinite-scroll while back-navigation restores `scrollY`. */
let restoreLock = false;

function observeSentinel(): void {
    const sentinel = document.querySelector("[data-infinite-sentinel]");
    if (!observer || !sentinel || restoreLock) return;
    observer.observe(sentinel);
}

/** Block extra chunks until Astro’s restored `scrollY` is applied. */
export function setWindowedRestoreLock(locked: boolean): void {
    restoreLock = locked;
    if (locked) {
        observer?.disconnect();
        return;
    }
    if (observer) {
        observeSentinel();
        return;
    }
    bindInfiniteScroll();
}

const ROW_HEIGHT_ESTIMATE = 80;

function listIsTallEnough(
    doc: Document,
    list: Element,
    opts: { untilId?: string; minHeight?: number; minRows?: number },
): boolean {
    if (opts.untilId && !list.querySelector(`[data-id="${CSS.escape(opts.untilId)}"]`)) {
        return false;
    }
    const rowCount = list.querySelectorAll(".song-row").length;
    if (opts.minRows !== undefined) {
        return rowCount >= opts.minRows;
    }
    if (opts.minHeight !== undefined) {
        const scrollHeight = doc.documentElement.scrollHeight;
        if (scrollHeight >= opts.minHeight) return true;
        // Incoming documents in `astro:before-swap` often have no layout yet.
        // Use a tall estimate so we undershoot; after-swap fills the rest.
        if (scrollHeight < 80) {
            if (rowCount * ROW_HEIGHT_ESTIMATE >= opts.minHeight) return true;
        }
        return false;
    }
    return true;
}

function neededWindowSize(list: Element, sorted: MoreSong[], opts: RewindowOpts, chunk: number): number {
    const current = list.querySelectorAll(".song-row").length;
    let n = opts.resetScroll ? chunk : Math.max(chunk, current);
    if (opts.minRows !== undefined) n = Math.max(n, opts.minRows);
    if (opts.untilId) {
        const index = sorted.findIndex((song) => songHasId(song, opts.untilId!));
        if (index >= 0) n = Math.max(n, index + 1);
    }
    if (opts.minHeight !== undefined) {
        n = Math.max(n, Math.ceil(opts.minHeight / ROW_HEIGHT_ESTIMATE));
    }
    return Math.min(n, sorted.length);
}

function finishLiveWindow(doc: Document, json: HTMLElement, remaining: number): void {
    const root = doc.querySelector("[data-more-songs-root]");
    if (remaining === 0) {
        root?.remove();
        observer?.disconnect();
        observer = null;
        loadMoreFn = null;
        listEl = null;
        return;
    }
    if (doc === document) {
        if (json.isConnected) json.dataset.bound = "";
        bindInfiniteScroll();
        window.dispatchEvent(new Event("kkaraoke:favorites"));
    }
}

/** Rebuild (or grow) the DOM as a prefix of the collection in `sort` order. */
export function rewindowSortedList(doc: Document, sort: SortKey, opts: RewindowOpts = {}): boolean {
    const list = doc.querySelector("[data-song-list]");
    const json = doc.querySelector<HTMLElement>("[data-more-songs]");
    if (!list || !json) return false;

    const all = parseAllSongs(json);
    if (all.length === 0) return false;

    const chunk = Math.max(1, Number(json.getAttribute("data-chunk") || "80"));
    const sorted = songsInSortOrder(all, sort);
    const n = neededWindowSize(list, sorted, opts, chunk);
    const prefix = matchedPrefixLength(list, sorted);
    const current = list.querySelectorAll(".song-row").length;

    if (prefix === n && current === n) {
        if (sorted.length === n) {
            doc.querySelector("[data-more-songs-root]")?.remove();
        }
        return false;
    }

    if (prefix === current && n > current) {
        list.insertAdjacentHTML("beforeend", sorted.slice(current, n).map(rowHtml).join(""));
        finishLiveWindow(doc, json, sorted.length - n);
        return true;
    }

    list.innerHTML = sorted.slice(0, n).map(rowHtml).join("");
    if (opts.resetScroll && doc === document) {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
    finishLiveWindow(doc, json, sorted.length - n);
    return true;
}

/**
 * Insert windowed rows into `doc` until `untilId` exists or the list is tall
 * enough. Safe on the live document and on `event.newDocument` before swap.
 */
export function ensureWindowedRows(
    doc: Document,
    opts: { untilId?: string; minHeight?: number; minRows?: number; sort?: SortKey; path?: string } = {},
): void {
    const json = doc.querySelector<HTMLElement>("[data-more-songs]");
    const list = doc.querySelector("[data-song-list]");
    if (!list || !json) return;

    const sort = opts.sort ?? readSavedSort(opts.path ?? (doc === document ? location.pathname : ""));
    if (sort !== "az") {
        rewindowSortedList(doc, sort, opts);
        return;
    }

    const root = doc.querySelector("[data-more-songs-root]");
    const all = parseAllSongs(json);
    const chunk = Math.max(1, Number(json.getAttribute("data-chunk") || "80"));
    let remaining = remainingInSortOrder(all, list, "az");

    let guard = 0;
    while (remaining.length > 0 && guard < 80 && !listIsTallEnough(doc, list, opts)) {
        const batch = remaining.splice(0, chunk);
        if (batch.length === 0) break;
        list.insertAdjacentHTML("beforeend", batch.map(rowHtml).join(""));
        guard += 1;
    }

    if (remaining.length === 0) {
        root?.remove();
    }

    if (doc === document) {
        if (json.isConnected) json.dataset.bound = "";
        bindInfiniteScroll();
        window.dispatchEvent(new Event("kkaraoke:favorites"));
    }
}

function bindInfiniteScroll(): void {
    const root = document.querySelector("[data-more-songs-root]");
    const list = document.querySelector("[data-song-list]");
    const sentinel = document.querySelector("[data-infinite-sentinel]");
    const json = document.querySelector<HTMLElement>("[data-more-songs]");

    if (!root || !list || !sentinel || !json) {
        observer?.disconnect();
        observer = null;
        loadMoreFn = null;
        listEl = null;
        return;
    }

    // Already wired to this exact list node — keep the in-memory remaining queue.
    if (json.dataset.bound === "1" && loadMoreFn && listEl === list) {
        observeSentinel();
        return;
    }

    observer?.disconnect();
    observer = null;

    const all = parseAllSongs(json);
    if (all.length === 0) {
        root.remove();
        loadMoreFn = null;
        listEl = null;
        return;
    }

    const sort = readSavedSort(location.pathname);
    let remaining = remainingInSortOrder(all, list, sort);
    json.dataset.bound = "1";

    if (remaining.length === 0) {
        loadMoreFn = null;
        listEl = null;
        root.remove();
        return;
    }

    const chunk = Math.max(1, Number(json.getAttribute("data-chunk") || "80"));
    listEl = list;

    const stopLoader = () => {
        observer?.disconnect();
        observer = null;
        loadMoreFn = null;
        root.remove();
    };

    const loadMore = () => {
        if (restoreLock || remaining.length === 0) return false;
        const batch = remaining.splice(0, chunk);
        if (batch.length === 0) {
            stopLoader();
            return false;
        }
        list.insertAdjacentHTML("beforeend", batch.map(rowHtml).join(""));
        window.dispatchEvent(new Event("kkaraoke:favorites"));
        if (remaining.length === 0) {
            stopLoader();
            return false;
        }
        return true;
    };

    const PREFETCH_PX = 1200;
    const loadWhileNear = () => {
        let n = 0;
        while (!restoreLock && remaining.length > 0 && n < 3) {
            if (n > 0) {
                const top = sentinel.getBoundingClientRect().top;
                if (top > window.innerHeight + PREFETCH_PX) break;
            }
            if (!loadMore()) break;
            n += 1;
            if (!sentinel.isConnected) break;
        }
    };
    loadMoreFn = loadWhileNear;

    observer = new IntersectionObserver(
        (entries) => {
            if (entries.some((e) => e.isIntersecting)) loadWhileNear();
        },
        { root: null, rootMargin: `${PREFETCH_PX}px 0px`, threshold: 0 },
    );
    observeSentinel();
}

function onLoadMoreClick(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("[data-load-more]")) return;
    loadMoreFn?.();
}

function onEnsureScrollHeight(event: Event): void {
    const detail = (event as CustomEvent<{ minHeight: number; root: Element; untilId?: string }>).detail;
    if (!detail) return;
    ensureWindowedRows(document, {
        minHeight: detail.minHeight,
        ...(detail.untilId ? { untilId: detail.untilId } : {}),
    });
}

declare global {
    interface Window {
        __kkaraokeSongWindowInit?: boolean;
    }
}

registerListRewindow(rewindowSortedList);

if (!window.__kkaraokeSongWindowInit) {
    window.__kkaraokeSongWindowInit = true;
    // Bind to the new document after swap — do not clear an already-correct loader first.
    document.addEventListener("astro:after-swap", bindInfiniteScroll);
    document.addEventListener("astro:page-load", bindInfiniteScroll);
    document.addEventListener("kkaraoke:ensure-scroll-height", onEnsureScrollHeight);
    document.addEventListener("click", onLoadMoreClick);
    bindInfiniteScroll();
}
