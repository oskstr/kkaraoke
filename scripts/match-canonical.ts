/**
 * Matches the whole catalogue against the MusicBrainz canonical metadata dump, offline.
 *
 * The dump exists for exactly our problem: turning an (artist string, title string)
 * pair into MBIDs. Its `combined_lookup` column is the artist and recording names with
 * punctuation and whitespace removed and diacritics folded to ASCII, so `Lou Bega` plus
 * `Mambo No5` lines up with `Mambo No. 5 (A Little Bit of...)` without any of the
 * fuzziness that makes the web service's phrase search both miss real matches and
 * accept wrong ones.
 *
 * It is one pass over a local file rather than a request per song, which turns the
 * identity half of the work from hours of rate-limited crawling into minutes of CPU.
 * The dump carries no works, composers, release dates or aliases, so the web service is
 * still needed to enrich whatever matches here.
 *
 * Get the dump from https://metabrainz.org/datasets/derived-dumps#canonical (CC0, ~2.3
 * GB compressed, refreshed twice a month) and point --csv at
 * canonical_musicbrainz_data.csv.
 *
 * Usage: pnpm match:canonical --csv <file> [--out data/canonical-matches.json]
 */

import { createReadStream } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
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
export function combinedLookup(artist: string, recording: string): string {
    const stripped = `${artist}${recording}`.replace(/[^\p{L}\p{N}_]+/gu, "").toLowerCase();
    const folded = [...stripped].map((character) => FOLDED.get(character) ?? character).join("");
    return folded.normalize("NFKD").replace(/\p{M}+/gu, "");
}

interface Match {
    /** How the row was found, since a prefix match is weaker evidence than an exact one. */
    how: "exact" | "prefix";
    /** Which rewriting of the venue's strings matched, if it took one. */
    variant: (typeof VARIANTS)[number];
    score: number;
    artistCredit: string;
    artistMbids: string[];
    recording: string;
    recordingMbid: string;
    release: string;
}

/**
 * The venue's own systematic deviations, in the order we would rather match. The dropped
 * article is the big one: the catalogue files The Beatles, The Kinks, The Killers and The
 * Cranberries without their article, which no amount of punctuation folding will fix
 * because the missing word is at the front of the key.
 */
const VARIANTS = ["as-written", "article-added", "annotation-stripped", "article-added-annotation-stripped"] as const;

/** Trailing parentheses in titles are the venue annotating, not part of the name. */
const withoutAnnotation = (title: string): string => title.replace(/\s*\([^()]*\)\s*$/, "").trim();

function keysFor(artist: string, title: string): { key: string; variant: (typeof VARIANTS)[number] }[] {
    const bare = withoutAnnotation(title);
    const candidates: { key: string; variant: (typeof VARIANTS)[number] }[] = [
        { key: combinedLookup(artist, title), variant: "as-written" },
    ];
    if (!/^the\s/i.test(artist)) {
        candidates.push({ key: combinedLookup(`The ${artist}`, title), variant: "article-added" });
    }
    if (bare !== title && bare.length > 0) {
        candidates.push({ key: combinedLookup(artist, bare), variant: "annotation-stripped" });
        if (!/^the\s/i.test(artist)) {
            candidates.push({
                key: combinedLookup(`The ${artist}`, bare),
                variant: "article-added-annotation-stripped",
            });
        }
    }
    // Two variants can collapse to the same key; keep the first, which ranks better.
    const seen = new Set<string>();
    return candidates.filter((candidate) => !seen.has(candidate.key) && seen.add(candidate.key));
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

    // Several songs can share a key: the catalogue lists some songs twice under
    // different punch-in numbers.
    const wanted = new Map<string, { postId: number; rank: number }[]>();
    for (const song of catalogue.songs) {
        for (const { key, variant } of keysFor(song.artist, song.song)) {
            const entry = { postId: song.postId, rank: VARIANTS.indexOf(variant) };
            const existing = wanted.get(key);
            if (existing === undefined) wanted.set(key, [entry]);
            else existing.push(entry);
        }
    }

    // A row only needs the expensive prefix check when its first few characters could
    // begin one of our keys, which for a dump of tens of millions of rows is what keeps
    // a single pass affordable.
    const PREFIX = 10;
    const byPrefix = new Map<string, string[]>();
    const shortKeys: string[] = [];
    for (const key of wanted.keys()) {
        if (key.length < PREFIX) {
            shortKeys.push(key);
            continue;
        }
        const head = key.slice(0, PREFIX);
        const bucket = byPrefix.get(head);
        if (bucket === undefined) byPrefix.set(head, [key]);
        else bucket.push(key);
    }

    const best = new Map<number, Match & { rank: number }>();
    let rows = 0;
    let malformed = 0;

    const reader = createInterface({ input: createReadStream(values.csv, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of reader) {
        rows++;
        if (rows === 1) {
            continue;
        }

        // combined_lookup holds only word characters, so it can be found as the
        // second-to-last comma-separated field without parsing the commas inside the
        // quoted names before it.
        const lastComma = line.lastIndexOf(",");
        if (lastComma < 1) {
            malformed++;
            continue;
        }
        const keyComma = line.lastIndexOf(",", lastComma - 1);
        if (keyComma < 0) {
            malformed++;
            continue;
        }
        const rowKey = line.slice(keyComma + 1, lastComma);
        if (rowKey.length === 0) {
            continue;
        }

        let matched: string | undefined;
        let how: Match["how"] = "exact";
        if (wanted.has(rowKey)) {
            matched = rowKey;
        } else {
            const candidates = byPrefix.get(rowKey.slice(0, PREFIX));
            const pool = candidates === undefined ? shortKeys : [...candidates, ...shortKeys];
            let longest: string | undefined;
            for (const key of pool) {
                if (rowKey.startsWith(key) && (longest === undefined || key.length > longest.length)) {
                    longest = key;
                }
            }
            if (longest !== undefined) {
                matched = longest;
                how = "prefix";
            }
        }
        if (matched === undefined) {
            continue;
        }

        const score = Number(line.slice(lastComma + 1));
        const entries = wanted.get(matched) ?? [];
        // Prefer the least-rewritten variant, then an exact match over a prefix one, then
        // the lower score, which the dump uses to mark the more canonical row.
        const improves = (entry: { postId: number; rank: number }): boolean => {
            const existing = best.get(entry.postId);
            if (existing === undefined) return true;
            if (entry.rank !== existing.rank) return entry.rank < existing.rank;
            if (how !== existing.how) return how === "exact";
            return score < existing.score;
        };
        const wins = entries.filter(improves);
        if (wins.length === 0) {
            continue;
        }

        const fields = parseRow(line);
        if (fields.length < 10) {
            malformed++;
            continue;
        }
        for (const entry of wins) {
            best.set(entry.postId, {
                how,
                variant: VARIANTS[entry.rank] ?? "as-written",
                rank: entry.rank,
                score,
                artistCredit: fields[3] ?? "",
                artistMbids: (fields[2] ?? "").split(/[,\s]+/).filter((mbid) => mbid.length > 0),
                recording: fields[7] ?? "",
                recordingMbid: fields[6] ?? "",
                release: fields[5] ?? "",
            });
        }

        if (rows % 5_000_000 === 0) {
            console.log(`  ${(rows / 1_000_000).toFixed(0)}M rows, ${best.size}/${wanted.size} keys matched`);
        }
    }

    const results = catalogue.songs.map((song) => {
        const match = best.get(song.postId);
        const { rank, ...rest } = match ?? { rank: 0 };
        return {
            postId: song.postId,
            id: song.id,
            artist: song.artist,
            song: song.song,
            ...(match === undefined ? { matched: false } : { matched: true, ...rest }),
        };
    });

    const matched = results.filter((r) => r.matched);
    console.log(`\n${rows} rows scanned${malformed > 0 ? `, ${malformed} unparseable` : ""}`);
    console.log(`matched ${matched.length}/${results.length} songs`);
    for (const how of ["exact", "prefix"] as const) {
        console.log(`  by ${how}: ${matched.filter((r) => r.how === how).length}`);
    }
    for (const variant of VARIANTS) {
        const n = matched.filter((r) => r.variant === variant).length;
        if (n > 0) console.log(`  via ${variant}: ${n}`);
    }

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, `${JSON.stringify({ songs: results }, null, 2)}\n`, "utf8");
    console.log(`Wrote ${values.out}`);
}

// Guarded so that `combinedLookup` can be imported and exercised without the import
// kicking off a scan of a seven-gigabyte file.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
