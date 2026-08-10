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
    rewrites?: string[];
    /** Set where the dump confirmed a proposal, holding the proposer's reasoning. */
    proposed?: string;
    from?: string;
    artistCredit?: string;
    artistMbids?: string[];
    /** MusicBrainz's own recording title, master markers and all. */
    recording?: string;
    /** The same title with a master marker dropped, which is the one to publish. */
    title?: string;
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
    /** The credited artists individually, for a page that wants to link each of them. */
    artists?: { mbid: string; name: string }[];
    /**
     * The show or film the song is from, where the venue put that in the artist column. Kept
     * apart from the artist: `Grease` is what people search for and is not a performer.
     */
    from?: string;
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

/** Punctuation and case removed, so that `P!nk` and `Pink` can be told apart by name. */
const nameKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Whether two entities are the same act rather than two acts with confusable names. A band
 * and its own frontman are separate entities and both are correct — Bob Marley & The Wailers
 * is if anything the better credit — and their names give it away, since one begins with the
 * other. Two unrelated people called Pink do not.
 */
function related(a: Artist | undefined, b: Artist | undefined): boolean {
    if (a === undefined || b === undefined) {
        return false;
    }
    const [left, right] = [nameKey(a.name), nameKey(b.name)];
    return left !== right && (left.startsWith(right) || right.startsWith(left));
}

/**
 * How a collaboration should read. The dump gives only the flattened credit line the matched
 * release happened to print, so the same two people arrive as `Nicole Kidman and Ewan
 * McGregor` on one song and `Nicole Kidman & Ewan McGregor` on the next, and one release
 * managed `Hall& Oates`. They are two artists either way, each with their own id.
 *
 * Where the line is nothing but the credited artists' own names joined by a neutral
 * conjunction, it can be rebuilt from those names and read the same way every time. Where it
 * says anything else it is left alone, because the something else is usually the part that
 * matters: `feat.` marks a guest, `duet with` marks a duet, `vs.` marks a remix.
 */
function readAsCredit(credit: string, credited: Artist[]): string {
    const tidy = credit.replace(/\s*&\s*/g, " & ").trim();
    if (credited.length < 2) {
        return tidy;
    }
    const neutral = tidy.split(/\s*(?:&|,|\band\b)\s*/).filter((part) => part.length > 0);
    const names = credited.map((artist) => artist.name);
    // A part accounts for an artist when it is their name, or the end of it: one release
    // credits Daryl Hall and John Oates as `Hall& Oates`, which is the same two men shortened,
    // and rebuilding it is what stops their three songs reading two different ways.
    const accounts = (part: string, name: string): boolean => {
        const [left, right] = [nameKey(part), nameKey(name)];
        return left === right || (left.length >= 3 && right.endsWith(left));
    };
    const accounted =
        neutral.length === names.length && neutral.every((part, index) => accounts(part, names[index] ?? ""));
    if (!accounted) {
        return tidy;
    }
    // Oxford-free: `A & B`, and `A, B & C` for three or more.
    return [names.slice(0, -1).join(", "), names.at(-1)].join(" & ");
}

function pickGenres(artist: Artist | undefined): string[] {
    return (artist?.genres ?? [])
        .filter((genre) => genre.count >= MIN_GENRE_VOTES)
        .slice(0, MAX_GENRES)
        .map((genre) => genre.name);
}

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

    // Which artist each of the venue's artist strings turned out to name, where its songs
    // agree. Identifying an artist does not depend on any one of their songs matching, so
    // this is what stops a single act appearing under two spellings when one song fails:
    // before it, 31 of ABBA's songs said ABBA and `Winner takes it all` said Abba.
    //
    // Read from the string's solo matches only. A collaboration says nothing about who the
    // string names on its own — the venue files duets under one member's name, so `Celine
    // Dion` credits Frank Sinatra on one song — and a string that is *only* ever a
    // collaboration gets nothing, since resolving it to its lead would drop a collaborator.
    const solo = new Map<string, Map<string, number>>();
    for (const match of matches.songs) {
        if (!match.matched || match.trusted !== true) continue;
        // A confirmed proposal says this string was the wrong credit for this song, so it is
        // no evidence about what the string means: Geri Halliwell must not become one of the
        // things `Spice Girls` denotes.
        if (match.proposed !== undefined) continue;
        const mbids = match.artistMbids ?? [];
        const only = mbids.length === 1 ? mbids[0] : undefined;
        if (only === undefined) continue;
        const counts = solo.get(match.artist) ?? new Map<string, number>();
        counts.set(only, (counts.get(only) ?? 0) + 1);
        solo.set(match.artist, counts);
    }

    /**
     * One artist string resolving to several solo artists is the best signal we have for a
     * wrong match, because MusicBrainz is full of different acts sharing a name: `So what`
     * came back credited to Pink, a German netlabel musician, rather than P!nk, and `Relax`
     * to Mika, an Austrian house duo, rather than MIKA. Whoever has the most songs under the
     * string is who the venue means, and a clear majority is what makes the rest suspect. A
     * tie is left alone: `Emilia` splits a song each between two entities that are the same
     * woman before and after a change of name.
     */
    const soleArtist = new Map<string, string>();
    for (const [artist, counts] of solo) {
        const [first, second] = [...counts].sort((a, b) => b[1] - a[1]);
        if (first !== undefined && (second === undefined || first[1] > second[1])) {
            soleArtist.set(artist, first[0]);
        }
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
    let artistOnly = 0;

    /**
     * What we can still say about a song whose title did not match: who it is by, which
     * carries the genres and the sort order with it.
     */
    const artistOnlyCorrection = (match: MatchRecord): void => {
        const mbid = soleArtist.get(match.artist);
        const artist = mbid === undefined ? undefined : artists.get(mbid);
        if (artist === undefined || /^\[.*\]$/.test(artist.name)) {
            return;
        }
        const resolved: Resolved = { postId: match.postId, artistMbids: [artist.mbid] };
        if (artist.name !== match.artist) {
            resolved.artist = artist.name;
            artistFixes++;
        }
        if (artist.sortName !== undefined) resolved.sortAs = artist.sortName;
        const genres = pickGenres(artist);
        if (genres.length > 0) {
            resolved.genres = genres;
            genreCount++;
        }
        songs.push(resolved);
        artistOnly++;
    };

    for (const match of matches.songs) {
        if (!match.matched) {
            // Worth separating, because only one of these is a matching problem. Knowing the
            // artist but not the title usually means the venue credited the wrong performer —
            // `Nothing's gonna change my love for you` is filed under George Harrison — while
            // not knowing the artist usually means the string is not an artist at all, but a
            // category such as `Julsång`, `Finsk musik` or a show name.
            review.push({
                ...pick(match),
                reason: soleArtist.has(match.artist)
                    ? "this artist has no such title; the venue may have credited the wrong one"
                    : "no match, and this artist string is unknown to MusicBrainz",
            });
            artistOnlyCorrection(match);
            continue;
        }
        if (match.trusted !== true) {
            review.push({
                ...pick(match),
                reason: match.placeholder === true ? "matched a placeholder entity" : `weak match (${match.how})`,
                ...(match.recording === undefined ? {} : { suggestion: `${match.artistCredit} – ${match.recording}` }),
            });
            artistOnlyCorrection(match);
            continue;
        }

        const mbids = match.artistMbids ?? [];

        // A solo match to anyone other than the act that dominates this artist string is a
        // different person who happens to share a name. The title it found is usually right —
        // P!nk has a So What too — but the recording is not hers, so the year would be wrong,
        // and nothing here is worth applying on the strength of a namesake.
        // A proposal is exempt, because disagreeing with the artist string is the whole point
        // of making one: nine of the venue's `Spice Girls` songs are solo singles.
        const dominant = match.proposed === undefined ? soleArtist.get(match.artist) : undefined;
        const found = artists.get(mbids[0] ?? "");
        if (
            mbids.length === 1 &&
            dominant !== undefined &&
            mbids[0] !== dominant &&
            !related(found, artists.get(dominant))
        ) {
            review.push({
                ...pick(match),
                reason: `credited to ${found?.name ?? "another artist"}${
                    found?.disambiguation === undefined ? "" : ` (${found.disambiguation})`
                }, but this artist's other songs are by ${artists.get(dominant)?.name ?? "someone else"}`,
                ...(match.recording === undefined ? {} : { suggestion: `${match.artistCredit} – ${match.recording}` }),
            });
            artistOnlyCorrection(match);
            continue;
        }

        const credited = mbids.map((mbid) => artists.get(mbid)).filter((artist) => artist !== undefined);
        const lead = credited[0];

        // A single credited artist gets the canonical name from its own lookup, because the
        // dump's credit is whatever the matched release printed. A collaboration is rebuilt
        // from the same names where the line is only names, and kept verbatim where it is not.
        const canonical =
            mbids.length === 1 && lead !== undefined
                ? lead.name
                : match.artistCredit === undefined
                  ? undefined
                  : readAsCredit(match.artistCredit, credited);

        // MusicBrainz files songs with no identifiable performer under placeholder
        // entities named in brackets, such as [Disney] and [traditional]. The id is real
        // and the title behind it is usually right, but it does not name an artist, so the
        // venue's own string is the better one to show and to sort under.
        const anonymous = canonical !== undefined && /^\[.*\]$/.test(canonical);
        if (anonymous) {
            review.push({ ...pick(match), reason: `MusicBrainz files this under ${canonical}, a placeholder` });
        }

        const resolved: Resolved = { postId: match.postId };
        if (match.from !== undefined) resolved.from = match.from;
        if (!anonymous && canonical !== undefined && canonical !== match.artist) {
            resolved.artist = canonical;
            artistFixes++;
        }
        // Sorting follows the lead artist so that a collaboration files under whoever is
        // credited first rather than under the whole credit line.
        if (!anonymous && lead?.sortName !== undefined) {
            resolved.sortAs = lead.sortName;
        }
        // `title` rather than `recording`: the matcher has already dropped a trailing marker
        // that named one master, so a karaoke track is not published as a club mix.
        const canonicalTitle = match.title ?? match.recording;
        if (canonicalTitle !== undefined && canonicalTitle !== match.song) {
            resolved.title = canonicalTitle;
            titleFixes++;
        }
        if (mbids.length > 0) resolved.artistMbids = mbids;
        // The credit line above is for reading; this is the same thing for linking. A
        // collaboration is several artists with their own ids, and the page cannot make
        // them separately clickable until it has them separately.
        if (credited.length > 1) {
            resolved.artists = credited.map((artist) => ({ mbid: artist.mbid, name: artist.name }));
        }
        if (match.recordingMbid !== undefined) resolved.recordingMbid = match.recordingMbid;

        const genres = pickGenres(lead);
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
    console.log(`  artist named from the artist's other songs, title still unknown: ${artistOnly}`);

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
