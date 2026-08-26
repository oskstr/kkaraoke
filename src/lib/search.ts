import type { SearchSong } from "./catalog";

/**
 * Client search for the karaoke catalog.
 *
 * The index stores display strings (`A★Teens`, `P!nk`, `a-ha`), but people type
 * `a teens`, `pink`, `aha`. Matching therefore folds punctuation and diacritics,
 * treats stylized separators as word breaks, and ranks title/artist hits above a
 * genre that merely contains the same letters.
 */

export interface SearchArtist {
    name: string;
    slug: string;
    sortName?: string;
    aliases?: string[];
}

const SONG_LIMIT = 80;
const ARTIST_LIMIT = 6;

/** Apostrophes and a few stylized marks drop out; they are not word breaks (`P!nk` → `pnk`). */
const STRIP_MARKS = /[\u02BB\u02BC\u02C8\u2018\u2019\uFF07'!°]/g;

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

/** Keep aliases that still say something the display name does not, Latin first. */
export function usefulAliases(name: string, aliases: readonly string[]): string[] {
    const seen = new Set<string>([compactText(name)]);
    const ranked = aliases.slice().sort((a, b) => aliasQuality(b) - aliasQuality(a) || a.length - b.length);
    const out: string[] = [];
    for (const alias of ranked) {
        const compact = compactText(alias);
        if (compact.length === 0 || seen.has(compact)) {
            continue;
        }
        seen.add(compact);
        out.push(alias);
        if (out.length >= 8) {
            break;
        }
    }
    return out;
}

function aliasQuality(alias: string): number {
    const folded = foldText(alias);
    const hasLatin = /[a-z]/.test(folded);
    const latinOnly = /^[a-z0-9 ]+$/.test(folded);
    return (latinOnly ? 2 : 0) + (hasLatin ? 1 : 0);
}

export function artistMap(artists: readonly SearchArtist[]): Map<string, SearchArtist> {
    return new Map(artists.map((artist) => [artist.slug, artist]));
}

function tokenHits(queryToken: string, fieldToken: string): boolean {
    if (queryToken.length <= 2) {
        return fieldToken === queryToken;
    }
    return fieldToken.startsWith(queryToken);
}

function tokensMatch(query: readonly string[], field: readonly string[]): boolean {
    if (query.length === 0) {
        return false;
    }
    return query.every((qt) => field.some((ft) => tokenHits(qt, ft)));
}

/** True when the field is the query, or its leading words are. `a ha` must not prefix `a hard`. */
function fieldPrefixMatch(field: string, queryTokens: readonly string[], queryFold: string): boolean {
    const folded = foldText(field);
    if (folded.length === 0 || queryFold.length === 0) {
        return false;
    }
    if (folded === queryFold) {
        return true;
    }
    const fieldTokens = searchTokens(field);
    if (queryTokens.length === 0 || queryTokens.length > fieldTokens.length) {
        return false;
    }
    return queryTokens.every((qt, index) => tokenHits(qt, fieldTokens[index]!));
}

function compactEquals(query: string, field: string): boolean {
    const compact = compactText(query);
    return compact.length >= 2 && compact === compactText(field);
}

function tokensForFields(fields: readonly string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (token: string) => {
        if (token.length === 0 || seen.has(token)) {
            return;
        }
        seen.add(token);
        out.push(token);
    };
    for (const field of fields) {
        for (const part of searchTokens(field)) {
            add(part);
        }
    }
    return out;
}

function fieldsCompactMatch(query: string, fields: readonly string[]): boolean {
    return fields.some((field) => compactEquals(query, field));
}

function strongPhraseMatch(query: string, value: string): boolean {
    const folded = foldText(query);
    const other = foldText(value);
    if (folded.length === 0 || other.length === 0) {
        return false;
    }
    if (folded === other) {
        return true;
    }
    const compact = compactText(query);
    return compact.length >= 3 && compact === compactText(value);
}

function isSingleLetterQuery(tokens: readonly string[]): boolean {
    return tokens.length === 1 && tokens[0]!.length === 1 && !/^\d$/.test(tokens[0]!);
}

function slugPhrase(slug: string): string {
    return slug.replace(/-/g, " ");
}

function primaryFields(song: SearchSong, artists: ReadonlyMap<string, SearchArtist> | undefined): string[] {
    const fields = [song.title, song.artist];
    if (song.from !== undefined) {
        fields.push(song.from);
    }
    for (const category of song.categories ?? []) {
        fields.push(category);
    }
    for (const credited of song.artists ?? []) {
        fields.push(credited.name);
        fields.push(slugPhrase(credited.slug));
        const record = artists?.get(credited.slug);
        if (record?.sortName !== undefined) {
            fields.push(record.sortName);
        }
    }
    return fields;
}

function aliasPhrases(song: SearchSong, artists: ReadonlyMap<string, SearchArtist> | undefined): string[] {
    const phrases: string[] = [];
    for (const credited of song.artists ?? []) {
        const record = artists?.get(credited.slug);
        for (const alias of record?.aliases ?? []) {
            phrases.push(alias);
        }
    }
    return phrases;
}

function artistPhrases(artist: SearchArtist): string[] {
    const fields = [artist.name, slugPhrase(artist.slug)];
    if (artist.sortName !== undefined) {
        fields.push(artist.sortName);
    }
    return fields;
}

export function matchesQuery(song: SearchSong, query: string, artists?: ReadonlyMap<string, SearchArtist>): boolean {
    return songMatches(song, query, artists);
}

function songMatches(song: SearchSong, query: string, artists: ReadonlyMap<string, SearchArtist> | undefined): boolean {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
        return false;
    }
    if (/^\d+$/.test(trimmed) && song.ids.some((id) => String(id).startsWith(trimmed))) {
        return true;
    }

    const qt = searchTokens(trimmed);
    if (qt.length === 0) {
        return false;
    }

    const primary = primaryFields(song, artists);
    if (isSingleLetterQuery(qt)) {
        return primary.some((field) => searchTokens(field)[0]?.startsWith(qt[0]!));
    }
    if (tokensMatch(qt, tokensForFields(primary)) || fieldsCompactMatch(trimmed, primary)) {
        return true;
    }
    if (aliasPhrases(song, artists).some((alias) => strongPhraseMatch(trimmed, alias))) {
        return true;
    }
    const genreTokens = (song.genres ?? []).flatMap(searchTokens);
    return qt.every((token) => genreTokens.includes(token));
}

function songScore(song: SearchSong, query: string, artists: ReadonlyMap<string, SearchArtist> | undefined): number {
    const trimmed = query.trim();
    const qt = searchTokens(trimmed);
    const qFold = foldText(trimmed);
    let score = 1;

    if (/^\d+$/.test(trimmed)) {
        if (song.ids.some((id) => String(id) === trimmed)) {
            score += 10_000;
        } else if (song.ids.some((id) => String(id).startsWith(trimmed))) {
            score += 8_000;
        }
    }

    const titleFold = foldText(song.title);
    const artistFold = foldText(song.artist);
    const titleTokens = searchTokens(song.title);
    const artistTokens = searchTokens(song.artist);

    if (titleFold === qFold) {
        score += 1_000;
    } else if (fieldPrefixMatch(song.title, qt, qFold)) {
        score += 800;
    } else if (tokensMatch(qt, tokensForFields([song.title])) || compactEquals(trimmed, song.title)) {
        score += 600;
        if (titleTokens[0] !== undefined && tokenHits(qt[0]!, titleTokens[0])) {
            score += 40;
        }
    }
    if (qt.length === 1 && titleTokens.includes(qt[0]!)) {
        score += 120;
    }

    if (artistFold === qFold || compactEquals(trimmed, song.artist)) {
        score += 950;
    } else if (fieldPrefixMatch(song.artist, qt, qFold)) {
        score += 750;
    } else if (tokensMatch(qt, tokensForFields([song.artist]))) {
        score += 550;
        if (artistTokens[0] !== undefined && tokenHits(qt[0]!, artistTokens[0])) {
            score += 30;
        }
    }
    if (qt.length === 1 && artistTokens.includes(qt[0]!)) {
        score += 100;
    }

    const credited = song.artists ?? [];
    for (const artist of credited) {
        if (foldText(slugPhrase(artist.slug)) === qFold || compactEquals(trimmed, artist.name)) {
            score += 900;
        }
        const record = artists?.get(artist.slug);
        if (record?.sortName !== undefined && foldText(record.sortName) === qFold) {
            score += 880;
        }
    }
    if (
        credited.length === 1 &&
        (foldText(slugPhrase(credited[0]!.slug)) === qFold ||
            compactEquals(trimmed, credited[0]!.name) ||
            foldText(credited[0]!.name) === qFold)
    ) {
        score += 150;
    }

    if (song.from !== undefined && tokensMatch(qt, tokensForFields([song.from]))) {
        score += 300;
    }
    for (const category of song.categories ?? []) {
        if (tokensMatch(qt, tokensForFields([category]))) {
            score += 280;
        }
    }
    if (tokensMatch(qt, tokensForFields(primaryFields(song, artists)))) {
        score += 100;
    }
    if (aliasPhrases(song, artists).some((alias) => strongPhraseMatch(trimmed, alias))) {
        score += 500;
    }
    const genreTokens = (song.genres ?? []).flatMap(searchTokens);
    if (qt.length > 0 && qt.every((token) => genreTokens.includes(token))) {
        score += 40;
    }

    score -= Math.min(titleTokens.length, 20);
    return score;
}

export function rankSongs(
    songs: readonly SearchSong[],
    query: string,
    artists?: ReadonlyMap<string, SearchArtist>,
    limit = SONG_LIMIT,
): SearchSong[] {
    if (query.trim().length === 0) {
        return [];
    }
    const hits: { song: SearchSong; score: number }[] = [];
    for (const song of songs) {
        if (!songMatches(song, query, artists)) {
            continue;
        }
        hits.push({ song, score: songScore(song, query, artists) });
    }
    hits.sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, "sv") || a.song.id - b.song.id);
    return hits.slice(0, limit).map((hit) => hit.song);
}

function artistMatches(artist: SearchArtist, query: string): boolean {
    const trimmed = query.trim();
    const qt = searchTokens(trimmed);
    if (qt.length === 0) {
        return false;
    }
    const phrases = artistPhrases(artist);
    if (isSingleLetterQuery(qt)) {
        return phrases.some((field) => searchTokens(field)[0]?.startsWith(qt[0]!));
    }
    if (tokensMatch(qt, tokensForFields(phrases)) || fieldsCompactMatch(trimmed, phrases)) {
        return true;
    }
    return (artist.aliases ?? []).some((alias) => strongPhraseMatch(trimmed, alias));
}

function artistScore(artist: SearchArtist, query: string): number {
    const trimmed = query.trim();
    const qt = searchTokens(trimmed);
    const qFold = foldText(trimmed);
    let score = 1;

    const nameFold = foldText(artist.name);
    if (nameFold === qFold || compactEquals(trimmed, artist.name)) {
        score += 1_000;
    } else if (fieldPrefixMatch(artist.name, qt, qFold)) {
        score += 800;
    } else if (tokensMatch(qt, tokensForFields([artist.name]))) {
        score += 600;
    }

    if (artist.sortName !== undefined) {
        const sortFold = foldText(artist.sortName);
        if (sortFold === qFold) {
            score += 700;
        } else if (tokensMatch(qt, tokensForFields([artist.sortName]))) {
            score += 400;
        }
    }

    const slugFold = foldText(slugPhrase(artist.slug));
    if (slugFold === qFold) {
        score += 650;
    } else if (tokensMatch(qt, tokensForFields([slugPhrase(artist.slug)]))) {
        score += 350;
    }

    if ((artist.aliases ?? []).some((alias) => strongPhraseMatch(trimmed, alias))) {
        score += 450;
    }

    score -= Math.min(searchTokens(artist.name).length, 10);
    return score;
}

export function rankArtists(artists: readonly SearchArtist[], query: string, limit = ARTIST_LIMIT): SearchArtist[] {
    if (query.trim().length === 0) {
        return [];
    }
    const hits: { artist: SearchArtist; score: number }[] = [];
    for (const artist of artists) {
        if (!artistMatches(artist, query)) {
            continue;
        }
        hits.push({ artist, score: artistScore(artist, query) });
    }
    hits.sort(
        (a, b) =>
            b.score - a.score ||
            a.artist.name.localeCompare(b.artist.name, "sv") ||
            a.artist.slug.localeCompare(b.artist.slug),
    );
    return hits.slice(0, limit).map((hit) => hit.artist);
}
