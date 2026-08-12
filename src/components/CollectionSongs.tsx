"use client";

import { useMemo, useState } from "react";
import FavoriteButton from "./FavoriteButton";
import type { SortKey } from "../lib/catalogue";

export interface CollectionSong {
    id: number;
    title: string;
    artist: string;
    subtitle: string;
    href?: string;
    year?: number;
    category?: string;
}

interface Props {
    songs: CollectionSong[];
    tint: string;
}

const TABS: { key: SortKey; label: string }[] = [
    { key: "az", label: "A–Z" },
    { key: "artist", label: "By artist" },
    { key: "year", label: "By year" },
];

const collator = new Intl.Collator("sv");

function sortSongs(songs: CollectionSong[], sort: SortKey): CollectionSong[] {
    const copy = [...songs];
    if (sort === "az") {
        return copy.sort((a, b) => collator.compare(a.title, b.title) || a.id - b.id);
    }
    if (sort === "artist") {
        return copy.sort(
            (a, b) =>
                collator.compare(a.artist || a.category || "", b.artist || b.category || "") ||
                collator.compare(a.title, b.title),
        );
    }
    return copy.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || collator.compare(a.title, b.title));
}

export default function CollectionSongs({ songs, tint }: Props) {
    const [sort, setSort] = useState<SortKey>("az");
    const rows = useMemo(() => sortSongs(songs, sort), [songs, sort]);

    return (
        <>
            <div className="px-[18px] pb-4" style={{ background: tint, borderBottom: "1px solid rgba(0,0,0,0.25)" }}>
                <div className="hd mt-3.5 flex gap-1.5 overflow-x-auto">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setSort(tab.key)}
                            className={
                                "shrink-0 rounded-full border border-white/18 px-3.5 py-1.5 text-[13px] font-semibold " +
                                (sort === tab.key
                                    ? "bg-white/92 text-[#17150F]"
                                    : "bg-black/22 text-white/85")
                            }
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="hd flex-1 overflow-y-auto bg-surface px-[18px] pt-1.5 pb-6">
                {rows.map((song) => (
                    <div key={song.id} className="flex items-center gap-2.5 border-b border-line py-3">
                        {song.href ? (
                            <a
                                href={song.href}
                                className="flex min-h-11 flex-1 flex-col justify-center text-left no-underline"
                            >
                                <div className="text-[15.5px] leading-snug text-cream">{song.title}</div>
                                <div className="mt-0.5 text-[13px] text-muted">{song.subtitle}</div>
                            </a>
                        ) : (
                            <div className="flex min-h-11 flex-1 flex-col justify-center">
                                <div className="text-[15.5px] leading-snug text-cream">{song.title}</div>
                                <div className="mt-0.5 text-[13px] text-muted">{song.subtitle}</div>
                            </div>
                        )}
                        <FavoriteButton songId={song.id} />
                    </div>
                ))}
            </div>
        </>
    );
}
