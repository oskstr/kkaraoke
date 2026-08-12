import catalogue from "../../data/songs.json";
import resolved from "../../data/resolved.json";
import overridesFile from "../../data/overrides.json";
import artistsFile from "../../data/artists.json";
import artistNamesFile from "../../data/artist-names.json";

/**
 * One credited performer on a song, with the MusicBrainz id the artist page is keyed by.
 * Collaborations carry several of these so each name can link on its own — never by parsing
 * the display credit, which cannot tell `Hall & Oates` from `Christina Aguilera, Lil’ Kim`.
 */
export interface CreditedArtist {
    mbid: string;
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
     * over inventing a cover singer for traditional material.
     */
    category?: string;
    /** ISO 639-3 lyrics language from the MusicBrainz work, where known. */
    language?: string;
    /** True when the artist or title shown is a correction rather than the venue's own. */
    corrected?: boolean;
}

/** What an artist page needs beyond the songs themselves. */
export interface Artist {
    mbid: string;
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
     * artists individually, with the ids a page needs to link each of them separately.
     */
    artists?: CreditedArtist[];
}

/**
 * A hand correction. Overrides win over the resolver. An empty `artist` means omit a
 * venue category label (`Julsång`, …) when there is no original artist and the venue did
 * not name a rendition — not an invitation to invent Carola or Bing Crosby. When the
 * venue already credited a performer's version of a traditional song, that credit stays.
 */
interface Override {
    postId: number;
    artist?: string;
    sortAs?: string;
    title?: string;
    from?: string;
    category?: string;
    language?: string;
    why?: string;
}

interface ArtistRecord {
    mbid: string;
    name: string;
    sortName?: string;
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

const artistRecords = new Map<string, ArtistRecord>(
    (artistsFile.artists as ArtistRecord[]).map((artist) => [artist.mbid, artist]),
);
const artistDisplayNames = new Map<string, string>(
    Object.entries(
        (artistNamesFile.artists ?? {}) as Record<string, { name: string; why?: string }>,
    ).map(([mbid, entry]) => [mbid, entry.name]),
);

function displayNameFor(mbid: string, fallback?: string): string | undefined {
    return artistDisplayNames.get(mbid) ?? artistRecords.get(mbid)?.name ?? fallback;
}

/**
 * Named credits for linking. Prefer the resolver's `artists` list; fall back to looking
 * up `artistMbids` in the artist catalogue so artist-only corrections still link. An
 * override that touched `artist` drops the ids: empty means no performer, and a hand-set
 * name may no longer match whoever MusicBrainz pointed at.
 */
function creditedArtists(correction: Correction | undefined, override: Override | undefined): CreditedArtist[] | undefined {
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
    const named: CreditedArtist[] = [];
    for (const mbid of mbids) {
        const name = displayNameFor(mbid);
        if (name === undefined) {
            continue;
        }
        named.push({ mbid, name });
    }
    return named.length > 0 ? named : undefined;
}

const composed: readonly Song[] = catalogue.songs
    .map((song): Song => {
        const correction = corrections.get(song.postId);
        const override = overrides.get(song.postId);
        // `??` would treat an explicit empty artist as missing and fall back to the venue
        // category label; traditional songs need the empty string to stick.
        const artist =
            override !== undefined && "artist" in override
                ? (override.artist ?? "")
                : (correction?.artist ?? song.artist);
        const title = override?.title ?? correction?.title ?? song.song;
        const from = override?.from ?? correction?.from;
        const category = override?.category;
        const language = override?.language ?? correction?.language;
        const artists = creditedArtists(correction, override);
        return {
            id: song.id,
            postId: song.postId,
            artist,
            song: title,
            ...(artists === undefined ? {} : { artists }),
            // Sorting an artist by their own sort name is what puts The Beatles under B,
            // and it only exists once a lookup has provided it.
            ...(correction?.genres === undefined ? {} : { genres: correction.genres }),
            ...(correction?.year === undefined ? {} : { year: correction.year }),
            ...(from === undefined ? {} : { from }),
            ...(category === undefined ? {} : { category }),
            ...(language === undefined ? {} : { language }),
            ...(artist === song.artist && title === song.song && category === undefined && from === undefined
                ? {}
                : { corrected: true }),
        };
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

export function getSongsByArtist(mbid: string): Song[] {
    return [...(songsByArtist.get(mbid) ?? [])];
}

function buildArtist(mbid: string): Artist | undefined {
    if (!songsByArtist.has(mbid)) {
        return undefined;
    }
    const record = artistRecords.get(mbid);
    const fromSong = songsByArtist.get(mbid)?.[0]?.artists?.find((a) => a.mbid === mbid)?.name;
    const name = displayNameFor(mbid, fromSong);
    if (name === undefined) {
        return undefined;
    }
    const genres = record?.genres
        ?.slice()
        .sort((a, b) => b.count - a.count || collator.compare(a.name, b.name))
        .slice(0, 5)
        .map((g) => g.name);
    return {
        mbid,
        name,
        ...(record?.sortName === undefined ? {} : { sortName: record.sortName }),
        ...(genres === undefined || genres.length === 0 ? {} : { genres }),
    };
}

/**
 * Every artist that has at least one song in the catalogue, for `getStaticPaths`.
 * Name prefers catalogue display overrides, then MusicBrainz, then whatever a song credited.
 */
export function getArtists(): Artist[] {
    const artists: Artist[] = [];
    for (const mbid of songsByArtist.keys()) {
        const artist = buildArtist(mbid);
        if (artist !== undefined) {
            artists.push(artist);
        }
    }
    return artists.sort(
        (a, b) =>
            collator.compare(a.sortName ?? a.name, b.sortName ?? b.name) ||
            collator.compare(a.name, b.name),
    );
}

export function getArtist(mbid: string): Artist | undefined {
    return buildArtist(mbid);
}
