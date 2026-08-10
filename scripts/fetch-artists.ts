/**
 * Fetches canonical details for every artist the offline match identified.
 *
 * The canonical dump gives ids but not names: its artist credit is whatever the matched
 * release printed, so `Hall & Oates` stays `Hall & Oates` even though the id behind it is
 * `Daryl Hall & John Oates`. Canonical names therefore have to come from a lookup by id.
 *
 * These are direct entity lookups rather than searches, so they avoid the search server
 * entirely and cost one request per artist regardless of how many songs that artist has.
 * Genres and aliases come along in the same request at no extra cost, which is where the
 * genre data and the alternative spellings for search come from.
 *
 * Usage: pnpm fetch:artists [--matches <file>] [--out data/artists.json]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { mbGet, requestStats } from "./lib/musicbrainz.ts";

interface ArtistLookup {
    id: string;
    name: string;
    "sort-name"?: string;
    type?: string;
    country?: string;
    disambiguation?: string;
    "life-span"?: { begin?: string; end?: string | null; ended?: boolean };
    genres?: { name: string; count: number }[];
    aliases?: { name: string; locale?: string | null; primary?: boolean | null }[];
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
    /** Ordered most-voted first; MusicBrainz genres are user tags, so counts matter. */
    genres?: { name: string; count: number }[];
    /** Alternative spellings, which are what make a search box find "Abba" and "ABBA". */
    aliases?: string[];
}

function toArtist(lookup: ArtistLookup): Artist {
    const artist: Artist = { mbid: lookup.id, name: lookup.name };
    if (lookup["sort-name"] !== undefined) artist.sortName = lookup["sort-name"];
    if (lookup.type !== undefined) artist.type = lookup.type;
    if (lookup.country !== undefined) artist.country = lookup.country;
    if (lookup.disambiguation) artist.disambiguation = lookup.disambiguation;
    const span = lookup["life-span"];
    if (span?.begin !== undefined) artist.began = span.begin;
    if (span?.end) artist.ended = span.end;

    const genres = (lookup.genres ?? [])
        .filter((genre) => genre.count > 0)
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .map((genre) => ({ name: genre.name, count: genre.count }));
    if (genres.length > 0) artist.genres = genres;

    const aliases = [...new Set((lookup.aliases ?? []).map((alias) => alias.name))].filter(
        (alias) => alias !== lookup.name,
    );
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
    // necessarily wrong, but it is not worth a request until someone has looked.
    const mbids = [
        ...new Set(
            matches.songs
                .filter((song) => song.matched && song.trusted === true)
                .flatMap((song) => song.artistMbids ?? []),
        ),
    ].sort();

    console.log(`${mbids.length} artists to look up`);
    const artists: Artist[] = [];
    const failed: string[] = [];
    for (const [index, mbid] of mbids.entries()) {
        try {
            artists.push(toArtist(await mbGet<ArtistLookup>(`artist/${mbid}?inc=genres+aliases`)));
        } catch (error) {
            failed.push(mbid);
            console.warn(`  ${mbid} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        if ((index + 1) % 50 === 0) {
            const { fetched, served } = requestStats();
            console.log(`  ${index + 1}/${mbids.length} (${fetched} fetched, ${served} cached)`);
        }
    }

    const withGenre = artists.filter((artist) => artist.genres !== undefined).length;
    console.log(`\n${artists.length} artists, ${withGenre} with at least one genre, ${failed.length} failed`);

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, `${JSON.stringify({ artists }, null, 2)}\n`, "utf8");
    console.log(`Wrote ${values.out}`);
}

await main();
