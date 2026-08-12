"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import FavoriteButton from "./FavoriteButton";
import { matchesQuery, type SearchSong } from "../lib/catalogue";
import { getSearchIndex, type SearchIndex } from "../lib/search-index";

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
    inputId: string;
}

function subtitle(song: SearchSong): string {
    const bits: string[] = [];
    if (song.artist) bits.push(song.artist);
    else if (song.category) bits.push(song.category);
    if (song.from) bits.push(song.from);
    if (song.year) bits.push(String(song.year));
    return bits.join(" · ");
}

export default function SearchResults({ suggestions, inputId }: Props) {
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState<SearchIndex | null>(null);
    const [loadError, setLoadError] = useState(false);
    const deferred = useDeferredValue(query);

    useEffect(() => {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (!input) return;

        const onInput = () => setQuery(input.value);
        input.addEventListener("input", onInput);
        setQuery(input.value);

        let cancelled = false;
        getSearchIndex()
            .then((data) => {
                if (!cancelled) setIndex(data);
            })
            .catch(() => {
                if (!cancelled) setLoadError(true);
            });

        return () => {
            cancelled = true;
            input.removeEventListener("input", onInput);
        };
    }, [inputId]);

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
                                className="rounded-full border border-[#2A2724] bg-[#1A1917] px-3.5 py-2 text-[13.5px] font-semibold text-[#E4DDD1] no-underline hover:text-[#F2EDE4]"
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
                            className="flex w-full items-center gap-3 border-b border-line px-0.5 py-3.5 text-left text-cream no-underline hover:text-cream"
                        >
                            <span className="flex-1 text-base font-medium">{a.name}</span>
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
                                className="flex min-h-11 flex-1 flex-col justify-center text-left text-cream no-underline hover:text-cream"
                            >
                                <div className="text-[15.5px] leading-snug">{song.title}</div>
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
    );
}
