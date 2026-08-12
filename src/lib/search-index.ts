import type { SearchSong } from "../lib/catalogue";

export interface SearchIndex {
    songs: SearchSong[];
    artists: { name: string; slug: string }[];
}

let cache: SearchIndex | null = null;
let inflight: Promise<SearchIndex> | null = null;

export function getSearchIndex(): Promise<SearchIndex> {
    if (cache) return Promise.resolve(cache);
    if (inflight) return inflight;

    inflight = fetch("/search-index.json")
        .then((r) => {
            if (!r.ok) throw new Error("bad status");
            return r.json() as Promise<SearchIndex>;
        })
        .then((data) => {
            cache = data;
            inflight = null;
            return data;
        })
        .catch((err) => {
            inflight = null;
            throw err;
        });

    return inflight;
}
