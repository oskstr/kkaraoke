/**
 * Works out when each matched song first came out.
 *
 * The obvious source is the matched recording's own first release date, and it is wrong
 * often enough to be useless: the canonical dump picks whichever recording its scoring
 * liked, which for `Girls and Boys` is a 2000 reissue and for `No Scrub` a 2013
 * compilation. Asking the recording gives the age of that particular master, not of the
 * song.
 *
 * So this asks the other question — what is the earliest release of this title by this
 * artist — by searching for the artist and title together and taking the earliest date
 * among the recordings whose title is exactly the song. That last filter is what excludes
 * the remixes, live takes and extended mixes; they are separate recordings with longer
 * titles, and including them is how a 2019 live version becomes a song's release year.
 *
 * Several artist-and-title pairs go into one query, because a request per song would take
 * hours against a per-IP rate limit. Not too many: the search returns a hundred
 * relevance-ranked results whatever it is asked, and a popular song alone can match
 * several hundred, so a large batch crowds its own members out.
 *
 * Usage: pnpm fetch:recordings [--matches <file>] [--out data/recordings.json] [--pairs 5]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { combinedLookup } from "./match-canonical.ts";
import { mbGet, requestStats } from "./lib/musicbrainz.ts";
import type { Artist } from "./fetch-artists.ts";

interface Hit {
    id: string;
    title: string;
    "first-release-date"?: string;
    "artist-credit"?: { artist?: { id: string } }[];
}

interface Pair {
    recordingMbid: string;
    artistMbid: string;
    title: string;
    titleKey: string;
}

export interface Recording {
    recordingMbid: string;
    /** Earliest release date of this title by this artist, as MusicBrainz has it. */
    firstReleased: string;
    year: number;
    /** How many recordings of the title agreed it exists, as a rough confidence signal. */
    seen: number;
}

/** Anything outside this is a typo in the data rather than a release date. */
const EARLIEST_PLAUSIBLE = 1890;

const lucene = (value: string): string => value.replace(/["\\]/g, " ").trim();

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
            out: { type: "string", default: "data/recordings.json" },
            pairs: { type: "string", default: "5" },
            limit: { type: "string" },
            fill: { type: "string", default: "data/recordings.json" },
        },
    });
    const perQuery = Number(values.pairs);
    if (!Number.isInteger(perQuery) || perQuery < 1) {
        throw new Error("--pairs must be a whole number of at least 1.");
    }

    const matches = JSON.parse(await readFile(values.matches, "utf8")) as {
        songs: {
            matched: boolean;
            trusted?: boolean;
            recording?: string;
            title?: string;
            recordingMbid?: string;
            artistMbids?: string[];
        }[];
    };
    const artistFile = JSON.parse(await readFile(values.artists, "utf8")) as { artists: Artist[] };
    const artists = new Map(artistFile.artists.map((artist) => [artist.mbid, artist]));

    // One pair per recording: several songs can share a recording, and asking twice about
    // the same one would only spend requests to get the same answer.
    const pairs = new Map<string, Pair>();
    for (const song of matches.songs) {
        if (!song.matched || song.trusted !== true) continue;
        const [artistMbid] = song.artistMbids ?? [];
        // The published title, not the matched master's: searching for the club mix by name
        // dates the club mix, which is the error this whole script exists to avoid.
        const recording = song.title ?? song.recording;
        const { recordingMbid } = song;
        if (artistMbid === undefined || recording === undefined || recordingMbid === undefined) continue;
        if (pairs.has(recordingMbid)) continue;
        const titleKey = combinedLookup(recording);
        if (titleKey.length === 0) continue;
        pairs.set(recordingMbid, { recordingMbid, artistMbid, title: recording, titleKey });
    }

    // Batching trades coverage for requests, and not linearly: five pairs to a query
    // leaves 45% of them crowded out of the hundred relevance-ranked results, but still
    // dates 2.75 recordings per request against one pair's 1.0. So the way to spend a
    // limited request budget is a wide pass first and then narrower passes over what it
    // missed, which is what --fill resumes from.
    const already = new Map<string, Recording>(
        ((await readJson<{ recordings: Recording[] }>(values.fill))?.recordings ?? []).map((recording) => [
            recording.recordingMbid,
            recording,
        ]),
    );
    if (already.size > 0) {
        console.log(`filling in from ${values.fill}, which already dates ${already.size}`);
        for (const mbid of already.keys()) pairs.delete(mbid);
    }

    const queue = [...pairs.values()].slice(0, values.limit === undefined ? undefined : Number(values.limit));
    const batches = Math.ceil(queue.length / perQuery);
    console.log(`${queue.length} recordings in ${batches} batches of ${perQuery}`);

    const found = new Map<string, Recording>(already);
    const startedAt = Date.now();

    for (let index = 0; index < queue.length; index += perQuery) {
        const batch = queue.slice(index, index + perQuery);
        const query = batch
            .map((pair) => `(arid:${pair.artistMbid} AND recording:"${lucene(pair.title)}")`)
            .join(" OR ");

        let hits: Hit[];
        try {
            hits =
                (await mbGet<{ recordings?: Hit[] }>(`recording?query=${encodeURIComponent(query)}&limit=100`))
                    .recordings ?? [];
        } catch (error) {
            console.warn(`  batch at ${index} failed: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }

        for (const pair of batch) {
            const floor = Number((artists.get(pair.artistMbid)?.began ?? "").slice(0, 4)) || EARLIEST_PLAUSIBLE;
            let earliest: string | undefined;
            let seen = 0;
            for (const hit of hits) {
                // Exactly this title, by this artist. A superset title is a different
                // recording of a different thing, however similar it looks.
                if (combinedLookup(hit.title) !== pair.titleKey) continue;
                if (!(hit["artist-credit"] ?? []).some((credit) => credit.artist?.id === pair.artistMbid)) continue;
                seen++;
                const date = hit["first-release-date"];
                if (date === undefined) continue;
                const year = Number(date.slice(0, 4));
                // A recording cannot predate the artist, so a date that does is evidence
                // about MusicBrainz's data rather than about the song.
                if (!Number.isFinite(year) || year < floor) continue;
                if (earliest === undefined || date < earliest) earliest = date;
            }
            if (earliest !== undefined) {
                found.set(pair.recordingMbid, {
                    recordingMbid: pair.recordingMbid,
                    firstReleased: earliest,
                    year: Number(earliest.slice(0, 4)),
                    seen,
                });
            }
        }

        const done = Math.min(index + perQuery, queue.length);
        if (done % (perQuery * 20) === 0 || done === queue.length) {
            const elapsed = (Date.now() - startedAt) / 1000;
            const remaining = ((elapsed / done) * (queue.length - done)) / 60;
            const { retried } = requestStats();
            console.log(
                `  ${done}/${queue.length} pairs, ${found.size} dated, ${retried} retried, ${remaining.toFixed(0)} min left`,
            );
        }
    }

    const years = [...found.values()].map((recording) => recording.year).sort((a, b) => a - b);
    console.log(`\ndated ${found.size}/${queue.length + already.size} recordings`);
    if (years.length > 0) {
        const at = (fraction: number): number => years[Math.floor(years.length * fraction)] ?? 0;
        console.log(
            `  years ${years[0]}–${years[years.length - 1]}, median ${at(0.5)}, quartiles ${at(0.25)}/${at(0.75)}`,
        );
    }

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, `${JSON.stringify({ recordings: [...found.values()] }, null, 2)}\n`, "utf8");
    console.log(`Wrote ${values.out}`);
}

await main();
