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
    /** Daytime still life used when `prefers-color-scheme: light`. */
    lightArt?: string;
    lightInk?: string;
    lightTheme?: string;
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
    lightArt?: string;
    lightInk?: string;
    lightTheme?: string;
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
type CollectionArt = { src: string; ink?: string; theme?: string; light?: { src: string; ink?: string; theme?: string } };
const COLLECTION_ART: Record<string, CollectionArt> = {
    "category:Birthday": { src: "/collections/birthday.webp", ink: "#F7F2E9", theme: "#120b0b", light: { src: "/collections/light/birthday.webp", ink: "#6b4420", theme: "#dbd4c9" } },
    "category:Children's song": { src: "/collections/children.webp", ink: "#F4E2B9", theme: "#0f0c0a", light: { src: "/collections/light/children.webp", ink: "#1e4a68", theme: "#67847b" } },
    "category:Christmas": { src: "/collections/christmas.webp", ink: "#F2E9D4", theme: "#181f1d", light: { src: "/collections/light/christmas.webp", ink: "#1f4a32", theme: "#c7cdd0" } },
    "category:Disney": { src: "/collections/disney.webp", ink: "#F5E5C0", theme: "#070b15", light: { src: "/collections/light/disney.webp", ink: "#6a4814", theme: "#a19174" } },
    "category:Eurovision": { src: "/collections/eurovision.webp", ink: "#E4E8F8", theme: "#060938", light: { src: "/collections/light/eurovision.webp", ink: "#334a58", theme: "#9a8f80" } },
    "category:Hymn": { src: "/collections/hymn.webp", ink: "#F7F2E9", theme: "#161315", light: { src: "/collections/light/hymn.webp", ink: "#6b3a14", theme: "#d0ad85" } },
    "category:Irish traditional": { src: "/collections/irish-traditional.webp", ink: "#E8D5C4", theme: "#091008", light: { src: "/collections/light/irish-traditional.webp", ink: "#3a4a14", theme: "#afb5b6" } },
    "category:James Bond": { src: "/collections/james-bond.webp", ink: "#F2EFE9", theme: "#161413", light: { src: "/collections/light/james-bond.webp", ink: "#1e5560", theme: "#a0bdc7" } },
    "category:Melodifestivalen": { src: "/collections/melodifestivalen.webp", ink: "#F6D4C8", theme: "#190c0d", light: { src: "/collections/light/melodifestivalen.webp", ink: "#6b1a4a", theme: "#b6b1ad" } },
    "category:Midsummer": { src: "/collections/midsummer.webp", ink: "#F9EFE5", theme: "#252628", light: { src: "/collections/light/midsummer.webp", ink: "#1a4d63", theme: "#6796b6" } },
    "category:Musical": { src: "/collections/musical.webp", ink: "#F9E8D2", theme: "#080504", light: { src: "/collections/light/musical.webp", ink: "#8a1524", theme: "#2d090b" } },
    "decade:1950": { src: "/collections/50s.webp", ink: "#FDEBD0", theme: "#251308", light: { src: "/collections/light/50s.webp", ink: "#8a3a18", theme: "#eceae1" } },
    "decade:1960": { src: "/collections/60s.webp", ink: "#F7D8D0", theme: "#260c0b", light: { src: "/collections/light/60s.webp", ink: "#8a4010", theme: "#af8967" } },
    "decade:1970": { src: "/collections/70s.webp", ink: "#F9F5E6", theme: "#1e1a12", light: { src: "/collections/light/70s.webp", ink: "#7a3510", theme: "#a57d43" } },
    "decade:1980": { src: "/collections/80s.webp", ink: "#FCE4EC", theme: "#130717", light: { src: "/collections/light/80s.webp", ink: "#5a4028", theme: "#cbc3b1" } },
    "decade:1990": { src: "/collections/90s.webp", ink: "#F2EBE1", theme: "#1c130d", light: { src: "/collections/light/90s.webp", ink: "#1e3a55", theme: "#cec6b4" } },
    "decade:2000": { src: "/collections/00s.webp", ink: "#E2E8F0", theme: "#0f1d2a", light: { src: "/collections/light/00s.webp", ink: "#2c3d4c", theme: "#eff2f6" } },
    "decade:2010": { src: "/collections/10s.webp", ink: "#F0F2F5", theme: "#0d141b", light: { src: "/collections/light/10s.webp", ink: "#13485c", theme: "#e3e8eb" } },
    "decade:2020": { src: "/collections/20s.webp", ink: "#EDE8FF", theme: "#161223", light: { src: "/collections/light/20s.webp", ink: "#4a4030", theme: "#d7d5d1" } },
    "genre:alternative rock": { src: "/collections/alternative-rock.webp", ink: "#E5DBD0", theme: "#020409", light: { src: "/collections/light/alternative-rock.webp", ink: "#5c4a24", theme: "#7f6f56" } },
    "genre:art rock": { src: "/collections/art-rock.webp", ink: "#DADDDA", theme: "#04070f", light: { src: "/collections/light/art-rock.webp", ink: "#6b4a28", theme: "#c3b7a9" } },
    "genre:blues": { src: "/collections/blues.webp", ink: "#ECD9C7", theme: "#020201", light: { src: "/collections/light/blues.webp", ink: "#6b3a10", theme: "#a0937d" } },
    "genre:blues rock": { src: "/collections/blues-rock.webp", ink: "#EDD9C5", theme: "#0f0e0d", light: { src: "/collections/light/blues-rock.webp", ink: "#6b3510", theme: "#85745f" } },
    "genre:britpop": { src: "/collections/britpop.webp", ink: "#E6DBC7", theme: "#050402", light: { src: "/collections/light/britpop.webp", ink: "#6a3414", theme: "#abbabd" } },
    "genre:contemporary r&b": { src: "/collections/contemporary-r-and-b.webp", ink: "#E5DBCE", theme: "#080806", light: { src: "/collections/light/contemporary-r-and-b.webp", ink: "#6b4a18", theme: "#c0d9e8" } },
    "genre:country": { src: "/collections/country.webp", ink: "#E0DCD4", theme: "#070a0f", light: { src: "/collections/light/country.webp", ink: "#5a4520", theme: "#d1ddea" } },
    "genre:country pop": { src: "/collections/country-pop.webp", ink: "#E8DACB", theme: "#050403", light: { src: "/collections/light/country-pop.webp", ink: "#2a4a5c", theme: "#e6dfd1" } },
    "genre:country rock": { src: "/collections/country-rock.webp", ink: "#EDD9C4", theme: "#030201", light: { src: "/collections/light/country-rock.webp", ink: "#3d4a18", theme: "#bdb8b0" } },
    "genre:dance": { src: "/collections/dance.webp", ink: "#DFDCD5", theme: "#020305", light: { src: "/collections/light/dance.webp", ink: "#4a4a12", theme: "#989272" } },
    "genre:dance-pop": { src: "/collections/dance-pop.webp", ink: "#D8DBEE", theme: "#010102", light: { src: "/collections/light/dance-pop.webp", ink: "#7a3a20", theme: "#d5bea0" } },
    "genre:disco": { src: "/collections/disco.webp", ink: "#E9DAC8", theme: "#030303", light: { src: "/collections/light/disco.webp", ink: "#7a4a14", theme: "#d1be9e" } },
    "genre:electronic": { src: "/collections/electronic.webp", ink: "#E3DBD1", theme: "#08080a", light: { src: "/collections/light/electronic.webp", ink: "#5c3a20", theme: "#d2cbbf" } },
    "genre:electropop": { src: "/collections/electropop.webp", ink: "#CCDEF2", theme: "#010102", light: { src: "/collections/light/electropop.webp", ink: "#2a5560", theme: "#cccbca" } },
    "genre:europop": { src: "/collections/europop.webp", ink: "#D8DDDE", theme: "#20262c", light: { src: "/collections/light/europop.webp", ink: "#6b5420", theme: "#efefef" } },
    "genre:folk": { src: "/collections/folk.webp", ink: "#F8D7BB", theme: "#030302", light: { src: "/collections/light/folk.webp", ink: "#4a4a18", theme: "#dee4e6" } },
    "genre:folk rock": { src: "/collections/folk-rock.webp", ink: "#EBDAC8", theme: "#0c0908", light: { src: "/collections/light/folk-rock.webp", ink: "#7a4010", theme: "#b9a486" } },
    "genre:funk": { src: "/collections/funk.webp", ink: "#FFD5B2", theme: "#060301", light: { src: "/collections/light/funk.webp", ink: "#7a4a10", theme: "#ac9277" } },
    "genre:glam metal": { src: "/collections/glam-metal.webp", ink: "#F1D6D8", theme: "#050002", light: { src: "/collections/light/glam-metal.webp", ink: "#6a2828", theme: "#b6b1ae" } },
    "genre:glam rock": { src: "/collections/glam-rock.webp", ink: "#DDDBE1", theme: "#020103", light: { src: "/collections/light/glam-rock.webp", ink: "#6b1818", theme: "#d8c7b3" } },
    "genre:hard rock": { src: "/collections/hard-rock.webp", ink: "#FAD6C3", theme: "#0a090a", light: { src: "/collections/light/hard-rock.webp", ink: "#7a3a10", theme: "#9a948e" } },
    "genre:heavy metal": { src: "/collections/heavy-metal.webp", ink: "#DDDCD8", theme: "#030405", light: { src: "/collections/light/heavy-metal.webp", ink: "#2a3a50", theme: "#dee7f2" } },
    "genre:hip hop": { src: "/collections/hip-hop.webp", ink: "#F4D8B8", theme: "#010103", light: { src: "/collections/light/hip-hop.webp", ink: "#6b3010", theme: "#f3e3c8" } },
    "genre:indie rock": { src: "/collections/indie-rock.webp", ink: "#E6DBCC", theme: "#010306", light: { src: "/collections/light/indie-rock.webp", ink: "#6b4a22", theme: "#7d7162" } },
    "genre:jazz": { src: "/collections/jazz.webp", ink: "#E6DBCC", theme: "#141415", light: { src: "/collections/light/jazz.webp", ink: "#6b4a14", theme: "#cec5b9" } },
    "genre:new wave": { src: "/collections/new-wave.webp", ink: "#F0D7D4", theme: "#040306", light: { src: "/collections/light/new-wave.webp", ink: "#6b2a28", theme: "#dbd7d4" } },
    "genre:pop": { src: "/collections/pop.webp", ink: "#F4ECD8", theme: "#0d0e0e", light: { src: "/collections/light/pop.webp", ink: "#4a3014", theme: "#cebda6" } },
    "genre:pop punk": { src: "/collections/pop-punk.webp", ink: "#DFDCD6", theme: "#000000", light: { src: "/collections/light/pop-punk.webp", ink: "#5c3a10", theme: "#8c7e6d" } },
    "genre:pop rap": { src: "/collections/pop-rap.webp", ink: "#FCD2E1", theme: "#0f0b11", light: { src: "/collections/light/pop-rap.webp", ink: "#5c3018", theme: "#e4dfdc" } },
    "genre:pop rock": { src: "/collections/pop-rock.webp", ink: "#EFD9BF", theme: "#0a1110", light: { src: "/collections/light/pop-rock.webp", ink: "#3d4a16", theme: "#ecf4fc" } },
    "genre:post-grunge": { src: "/collections/post-grunge.webp", ink: "#DEDCD5", theme: "#060806", light: { src: "/collections/light/post-grunge.webp", ink: "#4a3a20", theme: "#e4e7eb" } },
    "genre:r&b": { src: "/collections/r-and-b.webp", ink: "#E5DAD0", theme: "#07080a", light: { src: "/collections/light/r-and-b.webp", ink: "#7a1018", theme: "#94846f" } },
    "genre:rock": { src: "/collections/rock.webp", ink: "#EADCBF", theme: "#080506", light: { src: "/collections/light/rock.webp", ink: "#6b3010", theme: "#c1ab98" } },
    "genre:rock and roll": { src: "/collections/rock-and-roll.webp", ink: "#F2D9BC", theme: "#010000", light: { src: "/collections/light/rock-and-roll.webp", ink: "#6b2c14", theme: "#aba6a1" } },
    "genre:rockabilly": { src: "/collections/rockabilly.webp", ink: "#EDD9C7", theme: "#010101", light: { src: "/collections/light/rockabilly.webp", ink: "#5c3010", theme: "#ad8373" } },
    "genre:singer-songwriter": { src: "/collections/singer-songwriter.webp", ink: "#DDDCD8", theme: "#0a0e10", light: { src: "/collections/light/singer-songwriter.webp", ink: "#1e4a6b", theme: "#c1d5e4" } },
    "genre:soft rock": { src: "/collections/soft-rock.webp", ink: "#ECD9C8", theme: "#000000", light: { src: "/collections/light/soft-rock.webp", ink: "#5c3010", theme: "#c2dfef" } },
    "genre:soul": { src: "/collections/soul.webp", ink: "#EED9C4", theme: "#0f0b05", light: { src: "/collections/light/soul.webp", ink: "#6b3a10", theme: "#8e7a5c" } },
    "genre:synth-pop": { src: "/collections/synth-pop.webp", ink: "#D2DEE8", theme: "#000103", light: { src: "/collections/light/synth-pop.webp", ink: "#5c3a30", theme: "#c3c0b3" } },
    "genre:teen pop": { src: "/collections/teen-pop.webp", ink: "#F7D4D9", theme: "#040204", light: { src: "/collections/light/teen-pop.webp", ink: "#7a3a28", theme: "#c5b6a4" } },
    "lang:swe": { src: "/collections/swedish.webp", ink: "#F2E8D5", theme: "#060302", light: { src: "/collections/light/swedish.webp", ink: "#80301c", theme: "#bcab99" } },
};

/** Dark `theme-color` / art fallback — keep in sync with `--ink` in global.css. */
export const DEFAULT_THEME_COLOR = "#0a0a09";
/** Light `theme-color` — keep in sync with light `--surface` in global.css. */
export const LIGHT_THEME_COLOR = "#f2ede4";

export function artFor(kind: CollectionKind, key: string): string | undefined {
    return COLLECTION_ART[`${kind}:${key}`]?.src;
}

function collectionLook(kind: CollectionKind, key: string) {
    const entry = COLLECTION_ART[`${kind}:${key}`];
    const tint = tintFor(kind, key);
    return {
        tint,
        theme: entry?.theme ?? (entry === undefined ? tint : DEFAULT_THEME_COLOR),
        ...(entry === undefined
            ? {}
            : {
                  art: entry.src,
                  ink: entry.ink ?? "#F7F2E9",
                  ...(entry.light
                      ? {
                            lightArt: entry.light.src,
                            lightInk: entry.light.ink ?? "#1c1915",
                            lightTheme: entry.light.theme ?? LIGHT_THEME_COLOR,
                        }
                      : {}),
              }),
        ...collectionTransitionNames(kind, key),
    };
}

type ArtSurface = {
    tint: string;
    theme?: string;
    art?: string;
    ink?: string;
    lightArt?: string;
    lightInk?: string;
    lightTheme?: string;
};

function hexLuminance(hex: string): number {
    const n = hex.replace("#", "");
    if (n.length !== 6) return 0.5;
    const r = parseInt(n.slice(0, 2), 16) / 255;
    const g = parseInt(n.slice(2, 4), 16) / 255;
    const b = parseInt(n.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function scrimForInk(ink: string): string {
    if (hexLuminance(ink) > 0.45) {
        return "linear-gradient(to top, rgba(10,10,9,0.72) 0%, rgba(10,10,9,0.22) 55%, transparent 100%)";
    }
    return "linear-gradient(to top, rgba(242,237,228,0.78) 0%, rgba(242,237,228,0.3) 48%, transparent 100%)";
}

function shadowForInk(ink: string): string {
    if (hexLuminance(ink) > 0.45) {
        return "0 1px 1px rgba(0,0,0,0.55), 0 1px 10px rgba(0,0,0,0.45)";
    }
    // Dark type on a daylight photo: a cream halo for dim patches (curtains,
    // guitar bodies, organ wood) plus a hairline of shade so bright plaster
    // does not wash the letters out. Tile labels and the collection title share this.
    return "0 0 1px rgba(255,252,247,0.95), 0 1px 0 rgba(255,255,255,0.88), 0 1px 2px rgba(0,0,0,0.22), 0 1px 12px rgba(255,252,247,0.55)";
}

/** Inline style for a tile or collection bar — solid color, or CSS variables for art.
 *  Light/dark still lifes swap in CSS via `prefers-color-scheme`. Do not morph across themes.
 */
export function collectionSurfaceStyle(look: ArtSurface, position = "center top"): string {
    const color = look.theme ?? look.tint;
    if (look.art === undefined) return `background:${color}`;
    const ink = look.ink ?? "#F7F2E9";
    const parts = [
        `--art-theme-dark:${color}`,
        `--art-dark:url(${look.art})`,
        `--art-ink-dark:${ink}`,
        `--art-position:${position}`,
    ];
    if (look.lightArt) {
        const lightInk = look.lightInk ?? "#1c1915";
        parts.push(
            `--art-light:url(${look.lightArt})`,
            `--art-theme-light:${look.lightTheme ?? LIGHT_THEME_COLOR}`,
            `--art-ink-light:${lightInk}`,
            `--art-scrim-light:${scrimForInk(lightInk)}`,
            `--art-shadow-light:${shadowForInk(lightInk)}`,
        );
    }
    return parts.join(";");
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
