import { categoriesForSong, categoriesLabel, songBelongsToCategory } from "./categories";
import { getArtists, getSongs, slugify, type Artist, type Song } from "./songs";

export { categoriesForSong, categoriesLabel, songBelongsToCategory } from "./categories";

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
    /** Optional cover art; tile and collection bar share it so the morph matches. */
    art?: string;
    /** Label color on art tiles; cream unless the card wants something else. */
    ink?: string;
    /** CSS fallback under the art — top of the image, which iOS samples for the status bar. */
    theme?: string;
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
    art?: string;
    ink?: string;
    /** CSS fallback under the art — top of the image, which iOS samples for the status bar. */
    theme?: string;
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

/** Cover art under `public/collections/`. `theme` is the color at the top of the
 *  image (CSS fallback; iOS samples this for the status bar). Missing keys keep
 *  the hashed tint. */
const COLLECTION_ART: Record<string, { src: string; ink?: string; theme?: string }> = {
    "category:Birthday": { src: "/collections/birthday.webp", ink: "#F7F2E9", theme: "#120b0b" },
    "category:Melodifestivalen": { src: "/collections/melodifestivalen.webp", ink: "#F6D4C8", theme: "#190c0d" },
};

export const DEFAULT_THEME_COLOR = "#0a0a09";

export function artFor(kind: CollectionKind, key: string): string | undefined {
    return COLLECTION_ART[`${kind}:${key}`]?.src;
}

function collectionLook(kind: CollectionKind, key: string) {
    const entry = COLLECTION_ART[`${kind}:${key}`];
    const tint = tintFor(kind, key);
    return {
        tint,
        theme: entry?.theme ?? (entry === undefined ? tint : DEFAULT_THEME_COLOR),
        ...(entry === undefined ? {} : { art: entry.src, ink: entry.ink ?? "#F7F2E9" }),
        ...collectionTransitionNames(kind, key),
    };
}

/** Inline style for a tile or collection bar — solid color, or art with a text scrim.
 *  `color` is the CSS background-color iOS samples for the status bar.
 */
export function collectionSurfaceStyle(color: string, art?: string, position = "center top"): string {
    if (art === undefined) return `background:${color}`;
    // Transparent at the top so the status bar can match the art, not a black wash.
    const scrim = "linear-gradient(to top, rgba(10,10,9,0.72) 0%, rgba(10,10,9,0.22) 55%, transparent 100%)";
    return [
        `background-color:${color}`,
        `background-image:${scrim}, url("${art}")`,
        "background-size:cover",
        `background-position:${position}`,
    ].join(";");
}

function uniqueSorted(values: Iterable<string>): string[] {
    return [...new Set(values)].sort(collator.compare);
}

function decadeLabel(decade: string): string {
    return `${decade.slice(2)}s`;
}

/** Display label for a collection — must match tile text for view-transition morphs. */
export function collectionLabel(kind: CollectionKind, key: string): string {
    if (kind === "decade") return decadeLabel(key);
    if (kind === "lang") return LANGUAGE_LABELS[key] ?? key;
    if (kind === "genre") return titleCaseGenre(key);
    return key;
}

function titleCaseGenre(genre: string): string {
    const special: Record<string, string> = {
        "r&b": "R&B",
        "hip hop": "Hip hop",
        "drum and bass": "Drum and bass",
        "a cappella": "A cappella",
    };
    const lower = genre.toLowerCase();
    if (special[lower]) return special[lower]!;
    return lower.replace(/\b([a-z])/g, (ch) => ch.toUpperCase());
}

/** Curated home tiles that map onto real catalogue filters. */
export function featuredTiles(songs: Song[]): BrowseTile[] {
    // Keep this short (≈4 rows on a phone). Prefer evergreen karaoke entry points:
    // decades people actually sing, Swedish repertoire, Melodifestivalen, big genres,
    // and one fun theme. Seasonal niches (Christmas, Birthday) live under Categories.
    const curated: { kind: CollectionKind; key: string }[] = [
        { kind: "decade", key: "1980" },
        { kind: "decade", key: "1990" },
        { kind: "decade", key: "2000" },
        { kind: "lang", key: "swe" },
        { kind: "category", key: "Melodifestivalen" },
        { kind: "genre", key: "pop" },
        { kind: "genre", key: "rock" },
        { kind: "category", key: "Disney" },
    ];

    return curated
        .filter((tile) => songsInCollection(songs, tile.kind, tile.key).length > 0)
        .map((tile) => ({
            label: collectionLabel(tile.kind, tile.key),
            href: collectionPath(tile.kind, tile.key),
            kind: tile.kind,
            key: tile.key,
            ...collectionLook(tile.kind, tile.key),
        }));
}

export function browseTiles(
    facet: FacetKey,
    songs: Song[],
): {
    mode: "tiles" | "list";
    tiles: BrowseTile[];
} {
    if (facet === "featured") {
        return { mode: "tiles", tiles: featuredTiles(songs) };
    }

    if (facet === "decade") {
        const counts = new Map<string, number>();
        for (const song of songs) {
            if (song.year === undefined) continue;
            const decade = String(Math.floor(song.year / 10) * 10);
            counts.set(decade, (counts.get(decade) ?? 0) + 1);
        }
        // Drop sparse early decades (e.g. a handful of 1940s) but keep 50s / 20s
        // when the catalogue actually has a usable set.
        const decades = uniqueSorted(counts.keys()).filter((d) => (counts.get(d) ?? 0) >= 20);
        return {
            mode: "tiles",
            tiles: decades.map((d) => ({
                label: collectionLabel("decade", d),
                href: collectionPath("decade", d),
                kind: "decade" as const,
                key: d,
                large: true,
                ...collectionLook("decade", d),
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
                label: collectionLabel("genre", g),
                href: collectionPath("genre", g),
                kind: "genre" as const,
                key: g,
                ...collectionLook("genre", g),
            })),
        };
    }

    if (facet === "occasion") {
        const cats = uniqueSorted(songs.flatMap((s) => categoriesForSong(s)));
        return {
            mode: "tiles",
            tiles: cats.map((c) => ({
                label: collectionLabel("category", c),
                href: collectionPath("category", c),
                kind: "category" as const,
                key: c,
                ...collectionLook("category", c),
            })),
        };
    }

    if (facet === "film") {
        const films = uniqueSorted(songs.map((s) => s.from).filter((f): f is string => Boolean(f)));
        return {
            mode: "list",
            tiles: films.map((f) => ({
                label: collectionLabel("from", f),
                href: collectionPath("from", f),
                kind: "from" as const,
                key: f,
                ...collectionLook("from", f),
            })),
        };
    }

    const langs = uniqueSorted(songs.map((s) => s.language).filter((l): l is string => Boolean(l))).filter(
        (l) => LANGUAGE_LABELS[l] !== undefined,
    );
    return {
        mode: "list",
        tiles: langs.map((l) => ({
            label: collectionLabel("lang", l),
            href: collectionPath("lang", l),
            kind: "lang" as const,
            key: l,
            ...collectionLook("lang", l),
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
        return songBelongsToCategory(song, key);
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
            label: collectionLabel(kind, d),
            ...collectionLook(kind, d),
        }));
    }
    if (kind === "genre") {
        const genres = uniqueSorted(songs.flatMap((s) => s.genres ?? []));
        return genres.map((g) => ({
            kind,
            key: g,
            label: collectionLabel(kind, g),
            ...collectionLook(kind, g),
        }));
    }
    if (kind === "category") {
        return uniqueSorted(songs.flatMap((s) => categoriesForSong(s))).map((c) => ({
            kind,
            key: c,
            label: collectionLabel(kind, c),
            ...collectionLook(kind, c),
        }));
    }
    if (kind === "from") {
        return uniqueSorted(songs.map((s) => s.from).filter((f): f is string => Boolean(f))).map((f) => ({
            kind,
            key: f,
            label: collectionLabel(kind, f),
            ...collectionLook(kind, f),
        }));
    }
    return uniqueSorted(songs.map((s) => s.language).filter((l): l is string => Boolean(l))).map((l) => ({
        kind,
        key: l,
        label: collectionLabel(kind, l),
        ...collectionLook(kind, l),
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
                collator.compare(a.artist || categoriesLabel(a), b.artist || categoriesLabel(b)) ||
                collator.compare(a.song, b.song) ||
                a.id - b.id,
        );
    }
    return copy.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || collator.compare(a.song, b.song) || a.id - b.id);
}

/**
 * Same artist+title under different punch-in numbers → one row with `ids`.
 * Representative metadata prefers the richest enriched copy.
 */
export interface SongVariant extends Song {
    /** All punch-in numbers for this title, ascending. */
    ids: number[];
}

function variantKey(song: Song): string {
    return `${(song.artist || categoriesLabel(song)).toLowerCase()}\0${song.song.toLowerCase()}`;
}

function enrichmentScore(song: Song): number {
    let score = 0;
    if (song.year !== undefined) score += 2;
    if (song.from) score += 2;
    if (song.artists && song.artists.length > 0) score += 2;
    if (song.genres && song.genres.length > 0) score += 1;
    if (song.language) score += 1;
    if (song.categories && song.categories.length > 0) score += 1;
    return score;
}

export function mergeSongVariants(songs: Song[]): SongVariant[] {
    const groups = new Map<string, Song[]>();
    for (const song of songs) {
        const key = variantKey(song);
        const list = groups.get(key);
        if (list) list.push(song);
        else groups.set(key, [song]);
    }

    const merged: SongVariant[] = [];
    for (const group of groups.values()) {
        const ids = [...new Set(group.map((s) => s.id))].sort((a, b) => a - b);
        const primary = group.slice().sort((a, b) => enrichmentScore(b) - enrichmentScore(a) || a.id - b.id)[0]!;
        merged.push({ ...primary, id: ids[0]!, ids });
    }
    return merged;
}

export function sortSongVariants(songs: SongVariant[], sort: SortKey): SongVariant[] {
    const copy = [...songs];
    if (sort === "az") {
        return copy.sort((a, b) => collator.compare(a.song, b.song) || a.ids[0]! - b.ids[0]!);
    }
    if (sort === "artist") {
        return copy.sort(
            (a, b) =>
                collator.compare(a.artist || categoriesLabel(a), b.artist || categoriesLabel(b)) ||
                collator.compare(a.song, b.song) ||
                a.ids[0]! - b.ids[0]!,
        );
    }
    return copy.sort(
        (a, b) => (a.year ?? 9999) - (b.year ?? 9999) || collator.compare(a.song, b.song) || a.ids[0]! - b.ids[0]!,
    );
}

export function parseSort(value: string | null | undefined): SortKey {
    if (value === "artist" || value === "year" || value === "az") return value;
    return "az";
}

export function songSubtitle(song: Song): string {
    const bits: string[] = [];
    if (song.artist) bits.push(song.artist);
    else {
        const cats = categoriesLabel(song);
        if (cats) bits.push(cats);
    }
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
        const letter = letterForName(artist.name);
        const last = groups[groups.length - 1];
        if (last !== undefined && last.letter === letter) {
            last.artists.push(artist);
        } else {
            groups.push({ letter, artists: [artist] });
        }
    }
    return groups;
}

/** A–Z bucket from the display name’s first letter; non-letters go under #. */
function letterForName(name: string): string {
    const ch = name.trim().charAt(0).toUpperCase();
    return ch >= "A" && ch <= "Z" ? ch : "#";
}

/** Compact search index row — kept tiny for the client search island. */
export interface SearchSong {
    id: number;
    /** Punch-in numbers (one song can have several). */
    ids: number[];
    title: string;
    artist: string;
    from?: string;
    /** Explicit + derived umbrella categories (Disney, James Bond, Musical, …). */
    categories?: string[];
    year?: number;
    genres?: string[];
    language?: string;
    /** Credited artists with slugs — each name can link separately. */
    artists?: { name: string; slug: string }[];
}

export function buildSearchIndex(songs: Song[] = getSongs()): SearchSong[] {
    return mergeSongVariants(songs).map((song) => {
        const categories = categoriesForSong(song);
        return {
            id: song.id,
            ids: song.ids,
            title: song.song,
            artist: song.artist,
            ...(song.from === undefined ? {} : { from: song.from }),
            ...(categories.length > 0 ? { categories } : {}),
            ...(song.year === undefined ? {} : { year: song.year }),
            ...(song.genres === undefined || song.genres.length === 0 ? {} : { genres: song.genres }),
            ...(song.language === undefined ? {} : { language: song.language }),
            ...(song.artists === undefined || song.artists.length === 0
                ? {}
                : {
                      artists: song.artists.map((a) => ({ name: a.name, slug: a.slug })),
                  }),
        };
    });
}

export function matchesQuery(song: SearchSong, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return false;
    if (/^\d+$/.test(q) && song.ids.some((id) => String(id).startsWith(q))) {
        return true;
    }
    return [song.title, song.artist, song.from, ...(song.categories ?? []), ...(song.genres ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
}

export function collectionKinds(): CollectionKind[] {
    return ["decade", "genre", "category", "from", "lang"];
}
