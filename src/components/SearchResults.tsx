import { useDeferredValue, useEffect, useMemo, useState } from "react";
import FavoriteButton from "./FavoriteButton";
import { matchesQuery, type SearchSong } from "../lib/catalog";
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

function SongSubtitle({ song }: { song: SearchSong }) {
    const meta = [song.from, song.year ? String(song.year) : null].filter(Boolean);
    if (song.artists && song.artists.length > 0) {
        return (
            <>
                {song.artists.map((artist, index) => (
                    <span key={artist.slug}>
                        {index > 0 && ", "}
                        <a
                            href={`/artists/${artist.slug}`}
                            className="song-artist-link"
                            data-vt-artist={artist.slug}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {artist.name}
                        </a>
                    </span>
                ))}
                {meta.length > 0 && <span> · {meta.join(" · ")}</span>}
            </>
        );
    }
    const bits = [(song.categories ?? []).join(", ") || null, ...meta].filter(Boolean);
    return bits.length > 0 ? <>{bits.join(" · ")}</> : null;
}

function SongNumbers({ ids }: { ids: number[] }) {
    const label = ids.length === 1 ? `Number ${ids[0]}` : `Numbers ${ids.join(", ")}`;
    return (
        <span
            className="flex w-11 shrink-0 flex-col items-end gap-0.5 self-start pt-1 font-mono text-[12px] leading-none text-gold tabular-nums"
            aria-label={label}
        >
            {ids.map((id) => (
                <span key={id} aria-hidden="true">
                    {id}
                </span>
            ))}
        </span>
    );
}

export default function SearchResults({ suggestions, inputId }: Props) {
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState<SearchIndex | null>(null);
    const [loadError, setLoadError] = useState(false);
    const deferred = useDeferredValue(query);

    useEffect(() => {
        const input = document.getElementById(inputId) as HTMLInputElement | null;
        if (!input) return;

        const params = new URLSearchParams(location.search);
        const fromUrl = params.get("q") ?? "";
        if (fromUrl && input.value === "") {
            input.value = fromUrl;
        }

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

    useEffect(() => {
        if (!location.pathname.startsWith("/search")) return;
        const url = new URL(location.href);
        const trimmed = query.trim();
        if (trimmed) url.searchParams.set("q", trimmed);
        else url.searchParams.delete("q");
        if (url.href !== location.href) {
            history.replaceState(history.state, "", url);
        }
    }, [query]);

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
    const status = loadError
        ? "Couldn’t load the catalog."
        : !index && !idle
          ? "Searching"
          : empty
            ? "No matches"
            : q
              ? "Matches"
              : "";

    return (
        <div className="px-[18px] pt-2 pb-6">
            <div className="sr-only" aria-live="polite" aria-atomic="true">
                {status}
            </div>
            {loadError && <div className="px-5 py-16 text-center text-sm text-muted">Couldn’t load the catalog.</div>}

            {!loadError && !index && !idle && (
                <div className="px-5 py-16 text-center text-sm text-muted">Searching…</div>
            )}

            {idle && (
                <div>
                    <div className="py-2.5 font-mono text-[10.5px] tracking-[0.14em] text-faint uppercase">Jump to</div>
                    <div className="flex flex-wrap gap-1.5">
                        {suggestions.map((s) => (
                            <a
                                key={s.href + s.label}
                                href={s.href}
                                className="rounded-full border border-line-strong bg-panel px-3.5 py-2 text-[13.5px] font-semibold text-cream-soft no-underline hover:text-cream"
                                data-astro-prefetch="false"
                                {...(s.href === "/artists" ? { "data-astro-reload": true } : {})}
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
                            <span className="flex-1 text-base font-medium" data-vt-artist={a.slug}>
                                {a.name}
                            </span>
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
                        <div key={song.id} className="flex items-start gap-2.5 border-b border-line py-3">
                            <SongNumbers ids={song.ids} />
                            <div className="flex min-h-11 flex-1 flex-col justify-center text-left">
                                <div className="text-[15.5px] leading-snug text-cream">{song.title}</div>
                                <div className="mt-0.5 text-[13px] text-muted">
                                    <SongSubtitle song={song} />
                                </div>
                            </div>
                            <FavoriteButton songIds={song.ids} />
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
