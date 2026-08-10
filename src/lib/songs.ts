import catalogue from "../../data/songs.json";

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
}

/** Swedish collation, so å, ä and ö sort after z rather than beside a, a and o. */
const collator = new Intl.Collator("sv");

/**
 * The file is ordered by id to keep re-scrapes diffable, so sort for display here.
 * Falling back to the title keeps an artist's songs in a fixed order too, which the
 * database ordering left unspecified.
 */
const songs: readonly Song[] = [...catalogue.songs].sort(
    (a, b) => collator.compare(a.artist, b.artist) || collator.compare(a.song, b.song),
);

if (songs.length === 0) {
    throw new Error("data/songs.json holds no songs. Run `pnpm fetch:songs` to populate it.");
}

export function getSongs(): Song[] {
    return [...songs];
}
