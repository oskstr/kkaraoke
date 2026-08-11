/**
 * Fetches canonical details for every artist the offline match identified.
 *
 * The canonical dump gives ids but not names: its artist credit is whatever the matched
 * release printed, so `Hall & Oates` stays `Hall & Oates` even though the id behind it is
 * `Daryl Hall & John Oates`. Canonical names therefore have to come from MusicBrainz.
 *
 * A lookup per artist would be the obvious way and is the wrong one. The rate limit is per
 * IP, and on a shared address the documented one request per second is not ours alone, so
 * 1670 lookups took hours of mostly 503s. Search accepts a disjunction of ids and returns
 * a hundred artists per page, which is the same data in seventeen requests.
 *
 * Search returns raw tags rather than genres, and tags are a mix: U2 is tagged
 * `alternative rock` and `irish`. Intersecting them with MusicBrainz's own genre
 * vocabulary keeps the genres and drops the rest, for the cost of paging through 2184
 * genre names once.
 *
 * Usage: pnpm fetch:artists [--matches <file>] [--out data/artists.json]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { mbGet, requestStats } from "./lib/musicbrainz.ts";

/** The most ids a search page can return, and so the most worth asking for at once. */
const BATCH = 100;

interface SearchHit {
    id: string;
    name: string;
    "sort-name"?: string;
    type?: string;
    country?: string;
    disambiguation?: string;
    "life-span"?: { begin?: string; end?: string | null };
    tags?: { name: string; count: number }[];
    aliases?: { name: string }[];
}

export interface Artist {
    mbid: string;
    name: string;
    sortName?: string;
    type?: string;
    country?: string;
    disambiguation?: string;
    began?: string;
    ended?: string;
    /** Tags that are genres, most-voted first; MusicBrainz genres are votes, so counts matter. */
    genres?: { name: string; count: number }[];
    /** Alternative spellings, which are what would make a search box find ABBA from "Abba". */
    aliases?: string[];
}

/** Every genre name MusicBrainz recognises, so that `irish` can be told from `britpop`. */
async function genreVocabulary(): Promise<Set<string>> {
    const names = new Set<string>();
    for (let offset = 0; ; offset += BATCH) {
        const page = await mbGet<{ "genre-count": number; genres?: { name: string }[] }>(
            `genre/all?limit=${BATCH}&offset=${offset}`,
        );
        for (const genre of page.genres ?? []) {
            names.add(genre.name.toLowerCase());
        }
        if (names.size >= page["genre-count"] || (page.genres ?? []).length === 0) {
            break;
        }
    }
    return names;
}

function toArtist(hit: SearchHit, vocabulary: Set<string>): Artist {
    const artist: Artist = { mbid: hit.id, name: hit.name };
    if (hit["sort-name"] !== undefined) artist.sortName = hit["sort-name"];
    if (hit.type !== undefined) artist.type = hit.type;
    if (hit.country !== undefined) artist.country = hit.country;
    if (hit.disambiguation) artist.disambiguation = hit.disambiguation;
    const span = hit["life-span"];
    if (span?.begin !== undefined) artist.began = span.begin;
    if (span?.end) artist.ended = span.end;

    const genres = (hit.tags ?? [])
        .filter((tag) => tag.count > 0 && vocabulary.has(tag.name.toLowerCase()))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .map((tag) => ({ name: tag.name, count: tag.count }));
    if (genres.length > 0) artist.genres = genres;

    const aliases = [...new Set((hit.aliases ?? []).map((alias) => alias.name))].filter((alias) => alias !== hit.name);
    if (aliases.length > 0) artist.aliases = aliases;
    return artist;
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            matches: { type: "string", default: "data/canonical-matches.json" },
            out: { type: "string", default: "data/artists.json" },
        },
    });

    const matches = JSON.parse(await readFile(values.matches, "utf8")) as {
        songs: { matched: boolean; trusted?: boolean; artistMbids?: string[] }[];
    };

    // Only the matches we would actually show. An untrusted match's artist is not
    // necessarily wrong, but it is not worth asking about until someone has looked.
    // Sorted so that a re-run asks for the same batches and answers from the cache.
    const mbids = [
        ...new Set(
            matches.songs
                .filter((song) => song.matched && song.trusted === true)
                .flatMap((song) => song.artistMbids ?? []),
        ),
    ].sort();

    console.log("paging through the genre vocabulary");
    const vocabulary = await genreVocabulary();
    console.log(`  ${vocabulary.size} genre names`);

    const batches = Math.ceil(mbids.length / BATCH);
    console.log(`${mbids.length} artists in ${batches} batches`);
    const artists: Artist[] = [];
    for (let index = 0; index < mbids.length; index += BATCH) {
        const wanted = mbids.slice(index, index + BATCH);
        const query = `arid:(${wanted.join(" OR ")})`;
        const page = await mbGet<{ artists?: SearchHit[] }>(`artist?query=${encodeURIComponent(query)}&limit=${BATCH}`);
        for (const hit of page.artists ?? []) {
            artists.push(toArtist(hit, vocabulary));
        }
        console.log(`  batch ${index / BATCH + 1}/${batches}: ${(page.artists ?? []).length}/${wanted.length}`);
    }

    // A batch that silently returns fewer artists than it was asked about would leave
    // those songs showing the venue's own spelling, which is easy not to notice.
    const found = new Set(artists.map((artist) => artist.mbid));
    const missing = mbids.filter((mbid) => !found.has(mbid));
    const withGenre = artists.filter((artist) => artist.genres !== undefined).length;
    const { fetched, served, retried } = requestStats();
    console.log(`\n${artists.length} artists, ${withGenre} with a genre, ${missing.length} not returned`);
    console.log(`${fetched} requests, ${served} from cache, ${retried} retried`);
    if (missing.length > 0) {
        console.log(`  missing: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""}`);
    }

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, `${JSON.stringify({ artists }, null, 2)}\n`, "utf8");
    console.log(`Wrote ${values.out}`);
}

await main();
