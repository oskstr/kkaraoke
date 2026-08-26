import MiniSearch from "minisearch";
import type { SearchSong } from "./catalog";

/**
 * Client search for the karaoke catalog.
 *
 * MiniSearch finds the candidates. Ranking is ours: title/artist identity and
 * word prefixes beat an infix such as `cat` in Pussycat Dolls, and BM25 is not
 * allowed to bury Cat Stevens under Cameo just because the name is shorter.
 *
 * The tokenizer still folds stylized names (`A★Teens` / `a teens`, `P!nk` /
 * `pink`). Indexed fields are:
 *
 * - full words (Cat Stevens)
 * - edge prefixes of length ≥ 2 (`ca` → Cat, California)
 * - in-word suffixes of length ≥ 3 (`cat` → Pussycat Dolls)
 * - compact forms (`aha`, `ateens`, `acdc`)
 * - aliases (`Yusuf` → Cat Stevens)
 */

export interface SearchArtist {
    name: string;
    slug: string;
    sortName?: string;
    aliases?: string[];
}

export interface CatalogSearch {
    searchSongs(query: string, limit?: number): SearchSong[];
    searchArtists(query: string, limit?: number): SearchArtist[];
}

const SONG_LIMIT = 100;
const ARTIST_LIMIT = 6;
const EDGE_MIN = 2;
const INSIDE_MIN = 3;

/** Apostrophes and a few stylized marks drop out; they are not word breaks (`P!nk` → `pnk`). */
const STRIP_MARKS = /[\u02BB\u02BC\u02C8\u2018\u2019\uFF07'!°]/g;

const SEARCH_OPTIONS = {
    // Only the last letter uses MiniSearch prefix. Longer prefixes are already
    // indexed as edge n-grams; prefixing those would also hit inside-grams
    // (`love` → `loved` in Beloved).
    prefix: (term: string, i: number, terms: string[]) => i === terms.length - 1 && term.length === 1,
    fuzzy: (term: string) => (term.length > 5 ? 0.2 : false),
    maxFuzzy: 2,
    combineWith: "AND" as const,
    weights: { prefix: 0.45, fuzzy: 0.2 },
};

interface ParsedQuery {
    trimmed: string;
    phrase: string;
    compact: string;
    tokens: string[];
    numeric: boolean;
    singleLetter: boolean;
}

interface FieldHit {
    kind: number;
    extra: number;
}

const KIND = {
    identity: 200,
    compact: 190,
    phrasePrefix: 90,
    firstExact: 80,
    laterExact: 70,
    firstPrefix: 60,
    laterPrefix: 50,
    firstInfix: 40,
    laterInfix: 28,
    typo: 22,
} as const;

export function foldText(value: string): string {
    return value
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .replace(/ø/gi, "o")
        .replace(/æ/gi, "ae")
        .replace(/ß/g, "ss")
        .toLowerCase()
        .replace(/\$/g, "s")
        .replace(/&/g, " and ")
        .replace(STRIP_MARKS, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

export function compactText(value: string): string {
    return foldText(value).replace(/ /g, "");
}

export function searchTokens(value: string): string[] {
    const folded = foldText(value);
    return folded.length === 0 ? [] : folded.split(" ");
}

/** Prefixes of each word, excluding the word itself (`ca` / `cal` from California). */
export function edgeTokens(value: string): string[] {
    return unique(
        searchTokens(value).flatMap((part) => {
            const grams: string[] = [];
            for (let i = EDGE_MIN; i < part.length; i++) {
                grams.push(part.slice(0, i));
            }
            return grams;
        }),
    );
}

/** In-word suffixes (`cat` from Pussycat), so a query need not match the start of the word. */
export function insideTokens(value: string): string[] {
    return unique(
        searchTokens(value).flatMap((part) => {
            const grams: string[] = [];
            for (let i = 1; i <= part.length - INSIDE_MIN; i++) {
                grams.push(part.slice(i));
            }
            return grams;
        }),
    );
}

function compactForms(value: string): string[] {
    const parts = searchTokens(value);
    if (parts.length < 2) {
        return [];
    }
    // Glue short stylized names (`a-ha`, `AC/DC`, `A★Teens`), not long titles.
    if (parts.some((part) => part.length > 5) || parts.join("").length > 12) {
        return [];
    }
    const compact = parts.join("");
    return compact.length >= 3 ? [compact] : [];
}

function unique(values: string[]): string[] {
    return [...new Set(values.filter((value) => value.length > 0))];
}

/** Keep aliases that still say something the display name does not, Latin first. */
export function usefulAliases(name: string, aliases: readonly string[]): string[] {
    const seen = new Set<string>([compactText(name)]);
    const ranked = aliases.slice().sort((a, b) => aliasQuality(b, name) - aliasQuality(a, name) || a.length - b.length);
    const out: string[] = [];
    for (const alias of ranked) {
        const compact = compactText(alias);
        if (compact.length === 0 || seen.has(compact)) {
            continue;
        }
        seen.add(compact);
        out.push(alias);
        if (out.length >= 12) {
            break;
        }
    }
    return out;
}

function aliasQuality(alias: string, name: string): number {
    const folded = foldText(alias);
    const hasLatin = /[a-z]/.test(folded);
    const latinOnly = /^[a-z0-9 ]+$/.test(folded);
    const nameTokens = new Set(searchTokens(name));
    const distinctive = searchTokens(alias).every((token) => !nameTokens.has(token)) ? 2 : 0;
    return (latinOnly ? 4 : 0) + (hasLatin ? 1 : 0) + distinctive;
}

export function artistMap(artists: readonly SearchArtist[]): Map<string, SearchArtist> {
    return new Map(artists.map((artist) => [artist.slug, artist]));
}

function slugPhrase(slug: string): string {
    return slug.replace(/-/g, " ");
}

function creditedHints(song: SearchSong, artists: ReadonlyMap<string, SearchArtist>): string[] {
    const hints: string[] = [];
    for (const credited of song.artists ?? []) {
        hints.push(credited.name);
        hints.push(slugPhrase(credited.slug));
        const record = artists.get(credited.slug);
        if (record?.sortName !== undefined) {
            hints.push(record.sortName);
        }
    }
    return hints;
}

function aliasHints(song: SearchSong, artists: ReadonlyMap<string, SearchArtist>): string[] {
    const hints: string[] = [];
    for (const credited of song.artists ?? []) {
        const record = artists.get(credited.slug);
        for (const alias of record?.aliases ?? []) {
            hints.push(alias);
        }
    }
    return hints;
}

function joined(values: readonly string[]): string {
    return values.filter((value) => value.length > 0).join(" ");
}

function tokenizeField(text: string, fieldName?: string): string[] {
    if (fieldName === "edge") {
        return edgeTokens(text);
    }
    if (fieldName === "inside") {
        return insideTokens(text);
    }
    if (fieldName === "compact") {
        return text.split(" ").filter((part) => part.length > 0);
    }
    if (fieldName === "numbers") {
        const parts = text.split(" ").filter((part) => part.length > 0);
        return unique([...parts, ...edgeTokens(text)]);
    }
    return searchTokens(text);
}

interface SongDoc {
    id: number;
    title: string;
    artist: string;
    from: string;
    categories: string;
    genres: string;
    aliases: string;
    numbers: string;
    compact: string;
    edge: string;
    inside: string;
}

interface ArtistDoc {
    id: string;
    name: string;
    slug: string;
    sortName: string;
    aliases: string;
    compact: string;
    edge: string;
    inside: string;
}

function songDoc(song: SearchSong, artists: ReadonlyMap<string, SearchArtist>): SongDoc {
    const credited = creditedHints(song, artists);
    const aliases = aliasHints(song, artists);
    const primary = joined([song.title, song.artist, song.from ?? "", ...credited]);
    const edgeSource = joined([primary, ...aliases, ...(song.categories ?? [])]);
    return {
        id: song.id,
        title: song.title,
        artist: song.artist,
        from: song.from ?? "",
        categories: joined(song.categories ?? []),
        genres: joined(song.genres ?? []),
        aliases: joined(aliases),
        numbers: song.ids.map(String).join(" "),
        compact: joined([song.title, song.artist, ...credited, ...aliases].flatMap(compactForms)),
        edge: edgeSource,
        inside: primary,
    };
}

function artistDoc(artist: SearchArtist): ArtistDoc {
    const name = artist.name;
    const slug = slugPhrase(artist.slug);
    const sortName = artist.sortName ?? "";
    const aliasList = artist.aliases ?? [];
    const primary = joined([name, slug, sortName]);
    const aliases = joined(aliasList);
    return {
        id: artist.slug,
        name,
        slug,
        sortName,
        aliases,
        compact: joined([name, slug, sortName, ...aliasList].flatMap(compactForms)),
        edge: joined([primary, aliases]),
        inside: primary,
    };
}

function tokenizeQuery(query: string): string[] {
    const trimmed = query.trim();
    if (/^\d+$/.test(trimmed)) {
        return [trimmed];
    }
    return searchTokens(trimmed);
}

function parseQuery(raw: string): ParsedQuery | null {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return null;
    }
    const numeric = /^\d+$/.test(trimmed);
    const tokens = numeric ? [trimmed] : searchTokens(trimmed);
    if (tokens.length === 0) {
        return null;
    }
    return {
        trimmed,
        phrase: foldText(trimmed),
        compact: compactText(trimmed),
        tokens,
        numeric,
        singleLetter: tokens.length === 1 && tokens[0]!.length === 1 && !numeric,
    };
}

function firstSignificant(words: readonly string[]): number {
    return words[0] === "the" && words.length > 1 ? 1 : 0;
}

/** Same window MiniSearch uses: 0.2 of term length, at least 1, capped at 2. */
function maxTypoDistance(term: string): number {
    if (term.length <= 5) {
        return 0;
    }
    return Math.min(2, Math.max(1, Math.round(term.length * 0.2)));
}

function levenshtein(a: string, b: string, max: number): number {
    if (a === b) {
        return 0;
    }
    if (Math.abs(a.length - b.length) > max) {
        return max + 1;
    }
    const prev = new Array<number>(b.length + 1);
    const next = new Array<number>(b.length + 1);
    for (let j = 0; j <= b.length; j++) {
        prev[j] = j;
    }
    for (let i = 1; i <= a.length; i++) {
        next[0] = i;
        let rowMin = next[0]!;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            next[j] = Math.min(prev[j]! + 1, next[j - 1]! + 1, prev[j - 1]! + cost);
            if (next[j]! < rowMin) {
                rowMin = next[j]!;
            }
        }
        if (rowMin > max) {
            return max + 1;
        }
        for (let j = 0; j <= b.length; j++) {
            prev[j] = next[j]!;
        }
    }
    return prev[b.length]!;
}

function typoHit(word: string, term: string): FieldHit | null {
    const max = maxTypoDistance(term);
    if (max === 0) {
        return null;
    }
    const distance = levenshtein(word, term, max);
    if (distance < 1 || distance > max) {
        return null;
    }
    return { kind: KIND.typo, extra: distance * 8 };
}

function bestWordMatch(words: readonly string[], term: string, firstOnly: boolean): FieldHit {
    const skip = firstSignificant(words);
    let best: FieldHit = { kind: 0, extra: 99 };
    for (let i = 0; i < words.length; i++) {
        if (firstOnly && i !== skip) {
            continue;
        }
        const word = words[i]!;
        const first = i === skip;
        let extra = Math.max(0, word.length - term.length);
        let kind = 0;
        if (word === term) {
            kind = first ? KIND.firstExact : KIND.laterExact;
        } else if (word.startsWith(term)) {
            kind = first ? KIND.firstPrefix : KIND.laterPrefix;
        } else if (!firstOnly && term.length >= INSIDE_MIN && word.includes(term)) {
            kind = first ? KIND.firstInfix : KIND.laterInfix;
        } else if (!firstOnly) {
            const typo = typoHit(word, term);
            if (typo !== null) {
                kind = typo.kind;
                extra = typo.extra;
            }
        }
        if (kind > best.kind || (kind === best.kind && extra < best.extra)) {
            best = { kind, extra };
        }
    }
    return best;
}

function leadingPhraseHit(words: readonly string[], query: ParsedQuery): FieldHit | null {
    if (query.tokens.length === 0 || words.length < query.tokens.length) {
        return null;
    }
    for (let i = 0; i < query.tokens.length; i++) {
        const word = words[i]!;
        const term = query.tokens[i]!;
        if (i < query.tokens.length - 1) {
            if (word !== term) {
                return null;
            }
        } else if (word !== term && !word.startsWith(term) && typoHit(word, term) === null) {
            return null;
        }
    }
    const lastWord = words[query.tokens.length - 1]!;
    const lastTerm = query.tokens[query.tokens.length - 1]!;
    const extra = lastWord.length - lastTerm.length + (words.length - query.tokens.length) * 4;
    return { kind: KIND.phrasePrefix, extra };
}

function matchField(text: string, query: ParsedQuery, wordOnly = false): FieldHit {
    const folded = foldText(text);
    if (folded.length === 0) {
        return { kind: 0, extra: 99 };
    }
    const words = folded.split(" ");
    if (!wordOnly) {
        if (folded === query.phrase) {
            return { kind: KIND.identity, extra: 0 };
        }
        const compact = folded.replace(/ /g, "");
        if (query.compact.length >= 2 && compact === query.compact) {
            return { kind: KIND.compact, extra: 0 };
        }
        const phrase = leadingPhraseHit(words, query);
        if (phrase !== null && query.tokens.length > 1) {
            return phrase;
        }
    }

    let kindSum = 0;
    let extraSum = 0;
    for (const term of query.tokens) {
        const hit = bestWordMatch(words, term, query.singleLetter);
        if (hit.kind === 0) {
            return { kind: 0, extra: 99 };
        }
        kindSum += hit.kind;
        extraSum += hit.extra;
    }
    return { kind: kindSum / query.tokens.length, extra: extraSum };
}

function fieldScore(text: string, query: ParsedQuery, weight: number, extraScale: number, wordOnly = false): number {
    const hit = matchField(text, query, wordOnly);
    if (hit.kind === 0) {
        return 0;
    }
    return weight * 100 + hit.kind * 10 - hit.extra * extraScale;
}

function bestScore(scores: readonly number[]): number {
    let best = 0;
    for (const score of scores) {
        if (score > best) {
            best = score;
        }
    }
    return best;
}

function tokenQuery(query: ParsedQuery, term: string): ParsedQuery {
    return {
        trimmed: term,
        phrase: term,
        compact: term,
        tokens: [term],
        numeric: query.numeric,
        singleLetter: term.length === 1 && !query.numeric,
    };
}

function scoreFields(
    fields: readonly { text: string; weight: number }[],
    query: ParsedQuery,
    extraScale: number,
): number {
    const whole = bestScore(fields.map((field) => fieldScore(field.text, query, field.weight, extraScale)));
    if (query.tokens.length <= 1) {
        return whole;
    }
    let tokenSum = 0;
    for (const term of query.tokens) {
        const best = bestScore(
            fields.map((field) => fieldScore(field.text, tokenQuery(query, term), field.weight, extraScale, true)),
        );
        if (best === 0) {
            return whole;
        }
        tokenSum += best;
    }
    return Math.max(whole, tokenSum / query.tokens.length);
}

function artistFields(artist: SearchArtist): { text: string; weight: number }[] {
    return [
        { text: artist.name, weight: 50 },
        { text: slugPhrase(artist.slug), weight: 48 },
        ...(artist.sortName !== undefined ? [{ text: artist.sortName, weight: 36 }] : []),
        ...(artist.aliases ?? []).map((alias) => ({ text: alias, weight: 22 })),
    ];
}

function songFields(song: SearchSong, artists: ReadonlyMap<string, SearchArtist>): { text: string; weight: number }[] {
    const fields: { text: string; weight: number }[] = [
        { text: song.title, weight: 50 },
        { text: song.artist, weight: 45 },
    ];
    for (const row of song.artists ?? []) {
        const record = artists.get(row.slug);
        fields.push({ text: row.name, weight: 45 });
        fields.push({ text: slugPhrase(row.slug), weight: 44 });
        if (record?.sortName !== undefined) {
            fields.push({ text: record.sortName, weight: 32 });
        }
        for (const alias of record?.aliases ?? []) {
            fields.push({ text: alias, weight: 22 });
        }
    }
    if (song.from !== undefined) {
        fields.push({ text: song.from, weight: 24 });
    }
    for (const category of song.categories ?? []) {
        fields.push({ text: category, weight: 22 });
    }
    for (const genre of song.genres ?? []) {
        fields.push({ text: genre, weight: 6 });
    }
    return fields;
}

function scoreArtist(artist: SearchArtist, query: ParsedQuery): number {
    return scoreFields(artistFields(artist), query, 1);
}

function scoreSong(song: SearchSong, query: ParsedQuery, artists: ReadonlyMap<string, SearchArtist>): number {
    const score = scoreFields(songFields(song, artists), query, 0.01);
    let punch = 0;
    if (query.numeric) {
        // Below an exact title match (`1999` the Prince song) but above a loose word hit.
        if (song.ids.some((id) => String(id) === query.trimmed)) {
            punch = 6_850;
        } else if (song.ids.some((id) => String(id).startsWith(query.trimmed))) {
            punch = 6_400;
        }
    }
    const best = Math.max(score, punch);
    if (best === 0) {
        return 0;
    }
    const collab = Math.max(0, (song.artists?.length ?? 1) - 1);
    return best - collab * 40 - Math.min(searchTokens(song.title).length, 12);
}

function orderHits<T>(
    items: readonly T[],
    scoreOf: (item: T) => number,
    compareNames: (a: T, b: T) => number,
    limit: number,
): T[] {
    return items
        .map((item) => ({ item, score: scoreOf(item) }))
        .filter((hit) => hit.score > 0)
        .sort((a, b) => b.score - a.score || compareNames(a.item, b.item))
        .slice(0, limit)
        .map((hit) => hit.item);
}

export function createCatalogSearch(index: {
    songs: readonly SearchSong[];
    artists: readonly SearchArtist[];
}): CatalogSearch {
    const artistsBySlug = artistMap(index.artists);
    const songsById = new Map(index.songs.map((song) => [song.id, song]));
    const artistsById = new Map(index.artists.map((artist) => [artist.slug, artist]));

    const songs = new MiniSearch<SongDoc>({
        fields: ["title", "artist", "from", "categories", "genres", "aliases", "numbers", "compact", "edge", "inside"],
        idField: "id",
        tokenize: tokenizeField,
        processTerm: (term) => term,
        searchOptions: {
            ...SEARCH_OPTIONS,
            tokenize: tokenizeQuery,
        },
    });
    songs.addAll(index.songs.map((song) => songDoc(song, artistsBySlug)));

    const artists = new MiniSearch<ArtistDoc>({
        fields: ["name", "slug", "sortName", "aliases", "compact", "edge", "inside"],
        idField: "id",
        tokenize: tokenizeField,
        processTerm: (term) => term,
        searchOptions: {
            ...SEARCH_OPTIONS,
            tokenize: tokenizeQuery,
        },
    });
    artists.addAll(index.artists.map(artistDoc));

    return {
        searchSongs(query: string, limit = SONG_LIMIT): SearchSong[] {
            const parsed = parseQuery(query);
            if (parsed === null) {
                return [];
            }
            const candidates: SearchSong[] = [];
            for (const hit of songs.search(query)) {
                const song = songsById.get(hit.id as number);
                if (song !== undefined) {
                    candidates.push(song);
                }
            }
            return orderHits(
                candidates,
                (song) => scoreSong(song, parsed, artistsBySlug),
                (a, b) => a.title.localeCompare(b.title, "sv") || a.id - b.id,
                limit,
            );
        },
        searchArtists(query: string, limit = ARTIST_LIMIT): SearchArtist[] {
            const parsed = parseQuery(query);
            if (parsed === null) {
                return [];
            }
            const candidates: SearchArtist[] = [];
            for (const hit of artists.search(query)) {
                const artist = artistsById.get(String(hit.id));
                if (artist !== undefined) {
                    candidates.push(artist);
                }
            }
            return orderHits(
                candidates,
                (artist) => scoreArtist(artist, parsed),
                (a, b) => a.name.localeCompare(b.name, "sv") || a.slug.localeCompare(b.slug),
                limit,
            );
        },
    };
}

export function matchesQuery(
    song: SearchSong,
    query: string,
    artists: ReadonlyMap<string, SearchArtist> = new Map(),
): boolean {
    return rankSongs([song], query, artists, 1).some((hit) => hit.id === song.id);
}

export function rankSongs(
    songs: readonly SearchSong[],
    query: string,
    artists: ReadonlyMap<string, SearchArtist> = new Map(),
    limit = SONG_LIMIT,
): SearchSong[] {
    return createCatalogSearch({ songs, artists: [...artists.values()] }).searchSongs(query, limit);
}

export function rankArtists(artists: readonly SearchArtist[], query: string, limit = ARTIST_LIMIT): SearchArtist[] {
    return createCatalogSearch({ songs: [], artists }).searchArtists(query, limit);
}
