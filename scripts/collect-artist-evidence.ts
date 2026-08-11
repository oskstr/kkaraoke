/**
 * Gathers the MusicBrainz evidence needed to decide who an artist string refers to,
 * and writes it to a file for something else to judge.
 *
 * Fetching and judging are deliberately separate. The request budget is fixed by
 * MusicBrainz's per-IP rate limit, so it belongs to one process, while the judgement
 * can then be re-run over the same cached evidence by any number of models for free.
 *
 * Usage: pnpm collect:evidence --artists <file> [--out <file>] [--candidates 3] [--titles 3]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import catalogue from "../data/songs.json" with { type: "json" };
import { requestStats, searchArtists, searchRecordingForArtist, searchRecordings } from "./lib/musicbrainz.ts";
import type { ArtistHit, RecordingHit } from "./lib/musicbrainz.ts";

interface TitleCheck {
    title: string;
    found: boolean;
    canonicalTitle?: string;
    score?: number;
    firstReleaseDate?: string;
    /**
     * The search matches supersets of the title, so a hit is not proof: asking for
     * "Please don't go" returns "Baby Please Don’t Go", which would otherwise look
     * like corroboration of a completely unrelated artist.
     */
    looseMatch?: boolean;
}

interface Candidate {
    mbid: string;
    name: string;
    score?: number;
    type?: string;
    disambiguation?: string;
    country?: string;
    began?: string;
    aliases?: string[];
    /**
     * MusicBrainz placeholder entities such as `[Disney]` and `[traditional]`. They
     * score 100 against the strings that are category labels and even collect title
     * hits, so resolving to one would look like success while meaning nothing.
     */
    specialPurpose?: boolean;
    /**
     * Tribute and covers acts have recorded the same songs, so title checks alone do
     * not separate them from the original — `AC/DC UK` matches all three AC/DC titles.
     */
    likelyTributeOrCover?: boolean;
    /** Does this candidate actually have the songs the venue files under this name? */
    titleChecks: TitleCheck[];
}

interface TitleOnlyHit {
    title: string;
    artists: string;
    firstReleaseDate?: string;
    score?: number;
}

interface ArtistEvidence {
    artist: string;
    songCount: number;
    songs: { id: number; song: string }[];
    sampledTitles: string[];
    candidates: Candidate[];
    /**
     * Candidates for each fragment of a string that looks like it might name more than
     * one artist. Generated mechanically by splitting on separators, which is wrong as
     * often as it is right — `Adam & The Ants` splits into two fragments and is one
     * band. It is here so that whatever judges this evidence has ids available if the
     * string really is a collaboration, not as a suggestion that it is one.
     */
    splitFragments?: { fragment: string; candidates: Candidate[] }[];
    /**
     * Fallback for strings that are category labels, where there is no artist to scope
     * by. Collected only when no candidate cleanly has the venue's songs: once one
     * does, this adds nothing but a list of other people who covered them, and it is
     * three of the eleven requests an artist costs.
     */
    titleOnly?: { title: string; hits: TitleOnlyHit[] }[];
}

/** Deliberately greedy: over-splitting is harmless here, missing a real split is not. */
const SEPARATORS = /\s*(?:&|,|\/|\bfeat\b\.?|\bft\b\.?|\band\b|\boch\b|\bmed\b|\bvs\b\.?|\bwith\b)\s*/gi;

function fragmentsOf(artist: string): string[] {
    const parts = artist
        .split(SEPARATORS)
        .map((part) => part.trim())
        .filter((part) => part.length > 1);
    return parts.length > 1 ? [...new Set(parts)] : [];
}

const credited = (hit: RecordingHit): string =>
    (hit["artist-credit"] ?? []).map((credit) => credit.name).join(", ") || "(uncredited)";

/** Punctuation and case only, so that "LA woman" and "L.A. Woman" count as the same title. */
const compare = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

function isLooseMatch(asked: string, got: string): boolean {
    const [a, b] = [compare(asked), compare(got)];
    return a !== b && !b.startsWith(a);
}

async function checkTitle(title: string, arid: string): Promise<TitleCheck> {
    const top = ((await searchRecordingForArtist(title, arid)).recordings ?? [])[0];
    const check: TitleCheck = { title, found: top !== undefined };
    if (top) {
        check.canonicalTitle = top.title;
        if (top.score !== undefined) check.score = top.score;
        const date = top["first-release-date"];
        if (date !== undefined) check.firstReleaseDate = date;
        if (isLooseMatch(title, top.title)) check.looseMatch = true;
    }
    return check;
}

function toCandidate(hit: ArtistHit): Omit<Candidate, "titleChecks"> {
    const candidate: Omit<Candidate, "titleChecks"> = { mbid: hit.id, name: hit.name };
    if (hit.score !== undefined) candidate.score = hit.score;
    if (hit.type !== undefined) candidate.type = hit.type;
    if (hit.disambiguation) candidate.disambiguation = hit.disambiguation;
    if (hit.country !== undefined) candidate.country = hit.country;
    const began = hit["life-span"]?.begin;
    if (began !== undefined) candidate.began = began;
    const aliases = (hit.aliases ?? []).map((alias) => alias.name);
    if (aliases.length > 0) candidate.aliases = [...new Set(aliases)];
    if (/^\[.*\]$/.test(hit.name)) candidate.specialPurpose = true;
    if (/\b(tribute|cover band|covers band|karaoke)\b/i.test(hit.disambiguation ?? "")) {
        candidate.likelyTributeOrCover = true;
    }
    return candidate;
}

async function collect(artist: string, maxCandidates: number, maxTitles: number): Promise<ArtistEvidence> {
    const songs = catalogue.songs
        .filter((song) => song.artist === artist)
        .map((song) => ({ id: song.id, song: song.song }));
    if (songs.length === 0) {
        throw new Error(`No songs in the catalogue are filed under ${JSON.stringify(artist)}.`);
    }

    // Deterministic sample, so a re-run hits the cache instead of the network.
    const sampledTitles = songs.slice(0, maxTitles).map((song) => song.song);

    const hits = (await searchArtists(artist, 5)).artists ?? [];
    const candidates: Candidate[] = [];
    for (const hit of hits.slice(0, maxCandidates)) {
        const titleChecks: TitleCheck[] = [];
        for (const title of sampledTitles) {
            titleChecks.push(await checkTitle(title, hit.id));
        }
        candidates.push({ ...toCandidate(hit), titleChecks });
    }

    const splitFragments: NonNullable<ArtistEvidence["splitFragments"]> = [];
    for (const fragment of fragmentsOf(artist)) {
        const found = (await searchArtists(fragment, 3)).artists ?? [];
        const fragmentCandidates: Candidate[] = [];
        for (const hit of found.slice(0, 2)) {
            // One title is enough here: everyone credited on a collaboration should have
            // the song, and a fragment that has none is a sign the string was not a
            // collaboration in the first place.
            const first = sampledTitles[0];
            const titleChecks = first === undefined ? [] : [await checkTitle(first, hit.id)];
            fragmentCandidates.push({ ...toCandidate(hit), titleChecks });
        }
        splitFragments.push({ fragment, candidates: fragmentCandidates });
    }

    // A placeholder entity or a tribute act having the songs proves nothing about who
    // the venue meant, so neither counts as corroboration and neither may suppress the
    // title-only fallback — `[Disney]` matches two Disney titles and is not an artist.
    const corroborated = candidates.some(
        (candidate) =>
            candidate.specialPurpose !== true &&
            candidate.likelyTributeOrCover !== true &&
            candidate.titleChecks.some((check) => check.found && check.looseMatch !== true),
    );

    const evidence: ArtistEvidence = { artist, songCount: songs.length, songs, sampledTitles, candidates };
    if (splitFragments.length > 0) {
        evidence.splitFragments = splitFragments;
    }

    if (!corroborated) {
        const titleOnly: NonNullable<ArtistEvidence["titleOnly"]> = [];
        for (const title of sampledTitles) {
            const found = (await searchRecordings(title, 5)).recordings ?? [];
            titleOnly.push({
                title,
                hits: found.map((hit) => {
                    const entry: TitleOnlyHit = { title: hit.title, artists: credited(hit) };
                    const date = hit["first-release-date"];
                    if (date !== undefined) entry.firstReleaseDate = date;
                    if (hit.score !== undefined) entry.score = hit.score;
                    return entry;
                }),
            });
        }
        evidence.titleOnly = titleOnly;
    }
    return evidence;
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            artists: { type: "string" },
            out: { type: "string", default: "data/pilot/artist-evidence.json" },
            candidates: { type: "string", default: "3" },
            titles: { type: "string", default: "3" },
        },
    });

    if (values.artists === undefined) {
        throw new Error("--artists <file> is required: one artist string per line, as it appears in the catalogue.");
    }
    const maxCandidates = Number(values.candidates);
    const maxTitles = Number(values.titles);
    for (const [name, value] of [
        ["--candidates", maxCandidates],
        ["--titles", maxTitles],
    ] as const) {
        if (!Number.isInteger(value) || value < 1) {
            throw new Error(`${name} must be a whole number of at least 1.`);
        }
    }

    const wanted = (await readFile(values.artists, "utf8"))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));

    const evidence: ArtistEvidence[] = [];
    for (const [index, artist] of wanted.entries()) {
        evidence.push(await collect(artist, maxCandidates, maxTitles));
        const { fetched, served } = requestStats();
        console.log(`  ${index + 1}/${wanted.length} ${artist} (${fetched} fetched, ${served} cached)`);
    }

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, `${JSON.stringify({ artists: evidence }, null, 2)}\n`, "utf8");
    const { fetched, served } = requestStats();
    console.log(
        `Wrote evidence for ${evidence.length} artists to ${values.out} (${fetched} fetched, ${served} cached)`,
    );
}

await main();
