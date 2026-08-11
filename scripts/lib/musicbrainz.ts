/**
 * Cached, rate-limited MusicBrainz client.
 *
 * MusicBrainz measures its one-request-per-second limit per source IP and, once
 * exceeded, rejects every request rather than just the excess, so all traffic from
 * this process goes through a single queue. Responses are cached on disk outside the
 * repository, which is what makes re-running the reasoning over the same evidence
 * free.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "https://musicbrainz.org/ws/2";
const CACHE_DIR = ".cache/musicbrainz";

/** Their docs ask for a contact URL so they can get in touch before blocking anyone. */
const USER_AGENT = "kkaraoke-resolver/0.1 ( https://github.com/oskstr/kkaraoke )";

/** Slightly slower than the documented limit, since 503s show up even at exactly 1/s. */
const MIN_INTERVAL_MS = 1200;
/**
 * A ceiling on the adaptive backoff. Deliberately low: a 503 costs one retry, so a steady
 * trickle of them is cheaper than the interval it would take to avoid them. Aiming at zero
 * 503s drove the interval to ten seconds and turned a 35-minute pass into a four-hour one.
 */
const MAX_INTERVAL_MS = 4000;
/** How many clean requests before easing off again. Small, for the same reason. */
const EASE_AFTER = 5;
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
let served = 0;
let fetched = 0;
let retried = 0;
let interval = MIN_INTERVAL_MS;
let sinceThrottled = 0;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function cachePath(path: string): string {
    return join(CACHE_DIR, `${createHash("sha256").update(path).digest("hex")}.json`);
}

async function readCache(path: string): Promise<unknown | undefined> {
    try {
        return JSON.parse(await readFile(cachePath(path), "utf8")) as unknown;
    } catch {
        return undefined;
    }
}

/** A 404 means the entity is gone, and asking four more times will not bring it back. */
class Permanent extends Error {}

async function attemptOnce(path: string): Promise<unknown> {
    const response = await fetch(`${BASE}/${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
        headers: { "user-agent": USER_AGENT, accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 503 is how the rate limiter and a busy server both answer, so back off rather than
    // treating it as a failure.
    if (response.status === 503 || response.status === 429) {
        const after = Number(response.headers.get("retry-after"));
        throw new Throttled(`HTTP ${response.status}`, Number.isFinite(after) && after > 0 ? after * 1000 : undefined);
    }
    if (response.status === 404 || response.status === 400) {
        throw new Permanent(`HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    fetched++;
    return await response.json();
}

/**
 * Declared as a field rather than a constructor parameter property: Node's type stripping
 * removes types without rewriting code, so a parameter property is a syntax error there
 * even though it typechecks.
 */
class Throttled extends Error {
    retryAfterMs: number | undefined;

    constructor(message: string, retryAfterMs?: number) {
        super(message);
        this.retryAfterMs = retryAfterMs;
    }
}

async function request(path: string): Promise<unknown> {
    const wait = interval - (Date.now() - lastRequestAt);
    if (wait > 0) {
        await sleep(wait);
    }

    for (let attempt = 1; ; attempt++) {
        lastRequestAt = Date.now();
        try {
            const body = await attemptOnce(path);
            // Ease back towards the documented rate once the server stops complaining,
            // so that one bad patch does not slow the whole run down permanently.
            if (++sinceThrottled >= EASE_AFTER && interval > MIN_INTERVAL_MS) {
                interval = Math.max(MIN_INTERVAL_MS, Math.round(interval * 0.85));
                sinceThrottled = 0;
                console.warn(`    easing back to ${interval}ms between requests`);
            }
            return body;
        } catch (error) {
            if (error instanceof Throttled) {
                // A 503 is the only evidence we get about what rate is actually
                // sustainable, and it is worth acting on: the limit is per IP, and on a
                // shared address the documented one request per second is not ours alone.
                sinceThrottled = 0;
                interval = Math.min(MAX_INTERVAL_MS, Math.round(interval * 1.25));
            }
            if (error instanceof Permanent) {
                throw error;
            }
            if (attempt === MAX_ATTEMPTS) {
                throw new Error(`Giving up on ${path} after ${MAX_ATTEMPTS} attempts`, { cause: error });
            }
            const backoff = error instanceof Throttled ? (error.retryAfterMs ?? interval) : 2 ** attempt * 1000;
            retried++;
            // Logged because a silent retry is indistinguishable from a slow server, and
            // the difference decides whether a run of thousands is worth starting.
            console.warn(
                `    retrying ${path} in ${backoff}ms (attempt ${attempt}: ${
                    error instanceof Error ? error.message : String(error)
                })`,
            );
            await sleep(backoff);
        }
    }
}

/** Fetches a web service path, serving from the on-disk cache when it has been seen before. */
export async function mbGet<T>(path: string): Promise<T> {
    const cached = await readCache(path);
    if (cached !== undefined) {
        served++;
        return cached as T;
    }

    const result = queue.then(() => request(path));
    // Keep the queue alive even when a request throws, so one failure does not wedge
    // every later caller.
    queue = result.catch(() => undefined);
    const body = await result;

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath(path), JSON.stringify(body), "utf8");
    return body as T;
}

export function requestStats(): { fetched: number; served: number; retried: number } {
    return { fetched, served, retried };
}

export interface ArtistHit {
    id: string;
    name: string;
    score?: number;
    type?: string;
    disambiguation?: string;
    country?: string;
    aliases?: { name: string; locale?: string | null }[];
    "life-span"?: { begin?: string; end?: string | null };
}

export interface RecordingHit {
    id: string;
    title: string;
    score?: number;
    "first-release-date"?: string;
    "artist-credit"?: { name: string; artist?: { id: string; name: string } }[];
}

const lucene = (value: string): string => value.replace(/["\\]/g, " ").trim();

/**
 * Unfielded on purpose. An `artist:"…"` query only matches the primary name, which
 * silently misses every artist the venue refers to by an alias.
 */
export function searchArtists(name: string, limit = 5): Promise<{ artists?: ArtistHit[] }> {
    return mbGet(`artist?query=${encodeURIComponent(lucene(name))}&limit=${limit}`);
}

/** Asks whether a title exists under a specific artist, which is how a candidate is corroborated. */
export function searchRecordingForArtist(title: string, arid: string): Promise<{ recordings?: RecordingHit[] }> {
    const query = `recording:"${lucene(title)}" AND arid:${arid}`;
    return mbGet(`recording?query=${encodeURIComponent(query)}&limit=1`);
}

/** Title-only search, for songs whose artist field is a category label rather than an artist. */
export function searchRecordings(title: string, limit = 5): Promise<{ recordings?: RecordingHit[] }> {
    return mbGet(`recording?query=${encodeURIComponent(`recording:"${lucene(title)}"`)}&limit=${limit}`);
}
