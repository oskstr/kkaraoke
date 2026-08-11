import catalogue from "../../data/songs.json";
import resolved from "../../data/resolved.json";
import overridesFile from "../../data/overrides.json";

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
    /**
     * Present on collaborations only. `artist` above is the release's credit line, which
     * reads properly but is a single string; this is the same artists individually, with the
     * ids a page would need to link each of them separately. Nothing renders it yet.
     */
    artists?: { mbid: string; name: string }[];
}

/**
 * A hand correction. Overrides win over the resolver. An empty `artist` means omit the
 * venue's category label rather than invent a performer — traditional material belongs
 * under `category`, not under Carola or Bing Crosby.
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
        return {
            id: song.id,
            postId: song.postId,
            artist,
            song: title,
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

export function getSongs(): Song[] {
    return [...composed];
}
