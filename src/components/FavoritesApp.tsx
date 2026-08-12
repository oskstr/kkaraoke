"use client";

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
                            className="text-muted no-underline hover:text-cream-soft"
                        >
                            {artist.name}
                        </a>
                    </span>
                ))}
                {meta.length > 0 && <span> · {meta.join(" · ")}</span>}
            </>
        );
    }
    const bits = [song.category, ...meta].filter(Boolean);
    return bits.length > 0 ? <>{bits.join(" · ")}</> : null;
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

    const byId = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs]);

    const rows = useMemo(() => {
        return favorites.map((id) => byId.get(id)).filter((s): s is SearchSong => s !== undefined);
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
                <div key={song.id} className="flex items-center gap-2.5 border-b border-line py-3">
                    <div className="flex min-h-11 flex-1 flex-col justify-center text-left">
                        <div className="text-[15.5px] leading-snug text-cream">{song.title}</div>
                        <div className="mt-0.5 text-[13px] text-muted">
                            <SongSubtitle song={song} />
                        </div>
                    </div>
                    <FavoriteButton songId={song.id} />
                </div>
            ))}
        </div>
    );
}
