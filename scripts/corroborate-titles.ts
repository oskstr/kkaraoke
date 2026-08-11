/**
 * Corroborates resolved artist+title pairs against Discogs and Deezer.
 *
 * MusicBrainz stays primary for identity. This pass checks that a separate catalogue
 * also knows the same artist performing that song title, so published names are not
 * grounded only in one dump of recordings. Disagreements are listed for review — this
 * script never writes overrides or proposals.
 *
 * Resume-friendly via on-disk HTTP caches under `.cache/deezer` and `.cache/discogs`.
 *
 * Usage: pnpm corroborate:titles [--resolved data/resolved.json] [--songs data/songs.json]
 *                                [--out data/corroboration.json] [--limit N]
 *                                [--review-only]
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { titleKey, titlesCorroborate } from "./lib/song-title.ts";

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
    deezer?: SourceCheck;
    discogs?: SourceCheck;
}

/** Older corroboration files may still carry an `itunes` field. */
type LegacyCheck = Check & { itunes?: SourceCheck };

const DEEZER_CACHE = ".cache/deezer";
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

async function cachedGet(
    dir: string,
    key: string,
    url: string,
    headers: Record<string, string>,
): Promise<unknown> {
    const path = join(dir, `${createHash("sha256").update(key).digest("hex")}.json`);
    const hit = await readJson<unknown>(path);
    if (hit !== undefined) return hit;

    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= 6; attempt++) {
        const response = await fetch(url, {
            headers: { accept: "application/json", ...headers },
            signal: AbortSignal.timeout(30_000),
        });
        if (response.status === 429 || response.status === 403) {
            const retryAfter = Number(response.headers.get("retry-after"));
            const wait =
                Number.isFinite(retryAfter) && retryAfter > 0
                    ? retryAfter * 1000
                    : Math.min(60_000, 2000 * 2 ** (attempt - 1));
            lastError = new Error(`HTTP ${response.status} for ${url}`);
            console.warn(`    rate limited (${response.status}), waiting ${wait}ms (attempt ${attempt})`);
            await sleep(wait);
            continue;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} for ${url}`);
        }
        const body = await response.json();
        await mkdir(dir, { recursive: true });
        await writeFile(path, JSON.stringify(body), "utf8");
        return body;
    }
    throw lastError ?? new Error(`Giving up on ${url}`);
}

function isRateLimited(check: SourceCheck | undefined): boolean {
    const note = check?.note ?? "";
    return /\bHTTP (?:403|429)\b/.test(note);
}

function displayArtist(
    song: SongRow,
    resolved: ResolvedRow | undefined,
    override: { artist?: string } | undefined,
): string {
    // An override that clears the artist (traditionals / categories) has no performer to check.
    if (override !== undefined && override.artist === "") return "";
    if (resolved?.artists !== undefined && resolved.artists.length > 0) {
        return resolved.artists.map((a) => a.name).join(" & ");
    }
    if (resolved?.artist !== undefined) return resolved.artist;
    if (override?.artist !== undefined) return override.artist;
    return song.artist;
}

function displayTitle(
    song: SongRow,
    resolved: ResolvedRow | undefined,
    override: { title?: string } | undefined,
): string {
    if (override?.title !== undefined) return override.title;
    return resolved?.title ?? song.song;
}

function namesAgree(a: string, b: string): boolean {
    const ka = titleKey(a);
    const kb = titleKey(b);
    if (ka.length === 0 || kb.length === 0) return false;
    if (ka === kb) return true;
    return ka.includes(kb) || kb.includes(ka);
}

interface DeezerResult {
    data?: { title?: string; artist?: { name?: string }; album?: { title?: string } }[];
}

function leadName(artist: string): string {
    return artist.split(/\s+(?:&|and|feat\.?|ft\.?|featuring|with|vs\.?)\s+/i)[0]?.trim() || artist;
}

/**
 * Streaming catalogues are full of karaoke/tribute rows that share the song title. Those are
 * not corroboration of our artist — skip them when picking a hit to compare.
 */
const KARAOKE_JUNK =
    /\b(?:karaoke|tribute|originally performed|made famous|made popular|in the style of|sing[- ]?along|backing track|midi(?:fine)?|party tyme|ameritz|stagesound)\b/i;

function isKaraokeJunk(artist: string, title: string, album?: string): boolean {
    return KARAOKE_JUNK.test(artist) || KARAOKE_JUNK.test(title) || (album !== undefined && KARAOKE_JUNK.test(album));
}

/** Title spellings worth trying when the dump/work form is not how Spotify/Deezer file it. */
function titleQueryVariants(title: string): string[] {
    const variants = [title];
    const you = title.replace(/\bU\b/g, "You");
    const u = title.replace(/\bYou\b/g, "U");
    const dropAnymore = title.replace(/\s+Anymore\s*$/i, "").trim();
    const youDrop = you.replace(/\s+Anymore\s*$/i, "").trim();
    for (const variant of [you, u, dropAnymore, youDrop]) {
        if (variant.length > 0 && !variants.includes(variant)) variants.push(variant);
    }
    return variants;
}

function artistMatches(hitArtist: string, artist: string, queryArtist: string): boolean {
    return namesAgree(hitArtist, artist) || namesAgree(hitArtist, queryArtist);
}

async function checkDeezer(artist: string, title: string): Promise<SourceCheck> {
    const artists = [artist, leadName(artist)].filter(
        (name, index, all) => name.length > 0 && all.indexOf(name) === index,
    );
    const titles = titleQueryVariants(title);
    /** Best non-karaoke miss — never report a karaoke cover as "what Deezer says". */
    let bestMiss: { artist?: string; title?: string } | undefined;

    const considerMiss = (hitArtist: string, hitTitle: string): void => {
        if (bestMiss !== undefined) return;
        bestMiss = { artist: hitArtist, title: hitTitle };
    };

    try {
        for (const queryArtist of artists) {
            for (const queryTitle of titles) {
                const q = `artist:"${queryArtist}" track:"${queryTitle}"`;
                const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`;
                const body = (await cachedGet(DEEZER_CACHE, url, url, {
                    "user-agent": USER_AGENT,
                })) as DeezerResult;
                for (const hit of body.data ?? []) {
                    const hitArtist = hit.artist?.name;
                    const hitTitle = hit.title;
                    if (hitArtist === undefined || hitTitle === undefined) continue;
                    if (isKaraokeJunk(hitArtist, hitTitle, hit.album?.title)) continue;
                    if (artistMatches(hitArtist, artist, queryArtist) && titlesCorroborate(hitTitle, title)) {
                        return { ok: true, artist: hitArtist, title: hitTitle };
                    }
                    considerMiss(hitArtist, hitTitle);
                }
            }
        }

        // Free-text fallback with the same junk filter and loose title match.
        for (const queryTitle of titles) {
            const fallbackUrl =
                `https://api.deezer.com/search?q=${encodeURIComponent(`${leadName(artist)} ${queryTitle}`)}` +
                `&limit=15`;
            const fallback = (await cachedGet(DEEZER_CACHE, fallbackUrl, fallbackUrl, {
                "user-agent": USER_AGENT,
            })) as DeezerResult;
            for (const hit of fallback.data ?? []) {
                const hitArtist = hit.artist?.name;
                const hitTitle = hit.title;
                if (hitArtist === undefined || hitTitle === undefined) continue;
                if (isKaraokeJunk(hitArtist, hitTitle, hit.album?.title)) continue;
                if (artistMatches(hitArtist, artist, leadName(artist)) && titlesCorroborate(hitTitle, title)) {
                    return { ok: true, artist: hitArtist, title: hitTitle };
                }
                considerMiss(hitArtist, hitTitle);
            }
        }

        if (bestMiss?.title !== undefined) {
            const result: SourceCheck = {
                ok: false,
                title: bestMiss.title,
                note: "best non-karaoke Deezer hit did not agree on artist+title",
            };
            if (bestMiss.artist !== undefined) result.artist = bestMiss.artist;
            return result;
        }
        return { ok: false, note: "no Deezer song hits" };
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
    const lockPath = ".cache/corroborate.lock";
    await mkdir(dirname(lockPath), { recursive: true });
    try {
        await writeFile(lockPath, `${process.pid}\n`, { flag: "wx" });
    } catch {
        throw new Error(
            `Another corroborate:titles run holds ${lockPath}. Remove that file if the other run is gone.`,
        );
    }
    const releaseLock = async (): Promise<void> => {
        try {
            await unlink(lockPath);
        } catch {
            /* ignore */
        }
    };

    try {
        await run();
    } finally {
        await releaseLock();
    }
}

async function run(): Promise<void> {
    const { values } = parseArgs({
        options: {
            resolved: { type: "string", default: "data/resolved.json" },
            songs: { type: "string", default: "data/songs.json" },
            overrides: { type: "string", default: "data/overrides.json" },
            out: { type: "string", default: "data/corroboration.json" },
            fill: { type: "string", default: "data/corroboration.json" },
            limit: { type: "string" },
            /**
             * When true, Discogs is only queried if Deezer did not agree. Still uses two
             * sources overall; cuts the Discogs request budget for songs Deezer already
             * grounded.
             */
            "discogs-on-miss": { type: "boolean", default: false },
            /** Unauthenticated Discogs allows ~25 requests/minute. */
            "discogs-gap-ms": { type: "string", default: "3000" },
            "deezer-gap-ms": { type: "string", default: "200" },
            /** Rewrite the review markdown from an existing corroboration.json — no network. */
            "review-only": { type: "boolean", default: false },
        },
    });

    if (values["review-only"] === true) {
        const existing = await readJson<{ checks: Check[] }>(values.fill);
        if (existing === undefined) {
            throw new Error(`No ${values.fill} to render.`);
        }
        const neither = existing.checks.filter(
            (c) =>
                c.deezer !== undefined &&
                c.discogs !== undefined &&
                !c.deezer.ok &&
                !c.discogs.ok &&
                !isRateLimited(c.deezer) &&
                !isRateLimited(c.discogs),
        );
        const reviewPath = values.out.replace(/\.json$/, "-review.md");
        await writeFile(reviewPath, formatCorroborationReview(neither), "utf8");
        console.log(`Wrote ${reviewPath} (${neither.length} songs)`);
        return;
    }

    const songsFile = JSON.parse(await readFile(values.songs, "utf8")) as { songs: SongRow[] };
    const resolvedFile = await readJson<{ songs: ResolvedRow[] }>(values.resolved);
    const resolvedByPost = new Map((resolvedFile?.songs ?? []).map((row) => [row.postId, row]));
    const overridesFile = await readJson<{ overrides: { postId: number; artist?: string; title?: string }[] }>(
        values.overrides,
    );
    const overrideByPost = new Map((overridesFile?.overrides ?? []).map((row) => [row.postId, row]));

    const existing = await readJson<{ checks: LegacyCheck[] }>(values.fill);
    const byPost = new Map<number, Check>();
    for (const check of existing?.checks ?? []) {
        // Older runs stored iTunes results; keep successful ones as Deezer stand-ins so we
        // do not re-query songs already grounded on a second catalogue.
        const migrated: Check = {
            postId: check.postId,
            artist: check.artist,
            title: check.title,
        };
        if (check.deezer !== undefined) migrated.deezer = check.deezer;
        else if (check.itunes?.ok === true) {
            migrated.deezer = {
                ...check.itunes,
                note: check.itunes.note ?? "migrated from iTunes ok",
            };
        }
        if (check.discogs !== undefined && !isRateLimited(check.discogs)) {
            migrated.discogs = check.discogs;
        }
        byPost.set(check.postId, migrated);
    }

    const todo = songsFile.songs.filter((song) => {
        const prior = byPost.get(song.postId);
        if (prior?.deezer === undefined || prior.discogs === undefined) return true;
        return isRateLimited(prior.deezer) || isRateLimited(prior.discogs);
    });
    const limit = values.limit === undefined ? todo.length : Number(values.limit);
    if (!Number.isInteger(limit) || limit < 0) {
        throw new Error("--limit must be a non-negative whole number.");
    }
    const batch = todo.slice(0, limit);
    const discogsGap = Number(values["discogs-gap-ms"]);
    const deezerGap = Number(values["deezer-gap-ms"]);
    const discogsOnMiss = values["discogs-on-miss"] === true;

    console.log(
        `${[...byPost.values()].filter((c) => c.deezer && c.discogs).length} songs already complete; ${todo.length} still to ask` +
            (batch.length < todo.length ? ` (doing ${batch.length} this run)` : ""),
    );

    let deezerOk = 0;
    let discogsOk = 0;
    for (let index = 0; index < batch.length; index++) {
        const song = batch[index]!;
        const resolved = resolvedByPost.get(song.postId);
        const override = overrideByPost.get(song.postId);
        const artist = displayArtist(song, resolved, override);
        const title = displayTitle(song, resolved, override);
        // Traditional / category rows have no performer to corroborate.
        if (artist.trim().length === 0) {
            byPost.set(song.postId, {
                postId: song.postId,
                artist,
                title,
                deezer: { ok: true, note: "no artist (category/traditional)" },
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
        if (prior?.deezer !== undefined && !isRateLimited(prior.deezer)) {
            check.deezer = prior.deezer;
        }
        if (prior?.discogs !== undefined && !isRateLimited(prior.discogs)) {
            const skipped = (prior.discogs.note ?? "").startsWith("skipped Discogs");
            if (!(skipped && check.deezer === undefined)) {
                check.discogs = prior.discogs;
            }
        }

        if (check.deezer === undefined) {
            check.deezer = await checkDeezer(artist, title);
            await sleep(deezerGap);
        }
        if (check.discogs === undefined) {
            if (discogsOnMiss && check.deezer.ok) {
                check.discogs = {
                    ok: true,
                    note: "skipped Discogs; Deezer already agreed",
                };
            } else {
                check.discogs = await checkDiscogs(artist, title);
                await sleep(discogsGap);
            }
        }

        if (check.deezer?.ok) deezerOk++;
        if (check.discogs?.ok) discogsOk++;
        byPost.set(song.postId, check);

        if ((index + 1) % 25 === 0 || index + 1 === batch.length) {
            console.log(
                `  ${index + 1}/${batch.length} checked` +
                    ` (Deezer ok ${deezerOk}, Discogs ok ${discogsOk} this run)`,
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
    const both = checks.filter((c) => c.deezer?.ok && c.discogs?.ok).length;
    const either = checks.filter((c) => c.deezer?.ok || c.discogs?.ok).length;
    const neither = checks.filter(
        (c) =>
            c.deezer !== undefined &&
            c.discogs !== undefined &&
            !c.deezer.ok &&
            !c.discogs.ok &&
            !isRateLimited(c.deezer) &&
            !isRateLimited(c.discogs),
    );
    const rateLimited = checks.filter(
        (c) => isRateLimited(c.deezer) || isRateLimited(c.discogs),
    ).length;
    console.log(
        `\n${checks.length} songs checked: ${both} on both sources, ${either} on at least one, ${neither.length} on neither` +
            (rateLimited > 0 ? `, ${rateLimited} still rate-limited` : ""),
    );

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(
        values.out,
        `${JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                note: "Written by `pnpm corroborate:titles`. Regenerable; Discogs + Deezer; does not change the catalogue.",
                summary: {
                    checked: checks.length,
                    both,
                    either,
                    neither: neither.length,
                    rateLimited,
                },
                checks: checks.sort((a, b) => a.postId - b.postId),
            },
            null,
            2,
        )}\n`,
        "utf8",
    );

    const reviewPath = values.out.replace(/\.json$/, "-review.md");
    await writeFile(reviewPath, formatCorroborationReview(neither), "utf8");
    console.log(`Wrote ${values.out} and ${reviewPath}`);
}

function cell(value: string): string {
    return value.replace(/\|/g, "/").replace(/\n/g, " ");
}

/** What the other catalogue returned, or why there is nothing to compare. */
function sourceDiff(ours: { artist: string; title: string }, source: SourceCheck | undefined): string {
    if (source === undefined) return "—";
    if (source.ok) return "agrees";
    const theirArtist = source.artist;
    const theirTitle = source.title;
    if (theirArtist !== undefined || theirTitle !== undefined) {
        const theirs = `${theirArtist ?? "?"} – ${theirTitle ?? "?"}`;
        const artistDiff =
            theirArtist !== undefined && !namesAgree(theirArtist, ours.artist)
                ? `artist ${ours.artist} → ${theirArtist}`
                : undefined;
        const titleDiff =
            theirTitle !== undefined && !namesAgree(theirTitle, ours.title)
                ? `title ${ours.title} → ${theirTitle}`
                : undefined;
        const parts = [artistDiff, titleDiff].filter((part) => part !== undefined);
        // Always keep the full top hit so karaoke/cover noise is visible even when only
        // one field failed the name match.
        return parts.length > 0 ? `${parts.join("; ")} (${theirs})` : `top hit: ${theirs}`;
    }
    if (source.note !== undefined && source.note.length > 0) {
        // Strip long URLs from HTTP errors so the table stays readable.
        if (/\bHTTP \d+\b/.test(source.note)) {
            return source.note.replace(/https?:\S+/g, "").trim();
        }
        if (/^no \w+/i.test(source.note)) return "not found";
        return source.note;
    }
    return "not found";
}

function formatCorroborationReview(neither: Check[]): string {
    const disagreements = neither.filter(
        (c) =>
            c.deezer?.artist !== undefined ||
            c.deezer?.title !== undefined ||
            c.discogs?.artist !== undefined ||
            c.discogs?.title !== undefined,
    );
    const notFound = neither.filter((c) => !disagreements.includes(c));

    const lines = [
        "# Title/artist corroboration review",
        "",
        "Songs where neither Deezer nor Discogs agreed with the published artist+title.",
        "MusicBrainz remains primary; use this list to decide overrides or further checks.",
        "Rate-limited rows are omitted — re-run `pnpm corroborate:titles` to retry them.",
        "",
        `**${disagreements.length}** with a conflicting top hit (diff shown), **${notFound.length}** not found on either source.`,
        "",
        "## Disagreements",
        "",
        "Ours versus the other catalogue's top hit when that hit exists but does not match.",
        "",
        `| postId | our artist | our title | Deezer | Discogs |`,
        `| --- | --- | --- | --- | --- |`,
        ...disagreements.map((c) => {
            const ours = { artist: c.artist, title: c.title };
            return `| ${c.postId} | ${cell(c.artist)} | ${cell(c.title)} | ${cell(
                sourceDiff(ours, c.deezer),
            )} | ${cell(sourceDiff(ours, c.discogs))} |`;
        }),
        "",
        "## Not found on either source",
        "",
        "No usable Deezer or Discogs hit — often a remix/annotation title, a very local cut, or a credit the other catalogues file differently.",
        "",
        `| postId | our artist | our title |`,
        `| --- | --- | --- |`,
        ...notFound.map((c) => `| ${c.postId} | ${cell(c.artist)} | ${cell(c.title)} |`),
        "",
    ];
    return `${lines.join("\n")}\n`;
}

await main();
