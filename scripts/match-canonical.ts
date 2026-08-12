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
import {
    isLanguageVersionAnnotation,
    isMasterAnnotation,
    isTitleSubtitle,
    LANGUAGE_VERSION,
    publishedTitle,
} from "./lib/song-title.ts";
import type { WorkLink } from "./fetch-works.ts";

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
    "title-contraction",
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
    const bracket = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(title);
    // `Du hast (english)` must not strip to `Du hast` or it prefers the German master.
    // Keep the language tag, and add the MusicBrainz-shaped `English version` form.
    if (bracket?.[1] !== undefined && isLanguageVersionAnnotation(bracket[1])) {
        const language = LANGUAGE_VERSION.exec(bracket[1])?.[0];
        if (language !== undefined) {
            const capitalized = `${language.charAt(0).toUpperCase()}${language.slice(1).toLowerCase()}`;
            const normalized = title.replace(new RegExp(language, "i"), capitalized).replace(/\s+/g, " ").trim();
            if (normalized !== title) {
                forms.push({ value: normalized, rewrites: [] });
            }
            if (!/\bversion\b/i.test(bracket[1])) {
                forms.push({
                    value: `${withoutAnnotation(title)} (${capitalized} version)`,
                    rewrites: [],
                });
            }
        }
    } else {
        const bare = withoutAnnotation(title);
        if (bare !== title && bare.length > 0) {
            forms.push({ value: bare, rewrites: ["annotation-stripped"] });
        }
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
    // `Lying Eyes` / `Lyin' Eyes` — the venue often expands the contraction and then matches
    // a live bootleg titled that way instead of the studio cut.
    for (const form of [...forms]) {
        if (/\blying\b/i.test(form.value)) {
            forms.push({
                value: form.value.replace(/\blying\b/gi, "lyin'"),
                rewrites: [...form.rewrites, "title-contraction"],
            });
        }
        if (/\blyin'?\b/i.test(form.value)) {
            forms.push({
                value: form.value.replace(/\blyin'?\b/gi, "lying"),
                rewrites: [...form.rewrites, "title-contraction"],
            });
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
    /** ISO 639-3 lyrics language, where a proposal names one (never a show or film). */
    language?: string;
    /** Venue artist string, so a wrong-attribution proposal can beat a hit on the mistake. */
    venueArtist?: string;
    /** Artist the proposal named, when that differs from the venue. */
    proposalArtist?: string;
}

interface Match extends Row {
    how: How;
    /** Which rewritings of the venue's strings it took to get here, if any. */
    rewrites: Rewrite[];
    /** The proposer's reasoning, where the dump confirmed a proposal rather than a scrape. */
    proposed?: string;
    /** The show or film the song comes from, as the proposal gave it. */
    from?: string;
    /** ISO 639-3 lyrics language from a proposal, until a works lookup confirms one. */
    language?: string;
    /** Venue / proposal artists, kept so a later venue hit cannot undo a wrong-attribution fix. */
    venueArtist?: string;
    proposalArtist?: string;
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
        artistMbids: [...new Set((fields[2] ?? "").split(/[,\s]+/).filter((mbid) => mbid.length > 0))],
        recording: fields[7] ?? "",
        recordingMbid: fields[6] ?? "",
        release: fields[5] ?? "",
        score: Number(fields[9]),
    };
}

/** Concert bootlegs in the dump often outscore the studio cut on the same misspelled title. */
function isLiveRelease(release: string): boolean {
    return (
        /^\d{4}-\d{2}-\d{2}\s*:/.test(release) ||
        /\blive\b/i.test(release) ||
        /\bunplugged\b/i.test(release) ||
        /\bbootleg\b/i.test(release) ||
        /\b(?:live\s+lounge|in\s+concert|the\s+concert|concert\s+celebration|concert)\b/i.test(
            release,
        ) ||
        // Venue-named releases without the word "live" (e.g. Alicia Keys – Radio City Hall NYC).
        /\b(?:radio city|madison square|wembley|stadium|arena|amphitheatre|amphitheater|festival|concert hall|high school|sof[iı]|o₂|o2|mtv\s+history)\b/i.test(
            release,
        )
    );
}

/**
 * True when the venue (or a proposal) already named a language version — then a
 * `Waterloo (German version)`-shaped MusicBrainz title is what they asked for, not junk.
 * Bare venue titles like `Waterloo` must not invent a language that way.
 */
function titleAsksForLanguageVersion(title: string | undefined): boolean {
    if (title === undefined || title.length === 0) return false;
    const bracket = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(title);
    if (bracket?.[1] !== undefined && isLanguageVersionAnnotation(bracket[1])) return true;
    return LANGUAGE_VERSION.test(title) && /\bversion\b/i.test(title);
}

/** Remix / acoustic / club / concert masters should not beat the plain studio cut. */
function isVariantRecording(recording: string, allowLanguageVersion = false): boolean {
    const bracket = /\s*[([]([^()[\]]*)[)\]]\s*$/.exec(recording);
    if (bracket?.[1] !== undefined) {
        const inner = bracket[1].trim();
        // Language versions are only the song when the venue filed one (`Du hast (English
        // version)`). A bare `Waterloo` matching `Waterloo (German version)` is a variant.
        if (isLanguageVersionAnnotation(inner)) return !allowLanguageVersion;
        // Master markers win over subtitle heuristics (`The Eliel mix` contains "The").
        if (isMasterAnnotation(inner)) return true;
        if (isTitleSubtitle(inner)) return false;
        // Remixer-only tags (`Bimbo Jones`) and bare years (`(2010)`) are particular masters
        // even when they omit the word "mix".
        if (/^(?:19|20)\d{2}$/.test(inner)) return true;
        if (/^(?:feat\.?|ft\.?|featuring)\b/i.test(inner)) return true;
        if (/\b(?:dj|vs\.?|versus)\b|\sx\s/i.test(inner)) return true;
        // Two+ Capitalised names with no subtitle grammar → remixer credit, not a subtitle.
        if (/^[A-Z0-9][\w'’.&]*?(?:\s+[A-Z0-9][\w'’.&]*)+$/u.test(inner)) return true;
        return false;
    }
    // DJ mashups are not the karaoke master (`Just the Way You Are (Amazing) Vs. …`).
    // Do not treat album medleys (`If I Was Your Woman / Walk On By`) as variants — that
    // Diary cut is the studio recording, and marking it a variant left Unplugged winning.
    if (/\bvs\.?\b/i.test(recording)) return true;
    // Do not match bare `club` here — that is the title of `In da Club`, not a club mix.
    return /\b(?:remix|rmx|emix|mix|blend|revision|rework|dub|mash(?:[- ]?up)?|bootleg|acoustic|instrumental|karaoke|mixtape|(?:the\s+)?video|sessions?|slowed|chopped|hook)\b/i.test(
        recording,
    );
}

/**
 * Lower is better. Live/remix masters and random compilation homes lose to the plain studio
 * cut even when the dump's raw score prefers the junk row (Lady Marmalade on Just Be Free
 * outscoring the Lady Marmalade single).
 */
function matchQuality(row: Row, allowLanguageVersion = false): number {
    let quality = row.score;
    if (isLiveRelease(row.release)) quality += 50_000_000;
    if (isVariantRecording(row.recording, allowLanguageVersion)) quality += 40_000_000;
    // A release named for the recording is usually the single/album track we want.
    if (combinedLookup(row.release) === combinedLookup(withoutAnnotation(row.recording))) {
        quality -= 1_000_000;
    }
    return quality;
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
function gradePrefix(ourKey: string, recording: string, credit: string): How | undefined {
    const strippedKey = combinedLookup(credit, withoutAnnotation(recording));
    if (strippedKey === ourKey) {
        return "version";
    }
    // Album medley whose first half is our title (`If I Was Your Woman / Walk On By`).
    const medleyHead = recording.split(/\s\/\s/)[0]?.trim();
    if (
        medleyHead !== undefined &&
        medleyHead.length > 0 &&
        medleyHead !== recording &&
        combinedLookup(credit, withoutAnnotation(medleyHead)) === ourKey
    ) {
        return "version";
    }
    const full = combinedLookup(credit, recording);
    const extra = full.length - ourKey.length;
    // A couple of trailing letters is a spelling variant. A long mashup/remix suffix is not
    // evidence for the song — those rows must reach us as `version` after stripping, or not
    // at all (`Just the Way You Are (Amazing) Vs. U Sure Do…` used to win as `loose`).
    if (extra <= 2) return "spelling";
    return undefined;
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
     * `John Travolta` is not what anyone searches for. Not for language labels such as
     * `Finsk musik` or `Italian` — those belong in `language`.
     */
    from?: string;
    /**
     * ISO 639-3 lyrics language (`fin`, `ita`, `swe`, …), where the venue filed songs under
     * a language label rather than a performer, or where a proposer knows the language
     * ahead of a works lookup.
     */
    language?: string;
    /** Why the proposer thinks so, kept for whoever reads the match later. */
    why: string;
}

/** Punctuation, case and diacritics removed for comparing credit lines to proposals. */
const nameKey = (value: string): string =>
    value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/\p{M}+/gu, "")
        .replace(/[^a-z0-9]/g, "");

/**
 * Worse than any rewriting for ordinary collisions, so a speculative proposal cannot
 * overrule the catalogue's own strings. Wrong-attribution proposals are exempt in
 * `consider` when the existing hit is clearly the mistaken venue artist.
 */
const PROPOSED_RANK = 99;

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            csv: { type: "string" },
            out: { type: "string", default: "data/canonical-matches.json" },
            proposals: { type: "string", default: "data/proposals.json" },
            works: { type: "string", default: "data/works.json" },
        },
    });
    if (values.csv === undefined) {
        throw new Error("--csv <canonical_musicbrainz_data.csv> is required.");
    }

    const workTitles = new Map<string, string>();
    {
        const raw = await readFile(values.works, "utf8").catch(() => undefined);
        const file = raw === undefined ? undefined : (JSON.parse(raw) as { works: WorkLink[] });
        for (const work of file?.works ?? []) {
            if (work.title !== undefined && work.title.length > 0) {
                workTitles.set(work.recordingMbid, work.title);
            }
        }
        if (workTitles.size > 0) {
            console.log(`${workTitles.size} MusicBrainz work titles to prefer over recording titles`);
        }
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
                    venueArtist: song.artist,
                    ...(proposal.artist === undefined ? {} : { proposalArtist: proposal.artist }),
                    ...(proposal.from === undefined ? {} : { from: proposal.from }),
                    ...(proposal.language === undefined ? {} : { language: proposal.language }),
                });
            }
        }
    }

    const best = new Map<number, Match & { rank: number }>();
    const heads = affixIndex(wanted.keys(), "head");
    const venueSongByPostId = new Map(catalogue.songs.map((song) => [song.postId, song.song]));

    const allowsLanguageVersion = (postId: number): boolean => {
        const proposal = proposals.get(postId);
        return (
            titleAsksForLanguageVersion(venueSongByPostId.get(postId)) ||
            titleAsksForLanguageVersion(proposal?.title)
        );
    };

    const consider = (entry: Wanted, how: How, row: Row): void => {
        const { postId, rank } = entry;
        const allowLanguageVersion = allowsLanguageVersion(postId);
        const existing = best.get(postId);
        if (existing !== undefined) {
            // A confirmed wrong-attribution proposal must not be stolen back by an exact hit
            // on the mistaken venue artist (scan order otherwise prefers the mistake).
            if (
                existing.proposalArtist !== undefined &&
                entry.proposalArtist === undefined &&
                existing.venueArtist !== undefined
            ) {
                const venueKey = nameKey(existing.venueArtist);
                const proposedKey = nameKey(existing.proposalArtist);
                const newKey = nameKey(row.artistCredit);
                if (
                    venueKey.length > 0 &&
                    newKey.includes(venueKey.slice(0, Math.min(venueKey.length, 12))) &&
                    !newKey.includes(proposedKey.slice(0, Math.min(proposedKey.length, 12)))
                ) {
                    return;
                }
            }
            const existingLive = isLiveRelease(existing.release);
            const newLive = isLiveRelease(row.release);
            const existingVariant = isVariantRecording(existing.recording, allowLanguageVersion);
            const newVariant = isVariantRecording(row.recording, allowLanguageVersion);
            // Never replace a plain studio cut with a live/remix just because the venue
            // string ranked better — Alicia Keys' Songs in A Minor title is shorter than
            // the live `…Anymore` the venue wrote, so the proposal hits studio at a worse
            // rank and must not be stolen back by Radio City Hall.
            if (!existingLive && !existingVariant && (newLive || newVariant)) {
                return;
            }
            // A studio cut reached by one title contraction beats a concert bootleg that
            // matched the venue's misspelling exactly (`Lying Eyes` live vs `Lyin' Eyes`).
            // Proposals may use a worse rank; still let them pull the studio master.
            // Do not treat an acoustic/remix as "studio" just because its release is not live —
            // that is how `I'm Just Ken (acoustic)` stole the live plain-title master.
            // A live exact hit must not permanently block a studio cut reached later via
            // artist-scoped / title-first (Destiny's Child – Soldier: Live in Atlanta vs
            // Destiny Fulfilled). Rank/how may be worse; the studio master is still right.
            const studioUpgrade = existingLive && !newLive && !newVariant;
            const variantUpgrade =
                existingVariant &&
                !newVariant &&
                (rank <= existing.rank + 1 || entry.proposed !== undefined);
            // Same how/rank: prefer the single/album cut over a junk home the dump scores
            // higher (Lady Marmalade → Just Be Free vs the Lady Marmalade single).
            const qualityUpgrade =
                !newLive &&
                !newVariant &&
                matchQuality(row, allowLanguageVersion) < matchQuality(existing, allowLanguageVersion) &&
                rank <= existing.rank;
            // Exact studio via annotation-strip (rank 1) must beat a loose mashup on the raw
            // venue title (rank 0). Rewrite-count rank alone preferred the junk row.
            const howUpgrade =
                HOWS.indexOf(how) < HOWS.indexOf(existing.how) &&
                !newLive &&
                !newVariant;
            // Wrong-attribution proposals: the venue string matched someone else who happens
            // to have a recording of that title (`Dynamite` the band, solo `Steve Miller`).
            // Prefer the dump hit on the artist the proposal named.
            let attributionUpgrade = false;
            if (entry.proposalArtist !== undefined && entry.venueArtist !== undefined) {
                const venueKey = nameKey(entry.venueArtist);
                const proposedKey = nameKey(entry.proposalArtist);
                const existingKey = nameKey(existing.artistCredit);
                const newKey = nameKey(row.artistCredit);
                if (
                    venueKey.length > 0 &&
                    proposedKey.length > 0 &&
                    venueKey !== proposedKey &&
                    existingKey.includes(venueKey.slice(0, Math.min(venueKey.length, 12))) &&
                    (newKey.includes(proposedKey.slice(0, Math.min(proposedKey.length, 12))) ||
                        proposedKey.includes(newKey.slice(0, Math.min(newKey.length, 12))))
                ) {
                    attributionUpgrade = true;
                }
            }
            // A proposal that reaches a better how than the venue's own strings must be
            // allowed to win even at PROPOSED_RANK. Otherwise a truncated title that only
            // `loose`-matches a remix (`Don't think twice` → wrong Dylan master) permanently
            // blocks the proposal that names the real studio cut.
            const proposalUpgrade =
                entry.proposed !== undefined &&
                HOWS.indexOf(how) < HOWS.indexOf(existing.how);
            if (
                !studioUpgrade &&
                !variantUpgrade &&
                !qualityUpgrade &&
                !howUpgrade &&
                !attributionUpgrade &&
                !proposalUpgrade
            ) {
                if (rank > existing.rank) return;
                if (rank === existing.rank) {
                    const order = HOWS.indexOf(how) - HOWS.indexOf(existing.how);
                    if (order > 0) return;
                    if (order === 0 && !(matchQuality(row, allowLanguageVersion) < matchQuality(existing, allowLanguageVersion))) return;
                }
            }
        }
        best.set(postId, {
            ...row,
            how,
            rewrites: entry.rewrites,
            ...(entry.proposed === undefined ? {} : { proposed: entry.proposed }),
            ...(entry.from === undefined ? {} : { from: entry.from }),
            ...(entry.language === undefined ? {} : { language: entry.language }),
            ...(entry.venueArtist === undefined ? {} : { venueArtist: entry.venueArtist }),
            ...(entry.proposalArtist === undefined ? {} : { proposalArtist: entry.proposalArtist }),
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
        const how: How | undefined =
            asked === key ? "exact" : gradePrefix(asked, row.recording, row.artistCredit);
        // Long prefix leftovers are mashups/remixes, not a spelling of our key — skip.
        if (how === undefined) return;
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
        const current = best.get(song.postId);
        // Also re-open songs stuck on a live/remix master so a studio cut can upgrade them
        // (Destiny's Child – Soldier matched Live in Atlanta before Destiny Fulfilled).
        if (current !== undefined) {
            if (
                !isLiveRelease(current.release) &&
                !isVariantRecording(current.recording, allowsLanguageVersion(song.postId))
            ) {
                continue;
            }
        }
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
        const proposal = proposals.get(song.postId);
        if (match === undefined) {
            return { postId: song.postId, id: song.id, artist: song.artist, song: song.song, matched: false as const };
        }
        const { rank, ...rest } = match;
        // A bracketed name is one of MusicBrainz's placeholder entities, such as
        // [Disney] or [traditional]. It matches, and it means nothing.
        const placeholder = /^\[.*\]$/.test(match.artistCredit);
        // `recording` stays MusicBrainz's own recording title. `title` is what to publish and
        // date: the linked work title when it names the same song, otherwise the recording
        // with only mix/soundtrack markers dropped — never year/concert regex hacks.
        const workTitle =
            match.recordingMbid === undefined ? undefined : workTitles.get(match.recordingMbid);
        const published = publishedTitle(match.recording, workTitle, match.how);
        // A proposal's title wins when it names the work more carefully than the matched
        // master (`FourFiveSeconds` vs a remix titled with spaces; `Du hast (English version)`).
        const title =
            proposal?.title !== undefined
                ? publishedTitle(proposal.title, undefined, match.how).title
                : published.title;
        // A proposal's `from` wins over one extracted from the recording title or from an
        // artist-column soundtrack note: the proposer is naming the show the venue filed
        // under, which is the one worth searching for. Apply even when a non-proposal key
        // won the recording match — `from` / `language` are not competing artist strings.
        const from =
            proposal?.from ?? match.from ?? published.from ?? fromArtistAnnotation(song.artist);
        const language = proposal?.language ?? match.language;
        // A confirmed proposal means a person already decided this row is the song — even a
        // `loose` how that only reached the right master through a truncated venue title.
        const trusted = match.trusted || proposal !== undefined;
        return {
            postId: song.postId,
            id: song.id,
            artist: song.artist,
            song: song.song,
            matched: true as const,
            ...rest,
            title,
            trusted,
            ...(from === undefined ? {} : { from }),
            ...(language === undefined ? {} : { language }),
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
