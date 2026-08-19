import { useEffect, useMemo, useState } from "react";
import { useFavorites } from "./FavoriteButton";
import SongResultRow, { SongTableHead } from "./SongResultRow";
import type { SearchSong } from "../lib/catalog";
import { getSearchIndex } from "../lib/search-index";

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
        return <div className="py-8 text-sm text-muted">Loading…</div>;
    }

    if (favorites.length === 0 || rows.length === 0) {
        return (
            <div className="py-20 text-center">
                <div className="text-lg font-semibold text-cream">Nothing saved yet</div>
                <p className="mt-2.5 mb-4 text-sm text-pretty text-muted">
                    Tap the heart on a song and it stays here on your phone.
                </p>
                <a
                    href="/"
                    className="inline-block rounded-[10px] bg-gold-fill px-[18px] py-3 text-[14.5px] font-semibold text-on-gold no-underline hover:text-on-gold"
                >
                    Start browsing
                </a>
            </div>
        );
    }

    return (
        <div>
            <SongTableHead />
            {rows.map((song) => (
                <SongResultRow key={song.id} song={song} />
            ))}
        </div>
    );
}
