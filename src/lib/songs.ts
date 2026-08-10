import catalogue from "../../data/songs.json";
import resolved from "../../data/resolved.json";

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
    /**
     * Present on collaborations only. `artist` above is the release's credit line, which
     * reads properly but is a single string; this is the same artists individually, with the
     * ids a page would need to link each of them separately. Nothing renders it yet.
     */
    artists?: { mbid: string; name: string }[];
}

/** Swedish collation, so å, ä and ö sort after z rather than beside a, a and o. */
const collator = new Intl.Collator("sv");

/**
 * The scrape is the venue's data verbatim, and `data/resolved.json` is what MusicBrainz
 * says it should be. Only corrections the resolver marked as trustworthy are in that
 * file, so composing them is a straight overlay; the rest are listed there for review
 * and deliberately left showing the venue's own strings.
 */
const entries: readonly Correction[] = resolved.songs;
const corrections = new Map(entries.map((song) => [song.postId, song]));

const composed: readonly Song[] = catalogue.songs
    .map((song): Song => {
        const correction = corrections.get(song.postId);
        if (correction === undefined) {
            return song;
        }
        const artist = correction.artist ?? song.artist;
        const title = correction.title ?? song.song;
        return {
            id: song.id,
            postId: song.postId,
            artist,
            song: title,
            // Sorting an artist by their own sort name is what puts The Beatles under B,
            // and it only exists once a lookup has provided it.
            ...(correction.genres === undefined ? {} : { genres: correction.genres }),
            ...(correction.year === undefined ? {} : { year: correction.year }),
            ...(artist === song.artist && title === song.song ? {} : { corrected: true }),
        };
    })
    // The file is ordered by id to keep re-scrapes diffable, so sort for display here.
    // Falling back to the title keeps an artist's songs in a fixed order too.
    .sort((a, b) => {
        const left = corrections.get(a.postId)?.sortAs ?? a.artist;
        const right = corrections.get(b.postId)?.sortAs ?? b.artist;
        return collator.compare(left, right) || collator.compare(a.song, b.song);
    });

if (composed.length === 0) {
    throw new Error("data/songs.json holds no songs. Run `pnpm fetch:songs` to populate it.");
}

export function getSongs(): Song[] {
    return [...composed];
}
