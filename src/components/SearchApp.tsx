"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import FavoriteButton from "./FavoriteButton";
import { matchesQuery, type SearchSong } from "../lib/catalogue";

interface Suggestion {
    label: string;
    href: string;
}

interface ArtistHit {
    name: string;
    slug: string;
}

interface Props {
    suggestions: Suggestion[];
}

interface SearchIndex {
    songs: SearchSong[];
    artists: ArtistHit[];
}

function subtitle(song: SearchSong): string {
    const bits: string[] = [];
    if (song.artist) bits.push(song.artist);
    else if (song.category) bits.push(song.category);
    if (song.from) bits.push(song.from);
    if (song.year) bits.push(String(song.year));
    return bits.join(" · ");
}

export default function SearchApp({ suggestions }: Props) {
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState<SearchIndex | null>(null);
    const [loadError, setLoadError] = useState(false);
    const deferred = useDeferredValue(query);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        let cancelled = false;
        fetch("/search-index.json")
            .then((r) => {
                if (!r.ok) throw new Error("bad status");
                return r.json() as Promise<SearchIndex>;
            })
            .then((data) => {
                if (!cancelled) setIndex(data);
            })
            .catch(() => {
                if (!cancelled) setLoadError(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const q = deferred.trim().toLowerCase();

    const artistHits = useMemo(() => {
        if (!q || !index) return [] as ArtistHit[];
        return index.artists.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 6);
    }, [index, q]);

    const rows = useMemo(() => {
        if (!q || !index) return [] as SearchSong[];
        const hits: SearchSong[] = [];
        for (const song of index.songs) {
            if (matchesQuery(song, q)) {
                hits.push(song);
                if (hits.length >= 80) break;
            }
        }
        return hits;
    }, [index, q]);

    const idle = !query.trim();
    const empty = Boolean(query.trim()) && index !== null && rows.length === 0 && artistHits.length === 0;

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b border-[#1A1917] px-[18px] pb-3 pt-[22px]">
                <div className="flex items-center gap-2.5">
                    <div className="flex flex-1 items-center gap-2.5 rounded-xl border border-[#33302B] bg-panel px-3.5 py-3">
                        <svg
                            viewBox="0 0 24 24"
                            width="17"
                            height="17"
                            fill="none"
                            stroke="#8B8278"
                            strokeWidth="2.2"
                            strokeLinecap="round"
                            aria-hidden="true"
                        >
                            <circle cx="11" cy="11" r="7" />
                            <path d="M16.5 16.5 21 21" />
                        </svg>
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Songs, artists, films"
                            className="flex-1 border-0 bg-transparent text-[15px] text-cream outline-none placeholder:text-muted"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                        />
                    </div>
                    <a href="/" className="bg-transparent px-1 py-1 text-[14.5px] text-muted no-underline">
                        Cancel
                    </a>
                </div>
            </div>

            <div className="hd flex-1 overflow-y-auto px-[18px] pb-6 pt-2">
                {loadError && (
                    <div className="px-5 py-16 text-center text-sm text-muted">Couldn’t load the catalogue.</div>
                )}

                {!loadError && !index && !idle && (
                    <div className="px-5 py-16 text-center text-sm text-muted">Searching…</div>
                )}

                {idle && (
                    <div>
                        <div className="py-2.5 font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
                            Jump to
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {suggestions.map((s) => (
                                <a
                                    key={s.href + s.label}
                                    href={s.href}
                                    className="rounded-full border border-line-strong bg-panel px-3.5 py-2 text-[13.5px] font-semibold text-cream-soft no-underline"
                                >
                                    {s.label}
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {artistHits.length > 0 && (
                    <div>
                        <div className="pt-2.5 pb-1 font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
                            Artists
                        </div>
                        {artistHits.map((a) => (
                            <a
                                key={a.slug}
                                href={`/artists/${a.slug}`}
                                className="flex w-full items-center gap-3 border-b border-line px-0.5 py-3.5 text-left no-underline"
                            >
                                <span className="flex-1 text-base font-medium text-cream">{a.name}</span>
                                <span className="text-[15px] text-dim">→</span>
                            </a>
                        ))}
                    </div>
                )}

                {rows.length > 0 && (
                    <div>
                        <div className="pt-3.5 pb-1 font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">
                            Songs
                        </div>
                        {rows.map((song) => (
                            <div key={song.id} className="flex items-center gap-2.5 border-b border-line py-3">
                                <a
                                    href={song.artistSlug ? `/artists/${song.artistSlug}` : "/artists"}
                                    className="flex min-h-11 flex-1 flex-col justify-center text-left no-underline"
                                >
                                    <div className="text-[15.5px] leading-snug text-cream">{song.title}</div>
                                    <div className="mt-0.5 text-[13px] text-muted">{subtitle(song)}</div>
                                </a>
                                <FavoriteButton songId={song.id} />
                            </div>
                        ))}
                    </div>
                )}

                {empty && (
                    <div className="px-5 py-[70px] text-center">
                        <div className="text-[17px] font-semibold text-cream">No matches</div>
                        <p className="mt-2 text-sm text-muted">Try the artist, or the film it&apos;s from.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
