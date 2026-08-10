/**
 * Matches the whole catalogue against the MusicBrainz canonical metadata dump, offline.
 *
 * The dump exists for exactly our problem: turning an (artist string, title string) pair
 * into MBIDs. Its `combined_lookup` column is the artist and recording names with
 * punctuation and whitespace removed and diacritics folded to ASCII, so `Lou Bega` plus
 * `Mambo No5` lines up with `Mambo No. 5 (A Little Bit of...)` without any of the
 * fuzziness that makes the web service's phrase search both miss real matches and accept
 * wrong ones. It is one pass over a local file rather than a request per song.
 *
 * The dump carries no works, composers, release dates or aliases, so the web service is
 * still needed to enrich whatever matches here. Its chosen release is often a karaoke
 * compilation, so a year must never be read from it, and its artist credit is
 * release-specific, so canonical artist names have to come from the MBID.
 *
 * Get the dump from https://metabrainz.org/datasets/derived-dumps#canonical (CC0, ~2.3 GB
 * compressed, refreshed twice a month) and point --csv at canonical_musicbrainz_data.csv.
 *
 * Usage: pnpm match:canonical --csv <file> [--out data/canonical-matches.json]
 */

import { createReadStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import catalogue from "../data/songs.json" with { type: "json" };

/**
 * Characters the dump's Unidecode pass folds but Unicode decomposition does not, since
 * they are single code points rather than a base plus a combining mark. The Nordic ones
 * are the whole point for this catalogue.
 */
const FOLDED = new Map([
    ["ø", "o"],
    ["æ", "ae"],
    ["ß", "ss"],
    ["ð", "d"],
    ["þ", "th"],
    ["đ", "d"],
    ["ł", "l"],
    ["œ", "oe"],
]);

/**
 * Reproduces the dump's own key: strip everything that is not a letter, digit or
 * underscore, lowercase, then reduce to ASCII.
 */
export function combinedLookup(...parts: string[]): string {
    const stripped = parts
        .join("")
        .replace(/[^\p{L}\p{N}_]+/gu, "")
        .toLowerCase();
    const folded = [...stripped].map((character) => FOLDED.get(character) ?? character).join("");
    return folded.normalize("NFKD").replace(/\p{M}+/gu, "");
}

/**
 * The venue's own systematic deviations, in the order we would rather match. The dropped
 * article is the big one: the catalogue files The Beatles, The Kinks, The Killers and The
 * Cranberries without their article, which no amount of punctuation folding will fix
 * because the missing word is at the front of the key.
 */
const VARIANTS = ["as-written", "article-added", "annotation-stripped", "article-added-annotation-stripped"] as const;
type Variant = (typeof VARIANTS)[number];

/** Trailing parentheses are the venue annotating, or MusicBrainz marking a version. */
const withoutAnnotation = (title: string): string => title.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();

function keysFor(artist: string, title: string): { key: string; variant: Variant }[] {
    const bare = withoutAnnotation(title);
    const candidates: { key: string; variant: Variant }[] = [
        { key: combinedLookup(artist, title), variant: "as-written" },
    ];
    const articled = /^the\s/i.test(artist) ? undefined : `The ${artist}`;
    if (articled !== undefined) {
        candidates.push({ key: combinedLookup(articled, title), variant: "article-added" });
    }
    if (bare !== title && bare.length > 0) {
        candidates.push({ key: combinedLookup(artist, bare), variant: "annotation-stripped" });
        if (articled !== undefined) {
            candidates.push({
                key: combinedLookup(articled, bare),
                variant: "article-added-annotation-stripped",
            });
        }
    }
    const seen = new Set<string>();
    return candidates.filter((candidate) => !seen.has(candidate.key) && seen.add(candidate.key));
}

/**
 * How the row was found, worst last. A prefix match is weaker evidence than an exact one,
 * and how much weaker depends on what the extra text is: a version marker in brackets is
 * almost certainly the same song, two trailing letters is almost certainly a spelling
 * variant, and anything else may be a coincidence — `Secrets` reaches Madonna's
 * `Secret (Some Bizarre mix)` that way.
 */
const HOWS = ["exact", "version", "spelling", "artist-scoped", "near", "loose"] as const;
type How = (typeof HOWS)[number];

/** All but `loose`, which is the bucket for matches that could be coincidence. */
const TRUSTED: readonly How[] = ["exact", "version", "spelling", "artist-scoped", "near"];

/**
 * Whether two keys are within `limit` edits of each other, abandoning the calculation as
 * soon as they are not. Bounded rather than exact because the answer is only ever compared
 * against a small threshold.
 */
function within(a: string, b: string, limit: number): boolean {
    if (Math.abs(a.length - b.length) > limit) {
        return false;
    }
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const value = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
            row.push(value);
            if (value < best) best = value;
        }
        if (best > limit) {
            return false;
        }
        previous = row;
    }
    return (previous[b.length] ?? limit + 1) <= limit;
}

/**
 * How far a key of this length may stray. A typo in a long title is still recognisably that
 * title; one character in a short one is a different song, and `Stay` is a single edit from
 * `Say`.
 */
function tolerance(key: string): number {
    if (key.length >= 12) return 2;
    return key.length >= 7 ? 1 : 0;
}

interface Row {
    artistCredit: string;
    artistMbids: string[];
    recording: string;
    recordingMbid: string;
    release: string;
    score: number;
}

interface Match extends Row {
    how: How;
    variant: Variant;
    trusted: boolean;
}

/** The row's own fields, read only for the few thousand rows that matched. */
function parseRow(line: string): string[] {
    const fields: string[] = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const character = line[index];
        if (quoted) {
            if (character === '"') {
                if (line[index + 1] === '"') {
                    field += '"';
                    index++;
                } else {
                    quoted = false;
                }
            } else {
                field += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ",") {
            fields.push(field);
            field = "";
        } else {
            field += character;
        }
    }
    fields.push(field);
    return fields;
}

function toRow(line: string): Row | undefined {
    const fields = parseRow(line);
    if (fields.length < 10) {
        return undefined;
    }
    return {
        artistCredit: fields[3] ?? "",
        artistMbids: (fields[2] ?? "").split(/[,\s]+/).filter((mbid) => mbid.length > 0),
        recording: fields[7] ?? "",
        recordingMbid: fields[6] ?? "",
        release: fields[5] ?? "",
        score: Number(fields[9]),
    };
}

/**
 * Streams the dump, handing each row's lookup key to a visitor. `combined_lookup` holds
 * no commas, so it can be found as the second-to-last comma-separated field without
 * parsing the commas inside the quoted names before it.
 */
async function scan(csv: string, visit: (key: string, line: string) => void): Promise<number> {
    const reader = createInterface({ input: createReadStream(csv, { encoding: "utf8" }), crlfDelay: Infinity });
    let rows = 0;
    for await (const line of reader) {
        rows++;
        if (rows === 1) {
            continue;
        }
        const lastComma = line.lastIndexOf(",");
        if (lastComma < 1) continue;
        const keyComma = line.lastIndexOf(",", lastComma - 1);
        if (keyComma < 0) continue;
        const key = line.slice(keyComma + 1, lastComma);
        if (key.length > 0) visit(key, line);
    }
    return rows;
}

/**
 * Buckets keys by a fixed-length head or tail so that most of the dump's rows cost a
 * single hash lookup, which is what keeps a full scan to well under a minute.
 */
function affixIndex(keys: Iterable<string>, end: "head" | "tail"): (value: string) => string[] {
    const width = 8;
    const affixOf = (value: string): string => (end === "head" ? value.slice(0, width) : value.slice(-width));
    const buckets = new Map<string, string[]>();
    const short: string[] = [];
    for (const key of keys) {
        if (key.length < width) {
            short.push(key);
            continue;
        }
        const bucket = buckets.get(affixOf(key));
        if (bucket === undefined) buckets.set(affixOf(key), [key]);
        else bucket.push(key);
    }

    /** Every stored key that is a prefix (or suffix) of `value`, longest first. */
    return (value: string): string[] => {
        const pool = buckets.get(affixOf(value));
        if (pool === undefined && short.length === 0) {
            return [];
        }
        const test = end === "head" ? (k: string) => value.startsWith(k) : (k: string) => value.endsWith(k);
        return [...(pool ?? []), ...short].filter(test).sort((a, b) => b.length - a.length);
    };
}

/** Grades a prefix match by what the canonical title has that the venue's does not. */
function gradePrefix(ourKey: string, recording: string, credit: string): How {
    const strippedKey = combinedLookup(credit, withoutAnnotation(recording));
    if (strippedKey === ourKey) {
        return "version";
    }
    const full = combinedLookup(credit, recording);
    return full.length - ourKey.length <= 2 ? "spelling" : "loose";
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            csv: { type: "string" },
            out: { type: "string", default: "data/canonical-matches.json" },
        },
    });
    if (values.csv === undefined) {
        throw new Error("--csv <canonical_musicbrainz_data.csv> is required.");
    }

    // Several songs can share a key: the catalogue lists some songs twice under different
    // punch-in numbers.
    const wanted = new Map<string, { postId: number; rank: number }[]>();
    for (const song of catalogue.songs) {
        for (const { key, variant } of keysFor(song.artist, song.song)) {
            const entry = { postId: song.postId, rank: VARIANTS.indexOf(variant) };
            const existing = wanted.get(key);
            if (existing === undefined) wanted.set(key, [entry]);
            else existing.push(entry);
        }
    }

    const best = new Map<number, Match & { rank: number }>();
    const heads = affixIndex(wanted.keys(), "head");

    const consider = (postId: number, rank: number, how: How, row: Row): void => {
        const existing = best.get(postId);
        if (existing !== undefined) {
            if (rank > existing.rank) return;
            if (rank === existing.rank) {
                const order = HOWS.indexOf(how) - HOWS.indexOf(existing.how);
                if (order > 0) return;
                if (order === 0 && !(row.score < existing.score)) return;
            }
        }
        best.set(postId, {
            ...row,
            how,
            variant: VARIANTS[rank] ?? "as-written",
            rank,
            trusted: TRUSTED.includes(how),
        });
    };

    console.log("pass 1: matching artist and title together");
    const rows = await scan(values.csv, (key, line) => {
        // Every entry in a bucket asked for the same key, so one grading serves them all.
        const asked = wanted.has(key) ? key : heads(key)[0];
        if (asked === undefined) {
            return;
        }
        const entries = wanted.get(asked);
        if (entries === undefined) {
            return;
        }
        const row = toRow(line);
        if (row === undefined) {
            return;
        }
        const how: How = asked === key ? "exact" : gradePrefix(asked, row.recording, row.artistCredit);
        for (const entry of entries) {
            consider(entry.postId, entry.rank, how, row);
        }
    });

    const afterFirst = best.size;
    console.log(`  ${rows} rows scanned, ${afterFirst}/${catalogue.songs.length} songs matched`);

    // A second pass, now that we know which MBIDs the catalogue's artists correspond to.
    // The venue's typos live here: `Sugarbabes`, `Rozallo`, `Zuchero` and `Pink` for
    // `P!nk` never match a combined key, but their other songs did, so the artist is
    // known and the title alone is enough to place the rest.
    const mbidsByArtist = new Map<string, Set<string>>();
    for (const song of catalogue.songs) {
        const match = best.get(song.postId);
        if (match === undefined || !match.trusted) continue;
        const set = mbidsByArtist.get(song.artist) ?? new Set<string>();
        for (const mbid of match.artistMbids) set.add(mbid);
        mbidsByArtist.set(song.artist, set);
    }

    const byTitle = new Map<string, { postId: number; mbids: Set<string> }[]>();
    for (const song of catalogue.songs) {
        if (best.has(song.postId)) continue;
        const mbids = mbidsByArtist.get(song.artist);
        if (mbids === undefined || mbids.size === 0) continue;
        for (const title of new Set([song.song, withoutAnnotation(song.song)])) {
            const key = combinedLookup(title);
            if (key.length === 0) continue;
            const entry = { postId: song.postId, mbids };
            const existing = byTitle.get(key);
            if (existing === undefined) byTitle.set(key, [entry]);
            else existing.push(entry);
        }
    }

    if (byTitle.size > 0) {
        console.log(`pass 2: ${byTitle.size} titles from artists we can now identify`);
        const tails = affixIndex(byTitle.keys(), "tail");
        await scan(values.csv, (key, line) => {
            for (const titleKey of tails(key)) {
                const entries = byTitle.get(titleKey);
                if (entries === undefined) continue;
                let row: Row | undefined;
                for (const entry of entries) {
                    row ??= toRow(line);
                    if (row === undefined) return;
                    // The title has to be the whole of the row's title, not a fragment of
                    // it, or `Stay` would match everything ending in that word.
                    if (combinedLookup(row.recording) !== titleKey) continue;
                    if (!row.artistMbids.some((mbid) => entry.mbids.has(mbid))) continue;
                    consider(entry.postId, 0, "artist-scoped", row);
                }
            }
        });
        console.log(`  recovered ${best.size - afterFirst} more songs`);
    }

    // A third pass, for the songs whose artist we can reach but whose title we cannot. The
    // venue misspells titles as well as artists — `Wannabee`, `Fleetwod mac` — and a typo
    // is invisible to a key comparison however the key is built. Scoped to the artist's own
    // recordings and bounded by how far a key of that length may stray, a near match is
    // safe in a way that a global fuzzy search would not be.
    const beforeThird = best.size;
    const creditsByArtistKey = new Map<string, { credits: Set<string>; mbids: Set<string> }>();
    for (const song of catalogue.songs) {
        const match = best.get(song.postId);
        if (match === undefined || !match.trusted) continue;
        const key = combinedLookup(song.artist);
        const entry = creditsByArtistKey.get(key) ?? { credits: new Set<string>(), mbids: new Set<string>() };
        entry.credits.add(combinedLookup(match.artistCredit));
        for (const mbid of match.artistMbids) entry.mbids.add(mbid);
        creditsByArtistKey.set(key, entry);
    }

    const nearWanted = new Map<string, { postId: number; titleKey: string; mbids: Set<string> }[]>();
    for (const song of catalogue.songs) {
        if (best.has(song.postId)) continue;
        const artistKey = combinedLookup(song.artist);
        // The artist string may itself be misspelled, so reach for the trusted spellings
        // that are within an edit or two of it as well as for an exact match.
        const spelled = creditsByArtistKey.get(artistKey);
        const slack = tolerance(artistKey);
        const reachable =
            spelled !== undefined
                ? [spelled]
                : slack === 0
                  ? []
                  : [...creditsByArtistKey.entries()]
                        .filter(([key]) => within(key, artistKey, slack))
                        .map(([, entry]) => entry);
        const titleKey = combinedLookup(withoutAnnotation(song.song));
        if (titleKey.length === 0 || tolerance(titleKey) === 0) continue;
        for (const entry of reachable) {
            for (const credit of entry.credits) {
                const bucket = nearWanted.get(credit);
                const wantedEntry = { postId: song.postId, titleKey, mbids: entry.mbids };
                if (bucket === undefined) nearWanted.set(credit, [wantedEntry]);
                else bucket.push(wantedEntry);
            }
        }
    }

    if (nearWanted.size > 0) {
        const songsReached = new Set([...nearWanted.values()].flat().map((entry) => entry.postId)).size;
        console.log(`pass 3: ${songsReached} songs whose artist we know but whose title did not match`);
        const credits = affixIndex(nearWanted.keys(), "head");
        await scan(values.csv, (key, line) => {
            for (const credit of credits(key)) {
                const entries = nearWanted.get(credit);
                if (entries === undefined) continue;
                const rest = key.slice(credit.length);
                if (rest.length === 0) continue;
                let row: Row | undefined;
                for (const entry of entries) {
                    if (!within(rest, entry.titleKey, tolerance(entry.titleKey))) continue;
                    row ??= toRow(line);
                    if (row === undefined) return;
                    if (!row.artistMbids.some((mbid) => entry.mbids.has(mbid))) continue;
                    consider(entry.postId, 0, "near", row);
                }
            }
        });
        console.log(`  recovered ${best.size - beforeThird} more songs`);
    }

    const results = catalogue.songs.map((song) => {
        const match = best.get(song.postId);
        if (match === undefined) {
            return { postId: song.postId, id: song.id, artist: song.artist, song: song.song, matched: false as const };
        }
        const { rank, ...rest } = match;
        // A bracketed name is one of MusicBrainz's placeholder entities, such as
        // [Disney] or [traditional]. It matches, and it means nothing.
        const placeholder = /^\[.*\]$/.test(match.artistCredit);
        return {
            postId: song.postId,
            id: song.id,
            artist: song.artist,
            song: song.song,
            matched: true as const,
            ...rest,
            ...(placeholder ? { placeholder: true as const, trusted: false } : {}),
        };
    });

    const matched = results.filter((r) => r.matched);
    const trusted = matched.filter((r) => r.trusted);
    console.log(`\nmatched ${matched.length}/${results.length}, of which ${trusted.length} are trustworthy`);
    for (const how of HOWS) {
        const n = matched.filter((r) => r.how === how).length;
        if (n > 0) console.log(`  ${how}: ${n}`);
    }
    for (const variant of VARIANTS) {
        const n = matched.filter((r) => r.variant === variant).length;
        if (n > 0) console.log(`  via ${variant}: ${n}`);
    }
    console.log(`  placeholder credits discarded: ${matched.filter((r) => "placeholder" in r).length}`);

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, `${JSON.stringify({ songs: results }, null, 2)}\n`, "utf8");
    console.log(`Wrote ${values.out}`);
}

// Guarded so that `combinedLookup` can be imported and exercised without the import
// kicking off a scan of a seven-gigabyte file.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
