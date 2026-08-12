import { getArtists, getSongs, slugify, type Artist, type Song } from "./songs";

/** Swedish collation — å, ä, ö after z. */
export const collator = new Intl.Collator("sv");

export const TILE_COLORS = [
    "#7A4B3A",
    "#3F5A6B",
    "#5B4A72",
    "#6B6238",
    "#41684F",
    "#7A3F4F",
    "#3E4A6B",
    "#6B5230",
] as const;

export const LANGUAGE_LABELS: Record<string, string> = {
    eng: "English",
    swe: "Swedish",
    fin: "Finnish",
    spa: "Spanish",
    ita: "Italian",
    fra: "French",
    nor: "Norwegian",
    nob: "Norwegian",
    deu: "German",
    nld: "Dutch",
    jpn: "Japanese",
    kor: "Korean",
    mul: "Multiple",
    nap: "Neapolitan",
    pan: "Punjabi",
    zxx: "Instrumental",
};

export type FacetKey = "featured" | "decade" | "genre" | "occasion" | "film" | "lang";

export type CollectionKind = "decade" | "genre" | "category" | "from" | "lang";

export type SortKey = "az" | "artist" | "year";

export interface FacetTab {
    key: FacetKey;
    label: string;
    href: string;
}

export interface BrowseTile {
    label: string;
    href: string;
    tint: string;
    kind: CollectionKind;
    key: string;
    /** Shared with the collection header for morphing view transitions. */
    transitionName: string;
    titleTransitionName: string;
    /** Larger type for decade tiles. */
    large?: boolean;
}

export interface CollectionRef {
    kind: CollectionKind;
    key: string;
    label: string;
    tint: string;
    transitionName: string;
    titleTransitionName: string;
}

/** CSS view-transition-name friendly id (no slashes). */
export function collectionTransitionNames(kind: CollectionKind, key: string) {
    const id = `${kind}-${slugify(key)}`;
    return {
        transitionName: `coll-${id}`,
        titleTransitionName: `coll-title-${id}`,
    };
}

export const FACETS: FacetTab[] = [
    { key: "featured", label: "Featured", href: "/" },
    { key: "decade", label: "Decades", href: "/browse/decades" },
    { key: "genre", label: "Genres", href: "/browse/genres" },
    { key: "occasion", label: "Categories", href: "/browse/categories" },
    { key: "film", label: "Film & musical", href: "/browse/films" },
    { key: "lang", label: "Language", href: "/browse/languages" },
];

const FACET_PATH: Record<string, FacetKey> = {
    decades: "decade",
    genres: "genre",
    categories: "occasion",
    films: "film",
    languages: "lang",
};

export function facetFromParam(param: string | undefined): FacetKey | undefined {
    if (param === undefined) return undefined;
    return FACET_PATH[param];
}

export function collectionPath(kind: CollectionKind, key: string): string {
    return `/collections/${kind}/${encodeURIComponent(slugify(key))}`;
}

/** Stable tint so a browse tile and its collection header always match for morphing. */
export function tintFor(kind: CollectionKind, key: string): string {
    const seed = `${kind}:${key}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = Math.imul(hash, 31) + seed.charCodeAt(i);
    }
    return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length]!;
}

function uniqueSorted(values: Iterable<string>): string[] {
    return [...new Set(values)].sort(collator.compare);
}

function decadeLabel(decade: string): string {
    return `${decade.slice(2)}s`;
}

/** Curated home tiles that map onto real catalogue filters. */
export function featuredTiles(songs: Song[]): BrowseTile[] {
    const curated: { label: string; kind: CollectionKind; key: string }[] = [
        { label: "80s", kind: "decade", key: "1980" },
        { label: "Christmas", kind: "category", key: "Christmas" },
        { label: "90s", kind: "decade", key: "1990" },
        { label: "Rock", kind: "genre", key: "rock" },
        { label: "Swedish", kind: "lang", key: "swe" },
        { label: "Pop", kind: "genre", key: "pop" },
        { label: "70s", kind: "decade", key: "1970" },
        { label: "Grease", kind: "from", key: "Grease" },
        { label: "High School Musical", kind: "from", key: "High School Musical" },
        { label: "Birthday", kind: "category", key: "Birthday" },
    ];

    return curated
        .filter((tile) => songsInCollection(songs, tile.kind, tile.key).length > 0)
        .map((tile) => {
            const names = collectionTransitionNames(tile.kind, tile.key);
            return {
                label: tile.label,
                href: collectionPath(tile.kind, tile.key),
                tint: tintFor(tile.kind, tile.key),
                kind: tile.kind,
                key: tile.key,
                ...names,
            };
        });
}

export function browseTiles(facet: FacetKey, songs: Song[]): {
    mode: "tiles" | "list";
    tiles: BrowseTile[];
} {
    if (facet === "featured") {
        return { mode: "tiles", tiles: featuredTiles(songs) };
    }

    if (facet === "decade") {
        const decades = uniqueSorted(
            songs.filter((s) => s.year !== undefined).map((s) => String(Math.floor(s.year! / 10) * 10)),
        ).filter((d) => Number(d) >= 1960 && Number(d) <= 2010);
        return {
            mode: "tiles",
            tiles: decades.map((d) => ({
                label: decadeLabel(d),
                href: collectionPath("decade", d),
                tint: tintFor("decade", d),
                kind: "decade" as const,
                key: d,
                large: true,
                ...collectionTransitionNames("decade", d),
            })),
        };
    }

    if (facet === "genre") {
        const counts = new Map<string, number>();
        for (const song of songs) {
            for (const genre of song.genres ?? []) {
                counts.set(genre, (counts.get(genre) ?? 0) + 1);
            }
        }
        const genres = [...counts.entries()]
            .filter(([, n]) => n >= 20)
            .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
            .slice(0, 40)
            .map(([g]) => g)
            .sort(collator.compare);
        return {
            mode: "tiles",
            tiles: genres.map((g) => ({
                label: g,
                href: collectionPath("genre", g),
                tint: tintFor("genre", g),
                kind: "genre" as const,
                key: g,
                ...collectionTransitionNames("genre", g),
            })),
        };
    }

    if (facet === "occasion") {
        const cats = uniqueSorted(songs.map((s) => s.category).filter((c): c is string => Boolean(c)));
        return {
            mode: "tiles",
            tiles: cats.map((c) => ({
                label: c,
                href: collectionPath("category", c),
                tint: tintFor("category", c),
                kind: "category" as const,
                key: c,
                ...collectionTransitionNames("category", c),
            })),
        };
    }

    if (facet === "film") {
        const films = uniqueSorted(songs.map((s) => s.from).filter((f): f is string => Boolean(f)));
        return {
            mode: "list",
            tiles: films.map((f) => ({
                label: f,
                href: collectionPath("from", f),
                tint: tintFor("from", f),
                kind: "from" as const,
                key: f,
                ...collectionTransitionNames("from", f),
            })),
        };
    }

    const langs = uniqueSorted(songs.map((s) => s.language).filter((l): l is string => Boolean(l))).filter(
        (l) => LANGUAGE_LABELS[l] !== undefined,
    );
    return {
        mode: "list",
        tiles: langs.map((l) => ({
            label: LANGUAGE_LABELS[l] ?? l,
            href: collectionPath("lang", l),
            tint: tintFor("lang", l),
            kind: "lang" as const,
            key: l,
            ...collectionTransitionNames("lang", l),
        })),
    };
}

export function songsInCollection(songs: Song[], kind: CollectionKind, key: string): Song[] {
    return songs.filter((song) => songMatchesCollection(song, kind, key));
}

export function songMatchesCollection(song: Song, kind: CollectionKind, key: string): boolean {
    if (kind === "decade") {
        return song.year !== undefined && String(Math.floor(song.year / 10) * 10) === key;
    }
    if (kind === "genre") {
        return (song.genres ?? []).some((g) => g === key);
    }
    if (kind === "category") {
        return song.category === key;
    }
    if (kind === "from") {
        return song.from === key;
    }
    if (kind === "lang") {
        return song.language === key;
    }
    return false;
}

/** Resolve a collection slug back to the canonical key + label from the live catalogue. */
export function resolveCollection(
    kind: CollectionKind,
    slug: string,
    songs: Song[] = getSongs(),
): CollectionRef | undefined {
    const candidates = collectionCandidates(kind, songs);
    const match = candidates.find((c) => slugify(c.key) === slug);
    if (match === undefined) return undefined;
    return match;
}

function collectionCandidates(kind: CollectionKind, songs: Song[]): CollectionRef[] {
    if (kind === "decade") {
        return uniqueSorted(
            songs.filter((s) => s.year !== undefined).map((s) => String(Math.floor(s.year! / 10) * 10)),
        ).map((d) => ({
            kind,
            key: d,
            label: decadeLabel(d),
            tint: tintFor(kind, d),
            ...collectionTransitionNames(kind, d),
        }));
    }
    if (kind === "genre") {
        const genres = uniqueSorted(songs.flatMap((s) => s.genres ?? []));
        return genres.map((g) => ({
            kind,
            key: g,
            label: g,
            tint: tintFor(kind, g),
            ...collectionTransitionNames(kind, g),
        }));
    }
    if (kind === "category") {
        return uniqueSorted(songs.map((s) => s.category).filter((c): c is string => Boolean(c))).map(
            (c) => ({
                kind,
                key: c,
                label: c,
                tint: tintFor(kind, c),
                ...collectionTransitionNames(kind, c),
            }),
        );
    }
    if (kind === "from") {
        return uniqueSorted(songs.map((s) => s.from).filter((f): f is string => Boolean(f))).map((f) => ({
            kind,
            key: f,
            label: f,
            tint: tintFor(kind, f),
            ...collectionTransitionNames(kind, f),
        }));
    }
    return uniqueSorted(songs.map((s) => s.language).filter((l): l is string => Boolean(l))).map((l) => ({
        kind,
        key: l,
        label: LANGUAGE_LABELS[l] ?? l,
        tint: tintFor(kind, l),
        ...collectionTransitionNames(kind, l),
    }));
}

export function sortSongs(songs: Song[], sort: SortKey): Song[] {
    const copy = [...songs];
    if (sort === "az") {
        return copy.sort((a, b) => collator.compare(a.song, b.song) || a.id - b.id);
    }
    if (sort === "artist") {
        return copy.sort(
            (a, b) =>
                collator.compare(a.artist || a.category || "", b.artist || b.category || "") ||
                collator.compare(a.song, b.song),
        );
    }
    return copy.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || collator.compare(a.song, b.song));
}

export function parseSort(value: string | null | undefined): SortKey {
    if (value === "artist" || value === "year" || value === "az") return value;
    return "az";
}

export function songSubtitle(song: Song): string {
    const bits: string[] = [];
    if (song.artist) bits.push(song.artist);
    else if (song.category) bits.push(song.category);
    if (song.from) bits.push(song.from);
    if (song.year) bits.push(String(song.year));
    return bits.join(" · ");
}

export function songMeta(song: Song): string {
    return [song.from, song.year ? String(song.year) : null].filter(Boolean).join(" · ");
}

/** Primary artist link target for a song row. */
export function primaryArtistHref(song: Song): string | undefined {
    const first = song.artists?.[0];
    if (first !== undefined) return `/artists/${first.slug}`;
    return undefined;
}

export interface ArtistGroup {
    letter: string;
    artists: Artist[];
}

export function groupArtists(artists: Artist[] = getArtists()): ArtistGroup[] {
    const groups: ArtistGroup[] = [];
    for (const artist of artists) {
        const sort = artist.sortName ?? artist.name;
        const letter = sort.charAt(0).toUpperCase();
        const last = groups[groups.length - 1];
        if (last !== undefined && last.letter === letter) {
            last.artists.push(artist);
        } else {
            groups.push({ letter, artists: [artist] });
        }
    }
    return groups;
}

/** Compact search index row — kept tiny for the client search island. */
export interface SearchSong {
    id: number;
    title: string;
    artist: string;
    from?: string;
    category?: string;
    year?: number;
    genres?: string[];
    language?: string;
    artistSlug?: string;
}

export function buildSearchIndex(songs: Song[] = getSongs()): SearchSong[] {
    return songs.map((song) => ({
        id: song.id,
        title: song.song,
        artist: song.artist,
        ...(song.from === undefined ? {} : { from: song.from }),
        ...(song.category === undefined ? {} : { category: song.category }),
        ...(song.year === undefined ? {} : { year: song.year }),
        ...(song.genres === undefined || song.genres.length === 0 ? {} : { genres: song.genres }),
        ...(song.language === undefined ? {} : { language: song.language }),
        ...(song.artists?.[0] === undefined ? {} : { artistSlug: song.artists[0].slug }),
    }));
}

export function matchesQuery(song: SearchSong, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    return [song.title, song.artist, song.from, song.category, ...(song.genres ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
}

export function collectionKinds(): CollectionKind[] {
    return ["decade", "genre", "category", "from", "lang"];
}
