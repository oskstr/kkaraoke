"use client";

import { useMemo } from "react";
import FavoriteButton, { useFavorites } from "./FavoriteButton";
import type { SearchSong } from "../lib/catalogue";

interface Props {
    songs: SearchSong[];
}

function subtitle(song: SearchSong): string {
    const bits: string[] = [];
    if (song.artist) bits.push(song.artist);
    else if (song.category) bits.push(song.category);
    if (song.from) bits.push(song.from);
    if (song.year) bits.push(String(song.year));
    return bits.join(" · ");
}

export default function FavoritesApp({ songs }: Props) {
    const { favorites, ready } = useFavorites();
    const byId = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

    const rows = useMemo(() => {
        return favorites.map((id) => byId.get(id)).filter((s): s is SearchSong => s !== undefined);
    }, [favorites, byId]);

    if (!ready) {
        return <div className="px-[18px] py-8 text-sm text-muted">Loading…</div>;
    }

    if (rows.length === 0) {
        return (
            <div className="px-5 py-20 text-center">
                <div className="text-lg font-semibold text-cream">Nothing saved yet</div>
                <p className="mt-2.5 mb-4 text-sm text-pretty text-muted">
                    Tap the heart on a song and it stays here on your phone.
                </p>
                <a
                    href="/"
                    className="inline-block rounded-[10px] bg-gold px-[18px] py-3 text-[14.5px] font-semibold text-[#14120F] no-underline"
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
                    <a
                        href={song.artistSlug ? `/artists/${song.artistSlug}` : "/"}
                        className="flex min-h-11 flex-1 flex-col justify-center text-left no-underline"
                    >
                        <div className="text-[15.5px] leading-snug text-cream">{song.title}</div>
                        <div className="mt-0.5 text-[13px] text-muted">{subtitle(song)}</div>
                    </a>
                    <FavoriteButton songId={song.id} />
                </div>
            ))}
        </div>
    );
}
