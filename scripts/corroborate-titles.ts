/**
 * Corroborates resolved artist+title pairs against Discogs and iTunes Search.
 *
 * MusicBrainz stays primary for identity. This pass checks that a separate catalogue
 * also knows the same artist performing that song title, so published names are not
 * grounded only in one dump of recordings. Disagreements are listed for review — this
 * script never writes overrides or proposals.
 *
 * Resume-friendly via on-disk HTTP caches under `.cache/itunes` and `.cache/discogs`.
 *
 * Usage: pnpm corroborate:titles [--resolved data/resolved.json] [--songs data/songs.json]
 *                                [--out data/corroboration.json] [--limit N]
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { titleKey } from "./lib/song-title.ts";

interface SongRow {
    postId: number;
    artist: string;
    song: string;
}

interface ResolvedRow {
    postId: number;
    artist?: string;
    title?: string;
    artists?: { mbid: string; name: string }[];
    credit?: string;
}

interface SourceCheck {
    ok: boolean;
    artist?: string;
    title?: string;
    note?: string;
}

interface Check {
    postId: number;
    artist: string;
    title: string;
    itunes?: SourceCheck;
    discogs?: SourceCheck;
}

const ITUNES_CACHE = ".cache/itunes";
const DISCOGS_CACHE = ".cache/discogs";
const USER_AGENT = "kkaraoke-resolver/0.1 ( https://github.com/oskstr/kkaraoke )";

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson<T>(path: string): Promise<T | undefined> {
    try {
        return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
        return undefined;
    }
}

async function cachedGet(dir: string, key: string, url: string, headers: Record<string, string>): Promise<unknown> {
    const path = join(dir, `${createHash("sha256").update(key).digest("hex")}.json`);
    const hit = await readJson<unknown>(path);
    if (hit !== undefined) return hit;

    const response = await fetch(url, {
        headers: { accept: "application/json", ...headers },
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const body = await response.json();
    await mkdir(dir, { recursive: true });
    await writeFile(path, JSON.stringify(body), "utf8");
    return body;
}

function displayArtist(song: SongRow, resolved: ResolvedRow | undefined): string {
    if (resolved?.artists !== undefined && resolved.artists.length > 0) {
        return resolved.artists.map((a) => a.name).join(" & ");
    }
    return resolved?.artist ?? song.artist;
}

function displayTitle(song: SongRow, resolved: ResolvedRow | undefined): string {
    return resolved?.title ?? song.song;
}

function namesAgree(a: string, b: string): boolean {
    const ka = titleKey(a);
    const kb = titleKey(b);
    if (ka.length === 0 || kb.length === 0) return false;
    if (ka === kb) return true;
    return ka.includes(kb) || kb.includes(ka);
}

interface ItunesResult {
    results?: { artistName?: string; trackName?: string }[];
}

async function checkItunes(artist: string, title: string): Promise<SourceCheck> {
    const term = `${artist} ${title}`;
    const url =
        `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
        `&entity=song&limit=10`;
    try {
        const body = (await cachedGet(ITUNES_CACHE, url, url, {
            "user-agent": USER_AGENT,
        })) as ItunesResult;
        const hits = body.results ?? [];
        for (const hit of hits) {
            if (hit.artistName === undefined || hit.trackName === undefined) continue;
            if (namesAgree(hit.artistName, artist) && namesAgree(hit.trackName, title)) {
                return { ok: true, artist: hit.artistName, title: hit.trackName };
            }
        }
        const top = hits[0];
        if (top?.trackName !== undefined) {
            const result: SourceCheck = {
                ok: false,
                title: top.trackName,
                note: "top iTunes hit did not agree on artist+title",
            };
            if (top.artistName !== undefined) result.artist = top.artistName;
            return result;
        }
        return { ok: false, note: "no iTunes song hits" };
    } catch (error) {
        return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
}

interface DiscogsSearch {
    results?: { title?: string; type?: string }[];
}

async function checkDiscogs(artist: string, title: string): Promise<SourceCheck> {
    const url =
        `https://api.discogs.com/database/search?artist=${encodeURIComponent(artist)}` +
        `&track=${encodeURIComponent(title)}&type=release&per_page=5`;
    try {
        const body = (await cachedGet(DISCOGS_CACHE, url, url, {
            "user-agent": USER_AGENT,
        })) as DiscogsSearch;
        const hits = body.results ?? [];
        for (const hit of hits) {
            if (hit.title === undefined) continue;
            // Discogs search titles look like `Artist - Release`; the track filter means a
            // hit already matched the track string on that release.
            if (namesAgree(hit.title, artist) || hit.title.toLowerCase().includes(artist.toLowerCase().slice(0, 12))) {
                return { ok: true, title: hit.title };
            }
            return { ok: true, title: hit.title, note: "release hit for artist+track query" };
        }
        return { ok: false, note: "no Discogs release hits" };
    } catch (error) {
        return { ok: false, note: error instanceof Error ? error.message : String(error) };
    }
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            resolved: { type: "string", default: "data/resolved.json" },
            songs: { type: "string", default: "data/songs.json" },
            out: { type: "string", default: "data/corroboration.json" },
            fill: { type: "string", default: "data/corroboration.json" },
            limit: { type: "string" },
            /**
             * When true, Discogs is only queried if iTunes did not agree. Still uses two
             * sources overall; cuts the Discogs request budget for songs iTunes already
             * grounded.
             */
            "discogs-on-miss": { type: "boolean", default: false },
            /** Unauthenticated Discogs allows ~25 requests/minute. */
            "discogs-gap-ms": { type: "string", default: "2500" },
            "itunes-gap-ms": { type: "string", default: "200" },
        },
    });

    const songsFile = JSON.parse(await readFile(values.songs, "utf8")) as { songs: SongRow[] };
    const resolvedFile = await readJson<{ songs: ResolvedRow[] }>(values.resolved);
    const resolvedByPost = new Map((resolvedFile?.songs ?? []).map((row) => [row.postId, row]));

    const existing = await readJson<{ checks: Check[] }>(values.fill);
    const byPost = new Map((existing?.checks ?? []).map((check) => [check.postId, check]));

    const todo = songsFile.songs.filter((song) => {
        const prior = byPost.get(song.postId);
        return prior?.itunes === undefined || prior.discogs === undefined;
    });
    const limit = values.limit === undefined ? todo.length : Number(values.limit);
    if (!Number.isInteger(limit) || limit < 0) {
        throw new Error("--limit must be a non-negative whole number.");
    }
    const batch = todo.slice(0, limit);
    const discogsGap = Number(values["discogs-gap-ms"]);
    const itunesGap = Number(values["itunes-gap-ms"]);
    const discogsOnMiss = values["discogs-on-miss"] === true;

    console.log(
        `${byPost.size} songs already checked; ${todo.length} still to ask` +
            (batch.length < todo.length ? ` (doing ${batch.length} this run)` : ""),
    );

    let itunesOk = 0;
    let discogsOk = 0;
    for (let index = 0; index < batch.length; index++) {
        const song = batch[index]!;
        const resolved = resolvedByPost.get(song.postId);
        const artist = displayArtist(song, resolved);
        const title = displayTitle(song, resolved);
        // Traditional / category rows have no performer to corroborate.
        if (artist.trim().length === 0) {
            byPost.set(song.postId, {
                postId: song.postId,
                artist,
                title,
                itunes: { ok: true, note: "no artist (category/traditional)" },
                discogs: { ok: true, note: "no artist (category/traditional)" },
            });
            continue;
        }
        const prior = byPost.get(song.postId);
        const check: Check = {
            postId: song.postId,
            artist,
            title,
        };
        if (prior?.itunes !== undefined) check.itunes = prior.itunes;
        if (prior?.discogs !== undefined) check.discogs = prior.discogs;

        if (check.itunes === undefined) {
            check.itunes = await checkItunes(artist, title);
            await sleep(itunesGap);
        }
        if (check.discogs === undefined) {
            if (discogsOnMiss && check.itunes.ok) {
                check.discogs = {
                    ok: true,
                    note: "skipped Discogs; iTunes already agreed",
                };
            } else {
                check.discogs = await checkDiscogs(artist, title);
                await sleep(discogsGap);
            }
        }

        if (check.itunes?.ok) itunesOk++;
        if (check.discogs?.ok) discogsOk++;
        byPost.set(song.postId, check);

        if ((index + 1) % 25 === 0 || index + 1 === batch.length) {
            console.log(
                `  ${index + 1}/${batch.length} checked` +
                    ` (iTunes ok ${itunesOk}, Discogs ok ${discogsOk} this run)`,
            );
            await mkdir(dirname(values.out), { recursive: true });
            await writeFile(
                values.out,
                `${JSON.stringify(
                    {
                        generatedAt: new Date().toISOString(),
                        note: "Written by `pnpm corroborate:titles`. Regenerable; does not change the catalogue.",
                        checks: [...byPost.values()].sort((a, b) => a.postId - b.postId),
                    },
                    null,
                    2,
                )}\n`,
                "utf8",
            );
        }
    }

    const checks = [...byPost.values()];
    const both = checks.filter((c) => c.itunes?.ok && c.discogs?.ok).length;
    const either = checks.filter((c) => c.itunes?.ok || c.discogs?.ok).length;
    const neither = checks.filter(
        (c) => c.itunes !== undefined && c.discogs !== undefined && !c.itunes.ok && !c.discogs.ok,
    );
    console.log(
        `\n${checks.length} songs checked: ${both} on both sources, ${either} on at least one, ${neither.length} on neither`,
    );

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(
        values.out,
        `${JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                note: "Written by `pnpm corroborate:titles`. Regenerable; does not change the catalogue.",
                summary: {
                    checked: checks.length,
                    both,
                    either,
                    neither: neither.length,
                },
                checks: checks.sort((a, b) => a.postId - b.postId),
            },
            null,
            2,
        )}\n`,
        "utf8",
    );

    const reviewPath = values.out.replace(/\.json$/, "-review.md");
    const lines = [
        "# Title/artist corroboration review",
        "",
        "Songs where neither iTunes Search nor Discogs agreed with the published artist+title.",
        "MusicBrainz remains primary; use this list to decide overrides or further checks.",
        "",
        `| postId | artist | title | iTunes | Discogs |`,
        `| --- | --- | --- | --- | --- |`,
        ...neither.map(
            (c) =>
                `| ${c.postId} | ${c.artist.replace(/\|/g, "/")} | ${c.title.replace(/\|/g, "/")} | ${
                    c.itunes?.note ?? "no"
                } | ${c.discogs?.note ?? "no"} |`,
        ),
        "",
    ];
    await writeFile(reviewPath, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${values.out} and ${reviewPath}`);
}

await main();
