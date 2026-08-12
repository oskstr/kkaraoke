import catalogue from "../../data/songs.json" with { type: "json" };
import resolved from "../../data/resolved.json" with { type: "json" };
import overridesFile from "../../data/overrides.json" with { type: "json" };
import artistsFile from "../../data/artists.json" with { type: "json" };
import artistNamesFile from "../../data/artist-names.json" with { type: "json" };

/**
 * One credited performer on a song. Collaborations carry several of these so each name
 * can link on its own — never by parsing the display credit, which cannot tell
 * `Hall & Oates` from `Christina Aguilera, Lil’ Kim`. `mbid` is the stable identity;
 * `slug` is what the artist URL uses.
 */
export interface CreditedArtist {
    mbid: string;
    slug: string;
    name: string;
}

/**
 * The shape the pages rely on. Declared here rather than inferred from the JSON, so
 * that a change to the scraped catalogue fails the typecheck instead of quietly
 * reshaping the site.
 */
export interface Song {
    id: number;
    postId: number;
    artist: string;
    song: string;
    /**
     * Credited performers with ids, when the resolver identified them. Used to link each
     * name on the song list and to group songs onto an artist page. Absent when the song
     * has no performer (traditional / category material) or when an override replaced the
     * credit without an id.
     */
    artists?: CreditedArtist[];
    /** Artist genres, where MusicBrainz has enough votes to be worth showing. */
    genres?: string[];
    /** Earliest release of this title by this artist, where MusicBrainz knows it. */
    year?: number;
    /**
     * The show or film the song is from, where the venue filed it under that instead of a
     * performer. `Grease` is what someone would search for, so it must not be lost when the
     * artist column starts naming the cast. Not for language labels — see `language`.
     */
    from?: string;
    /**
     * A search category that is not a show and not a performer — Christmas carols filed
     * under `Julsång`, birthday songs, hymns, and so on. Prefer this (and an empty artist)
     * over inventing a cover singer for traditional material. Umbrella browse categories
     * such as Disney / James Bond / Musical are also derived from `from` — see
     * `src/lib/categories.ts`. Melodifestivalen / Eurovision (and songs in both) use
     * `categories` when more than one label applies.
     */
    category?: string;
    /**
     * Extra search categories beyond `category` — used when a song belongs to more than
     * one (e.g. a Melodifestivalen winner that also went to Eurovision).
     */
    categories?: string[];
    /** ISO 639-3 lyrics language from the MusicBrainz work, where known. */
    language?: string;
    /** True when the artist or title shown is a correction rather than the venue's own. */
    corrected?: boolean;
}

/** What an artist page needs beyond the songs themselves. */
export interface Artist {
    mbid: string;
    slug: string;
    name: string;
    sortName?: string;
    genres?: string[];
}

/**
 * What the resolver may say about a song. Declared rather than inferred for the same
 * reason as `Song`, and with more force here: every field is optional, so inference would
 * make the site's typecheck depend on whether some song in the file happens to have a
 * genre yet. The annotation below still fails if a field changes type.
 */
interface Correction {
    postId: number;
    artist?: string;
    sortAs?: string;
    title?: string;
    genres?: string[];
    year?: number;
    from?: string;
    language?: string;
    /** Ids only — present even on artist-only corrections that never built the named list. */
    artistMbids?: string[];
    /**
     * Present when the resolver knew each credited artist by name. `artist` above is the
     * release's credit line, which reads properly but is a single string; this is the same
     * artists individually, with the ids needed to link each of them separately.
     */
    artists?: { mbid: string; name: string }[];
}

/**
 * A hand correction. Overrides win over the resolver. An empty `artist` means omit a
 * venue category label (`Julsång`, …) when there is no original artist and the venue did
 * not name a rendition — not an invitation to invent Carola or Bing Crosby. When the
 * venue already credited a performer's version of a traditional song, that credit stays.
 *
 * `year` / `genres` are for dump-blind corrections (or when a namesake match's enrichment
 * must be replaced). They win when set. Otherwise the compose step keeps the resolver's
 * year and genres unless the override clearly invalidates that match.
 */
interface Override {
    postId: number;
    artist?: string;
    sortAs?: string;
    title?: string;
    from?: string;
    category?: string;
    /** One or more search categories; merged with `category` at compose time. */
    categories?: string[];
    language?: string;
    year?: number;
    genres?: string[];
    /**
     * When an override names performers the dump never confirmed, these ids still let the
     * song list link them. Absent when the override only corrects a display string.
     */
    artists?: { mbid: string; name: string }[];
    why?: string;
}

interface ArtistRecord {
    mbid: string;
    name: string;
    sortName?: string;
    type?: string;
    disambiguation?: string;
    genres?: { name: string; count: number }[];
}

/** Swedish collation, so å, ä and ö sort after z rather than beside a, a and o. */
const collator = new Intl.Collator("sv");

/**
 * The scrape is the venue's data verbatim, and `data/resolved.json` is what MusicBrainz
 * says it should be. Only corrections the resolver marked as trustworthy are in that
 * file, so composing them is a straight overlay; the rest are listed there for review
 * and deliberately left showing the venue's own strings. `data/overrides.json` wins
 * over both, which is how a traditional carol can drop a fake singer without the next
 * rematch putting one back.
 */
const entries: readonly Correction[] = resolved.songs;
const corrections = new Map(entries.map((song) => [song.postId, song]));
const overrides = new Map(
    (overridesFile.overrides as Override[]).map((entry) => [entry.postId, entry]),
);

interface ArtistNameEntry {
    name: string;
    /** Optional URL slug when slugifying `name` would be awkward (`P!nk` → `pink`). */
    slug?: string;
    why?: string;
}

const artistRecords = new Map<string, ArtistRecord>(
    (artistsFile.artists as ArtistRecord[]).map((artist) => [artist.mbid, artist]),
);
const artistNameEntries = new Map<string, ArtistNameEntry>(
    Object.entries((artistNamesFile.artists ?? {}) as Record<string, ArtistNameEntry>),
);
const artistDisplayNames = new Map<string, string>(
    [...artistNameEntries].map(([mbid, entry]) => [mbid, entry.name]),
);

function displayNameFor(mbid: string, fallback?: string): string | undefined {
    return artistDisplayNames.get(mbid) ?? artistRecords.get(mbid)?.name ?? fallback;
}

/**
 * URL slug from a display name. Latin diacritics fold to ASCII (`å`→`a`, `ö`→`o`) so
 * paths stay easy to type; other scripts are kept unless a catalogue display name
 * supplies Latin. `$` becomes `s` (A$AP → asap). `&` becomes `and`. Modifier
 * apostrophes (Hawaiian ʻ, etc.) drop out. Remaining punctuation becomes hyphens.
 */
export function slugify(name: string): string {
    return (
        name
            .normalize("NFKD")
            .replace(/\p{M}/gu, "")
            .replace(/[\u02BB\u02BC\u02C8\u2018\u2019\uFF07']/gu, "")
            .toLowerCase()
            .replace(/ø/g, "o")
            .replace(/æ/g, "ae")
            .replace(/\$/g, "s")
            .replace(/&/g, " and ")
            .replace(/[^\p{L}\p{N}]+/gu, "-")
            .replace(/^-+|-+$/g, "") || "artist"
    );
}

/**
 * Named credits without slugs yet — slugs need the full set of catalogue artists so
 * collisions (two Alices, two Mikas) can be disambiguated. An override may supply the
 * list directly when the dump never confirmed the performers; an override that only
 * sets `artist` (including empty) drops resolver ids so a hand-set name is not linked
 * to whoever MusicBrainz pointed at.
 */
function creditedArtists(
    correction: Correction | undefined,
    override: Override | undefined,
): { mbid: string; name: string }[] | undefined {
    if (override?.artists !== undefined && override.artists.length > 0) {
        return override.artists.map((artist) => ({
            mbid: artist.mbid,
            name: displayNameFor(artist.mbid, artist.name) ?? artist.name,
        }));
    }
    if (override !== undefined && "artist" in override) {
        return undefined;
    }
    if (correction?.artists !== undefined && correction.artists.length > 0) {
        return correction.artists.map((artist) => ({
            mbid: artist.mbid,
            name: displayNameFor(artist.mbid, artist.name) ?? artist.name,
        }));
    }
    const mbids = correction?.artistMbids ?? [];
    if (mbids.length === 0) {
        return undefined;
    }
    const named: { mbid: string; name: string }[] = [];
    for (const mbid of mbids) {
        const name = displayNameFor(mbid);
        if (name === undefined) {
            continue;
        }
        named.push({ mbid, name });
    }
    return named.length > 0 ? named : undefined;
}

function correctionArtistMbids(correction: Correction | undefined): Set<string> {
    const mbids = new Set<string>();
    for (const mbid of correction?.artistMbids ?? []) {
        mbids.add(mbid);
    }
    for (const artist of correction?.artists ?? []) {
        mbids.add(artist.mbid);
    }
    return mbids;
}

/**
 * Year and genres come from whoever the dump matched. Keep them when an override only
 * fixes a credit string or replaces a placeholder — the recording date is still that
 * song's. Drop them when the override clears the performer, or when it names different
 * MusicBrainz artists than the dump (namesake / wrong-match cases). An explicit
 * override `year` / `genres` always wins.
 */
function enrichmentFor(
    correction: Correction | undefined,
    override: Override | undefined,
): { year?: number; genres?: string[] } {
    const keep = keepCorrectionEnrichment(correction, override);
    const year =
        override !== undefined && "year" in override
            ? override.year
            : keep
              ? correction?.year
              : undefined;
    const genres =
        override !== undefined && "genres" in override
            ? override.genres
            : keep
              ? correction?.genres
              : undefined;
    return {
        ...(year === undefined ? {} : { year }),
        ...(genres === undefined ? {} : { genres }),
    };
}

function keepCorrectionEnrichment(
    correction: Correction | undefined,
    override: Override | undefined,
): boolean {
    if (override === undefined) {
        return true;
    }
    // Traditional / category material with no performer — dump enrichment hitchhiked on a
    // lyricist, placeholder, or invented credit and must not stay.
    if ("artist" in override && (override.artist ?? "") === "") {
        return false;
    }
    const overrideMbids = new Set((override.artists ?? []).map((artist) => artist.mbid));
    if (overrideMbids.size === 0) {
        // Display-string or dump-blind credit with no ids: keep enrichment when the dump
        // had any (same act, missing title) and drop nothing solely for setting `artist`.
        return true;
    }
    const matched = correctionArtistMbids(correction);
    if (matched.size === 0) {
        // Dump had a recording/year but no real performer (e.g. [Disney] placeholder).
        // Replacing the credit keeps the recording's year.
        return true;
    }
    for (const mbid of overrideMbids) {
        if (matched.has(mbid)) {
            return true;
        }
    }
    // Override names a different act than the dump matched — namesake / wrong recording.
    return false;
}

const composedWithoutSlugs = catalogue.songs.map((song) => {
    const correction = corrections.get(song.postId);
    const override = overrides.get(song.postId);
    // `??` would treat an explicit empty artist as missing and fall back to the venue
    // category label; traditional songs need the empty string to stick.
    const artist =
        override !== undefined && "artist" in override
            ? (override.artist ?? "")
            : (correction?.artist ?? song.artist);
    const title = override?.title ?? correction?.title ?? song.song;
    // Empty `from` on an override clears a bad resolver value (e.g. Eurovision-as-from).
    const from =
        override !== undefined && "from" in override
            ? override.from || undefined
            : correction?.from;
    const category = override?.category;
    const categories = override?.categories;
    const language = override?.language ?? correction?.language;
    const artists = creditedArtists(correction, override);
    const { year, genres } = enrichmentFor(correction, override);
    return {
        id: song.id,
        postId: song.postId,
        artist,
        song: title,
        ...(artists === undefined ? {} : { artists }),
        // Sorting an artist by their own sort name is what puts The Beatles under B,
        // and it only exists once a lookup has provided it.
        ...(genres === undefined ? {} : { genres }),
        ...(year === undefined ? {} : { year }),
        ...(from === undefined ? {} : { from }),
        ...(category === undefined ? {} : { category }),
        ...(categories === undefined || categories.length === 0 ? {} : { categories }),
        ...(language === undefined ? {} : { language }),
        ...(artist === song.artist &&
        title === song.song &&
        category === undefined &&
        (categories === undefined || categories.length === 0) &&
        from === undefined
            ? {}
            : { corrected: true as const }),
    };
});

/**
 * Unique slugs for every artist that appears on a song. Curated `slug` entries in
 * artist-names.json win first, and the same curated slug on two MBIDs is a deliberate
 * merge (Alice Cooper band + solo → one page). Otherwise prefer the bare name; when two
 * catalogue artists share a slug by accident, fall back to type, then MusicBrainz
 * disambiguation, then a short id suffix.
 */
function assignSlugs(mbids: Iterable<string>): Map<string, string> {
    const slugByMbid = new Map<string, string>();
    const used = new Set<string>();
    const remaining: string[] = [];

    const claim = (mbid: string, candidate: string): void => {
        let slug = candidate;
        if (used.has(slug)) {
            slug = `${candidate}-${mbid.slice(0, 8)}`;
        }
        used.add(slug);
        slugByMbid.set(mbid, slug);
    };

    // Curated slugs may be shared: that is how we merge MusicBrainz entities that karaoke
    // browsers treat as one act. Auto-assigned slugs below stay unique.
    for (const mbid of mbids) {
        const curated = artistNameEntries.get(mbid)?.slug;
        if (curated !== undefined && curated.length > 0) {
            const slug = slugify(curated);
            slugByMbid.set(mbid, slug);
            used.add(slug);
        } else {
            remaining.push(mbid);
        }
    }

    const byBase = new Map<string, string[]>();
    for (const mbid of remaining) {
        const name = displayNameFor(mbid) ?? creditedNames.get(mbid);
        if (name === undefined) {
            continue;
        }
        const base = slugify(name);
        const group = byBase.get(base);
        if (group === undefined) {
            byBase.set(base, [mbid]);
        } else {
            group.push(mbid);
        }
    }

    for (const [base, group] of byBase) {
        if (group.length === 1 && !used.has(base)) {
            claim(group[0]!, base);
            continue;
        }
        for (const mbid of group) {
            const record = artistRecords.get(mbid);
            const typeSlug = record?.type !== undefined ? slugify(record.type) : undefined;
            const disambiguationSlug =
                record?.disambiguation !== undefined && record.disambiguation.length > 0
                    ? slugify(record.disambiguation)
                    : undefined;
            const candidate =
                !used.has(base) && group.length === 1
                    ? base
                    : typeSlug !== undefined && !used.has(`${base}-${typeSlug}`)
                      ? `${base}-${typeSlug}`
                      : disambiguationSlug !== undefined && !used.has(`${base}-${disambiguationSlug}`)
                        ? `${base}-${disambiguationSlug}`
                        : `${base}-${mbid.slice(0, 8)}`;
            claim(mbid, candidate);
        }
    }

    return slugByMbid;
}

const catalogueMbids = new Set<string>();
const creditedNames = new Map<string, string>();
for (const song of composedWithoutSlugs) {
    for (const artist of song.artists ?? []) {
        catalogueMbids.add(artist.mbid);
        if (!creditedNames.has(artist.mbid)) {
            creditedNames.set(artist.mbid, artist.name);
        }
    }
}
const slugByMbid = assignSlugs(catalogueMbids);
/** One slug may cover several MusicBrainz ids when artist-names.json merges them. */
const mbidsBySlug = new Map<string, string[]>();
for (const [mbid, slug] of slugByMbid) {
    const group = mbidsBySlug.get(slug);
    if (group === undefined) {
        mbidsBySlug.set(slug, [mbid]);
    } else {
        group.push(mbid);
    }
}

const composed: readonly Song[] = composedWithoutSlugs
    .map((song): Song => {
        const { artists: rawArtists, ...rest } = song;
        if (rawArtists === undefined) {
            return rest;
        }
        const artists: CreditedArtist[] = [];
        for (const artist of rawArtists) {
            const slug = slugByMbid.get(artist.mbid);
            if (slug === undefined) {
                continue;
            }
            artists.push({ mbid: artist.mbid, slug, name: artist.name });
        }
        return artists.length > 0 ? { ...rest, artists } : rest;
    })
    // The file is ordered by id to keep re-scrapes diffable, so sort for display here.
    // Falling back to the title keeps an artist's songs in a fixed order too.
    .sort((a, b) => {
        const left = overrides.get(a.postId)?.sortAs ?? corrections.get(a.postId)?.sortAs ?? a.artist;
        const right = overrides.get(b.postId)?.sortAs ?? corrections.get(b.postId)?.sortAs ?? b.artist;
        return collator.compare(left, right) || collator.compare(a.song, b.song);
    });

if (composed.length === 0) {
    throw new Error("data/songs.json holds no songs. Run `pnpm fetch:songs` to populate it.");
}

/** Songs grouped by credited artist MBID — collaborations appear under every credited name. */
const songsByArtist = new Map<string, Song[]>();
for (const song of composed) {
    for (const artist of song.artists ?? []) {
        const list = songsByArtist.get(artist.mbid);
        if (list === undefined) {
            songsByArtist.set(artist.mbid, [song]);
        } else {
            list.push(song);
        }
    }
}

for (const list of songsByArtist.values()) {
    list.sort((a, b) => collator.compare(a.song, b.song) || a.id - b.id);
}

export function getSongs(): Song[] {
    return [...composed];
}

export function getSongsByArtist(slug: string): Song[] {
    const mbids = mbidsBySlug.get(slug);
    if (mbids === undefined || mbids.length === 0) {
        return [];
    }
    const songs: Song[] = [];
    const seen = new Set<number>();
    for (const mbid of mbids) {
        for (const song of songsByArtist.get(mbid) ?? []) {
            if (seen.has(song.postId)) {
                continue;
            }
            seen.add(song.postId);
            songs.push(song);
        }
    }
    return songs.sort((a, b) => collator.compare(a.song, b.song) || a.id - b.id);
}

function genresFor(mbid: string): string[] | undefined {
    const genres = artistRecords
        .get(mbid)
        ?.genres?.slice()
        .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name))
        .slice(0, 5)
        .map((g) => g.name);
    return genres === undefined || genres.length === 0 ? undefined : genres;
}

/**
 * Prefer a Person entity when several MBIDs share a slug, so Alice Cooper sorts as
 * Cooper, Alice rather than under A for the band's sort name.
 */
function preferredMbid(mbids: readonly string[]): string {
    const person = mbids.find((mbid) => artistRecords.get(mbid)?.type === "Person");
    return person ?? mbids[0]!;
}

function buildArtist(slug: string): Artist | undefined {
    const mbids = mbidsBySlug.get(slug);
    if (mbids === undefined || mbids.length === 0) {
        return undefined;
    }
    if (!mbids.some((mbid) => songsByArtist.has(mbid))) {
        return undefined;
    }
    const mbid = preferredMbid(mbids);
    const record = artistRecords.get(mbid);
    const fromSong = songsByArtist.get(mbid)?.[0]?.artists?.find((a) => a.mbid === mbid)?.name
        ?? songsByArtist.get(mbids[0]!)?.[0]?.artists?.find((a) => a.slug === slug)?.name;
    const name = displayNameFor(mbid, fromSong) ?? displayNameFor(mbids[0]!, fromSong);
    if (name === undefined) {
        return undefined;
    }
    const genreCounts = new Map<string, number>();
    for (const id of mbids) {
        for (const genre of artistRecords.get(id)?.genres ?? []) {
            genreCounts.set(genre.name, (genreCounts.get(genre.name) ?? 0) + genre.count);
        }
    }
    const genres =
        genreCounts.size === 0
            ? genresFor(mbid)
            : [...genreCounts]
                  .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
                  .slice(0, 5)
                  .map(([genre]) => genre);
    return {
        mbid,
        slug,
        name,
        ...(record?.sortName === undefined ? {} : { sortName: record.sortName }),
        ...(genres === undefined || genres.length === 0 ? {} : { genres }),
    };
}

/**
 * Every artist that has at least one song in the catalogue, for `getStaticPaths`.
 * One row per slug, so curated merges (Alice Cooper) appear once.
 */
export function getArtists(): Artist[] {
    const artists: Artist[] = [];
    for (const slug of mbidsBySlug.keys()) {
        const artist = buildArtist(slug);
        if (artist !== undefined) {
            artists.push(artist);
        }
    }
    // Sort by display name (not MusicBrainz sortName like "Jackson, Michael").
    return artists.sort((a, b) => collator.compare(a.name, b.name));
}

export function getArtist(slug: string): Artist | undefined {
    return buildArtist(slug);
}
