/** Windowed song lists for large collections.
 *
 *  Important: never reset `remaining` to the full JSON payload while the DOM
 *  already contains later chunks — that re-appends early letters (B…) under F.
 *  Always skip song ids that are already rendered.
 */

export {};

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
                    `${i > 0 ? ", " : ""}<a href="/artists/${escapeAttr(a.slug)}" class="song-artist-link">${escapeHtml(a.name)}</a>`,
            )
            .join("");
        if (meta.length > 0) subtitle += ` · ${escapeHtml(meta.join(" · "))}`;
    } else {
        const bits = [song.categories, ...meta].filter(Boolean);
        subtitle = escapeHtml(bits.join(" · "));
    }
    const ids = song.ids.length > 0 ? song.ids : [song.id];
    const idsAttr = ids.join(",");
    const numbersLabel = ids.length === 1 ? `Number ${ids[0]}` : `Numbers ${ids.join(", ")}`;
    const numbers = ids.map((id) => `<span aria-hidden="true">${id}</span>`).join("");
    return `<div class="song-row flex items-start gap-2.5 border-b border-line py-3" data-title="${escapeAttr(song.title)}" data-artist="${escapeAttr(song.artist)}" data-year="${escapeAttr(song.year)}" data-id="${ids[0]}">
        <span class="song-num flex w-11 shrink-0 flex-col items-end gap-0.5 pt-1 font-mono text-[12px] tabular-nums leading-none text-gold" aria-label="${escapeAttr(numbersLabel)}">${numbers}</span>
        <div class="flex min-h-11 flex-1 flex-col justify-center">
          <div class="text-[15.5px] leading-snug text-cream">${title}</div>
          <div class="mt-0.5 text-[13px] text-muted">${subtitle}</div>
        </div>
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

function notYetRendered(song: MoreSong, seen: Set<string>): boolean {
    const ids = song.ids.length > 0 ? song.ids : [song.id];
    return ids.every((id) => !seen.has(String(id)));
}

let observer: IntersectionObserver | null = null;
let loadMoreFn: (() => void) | null = null;
let listEl: Element | null = null;

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
        return;
    }

    observer?.disconnect();
    observer = null;

    let remaining: MoreSong[] = [];
    try {
        remaining = JSON.parse(json.textContent || "[]") as MoreSong[];
    } catch {
        root.remove();
        loadMoreFn = null;
        listEl = null;
        return;
    }

    // Drop anything already in the DOM (initial SSR rows + any ensure-loaded chunks).
    const seen = renderedSongIds(list);
    remaining = remaining.filter((song) => notYetRendered(song, seen));
    json.dataset.bound = "1";

    if (remaining.length === 0) {
        loadMoreFn = null;
        listEl = null;
        root.remove();
        return;
    }

    const chunk = Math.max(1, Number(json.getAttribute("data-chunk") || "80"));
    listEl = list;

    const loadMore = () => {
        if (remaining.length === 0) return;
        // Re-check DOM in case another pass inserted rows.
        const live = renderedSongIds(list);
        while (remaining.length > 0 && !notYetRendered(remaining[0]!, live)) {
            remaining.shift();
        }
        if (remaining.length === 0) {
            observer?.disconnect();
            observer = null;
            loadMoreFn = null;
            root.remove();
            return;
        }
        const batch = remaining.splice(0, chunk).filter((song) => notYetRendered(song, live));
        for (const song of batch) {
            for (const id of song.ids.length > 0 ? song.ids : [song.id]) {
                live.add(String(id));
            }
        }
        if (batch.length === 0) return;
        list.insertAdjacentHTML("beforeend", batch.map(rowHtml).join(""));
        window.dispatchEvent(new Event("kkaraoke:favorites"));
        if (remaining.length === 0) {
            observer?.disconnect();
            observer = null;
            loadMoreFn = null;
            root.remove();
        }
    };
    loadMoreFn = loadMore;

    observer = new IntersectionObserver(
        (entries) => {
            if (entries.some((e) => e.isIntersecting)) loadMore();
        },
        { root: null, rootMargin: "240px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
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

    if (!loadMoreFn || listEl !== document.querySelector("[data-song-list]")) {
        bindInfiniteScroll();
    }

    let guard = 0;
    while (loadMoreFn && listEl && guard < 50) {
        if (detail.untilId) {
            if (listEl.querySelector(`[data-id="${CSS.escape(detail.untilId)}"]`)) break;
        } else if (document.documentElement.scrollHeight >= detail.minHeight) {
            break;
        }
        const before = listEl.querySelectorAll(".song-row").length;
        loadMoreFn();
        const after = listEl.querySelectorAll(".song-row").length;
        if (after === before) break;
        guard += 1;
    }
}

declare global {
    interface Window {
        __kkaraokeSongWindowInit?: boolean;
    }
}

if (!window.__kkaraokeSongWindowInit) {
    window.__kkaraokeSongWindowInit = true;
    // Bind to the new document after swap — do not clear an already-correct loader first.
    document.addEventListener("astro:after-swap", bindInfiniteScroll);
    document.addEventListener("astro:page-load", bindInfiniteScroll);
    document.addEventListener("kkaraoke:ensure-scroll-height", onEnsureScrollHeight);
    document.addEventListener("click", onLoadMoreClick);
    bindInfiniteScroll();
}
