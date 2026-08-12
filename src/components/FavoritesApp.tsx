import { useEffect, useMemo, useState } from "react";
import FavoriteButton, { useFavorites } from "./FavoriteButton";
import type { SearchSong } from "../lib/catalogue";
import { getSearchIndex } from "../lib/search-index";

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

export default function FavoritesApp() {
    const { favorites, ready } = useFavorites();
    const [songs, setSongs] = useState<SearchSong[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        getSearchIndex()
            .then((data) => {
                if (!cancelled) setSongs(data.songs);
            })
            .catch(() => {
                if (!cancelled) setSongs([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const byId = useMemo(() => {
        const map = new Map<number, SearchSong>();
        for (const song of songs ?? []) {
            for (const id of song.ids) map.set(id, song);
        }
        return map;
    }, [songs]);

    const rows = useMemo(() => {
        const seen = new Set<number>();
        const out: SearchSong[] = [];
        for (const id of favorites) {
            const song = byId.get(id);
            if (!song || seen.has(song.id)) continue;
            seen.add(song.id);
            out.push(song);
        }
        return out;
    }, [favorites, byId]);

    if (!ready || songs === null) {
        return <div className="px-[18px] py-8 text-sm text-muted">Loading…</div>;
    }

    if (favorites.length === 0 || rows.length === 0) {
        return (
            <div className="px-5 py-20 text-center">
                <div className="text-lg font-semibold text-cream">Nothing saved yet</div>
                <p className="mt-2.5 mb-4 text-sm text-pretty text-muted">
                    Tap the heart on a song and it stays here on your phone.
                </p>
                <a
                    href="/"
                    className="inline-block rounded-[10px] bg-gold px-[18px] py-3 text-[14.5px] font-semibold text-[#14120F] no-underline hover:text-[#14120F]"
                >
                    Start browsing
                </a>
            </div>
        );
    }

    return (
        <div>
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
    );
}
