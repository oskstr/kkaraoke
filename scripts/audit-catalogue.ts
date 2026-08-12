/**
 * Full-catalogue reasonableness checks on published titles and matched masters.
 *
 * Run after rematch/rebuild. Exits non-zero when pollution classes that should be empty
 * still have hits — so "done" is not a vibe check on a handful of examples.
 *
 * Usage: pnpm audit:catalogue
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface Song {
    postId: number;
    artist: string;
    song: string;
}

interface Resolved {
    postId: number;
    title?: string;
    artist?: string;
    artists?: { name: string }[];
    year?: number;
    how?: string;
}

interface Match {
    postId: number;
    matched?: boolean;
    trusted?: boolean;
    title?: string;
    recording?: string;
    release?: string;
    how?: string;
    artistCredit?: string;
}

const VERSION_PAREN =
    /\(([^)]*\b(?:remix|rmx|emix|blend|bootleg|thunderdub|edit|version|mix|dub|anthem|instrumental|karaoke|acoustic|live|demo|unplugged|radio|extended|fade|clean|dirty|super\s+clean)\b[^)]*)\)\s*$/i;
const LANGUAGE_VERSION =
    /\b(?:english|swedish|finnish|german|spanish|french|italian|norwegian|danish|dutch|portuguese)\s+version\b/i;
const SUBTITLE =
    /\b(?:are made of|looks like|call me by|part\s*\d|vols?\.?|volume|theme|aka)\b/i;
const REMIXER_SHAPE =
    /\([^)]*(?:'s|’s)\s+[^)]*(?:mix|remix|edit|version|dub|emix|anthem)[^)]*\)/i;
const YEAR_PAREN = /\((?:19|20)\d{2}\)\s*$/;
const LIVE_RELEASE =
    /\b(?:live|concert|unplugged|bootleg|radio city|madison square|wembley|mtv history|wildlife concert|jerusalem concert|montreux|bogart|royal albert|permission to dance|live usa|firefest)\b/i;

async function main(): Promise<void> {
    const songs = (JSON.parse(await readFile("data/songs.json", "utf8")) as { songs: Song[] }).songs;
    const resolved = (
        JSON.parse(await readFile("data/resolved.json", "utf8")) as { songs: Resolved[] }
    ).songs;
    const matches = (
        JSON.parse(await readFile("data/canonical-matches.json", "utf8")) as { songs: Match[] }
    ).songs;
    const byResolved = new Map(resolved.map((row) => [row.postId, row]));
    const byMatch = new Map(matches.map((row) => [row.postId, row]));

    type Hit = { postId: number; detail: string };
    const buckets = {
        bootlegMatch: [] as Hit[],
        versionParenPublished: [] as Hit[],
        remixerPublished: [] as Hit[],
        yearParenPublished: [] as Hit[],
        mashupRecording: [] as Hit[],
        liveRelease: [] as Hit[],
        untrusted: [] as Hit[],
    };

    for (const song of songs) {
        const match = byMatch.get(song.postId);
        if (match?.matched !== true) continue;
        const row = byResolved.get(song.postId);
        const title = row?.title ?? match.title ?? song.song;
        const artist =
            row?.artists?.map((part) => part.name).join(", ") ?? row?.artist ?? song.artist;
        const recording = match.recording ?? "";
        const release = match.release ?? "";
        const detail = `${artist} — ${title} | ${recording} | ${release} [${match.how}]`;

        if (/\bbootleg\b/i.test(recording) || /\bbootleg\b/i.test(release)) {
            buckets.bootlegMatch.push({ postId: song.postId, detail });
        }
        if (REMIXER_SHAPE.test(title)) {
            buckets.remixerPublished.push({ postId: song.postId, detail });
        }
        if (YEAR_PAREN.test(title)) {
            buckets.yearParenPublished.push({ postId: song.postId, detail });
        }
        if (
            VERSION_PAREN.test(title) &&
            !LANGUAGE_VERSION.test(title) &&
            !SUBTITLE.test(title)
        ) {
            buckets.versionParenPublished.push({ postId: song.postId, detail });
        }
        if (/\bvs\.?\b/i.test(recording)) {
            buckets.mashupRecording.push({ postId: song.postId, detail });
        }
        if (
            LIVE_RELEASE.test(release) ||
            /\(.*\blive\b.*\)/i.test(recording) ||
            /-\s*Live\s*$/i.test(recording)
        ) {
            buckets.liveRelease.push({ postId: song.postId, detail });
        }
        if (match.trusted === false) {
            buckets.untrusted.push({ postId: song.postId, detail });
        }
    }

    // These must be empty — pollution we claim to have fixed catalogue-wide.
    const mustBeEmpty = [
        "bootlegMatch",
        "versionParenPublished",
        "remixerPublished",
        "yearParenPublished",
        "mashupRecording",
    ] as const;

    console.log(`Audited ${songs.length} songs (${matches.filter((m) => m.matched).length} matched)`);
    for (const [name, rows] of Object.entries(buckets)) {
        console.log(`\n=== ${name}: ${rows.length} ===`);
        for (const row of rows.slice(0, 25)) {
            console.log(`  ${row.postId}: ${row.detail}`);
        }
        if (rows.length > 25) console.log(`  ... +${rows.length - 25} more`);
    }

    const failures = mustBeEmpty.filter((name) => buckets[name]!.length > 0);
    if (failures.length > 0) {
        console.error(`\nFAIL: non-empty pollution buckets: ${failures.join(", ")}`);
        process.exitCode = 1;
        return;
    }
    console.log("\nOK: required pollution buckets are empty.");
    console.log(
        `Note: ${buckets.liveRelease.length} live-release matches remain (dump may lack studio cuts).`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    });
}
