/**
 * Composes the machine-resolved layer the site reads, from the offline match and the
 * artist lookups.
 *
 * This is the only writer of `data/resolved.json`. It is fully regenerable and safe to
 * delete: the scrape it corrects is in `data/songs.json`, and anything a human decides
 * belongs in `data/overrides.json`, which no script ever writes.
 *
 * Only trustworthy matches are applied. Everything else is listed under `review` with the
 * correction it would have made, so that a wrong guess is something someone chose rather
 * than something that quietly shipped.
 *
 * Usage: pnpm build:resolved [--matches <file>] [--artists <file>] [--out data/resolved.json]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import type { Artist } from "./fetch-artists.ts";
import type { Recording } from "./fetch-recordings.ts";

interface MatchRecord {
    postId: number;
    id: number;
    artist: string;
    song: string;
    matched: boolean;
    trusted?: boolean;
    placeholder?: boolean;
    how?: string;
    variant?: string;
    artistCredit?: string;
    artistMbids?: string[];
    recording?: string;
    recordingMbid?: string;
}

interface Resolved {
    /** The scrape's key, since a song's punch-in number is the likelier of the two to move. */
    postId: number;
    /** Display name for the artist, canonical where a lookup provided one. */
    artist?: string;
    /** What to sort under, so that The Beatles files under B. */
    sortAs?: string;
    title?: string;
    artistMbids?: string[];
    recordingMbid?: string;
    genres?: string[];
    /** Earliest release of this title by this artist, which is not the same as the master's date. */
    year?: number;
    how?: string;
}

/**
 * Genres are user tags, so a long tail of one-vote suggestions comes with them. Two votes
 * is enough to drop the noise while keeping the genres an artist is actually known for.
 */
const MIN_GENRE_VOTES = 2;
const MAX_GENRES = 3;

async function readJson<T>(path: string): Promise<T | undefined> {
    try {
        return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
        return undefined;
    }
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            matches: { type: "string", default: "data/canonical-matches.json" },
            artists: { type: "string", default: "data/artists.json" },
            recordings: { type: "string", default: "data/recordings.json" },
            out: { type: "string", default: "data/resolved.json" },
        },
    });

    const matches = await readJson<{ songs: MatchRecord[] }>(values.matches);
    if (matches === undefined) {
        throw new Error(`Could not read ${values.matches}. Run \`pnpm match:canonical\` first.`);
    }
    // Enrichment is optional so that the titles can be applied before the artist lookups,
    // which take an hour, have finished.
    const artistFile = await readJson<{ artists: Artist[] }>(values.artists);
    const artists = new Map((artistFile?.artists ?? []).map((artist) => [artist.mbid, artist]));
    if (artistFile === undefined) {
        console.warn(`No ${values.artists} yet, so artist names and genres will be left alone.`);
    }

    // An array rather than an object keyed by id: five thousand keys in a JSON module
    // makes TypeScript infer five thousand properties, and the site can build its own map.
    const recordingFile = await readJson<{ recordings: Recording[] }>(values.recordings);
    const years = new Map((recordingFile?.recordings ?? []).map((r) => [r.recordingMbid, r.year]));
    if (recordingFile === undefined) {
        console.warn(`No ${values.recordings} yet, so songs will have no year.`);
    }

    const songs: Resolved[] = [];
    const review: {
        postId: number;
        id: number;
        artist: string;
        song: string;
        reason: string;
        suggestion?: string;
    }[] = [];

    let titleFixes = 0;
    let artistFixes = 0;
    let genreCount = 0;
    let yearCount = 0;

    for (const match of matches.songs) {
        if (!match.matched) {
            review.push({ ...pick(match), reason: "no match in the canonical dump" });
            continue;
        }
        if (match.trusted !== true) {
            review.push({
                ...pick(match),
                reason: match.placeholder === true ? "matched a placeholder entity" : `weak match (${match.how})`,
                ...(match.recording === undefined ? {} : { suggestion: `${match.artistCredit} – ${match.recording}` }),
            });
            continue;
        }

        const mbids = match.artistMbids ?? [];
        const credited = mbids.map((mbid) => artists.get(mbid)).filter((artist) => artist !== undefined);
        const lead = credited[0];

        // A single credited artist gets the canonical name from its own lookup, because
        // the dump's credit is whatever the matched release printed. A collaboration keeps
        // the release's credit line, which reads better than joining names and preserves
        // the "feat." that tells a guest apart from a duet.
        const canonical = mbids.length === 1 && lead !== undefined ? lead.name : match.artistCredit;

        // MusicBrainz files songs with no identifiable performer under placeholder
        // entities named in brackets, such as [Disney] and [traditional]. The id is real
        // and the title behind it is usually right, but it does not name an artist, so the
        // venue's own string is the better one to show and to sort under.
        const anonymous = canonical !== undefined && /^\[.*\]$/.test(canonical);
        if (anonymous) {
            review.push({ ...pick(match), reason: `MusicBrainz files this under ${canonical}, a placeholder` });
        }

        const resolved: Resolved = { postId: match.postId };
        if (!anonymous && canonical !== undefined && canonical !== match.artist) {
            resolved.artist = canonical;
            artistFixes++;
        }
        // Sorting follows the lead artist so that a collaboration files under whoever is
        // credited first rather than under the whole credit line.
        if (!anonymous && lead?.sortName !== undefined) {
            resolved.sortAs = lead.sortName;
        }
        if (match.recording !== undefined && match.recording !== match.song) {
            resolved.title = match.recording;
            titleFixes++;
        }
        if (mbids.length > 0) resolved.artistMbids = mbids;
        if (match.recordingMbid !== undefined) resolved.recordingMbid = match.recordingMbid;

        const genres = (lead?.genres ?? [])
            .filter((genre) => genre.count >= MIN_GENRE_VOTES)
            .slice(0, MAX_GENRES)
            .map((genre) => genre.name);
        if (genres.length > 0) {
            resolved.genres = genres;
            genreCount++;
        }
        const year = match.recordingMbid === undefined ? undefined : years.get(match.recordingMbid);
        if (year !== undefined) {
            resolved.year = year;
            yearCount++;
        }
        if (match.how !== undefined) resolved.how = match.how;

        songs.push(resolved);
    }

    const total = matches.songs.length;
    console.log(`${songs.length}/${total} songs resolved, ${review.length} left for review`);
    console.log(`  titles corrected: ${titleFixes}`);
    console.log(`  artist names corrected: ${artistFixes}`);
    console.log(`  songs with a genre: ${genreCount}`);
    console.log(`  songs with a year: ${yearCount}`);

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(
        values.out,
        `${JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                note: "Written by `pnpm build:resolved`. Regenerable; hand edits belong in data/overrides.json.",
                songs,
                review,
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
    console.log(`Wrote ${values.out}`);
}

function pick(match: MatchRecord): { postId: number; id: number; artist: string; song: string } {
    return { postId: match.postId, id: match.id, artist: match.artist, song: match.song };
}

await main();
