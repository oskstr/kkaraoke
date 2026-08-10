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
const MAX_ATTEMPTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;

let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;
let served = 0;
let fetched = 0;

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

async function request(path: string): Promise<unknown> {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (wait > 0) {
        await sleep(wait);
    }

    for (let attempt = 1; ; attempt++) {
        lastRequestAt = Date.now();
        try {
            const response = await fetch(`${BASE}/${path}${path.includes("?") ? "&" : "?"}fmt=json`, {
                headers: { "user-agent": USER_AGENT, accept: "application/json" },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            // 503 is how the rate limiter and a busy server both answer, so back off
            // rather than treating it as a failure.
            if (response.status === 503 || response.status === 429) {
                throw new Error(`HTTP ${response.status} (throttled)`);
            }
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            fetched++;
            return await response.json();
        } catch (error) {
            if (attempt === MAX_ATTEMPTS) {
                throw new Error(`Giving up on ${path} after ${MAX_ATTEMPTS} attempts`, { cause: error });
            }
            const backoff = 2 ** attempt * 1000;
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

export function requestStats(): { fetched: number; served: number } {
    return { fetched, served };
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
