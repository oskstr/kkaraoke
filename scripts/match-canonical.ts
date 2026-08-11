/**
 * Matches the whole catalogue against the MusicBrainz canonical metadata dump, offline.
 *
 * The dump exists for exactly our problem: turning an (artist string, title string) pair
 * into MBIDs. Its `combined_lookup` column is the artist and recording names with
 * punctuation and whitespace removed and diacritics folded to ASCII, so `Lou Bega` plus
 * `Mambo No5` lines up with `Mambo No. 5 (A Little Bit of...)` without any of the
 * fuzziness that makes the web service's phrase search both miss real matches and accept
 * wrong ones. It is one pass over a local file rather than a request per song.
 *
 * The dump carries no works, composers, release dates or aliases, so the web service is
 * still needed to enrich whatever matches here. Its chosen release is often a karaoke
 * compilation, so a year must never be read from it, and its artist credit is
 * release-specific, so canonical artist names have to come from the MBID.
 *
 * Get the dump from https://metabrainz.org/datasets/derived-dumps#canonical (CC0, ~2.3 GB
 * compressed, refreshed twice a month) and point --csv at canonical_musicbrainz_data.csv.
 *
 * Usage: pnpm match:canonical --csv <file> [--out data/canonical-matches.json]
 */

import { createReadStream } from "node:fs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import catalogue from "../data/songs.json" with { type: "json" };

/**
 * Characters the dump's Unidecode pass folds but Unicode decomposition does not, since
 * they are single code points rather than a base plus a combining mark. The Nordic ones
 * are the whole point for this catalogue.
 */
const FOLDED = new Map([
    ["ø", "o"],
    ["æ", "ae"],
    ["ß", "ss"],
    ["ð", "d"],
    ["þ", "th"],
    ["đ", "d"],
    ["ł", "l"],
    ["œ", "oe"],
]);

/**
 * Reproduces the dump's own key: strip everything that is not a letter, digit or
 * underscore, lowercase, then reduce to ASCII.
 */
export function combinedLookup(...parts: string[]): string {
    const stripped = parts
        .join("")
        .replace(/[^\p{L}\p{N}_]+/gu, "")
        .toLowerCase();
    const folded = [...stripped].map((character) => FOLDED.get(character) ?? character).join("");
    return folded.normalize("NFKD").replace(/\p{M}+/gu, "");
}

/**
 * The rewritings the venue's strings need before they line up with MusicBrainz's. The
 * dropped leading article is the big one, and it happens at both ends: the catalogue files
 * The Beatles, The Kinks and The Cranberries without their article, and does the same to
 * titles — `Winner takes it all`, `Little Time`, `Rush of blood to the head`. No amount of
 * punctuation folding fixes that, because the missing word is at the front of the key.
 */
const REWRITES = [
    "artist-article-added",
    "title-article-added",
    "title-article-dropped",
    "annotation-stripped",
    "ampersand-spelled-out",
] as const;
type Rewrite = (typeof REWRITES)[number];

/** Trailing parentheses are the venue annotating, or MusicBrainz marking a version. */
const withoutAnnotation = (title: string): string => title.replace(/\s*[([][^()[\]]*[)\]]\s*$/, "").trim();

/**
 * Parentheses on the *artist* column are almost always the venue stuffing a film/show into
 * the only field it had: `Enya (fellowship Of The Ring Soundtrack)`. Strip those so the real
 * name can match, but leave clarifying performer notes alone — `Chess (Linda Eder)` is naming
 * who sings, not a soundtrack credit.
 */
const ARTIST_ANNOTATION =
    /\s*[([]([^()[\]]*(?:\bsoundtrack\b|\bfellowship\b|\bjungle book\b|\bdisney\b|\beurovision\b|\bfrom\b)[^()[\]]*)[)\]]\s*$/i;

const withoutArtistAnnotation = (artist: string): string => artist.replace(ARTIST_ANNOTATION, "").trim();

/**
 * Turn the stripped artist annotation into a `from` value worth searching for.
 * `fellowship Of The Ring Soundtrack` → `The Fellowship of the Ring`.
 */
function fromArtistAnnotation(artist: string): string | undefined {
    const match = ARTIST_ANNOTATION.exec(artist);
    if (match?.[1] === undefined) {
        return undefined;
    }
    let raw = match[1]
        .replace(/\bsoundtrack\b/gi, "")
        .replace(/\boriginal motion picture\b/gi, "")
        .replace(/\bthe movie\b/gi, "")
        .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
        .trim();
    if (/^fellowship of the ring$/i.test(raw)) {
        raw = "The Fellowship of the Ring";
    }
    return raw.length > 0 ? raw : undefined;
}

/**
 * Words that make a trailing bracket a marker for one particular master rather than part of
 * the song's name. The distinction matters twice over: `Lady Marmalade (Thunderpuss club mix)`
 * is the wrong title to show for a karaoke track, and dating that recording dates the remix.
 * Anything else in brackets is left alone, because `Exhale (Shoop Shoop)` and `The Ketchup
 * Song (Aserejé)` really are called that.
 *
 * `from` is here because MusicBrainz often folds the soundtrack credit into the recording
 * title — `Girls Talk Boys (from "Ghostbusters" original motion picture soundtrack)` — and
 * that is annotation, not the song's name. Without it, a prefix match grades as a version
 * and then publishes the contaminated title.
 */
const VERSION_MARKER =
    /\b(?:mix|remix|instrumental|acoustic|live|karaoke|backing track|edit|version|reprise|radio|extended|demo|remaster(?:ed)?|re-?recorded|unplugged|dub|a cappella|single|from)\b/i;

/**
 * Pull the show or film out of a `(from "…")` / `(from … soundtrack)` suffix, when that is
 * what the bracket is doing. Returns undefined for every other kind of bracket.
 */
function fromAnnotation(recording: string): string | undefined {
    const bracket = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(recording);
    if (bracket?.[1] === undefined || !/\bfrom\b/i.test(bracket[1])) {
        return undefined;
    }
    const raw = bracket[1]
        .replace(/^\s*from\s+/i, "")
        .replace(/\s*(?:original\s+)?(?:motion\s+picture\s+)?soundtrack\s*$/i, "")
        .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
        .trim();
    return raw.length > 0 ? raw : undefined;
}

/**
 * The title to publish, which is MusicBrainz's exact recording title unless that title only
 * differs by naming a master we did not ask about — or by naming the film it is from.
 */
function titleToUse(recording: string): { title: string; from?: string } {
    const bracket = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(recording);
    if (bracket?.[1] === undefined || !VERSION_MARKER.test(bracket[1])) {
        return { title: recording };
    }
    const base = withoutAnnotation(recording);
    const title = base.length > 0 ? base : recording;
    const from = fromAnnotation(recording);
    return from === undefined ? { title } : { title, from };
}

const LEADING_ARTICLE = /^(the|a|an)\s+/i;

/**
 * Where the venue joins several artists into one string. The whole string is then nobody: it
 * matches no key, and it has no other songs to be identified from, so `2 Pac feat. KC & Jo Jo`
 * is unreachable while `2 Pac` is not. Splitting on the first join word gives the lead, which
 * is enough to scope a search for the title.
 */
const JOIN = /\s+(?:feat\.?|ft\.?|featuring|with|duet with|med|vs\.?|versus|and|x)\s+|\s*[&,+/]\s*/i;

function leadArtist(artist: string): string | undefined {
    const lead = artist.split(JOIN)[0]?.trim();
    return lead !== undefined && lead.length > 0 && lead !== artist.trim() ? lead : undefined;
}

/** Every named part of a collaboration string, for order-independent matching. */
function artistFragments(artist: string): string[] {
    return artist
        .split(JOIN)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
}

interface Form {
    value: string;
    rewrites: Rewrite[];
}

/**
 * The key strips `&` rather than reading it, so a venue `&` and a MusicBrainz `and` fold to
 * different keys and never meet: `Belle & Sebastian` cannot reach `Belle and Sebastian`.
 * Spelling it out — and the other way, turning a venue `and` into `&` — is the missing form.
 * `Head and heart` is how the venue writes Joel Corry's `Head & Heart`; without the reverse
 * direction those never meet either. Only ever adds keys.
 */
function spelledOut(forms: Form[]): Form[] {
    return [
        ...forms,
        ...forms
            .filter((form) => form.value.includes("&"))
            .map((form) => ({
                value: form.value.replaceAll("&", " and "),
                rewrites: [...form.rewrites, "ampersand-spelled-out" as Rewrite],
            })),
        ...forms
            .filter((form) => /\sand\s/i.test(form.value))
            .map((form) => ({
                value: form.value.replace(/\sand\s/gi, " & "),
                rewrites: [...form.rewrites, "ampersand-spelled-out" as Rewrite],
            })),
    ];
}

function artistForms(artist: string): Form[] {
    const forms: Form[] = [{ value: artist, rewrites: [] }];
    const bare = withoutArtistAnnotation(artist);
    if (bare !== artist && bare.length > 0) {
        forms.push({ value: bare, rewrites: ["annotation-stripped"] });
    }
    for (const form of [...forms]) {
        if (!LEADING_ARTICLE.test(form.value)) {
            forms.push({ value: `The ${form.value}`, rewrites: [...form.rewrites, "artist-article-added"] });
        }
    }
    return spelledOut(forms);
}

function titleForms(title: string): Form[] {
    const forms: Form[] = [{ value: title, rewrites: [] }];
    const bare = withoutAnnotation(title);
    if (bare !== title && bare.length > 0) {
        forms.push({ value: bare, rewrites: ["annotation-stripped"] });
    }
    // Both directions, since the venue drops articles far more often than it adds them but
    // does both. Applied to the annotation-stripped form too, so `Winner takes it all
    // (duett)` can lose the annotation and gain the article in one go.
    for (const form of [...forms]) {
        if (LEADING_ARTICLE.test(form.value)) {
            forms.push({
                value: form.value.replace(LEADING_ARTICLE, ""),
                rewrites: [...form.rewrites, "title-article-dropped"],
            });
        } else {
            for (const article of ["The", "A", "An"]) {
                forms.push({
                    value: `${article} ${form.value}`,
                    rewrites: [...form.rewrites, "title-article-added"],
                });
            }
        }
    }
    return spelledOut(forms);
}

/**
 * Every key the song could reasonably be filed under, least-rewritten first. Ranking by how
 * much rewriting a key took is what keeps a rewritten match from beating a literal one.
 */
function keysFor(artist: string, title: string): { key: string; rewrites: Rewrite[] }[] {
    const candidates = artistForms(artist).flatMap((left) =>
        titleForms(title).map((right) => ({
            key: combinedLookup(left.value, right.value),
            rewrites: [...left.rewrites, ...right.rewrites],
        })),
    );
    candidates.sort((a, b) => a.rewrites.length - b.rewrites.length);
    const seen = new Set<string>();
    return candidates.filter((candidate) => !seen.has(candidate.key) && seen.add(candidate.key));
}

/**
 * How the row was found, worst last. A prefix match is weaker evidence than an exact one,
 * and how much weaker depends on what the extra text is: a version marker in brackets is
 * almost certainly the same song, two trailing letters is almost certainly a spelling
 * variant, and anything else may be a coincidence — `Secrets` reaches Madonna's
 * `Secret (Some Bizarre mix)` that way.
 *
 * `title-first` is the pass that starts from an exact title and asks whether the credit is
 * close enough to the venue's artist string. It is weaker than scoping by a known artist
 * id, but it is what reaches a misspelled artist who has no other trusted song yet —
 * `Zara Larssn`, `Colby Caillat`, `Nanne Grönwall`.
 */
const HOWS = [
    "exact",
    "version",
    "spelling",
    "artist-scoped",
    "lead-scoped",
    "collab-scoped",
    "title-first",
    "near",
    "loose",
] as const;
type How = (typeof HOWS)[number];

/** All but `loose`, which is the bucket for matches that could be coincidence. */
const TRUSTED: readonly How[] = [
    "exact",
    "version",
    "spelling",
    "artist-scoped",
    "lead-scoped",
    "collab-scoped",
    "title-first",
    "near",
];

/**
 * Whether two keys are within `limit` edits of each other, abandoning the calculation as
 * soon as they are not. Bounded rather than exact because the answer is only ever compared
 * against a small threshold.
 */
function within(a: string, b: string, limit: number): boolean {
    if (Math.abs(a.length - b.length) > limit) {
        return false;
    }
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let best = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            const value = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
            row.push(value);
            if (value < best) best = value;
        }
        if (best > limit) {
            return false;
        }
        previous = row;
    }
    return (previous[b.length] ?? limit + 1) <= limit;
}

/**
 * How far a key of this length may stray. A typo in a long title is still recognisably that
 * title; one character in a short one is a different song, and `Stay` is a single edit from
 * `Say`.
 */
function tolerance(key: string): number {
    if (key.length >= 12) return 2;
    return key.length >= 7 ? 1 : 0;
}

/**
 * Whether one key is the other with two neighbouring characters swapped, which is what makes
 * `Vouge` out of `Vogue`. Short titles get this and nothing else: a transposition is a slip
 * of the fingers rather than a different word, so it stays safe at lengths where a single
 * substitution would not be.
 */
function transposed(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    const differing = [...a].flatMap((char, index) => (char === b[index] ? [] : [index]));
    const [first, second] = differing;
    return (
        differing.length === 2 &&
        first !== undefined &&
        second === first + 1 &&
        a[first] === b[second] &&
        a[second] === b[first]
    );
}

/** Close enough to be the same title, given how much room a key of this length has. */
const nearlySame = (candidate: string, key: string): boolean =>
    tolerance(key) === 0 ? transposed(candidate, key) : within(candidate, key, tolerance(key));

/**
 * Whether a dump credit is close enough to the venue's artist string to accept a title-first
 * match. Exact and near-edit matches count, as do a lead that heads the credit, and a credit
 * that is a prefix of the venue's name (`Nanne` for `Nanne Grönwall` — MusicBrainz files her
 * under the mononym and keeps Grönvall only as disambiguation, so the dump never says the
 * surname).
 */
function artistCloseEnough(venue: string, credit: string): boolean {
    const venueKey = combinedLookup(venue);
    const creditKey = combinedLookup(credit);
    if (venueKey.length === 0 || creditKey.length === 0) {
        return false;
    }
    if (venueKey === creditKey || nearlySame(venueKey, creditKey)) {
        return true;
    }
    // Mononym / longer-name: both sides long enough that a shared prefix is not `A` vs `ABBA`.
    if (
        venueKey.length >= 5 &&
        creditKey.length >= 5 &&
        (venueKey.startsWith(creditKey) || creditKey.startsWith(venueKey))
    ) {
        return true;
    }
    const lead = leadArtist(venue);
    if (lead !== undefined) {
        const leadKey = combinedLookup(lead);
        if (leadKey.length === 0) {
            return false;
        }
        if (creditKey === leadKey || creditKey.startsWith(leadKey) || nearlySame(creditKey, leadKey)) {
            return true;
        }
        const creditLead = leadArtist(credit) ?? credit.split(",")[0]?.trim() ?? credit;
        const creditLeadKey = combinedLookup(creditLead);
        if (creditLeadKey.length > 0 && (leadKey === creditLeadKey || nearlySame(leadKey, creditLeadKey))) {
            return true;
        }
    }
    return false;
}

/**
 * Short titles collide constantly (`Go`, `Stay`, `Hero`), so a title-first accept there
 * needs the artist itself to be an exact or near match, not merely a lead prefix.
 */
function acceptTitleFirst(venue: string, credit: string, titleKey: string): boolean {
    if (!artistCloseEnough(venue, credit)) {
        return false;
    }
    if (titleKey.length >= 8) {
        return true;
    }
    const venueKey = combinedLookup(venue);
    const creditKey = combinedLookup(credit);
    if (venueKey === creditKey || nearlySame(venueKey, creditKey)) {
        return true;
    }
    const lead = leadArtist(venue);
    if (lead === undefined) {
        return false;
    }
    const creditLead = leadArtist(credit) ?? credit.split(",")[0]?.trim() ?? credit;
    const leadKey = combinedLookup(lead);
    const creditLeadKey = combinedLookup(creditLead);
    return leadKey.length > 0 && (leadKey === creditLeadKey || nearlySame(leadKey, creditLeadKey));
}

interface Row {
    artistCredit: string;
    artistMbids: string[];
    recording: string;
    recordingMbid: string;
    release: string;
    score: number;
}

/** A song asking to be matched under one particular key. */
interface Wanted {
    postId: number;
    /** How much rewriting the key took, so a literal match always wins. */
    rank: number;
    rewrites: Rewrite[];
    /** Set when the key came from a proposal rather than from the catalogue's own strings. */
    proposed?: string;
    from?: string;
}

interface Match extends Row {
    how: How;
    /** Which rewritings of the venue's strings it took to get here, if any. */
    rewrites: Rewrite[];
    /** The proposer's reasoning, where the dump confirmed a proposal rather than a scrape. */
    proposed?: string;
    /** The show or film the song comes from, as the proposal gave it. */
    from?: string;
    trusted: boolean;
}

/** The row's own fields, read only for the few thousand rows that matched. */
function parseRow(line: string): string[] {
    const fields: string[] = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < line.length; index++) {
        const character = line[index];
        if (quoted) {
            if (character === '"') {
                if (line[index + 1] === '"') {
                    field += '"';
                    index++;
                } else {
                    quoted = false;
                }
            } else {
                field += character;
            }
        } else if (character === '"') {
            quoted = true;
        } else if (character === ",") {
            fields.push(field);
            field = "";
        } else {
            field += character;
        }
    }
    fields.push(field);
    return fields;
}

function toRow(line: string): Row | undefined {
    const fields = parseRow(line);
    if (fields.length < 10) {
        return undefined;
    }
    return {
        artistCredit: fields[3] ?? "",
        artistMbids: (fields[2] ?? "").split(/[,\s]+/).filter((mbid) => mbid.length > 0),
        recording: fields[7] ?? "",
        recordingMbid: fields[6] ?? "",
        release: fields[5] ?? "",
        score: Number(fields[9]),
    };
}

/**
 * Streams the dump, handing each row's lookup key to a visitor. `combined_lookup` holds
 * no commas, so it can be found as the second-to-last comma-separated field without
 * parsing the commas inside the quoted names before it.
 */
async function scan(csv: string, visit: (key: string, line: string) => void): Promise<number> {
    const reader = createInterface({ input: createReadStream(csv, { encoding: "utf8" }), crlfDelay: Infinity });
    let rows = 0;
    for await (const line of reader) {
        rows++;
        if (rows === 1) {
            continue;
        }
        const lastComma = line.lastIndexOf(",");
        if (lastComma < 1) continue;
        const keyComma = line.lastIndexOf(",", lastComma - 1);
        if (keyComma < 0) continue;
        const key = line.slice(keyComma + 1, lastComma);
        if (key.length > 0) visit(key, line);
    }
    return rows;
}

/**
 * Buckets keys by a fixed-length head or tail so that most of the dump's rows cost a
 * single hash lookup, which is what keeps a full scan to well under a minute.
 */
function affixIndex(keys: Iterable<string>, end: "head" | "tail"): (value: string) => string[] {
    const width = 8;
    const affixOf = (value: string): string => (end === "head" ? value.slice(0, width) : value.slice(-width));
    const buckets = new Map<string, string[]>();
    const short: string[] = [];
    for (const key of keys) {
        if (key.length < width) {
            short.push(key);
            continue;
        }
        const bucket = buckets.get(affixOf(key));
        if (bucket === undefined) buckets.set(affixOf(key), [key]);
        else bucket.push(key);
    }

    /** Every stored key that is a prefix (or suffix) of `value`, longest first. */
    return (value: string): string[] => {
        const pool = buckets.get(affixOf(value));
        if (pool === undefined && short.length === 0) {
            return [];
        }
        const test = end === "head" ? (k: string) => value.startsWith(k) : (k: string) => value.endsWith(k);
        return [...(pool ?? []), ...short].filter(test).sort((a, b) => b.length - a.length);
    };
}

/** Grades a prefix match by what the canonical title has that the venue's does not. */
function gradePrefix(ourKey: string, recording: string, credit: string): How {
    const strippedKey = combinedLookup(credit, withoutAnnotation(recording));
    if (strippedKey === ourKey) {
        return "version";
    }
    const full = combinedLookup(credit, recording);
    return full.length - ourKey.length <= 2 ? "spelling" : "loose";
}

/**
 * A guess at what a song the dump cannot place actually is. Written by whoever is working the
 * review queue, by hand or by an agent, and deliberately not authoritative: a proposal only
 * ever adds keys to look for, so it takes effect if and only if MusicBrainz turns out to hold
 * that artist with that recording. A wrong guess finds nothing and changes nothing, which is
 * what makes it safe to let something fallible write this file.
 */
interface Proposal {
    postId: number;
    artist?: string;
    title?: string;
    /**
     * The show or film the song is from, where that is what the venue put in the artist
     * column. Its own field rather than an artist, because `Grease` is not a performer and
     * `John Travolta` is not what anyone searches for.
     */
    from?: string;
    /** Why the proposer thinks so, kept for whoever reads the match later. */
    why: string;
}

/**
 * Worse than any rewriting, so that a proposal can only win where nothing else matched at
 * all. Guessing must never be able to overrule the catalogue's own strings.
 */
const PROPOSED_RANK = 99;

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            csv: { type: "string" },
            out: { type: "string", default: "data/canonical-matches.json" },
            proposals: { type: "string", default: "data/proposals.json" },
        },
    });
    if (values.csv === undefined) {
        throw new Error("--csv <canonical_musicbrainz_data.csv> is required.");
    }

    const proposals = new Map<number, Proposal>();
    if (values.proposals !== undefined) {
        // Absent is fine: proposals are an optional layer, and the file may not exist yet.
        const raw = await readFile(values.proposals, "utf8").catch(() => undefined);
        const file = raw === undefined ? undefined : (JSON.parse(raw) as { proposals: Proposal[] });
        for (const proposal of file?.proposals ?? []) proposals.set(proposal.postId, proposal);
        if (proposals.size > 0) console.log(`${proposals.size} proposals to put to the dump`);
    }

    // Several songs can share a key: the catalogue lists some songs twice under different
    // punch-in numbers.
    const wanted = new Map<string, Wanted[]>();
    const add = (key: string, entry: Wanted): void => {
        const existing = wanted.get(key);
        if (existing === undefined) wanted.set(key, [entry]);
        else existing.push(entry);
    };
    for (const song of catalogue.songs) {
        for (const { key, rewrites } of keysFor(song.artist, song.song)) {
            add(key, { postId: song.postId, rank: rewrites.length, rewrites });
        }
        const proposal = proposals.get(song.postId);
        if (proposal !== undefined) {
            const keys = keysFor(proposal.artist ?? song.artist, proposal.title ?? song.song);
            for (const { key, rewrites } of keys) {
                add(key, {
                    postId: song.postId,
                    rank: PROPOSED_RANK,
                    rewrites,
                    proposed: proposal.why,
                    ...(proposal.from === undefined ? {} : { from: proposal.from }),
                });
            }
        }
    }

    const best = new Map<number, Match & { rank: number }>();
    const heads = affixIndex(wanted.keys(), "head");

    const consider = (entry: Wanted, how: How, row: Row): void => {
        const { postId, rank } = entry;
        const existing = best.get(postId);
        if (existing !== undefined) {
            if (rank > existing.rank) return;
            if (rank === existing.rank) {
                const order = HOWS.indexOf(how) - HOWS.indexOf(existing.how);
                if (order > 0) return;
                if (order === 0 && !(row.score < existing.score)) return;
            }
        }
        best.set(postId, {
            ...row,
            how,
            rewrites: entry.rewrites,
            ...(entry.proposed === undefined ? {} : { proposed: entry.proposed }),
            ...(entry.from === undefined ? {} : { from: entry.from }),
            rank,
            trusted: TRUSTED.includes(how),
        });
    };

    console.log("pass 1: matching artist and title together");
    const rows = await scan(values.csv, (key, line) => {
        // Every entry in a bucket asked for the same key, so one grading serves them all.
        const asked = wanted.has(key) ? key : heads(key)[0];
        if (asked === undefined) {
            return;
        }
        const entries = wanted.get(asked);
        if (entries === undefined) {
            return;
        }
        const row = toRow(line);
        if (row === undefined) {
            return;
        }
        const how: How = asked === key ? "exact" : gradePrefix(asked, row.recording, row.artistCredit);
        for (const entry of entries) {
            consider(entry, how, row);
        }
    });

    const afterFirst = best.size;
    console.log(`  ${rows} rows scanned, ${afterFirst}/${catalogue.songs.length} songs matched`);

    // A second pass, now that we know which MBIDs the catalogue's artists correspond to.
    // The venue's typos live here: `Sugarbabes`, `Rozallo`, `Zuchero` and `Pink` for
    // `P!nk` never match a combined key, but their other songs did, so the artist is
    // known and the title alone is enough to place the rest.
    const mbidsByArtist = new Map<string, Set<string>>();
    const remember = (artistKey: string, mbids: Iterable<string>): void => {
        const set = mbidsByArtist.get(artistKey) ?? new Set<string>();
        for (const mbid of mbids) set.add(mbid);
        mbidsByArtist.set(artistKey, set);
    };
    for (const song of catalogue.songs) {
        const match = best.get(song.postId);
        if (match === undefined || !match.trusted) continue;
        remember(combinedLookup(song.artist), match.artistMbids);
        // A collaboration matched under its full venue string still identifies its lead:
        // `Clean Bandit feat. Sean Paul & Anne-Marie` is how we learn who Clean Bandit is,
        // and without that, `Clean Bandit ft Zara Larssn` has nobody to scope by.
        const lead = leadArtist(song.artist);
        const leadMbid = match.artistMbids[0];
        if (lead !== undefined && leadMbid !== undefined) {
            remember(combinedLookup(lead), [leadMbid]);
        }
        // Featured artists too, when the credit line splits into as many names as ids:
        // `Bruno Mars ft Cardi B` is how we learn Cardi B, so `J Balvin ft. Cardi B` can
        // insist on both ids being present rather than guessing from the lead alone.
        const creditParts = artistFragments(match.artistCredit);
        if (creditParts.length > 1 && creditParts.length === match.artistMbids.length) {
            for (let index = 0; index < creditParts.length; index++) {
                const part = creditParts[index];
                const mbid = match.artistMbids[index];
                if (part !== undefined && mbid !== undefined) {
                    remember(combinedLookup(part), [mbid]);
                }
            }
        }
    }

    const byTitle = new Map<string, { postId: number; mbids: Set<string>; viaLead: boolean }[]>();
    for (const song of catalogue.songs) {
        if (best.has(song.postId)) continue;
        // The whole artist string first, then its lead. 111 of the misses are a collaboration
        // the venue wrote as one string whose lead we have already identified elsewhere.
        const own = mbidsByArtist.get(combinedLookup(song.artist));
        const lead = leadArtist(song.artist);
        const viaLead = own === undefined || own.size === 0;
        const mbids = viaLead ? (lead === undefined ? undefined : mbidsByArtist.get(combinedLookup(lead))) : own;
        if (mbids === undefined || mbids.size === 0) continue;
        for (const title of new Set([song.song, withoutAnnotation(song.song)])) {
            const key = combinedLookup(title);
            if (key.length === 0) continue;
            const entry = { postId: song.postId, mbids, viaLead };
            const existing = byTitle.get(key);
            if (existing === undefined) byTitle.set(key, [entry]);
            else existing.push(entry);
        }
    }

    if (byTitle.size > 0) {
        console.log(`pass 2: ${byTitle.size} titles from artists we can now identify`);
        const tails = affixIndex(byTitle.keys(), "tail");
        await scan(values.csv, (key, line) => {
            for (const titleKey of tails(key)) {
                const entries = byTitle.get(titleKey);
                if (entries === undefined) continue;
                let row: Row | undefined;
                for (const entry of entries) {
                    row ??= toRow(line);
                    if (row === undefined) return;
                    // The title has to be the whole of the row's title, not a fragment of
                    // it, or `Stay` would match everything ending in that word.
                    if (combinedLookup(row.recording) !== titleKey) continue;
                    // Scoping by a lead means the lead has to be the lead. Merely appearing in
                    // the credit is how `Peabo Bryson & Regina Bell – A whole new world` lands
                    // on a Koda Kumi cover that features him.
                    const credited = entry.viaLead ? row.artistMbids.slice(0, 1) : row.artistMbids;
                    if (!credited.some((mbid) => entry.mbids.has(mbid))) continue;
                    consider(
                        { postId: entry.postId, rank: 0, rewrites: [] },
                        entry.viaLead ? "lead-scoped" : "artist-scoped",
                        row,
                    );
                }
            }
        });
        console.log(`  recovered ${best.size - afterFirst} more songs`);
    }

    // Collaborations the venue billed in the wrong order: `Ed Sheeran Ft. Eminem – River` is
    // Eminem feat. Ed Sheeran, and `Justin Bieber ft Ed sheeran – I don't care` is Ed Sheeran &
    // Justin Bieber. Lead-scoping rejects those because the venue's lead is not the recording's.
    // When two or more named fragments are already known, requiring every one of them on the
    // credit is order-free and still blocks the Peabo-on-a-cover failure (Regina Belle absent).
    const beforeCollab = best.size;
    const collabByTitle = new Map<string, { postId: number; required: Set<string>[] }[]>();
    for (const song of catalogue.songs) {
        if (best.has(song.postId)) continue;
        const fragments = artistFragments(song.artist);
        if (fragments.length < 2) continue;
        const required: Set<string>[] = [];
        for (const fragment of fragments) {
            const mbids =
                mbidsByArtist.get(combinedLookup(fragment)) ??
                (!LEADING_ARTICLE.test(fragment) ? mbidsByArtist.get(combinedLookup(`The ${fragment}`)) : undefined);
            if (mbids !== undefined && mbids.size > 0) {
                required.push(mbids);
            }
        }
        if (required.length < 2) continue;
        for (const title of new Set([song.song, withoutAnnotation(song.song)])) {
            const key = combinedLookup(title);
            if (key.length === 0) continue;
            const entry = { postId: song.postId, required };
            const existing = collabByTitle.get(key);
            if (existing === undefined) collabByTitle.set(key, [entry]);
            else existing.push(entry);
        }
    }
    if (collabByTitle.size > 0) {
        console.log(`pass 2b: ${collabByTitle.size} titles with two or more known collaboration fragments`);
        const tails = affixIndex(collabByTitle.keys(), "tail");
        await scan(values.csv, (key, line) => {
            for (const titleKey of tails(key)) {
                const entries = collabByTitle.get(titleKey);
                if (entries === undefined) continue;
                let row: Row | undefined;
                for (const entry of entries) {
                    if (best.has(entry.postId)) continue;
                    row ??= toRow(line);
                    if (row === undefined) return;
                    if (combinedLookup(row.recording) !== titleKey) continue;
                    const credited = new Set(row.artistMbids);
                    if (!entry.required.every((mbids) => [...mbids].some((mbid) => credited.has(mbid)))) continue;
                    consider({ postId: entry.postId, rank: 0, rewrites: [] }, "collab-scoped", row);
                }
            }
        });
        console.log(`  recovered ${best.size - beforeCollab} more songs`);
    }

    // A title-first pass, for artists the earlier passes cannot reach at all: the venue's
    // only song by them is misspelled (`Zara Larssn`, `Colby Caillat`, `Alannah Miles`), or
    // MusicBrainz files them under a mononym the dump does not alias (`Nanne`). Fuzzy-matching
    // every artist credit in the dump would be expensive; anchoring on an exact title keeps
    // the search space to the rows that share that title, then asking whether the credit is
    // reasonably close.
    const beforeTitleFirst = best.size;
    const titleFirst = new Map<string, { postId: number; artist: string }[]>();
    for (const song of catalogue.songs) {
        if (best.has(song.postId)) continue;
        for (const title of new Set([song.song, withoutAnnotation(song.song)])) {
            const key = combinedLookup(title);
            if (key.length < 4) continue;
            const entry = { postId: song.postId, artist: song.artist };
            const existing = titleFirst.get(key);
            if (existing === undefined) titleFirst.set(key, [entry]);
            else existing.push(entry);
        }
    }

    if (titleFirst.size > 0) {
        console.log(`pass 3: ${titleFirst.size} titles looking for a close-enough artist credit`);
        const tails = affixIndex(titleFirst.keys(), "tail");
        await scan(values.csv, (key, line) => {
            for (const titleKey of tails(key)) {
                const entries = titleFirst.get(titleKey);
                if (entries === undefined) continue;
                let row: Row | undefined;
                for (const entry of entries) {
                    if (best.has(entry.postId)) continue;
                    row ??= toRow(line);
                    if (row === undefined) return;
                    // Exact title only — the point of anchoring. Annotation-stripped equals
                    // count too, so a soundtrack suffix on MusicBrainz's side does not block us.
                    const recordingKey = combinedLookup(row.recording);
                    const bareKey = combinedLookup(withoutAnnotation(row.recording));
                    if (recordingKey !== titleKey && bareKey !== titleKey) continue;
                    if (!acceptTitleFirst(entry.artist, row.artistCredit, titleKey)) continue;
                    consider({ postId: entry.postId, rank: 0, rewrites: [] }, "title-first", row);
                }
            }
        });
        console.log(`  recovered ${best.size - beforeTitleFirst} more songs`);
    }

    // Title-first may have just identified artists the earlier scoped pass could not see —
    // Kygo only appeared as `Kygo Ft. …` until Firestone matched — so a second scoped pass
    // places the rest of their catalogue (`Kygo – Higher love`) now that the lead is known.
    const beforeRescope = best.size;
    const mbidsAfterTitle = new Map<string, Set<string>>();
    const rememberAfter = (artistKey: string, mbids: Iterable<string>): void => {
        const set = mbidsAfterTitle.get(artistKey) ?? new Set<string>();
        for (const mbid of mbids) set.add(mbid);
        mbidsAfterTitle.set(artistKey, set);
    };
    for (const song of catalogue.songs) {
        const match = best.get(song.postId);
        if (match === undefined || !match.trusted) continue;
        rememberAfter(combinedLookup(song.artist), match.artistMbids);
        const lead = leadArtist(song.artist);
        const leadMbid = match.artistMbids[0];
        if (lead !== undefined && leadMbid !== undefined) {
            rememberAfter(combinedLookup(lead), [leadMbid]);
        }
        // A title-first hit on a misspelled solo string (`Rozallo` → Rozalla) also teaches us
        // the credit's own name, so later songs filed under the canonical spelling can find it.
        if (match.how === "title-first" && match.artistMbids[0] !== undefined) {
            rememberAfter(combinedLookup(match.artistCredit), match.artistMbids);
        }
    }
    const rescopeByTitle = new Map<string, { postId: number; mbids: Set<string>; viaLead: boolean }[]>();
    for (const song of catalogue.songs) {
        if (best.has(song.postId)) continue;
        const own = mbidsAfterTitle.get(combinedLookup(song.artist));
        const lead = leadArtist(song.artist);
        const viaLead = own === undefined || own.size === 0;
        const mbids = viaLead ? (lead === undefined ? undefined : mbidsAfterTitle.get(combinedLookup(lead))) : own;
        if (mbids === undefined || mbids.size === 0) continue;
        for (const title of new Set([song.song, withoutAnnotation(song.song)])) {
            const key = combinedLookup(title);
            if (key.length === 0) continue;
            const entry = { postId: song.postId, mbids, viaLead };
            const existing = rescopeByTitle.get(key);
            if (existing === undefined) rescopeByTitle.set(key, [entry]);
            else existing.push(entry);
        }
    }
    if (rescopeByTitle.size > 0) {
        console.log(`pass 3b: ${rescopeByTitle.size} titles re-scoped to artists title-first identified`);
        const tails = affixIndex(rescopeByTitle.keys(), "tail");
        await scan(values.csv, (key, line) => {
            for (const titleKey of tails(key)) {
                const entries = rescopeByTitle.get(titleKey);
                if (entries === undefined) continue;
                let row: Row | undefined;
                for (const entry of entries) {
                    if (best.has(entry.postId)) continue;
                    row ??= toRow(line);
                    if (row === undefined) return;
                    if (combinedLookup(row.recording) !== titleKey) continue;
                    const credited = entry.viaLead ? row.artistMbids.slice(0, 1) : row.artistMbids;
                    if (!credited.some((mbid) => entry.mbids.has(mbid))) continue;
                    consider(
                        { postId: entry.postId, rank: 0, rewrites: [] },
                        entry.viaLead ? "lead-scoped" : "artist-scoped",
                        row,
                    );
                }
            }
        });
        console.log(`  recovered ${best.size - beforeRescope} more songs`);
    }

    // A fourth pass, for the songs whose artist we can reach but whose title we cannot. The
    // venue misspells titles as well as artists — `Wannabee`, `Fleetwod mac` — and a typo
    // is invisible to a key comparison however the key is built. Scoped to the artist's own
    // recordings and bounded by how far a key of that length may stray, a near match is
    // safe in a way that a global fuzzy search would not be.
    const beforeNear = best.size;
    const creditsByArtistKey = new Map<string, { credits: Set<string>; mbids: Set<string> }>();
    const rememberCredits = (artistKey: string, credit: string, mbids: Iterable<string>): void => {
        const entry = creditsByArtistKey.get(artistKey) ?? { credits: new Set<string>(), mbids: new Set<string>() };
        entry.credits.add(combinedLookup(credit));
        for (const mbid of mbids) entry.mbids.add(mbid);
        creditsByArtistKey.set(artistKey, entry);
    };
    for (const song of catalogue.songs) {
        const match = best.get(song.postId);
        if (match === undefined || !match.trusted) continue;
        rememberCredits(combinedLookup(song.artist), match.artistCredit, match.artistMbids);
        const lead = leadArtist(song.artist);
        const leadMbid = match.artistMbids[0];
        if (lead !== undefined && leadMbid !== undefined) {
            rememberCredits(combinedLookup(lead), match.artistCredit, [leadMbid]);
        }
    }

    const nearWanted = new Map<string, { postId: number; titleKey: string; mbids: Set<string> }[]>();
    const addNear = (artistKey: string, postId: number, titleKey: string): void => {
        const spelled = creditsByArtistKey.get(artistKey);
        const slack = tolerance(artistKey);
        const reachable =
            spelled !== undefined
                ? [spelled]
                : slack === 0
                  ? []
                  : [...creditsByArtistKey.entries()]
                        .filter(([key]) => within(key, artistKey, slack))
                        .map(([, entry]) => entry);
        for (const entry of reachable) {
            for (const credit of entry.credits) {
                const bucket = nearWanted.get(credit);
                const wantedEntry = { postId, titleKey, mbids: entry.mbids };
                if (bucket === undefined) nearWanted.set(credit, [wantedEntry]);
                else bucket.push(wantedEntry);
            }
        }
    };
    for (const song of catalogue.songs) {
        if (best.has(song.postId)) continue;
        const titleKey = combinedLookup(withoutAnnotation(song.song));
        // A key too short for an edit is still worth reaching for on a transposition alone.
        if (titleKey.length < 4) continue;
        addNear(combinedLookup(song.artist), song.postId, titleKey);
        // Collaborations whose lead we know but whose title is misspelled (`Monolpoly`,
        // `Next 2 you`) never reach the lead through the full artist string.
        const lead = leadArtist(song.artist);
        if (lead !== undefined) {
            addNear(combinedLookup(lead), song.postId, titleKey);
        }
    }

    if (nearWanted.size > 0) {
        const songsReached = new Set([...nearWanted.values()].flat().map((entry) => entry.postId)).size;
        console.log(`pass 4: ${songsReached} songs whose artist we know but whose title did not match`);
        const credits = affixIndex(nearWanted.keys(), "head");
        await scan(values.csv, (key, line) => {
            for (const credit of credits(key)) {
                const entries = nearWanted.get(credit);
                if (entries === undefined) continue;
                const rest = key.slice(credit.length);
                if (rest.length === 0) continue;
                let row: Row | undefined;
                for (const entry of entries) {
                    if (!nearlySame(rest, entry.titleKey)) continue;
                    row ??= toRow(line);
                    if (row === undefined) return;
                    if (!row.artistMbids.some((mbid) => entry.mbids.has(mbid))) continue;
                    consider({ postId: entry.postId, rank: 0, rewrites: [] }, "near", row);
                }
            }
        });
        console.log(`  recovered ${best.size - beforeNear} more songs`);
    }

    const results = catalogue.songs.map((song) => {
        const match = best.get(song.postId);
        if (match === undefined) {
            return { postId: song.postId, id: song.id, artist: song.artist, song: song.song, matched: false as const };
        }
        const { rank, ...rest } = match;
        // A bracketed name is one of MusicBrainz's placeholder entities, such as
        // [Disney] or [traditional]. It matches, and it means nothing.
        const placeholder = /^\[.*\]$/.test(match.artistCredit);
        // `recording` stays MusicBrainz's own title; `title` is the one to publish and to
        // date, which differs only where the match landed on a particular master.
        const published = titleToUse(match.recording);
        // A proposal's `from` wins over one extracted from the recording title or from an
        // artist-column soundtrack note: the proposer is naming the show the venue filed
        // under, which is the one worth searching for.
        const from = match.from ?? published.from ?? fromArtistAnnotation(song.artist);
        return {
            postId: song.postId,
            id: song.id,
            artist: song.artist,
            song: song.song,
            matched: true as const,
            ...rest,
            title: published.title,
            ...(from === undefined ? {} : { from }),
            ...(placeholder ? { placeholder: true as const, trusted: false } : {}),
        };
    });

    const matched = results.filter((r) => r.matched);
    const trusted = matched.filter((r) => r.trusted);
    console.log(`\nmatched ${matched.length}/${results.length}, of which ${trusted.length} are trustworthy`);
    for (const how of HOWS) {
        const n = matched.filter((r) => r.how === how).length;
        if (n > 0) console.log(`  ${how}: ${n}`);
    }
    for (const rewrite of REWRITES) {
        const n = matched.filter((r) => (r.rewrites ?? []).includes(rewrite)).length;
        if (n > 0) console.log(`  needed ${rewrite}: ${n}`);
    }
    console.log(`  placeholder credits discarded: ${matched.filter((r) => "placeholder" in r).length}`);

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, `${JSON.stringify({ songs: results }, null, 2)}\n`, "utf8");
    console.log(`Wrote ${values.out}`);
}

// Guarded so that `combinedLookup` can be imported and exercised without the import
// kicking off a scan of a seven-gigabyte file.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main();
}
