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
import type { WorkLink } from "./fetch-works.ts";

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
    /** ISO 639-3 from a proposal, until a works lookup confirms one. */
    language?: string;
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
    /** The credited artists individually, which is what the artist column is built from. */
    artists?: { mbid: string; name: string }[];
    /**
     * The matched release's own flattened credit line, kept for the collaboration kind it
     * encodes and never displayed.
     */
    credit?: string;
    /**
     * The show or film the song is from, where the venue put that in the artist column. Kept
     * apart from the artist: `Grease` is what people search for and is not a performer.
     * Never a language label — that is `language`.
     */
    from?: string;
    /** ISO 639-3 lyrics language from the MusicBrainz work, or a confirmed proposal. */
    language?: string;
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
/** Where the venue joins several artists into one string, as the matcher splits it. */
const JOIN = /\s+(?:feat\.?|ft\.?|featuring|with|duet with|med|vs\.?|versus|and|x)\s+|\s*[&,+/]\s*/i;

const MIN_GENRE_VOTES = 2;
/** When nobody has two votes, a single vote is still better than a blank genre column. */
const FALLBACK_GENRE_VOTES = 1;
const MAX_GENRES = 3;

const HAS_LATIN = /\p{Script=Latin}/u;

/**
 * The name to show. MusicBrainz's canonical name is the artist's own preferred one, which for
 * `Άννα Βίσση` and `鄭秀文` is written in a script nobody in the room can type. Where the
 * primary name has letters but none of them are Latin, a Latin alias is the usable name.
 * Digit-only or symbolic names (`911`, `98°`, `A★Teens`) keep the primary — they are not a
 * foreign script, and the first Latin alias is often a wrong-country disambiguation that
 * someone parked in the alias list (`911 (US)` for the UK boy band).
 *
 * When the matched credit line still uses an older or more familiar alias (`Kanye West` on a
 * 2008 recording whose artist is now filed as `Ye`), prefer that alias so the page names the
 * act the way the recording does.
 */
/** Fancy hyphens / accents folded so `Jay‐Z` and `JAŸ-Z` can be ranked as plain Latin. */
const plainLatin = (value: string): string =>
    value
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .replace(/[\u2010-\u2015\u2212]/g, "-");

const isPlainAscii = (value: string): boolean => /^[\x00-\x7F]+$/.test(plainLatin(value));

/** Prefer `Jay-Z` / `Jay Z` over `Jay - Z` or stylized `JAŸ-Z`. */
function preferDisplayForm(a: string, b: string, fragment?: string): number {
    return (
        // Prefer the fragment's own spelling when it is one of the options.
        (fragment !== undefined && b === fragment ? 1 : 0) - (fragment !== undefined && a === fragment ? 1 : 0) ||
        // Prefer plain ASCII (Jay-Z) over stylized primaries (JAŸ-Z) and unicode hyphens.
        (isPlainAscii(b) ? 1 : 0) - (isPlainAscii(a) ? 1 : 0) ||
        // Prefer `Jay-Z` over the odd `Jay - Z` alias.
        (/\s-\s/.test(a) ? 1 : 0) - (/\s-\s/.test(b) ? 1 : 0) ||
        // Prefer spaced forms (Kanye West) over jammed ones (KanYeWest).
        (b.includes(" ") && !/\s-\s/.test(b) ? 1 : 0) - (a.includes(" ") && !/\s-\s/.test(a) ? 1 : 0) ||
        // Prefer a real hyphenated trademark form (Jay-Z) over a spaced one (Jay Z), when both ASCII.
        (/^[^\s]+-[^\s]+$/.test(b) ? 1 : 0) - (/^[^\s]+-[^\s]+$/.test(a) ? 1 : 0) ||
        a.length - b.length
    );
}

function displayName(artist: Artist, credit?: string, venueArtist?: string): string {
    const options = [artist.name, ...(artist.aliases ?? [])];
    // Prefer a name form that still appears on the matched credit or the venue's string
    // (Kanye West on a 2008 cut; Jay-Z when the venue wrote Jay Z rather than JAŸ-Z).
    // Match whole credit fragments, not substrings — otherwise `Est'elle` wins over `Estelle`
    // because both fold to `estelle` and the longer spelling sorts first.
    // Venue before credit: the room's spelling is usually the familiar one (`Jay Z`, `Estelle`).
    for (const source of [venueArtist, credit]) {
        if (source === undefined) continue;
        const fragments = source
            .split(JOIN)
            .map((part) => part.trim())
            .filter((part) => part.length > 0);
        for (const fragment of [...fragments, source]) {
            const fragmentKey = nameKey(fragment);
            if (fragmentKey.length < 2) continue;
            const exact = options
                .filter((option) => nameKey(option) === fragmentKey)
                .sort((a, b) => preferDisplayForm(a, b, fragment))[0];
            if (exact !== undefined) {
                return exact;
            }
        }
    }
    // Digit-only / symbolic primaries (`911`) keep the primary — the first Latin alias is often
    // a wrong-country disambiguation (`911 (US)` for the UK boy band).
    if (!/\p{Letter}/u.test(artist.name)) {
        return artist.name;
    }
    if (HAS_LATIN.test(artist.name)) {
        // Stylized Latin primaries (JAŸ-Z) still prefer a plain ASCII alias when one exists.
        if (!isPlainAscii(artist.name)) {
            const ascii = [...(artist.aliases ?? [])]
                .filter((alias) => isPlainAscii(alias) && HAS_LATIN.test(alias) && nameKey(alias) === nameKey(artist.name))
                .sort((a, b) => preferDisplayForm(a, b))[0];
            if (ascii !== undefined) return ascii;
        }
        return artist.name;
    }
    return (artist.aliases ?? []).find((alias) => HAS_LATIN.test(alias)) ?? artist.name;
}

/** Punctuation, case and diacritics removed, so `JAŸ-Z` and `Jay-Z` can meet. */
const nameKey = (value: string): string =>
    value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .replace(/[^a-z0-9]/g, "");

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

function pickGenres(artist: Artist | undefined): string[] {
    const genres = artist?.genres ?? [];
    const preferred = genres.filter((genre) => genre.count >= MIN_GENRE_VOTES);
    const pool = preferred.length > 0 ? preferred : genres.filter((genre) => genre.count >= FALLBACK_GENRE_VOTES);
    return pool.slice(0, MAX_GENRES).map((genre) => genre.name);
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
            works: { type: "string", default: "data/works.json" },
            out: { type: "string", default: "data/resolved.json" },
            queue: { type: "string", default: "data/review.md" },
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

    const worksFile = await readJson<{ works: WorkLink[] }>(values.works);
    const languages = new Map(
        (worksFile?.works ?? [])
            .filter((work) => work.language !== undefined)
            .map((work) => [work.recordingMbid, work.language!]),
    );
    if (worksFile === undefined) {
        console.warn(`No ${values.works} yet, so languages come only from proposals.`);
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
    const review: ReviewEntry[] = [];

    let titleFixes = 0;
    let artistFixes = 0;
    let genreCount = 0;
    let yearCount = 0;
    let languageCount = 0;
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
        const name = displayName(artist);
        if (name !== match.artist) {
            resolved.artist = name;
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
                reason: match.placeholder === true ? "matched a placeholder entity" : "weak match",
                ...(match.placeholder === true ? {} : { detail: `matched by ${match.how}` }),
                ...(match.recording === undefined ? {} : { suggestion: `${match.artistCredit} – ${match.recording}` }),
            });
            artistOnlyCorrection(match);
            continue;
        }

        const mbids = [...new Set(match.artistMbids ?? [])];

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
                reason: "credited to a namesake, not to this artist",
                detail: `MusicBrainz says ${found?.name ?? "another artist"}${
                    found?.disambiguation === undefined ? "" : ` (${found.disambiguation})`
                }, but this artist's other songs are by ${artists.get(dominant)?.name ?? "someone else"}`,
                ...(match.recording === undefined ? {} : { suggestion: `${match.artistCredit} – ${match.recording}` }),
            });
            artistOnlyCorrection(match);
            continue;
        }

        const credited = mbids.map((mbid) => artists.get(mbid)).filter((artist) => artist !== undefined);
        const lead = credited[0];
        const creditLine = match.artistCredit;

        // Each distinct artist, comma separated. Prefer the name form that still appears on
        // the matched credit (Kanye West on a 2008 cut whose artist is now Ye) over today's
        // primary name, and never a wrong-country alias parked on a digit-only act.
        const canonical =
            credited.length === mbids.length && credited.length > 0
                ? credited.map((artist) => displayName(artist, creditLine, match.artist)).join(", ")
                : match.artistCredit;

        // MusicBrainz files songs with no identifiable performer under placeholder
        // entities named in brackets, such as [Disney] and [traditional]. The id is real
        // and the title behind it is usually right, but it does not name an artist, so the
        // venue's own string is the better one to show and to sort under.
        const anonymous = canonical !== undefined && /^\[.*\]$/.test(canonical);
        if (anonymous) {
            review.push({
                ...pick(match),
                reason: "matched a placeholder entity",
                detail: `MusicBrainz files this under ${canonical}, which is an id but not a performer`,
            });
        }

        // Scoping a search to the lead can land on the lead's solo recording, so `Ashanti & Ja
        // Rule – Happy` becomes Ashanti alone. Title-first can do the same when it accepts a
        // credit headed by the venue's lead. The canonical names, year and genres are still
        // a gain over the venue's string, so this is applied and noted rather than withheld.
        if (
            (match.how === "lead-scoped" || match.how === "title-first" || match.how === "collab-scoped") &&
            credited.length < match.artist.split(JOIN).length
        ) {
            review.push({
                ...pick(match),
                reason: "matched through the lead artist, which named fewer artists than the venue did",
                suggestion: `${canonical ?? ""} – ${match.title ?? ""}`,
            });
        }

        const resolved: Resolved = { postId: match.postId };
        if (match.from !== undefined) resolved.from = match.from;
        const language =
            (match.recordingMbid === undefined ? undefined : languages.get(match.recordingMbid)) ??
            match.language;
        if (language !== undefined) {
            resolved.language = language;
            languageCount++;
        }
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
        // What the artist column is made of, so the page can link each name on its own rather
        // than parsing one back out of a string.
        if (credited.length > 0) {
            resolved.artists = credited.map((artist) => ({
                mbid: artist.mbid,
                name: displayName(artist, creditLine, match.artist),
            }));
        }
        // MusicBrainz distinguishes a guest from an equal billing, and the dump flattens that
        // distinction into this line: `feat.`, `duet with`, `vs.`. Keeping it means the
        // distinction can be recovered later, properly, from the web service's join phrases.
        if (credited.length > 1 && match.artistCredit !== undefined) {
            resolved.credit = match.artistCredit;
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
    console.log(`  songs with a language: ${languageCount}`);
    console.log(`  artist named from the artist's other songs, title still unknown: ${artistOnly}`);

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(
        values.out,
        `${JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                note: "Written by `pnpm build:resolved`. Regenerable; hand edits belong in data/overrides.json.",
                songs,
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
    console.log(`Wrote ${values.out}`);
    await writeFile(values.queue, reviewQueue(review), "utf8");
    console.log(`Wrote ${values.queue}`);
}

interface ReviewEntry {
    postId: number;
    id: number;
    artist: string;
    song: string;
    /** The category, kept identical across entries so that the queue groups by it. */
    reason: string;
    /** What is specific to this song, which must stay out of `reason` or every group is one. */
    detail?: string;
    suggestion?: string;
}

/**
 * The queue as something a person can actually work through, which the JSON was not: it began
 * on line 117,799 of a generated file, after every song that had already been resolved.
 *
 * Grouped by what is wrong, because the groups are different jobs, and within that by the
 * venue's artist string, largest first, because one decision about `Finsk musik` settles
 * thirty-nine songs and one about `Rozallo` settles one. `postId` is what a proposal is keyed
 * by; `id` is the number on the wall.
 */
function reviewQueue(review: ReviewEntry[]): string {
    const byReason = new Map<string, ReviewEntry[]>();
    for (const entry of review) {
        byReason.set(entry.reason, [...(byReason.get(entry.reason) ?? []), entry]);
    }

    const lines = [
        "# Songs still to review",
        "",
        `${review.length} songs, written by \`pnpm build:resolved\`. Regenerable, so do not edit it.`,
        "",
        "A decision here becomes an entry in `data/proposals.json`, keyed by `postId`. A proposal only",
        "adds a key for the matcher to look for, so it applies if MusicBrainz agrees and does nothing at",
        "all if it does not — a wrong guess is cheap. Anything the dump cannot confirm belongs in",
        "`data/overrides.json` instead.",
        "",
        "## Contents",
        "",
    ];
    const sections = [...byReason].sort((a, b) => b[1].length - a[1].length);
    for (const [reason, entries] of sections) {
        lines.push(`- ${reason} — **${entries.length}**`);
    }

    for (const [reason, entries] of sections) {
        lines.push("", `## ${reason} (${entries.length})`, "");
        const byArtist = new Map<string, ReviewEntry[]>();
        for (const entry of entries) {
            byArtist.set(entry.artist, [...(byArtist.get(entry.artist) ?? []), entry]);
        }
        const groups = [...byArtist].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "sv"));
        for (const [artist, songs] of groups) {
            lines.push(`### ${artist} — ${songs.length}`, "");
            const found = (song: ReviewEntry): string =>
                [song.suggestion, song.detail].filter((part) => part !== undefined).join(" — ");
            const explained = songs.some((song) => found(song).length > 0);
            lines.push(
                explained
                    ? "| id | the venue's title | what we found | postId |"
                    : "| id | the venue's title | postId |",
            );
            lines.push(explained ? "| -: | --- | --- | -: |" : "| -: | --- | -: |");
            for (const song of [...songs].sort((a, b) => a.id - b.id)) {
                const cells = explained
                    ? [song.id, song.song, found(song), song.postId]
                    : [song.id, song.song, song.postId];
                lines.push(`| ${cells.join(" | ")} |`);
            }
            lines.push("");
        }
    }
    return `${lines.join("\n").trimEnd()}\n`;
}

function pick(match: MatchRecord): { postId: number; id: number; artist: string; song: string } {
    return { postId: match.postId, id: match.id, artist: match.artist, song: match.song };
}

await main();
