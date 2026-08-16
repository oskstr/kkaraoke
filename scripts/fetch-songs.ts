/**
 * Scrapes the karaoke catalog from kkaraoke.se into a JSON file.
 *
 * The site offers no API. The list is a WordPress/Elementor page with a JetEngine
 * listing widget, and paging it re-renders the entire ~450 KB page as HTML, so the
 * only way to read the catalog is to walk every page and pull the rows out of the
 * markup. Runs rarely and by hand, so it parses with regexes rather than pulling in
 * an HTML parser; every assumption about the markup is asserted, and the script
 * aborts instead of writing a half-scraped or empty catalog.
 *
 * Usage: pnpm fetch:songs [--out <file>] [--pages <n>] [--delay <ms>]
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const LIST_URL = "https://www.kkaraoke.se/latar/";

/**
 * The page renders the same catalog twice, as two listings with different page
 * sizes, and `jsf` picks which of them `pagenum` applies to. This is the one
 * showing 50 rows per page; the other shows 10 and would need five times the
 * requests.
 */
const PROVIDER = "jet-engine/default";

/**
 * Each row is three Elementor heading widgets, told apart by the element id baked
 * into the template. Their order in the markup is not the order they appear in on
 * screen, so match on the id and not on position.
 */
const ELEMENT_IDS = {
    id: "d5ad0a6",
    artist: "af6603b",
    song: "d1a0a37",
} as const;

const USER_AGENT = "kkaraoke-catalog-fetcher (+https://github.com/oskstr/kkaraoke)";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 4;

interface Song {
    id: number;
    postId: number;
    artist: string;
    song: string;
}

interface Listing {
    /** Markup of the listing container only, so rows of the other listing can't leak in. */
    html: string;
    totalPages: number;
    perPage: number;
}

interface ListingNav {
    query?: {
        jet_smart_filters?: string;
        posts_per_page?: string | number;
    };
}

const NAMED_ENTITIES = new Map([
    ["amp", "&"],
    ["lt", "<"],
    ["gt", ">"],
    ["quot", '"'],
    ["apos", "'"],
    ["nbsp", "\u00a0"],
    ["ndash", "\u2013"],
    ["mdash", "\u2014"],
    ["hellip", "\u2026"],
    ["lsquo", "\u2018"],
    ["rsquo", "\u2019"],
    ["ldquo", "\u201c"],
    ["rdquo", "\u201d"],
    ["deg", "\u00b0"],
]);

/** Entities the table above doesn't know, reported together once the walk is done. */
const unknownEntities = new Set<string>();

function decodeEntities(text: string): string {
    return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, entity: string) => {
        if (entity.startsWith("#x") || entity.startsWith("#X")) {
            return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
        }
        if (entity.startsWith("#")) {
            return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
        }
        const named = NAMED_ENTITIES.get(entity);
        if (named === undefined) {
            unknownEntities.add(match);
            return match;
        }
        return named;
    });
}

function pageUrl(page: number): string {
    const url = new URL(LIST_URL);
    url.searchParams.set("jsf", PROVIDER);
    url.searchParams.set("pagenum", String(page));
    return url.toString();
}

async function fetchPage(page: number): Promise<string> {
    for (let attempt = 1; ; attempt++) {
        try {
            const response = await fetch(pageUrl(page), {
                headers: { "user-agent": USER_AGENT, accept: "text/html" },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }
            return await response.text();
        } catch (error) {
            if (attempt === MAX_ATTEMPTS) {
                throw new Error(`Giving up on page ${page} after ${MAX_ATTEMPTS} attempts`, { cause: error });
            }
            const backoff = 2 ** attempt * 1000;
            console.warn(`  page ${page} attempt ${attempt} failed (${describe(error)}), retrying in ${backoff}ms`);
            await sleep(backoff);
        }
    }
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Narrows the page down to the listing `PROVIDER` paginates. Both listings use the
 * same markup for their rows, so scraping the whole page would mix the two.
 */
function findListing(html: string): Listing {
    const containers = [...html.matchAll(/<div class="jet-listing-grid__items[^>]*>/g)];
    if (containers.length === 0) {
        throw new Error("No JetEngine listing found. The page layout has probably changed.");
    }

    for (const [index, container] of containers.entries()) {
        const tag = container[0];
        const navAttribute = /data-nav="([^"]*)"/.exec(tag)?.[1];
        if (navAttribute === undefined) {
            continue;
        }
        const nav = JSON.parse(decodeEntities(navAttribute)) as ListingNav;
        if (nav.query?.jet_smart_filters !== PROVIDER) {
            continue;
        }

        const start = container.index;
        const end = containers[index + 1]?.index ?? html.length;
        return {
            html: html.slice(start, end),
            totalPages: Number(/data-pages="(\d+)"/.exec(tag)?.[1]),
            perPage: Number(nav.query.posts_per_page),
        };
    }

    throw new Error(`No listing is paginated by "${PROVIDER}". The page layout has probably changed.`);
}

function parseRows(listingHtml: string, page: number): Song[] {
    // Rows nest further divs, so rather than trying to match balanced markup, cut the
    // listing at each row boundary and read the first hit for each field in the chunk.
    // The trailing chunk carries the rest of the page with it, which is harmless as
    // long as fields are read from the front.
    const chunks = listingHtml
        .split(/(?=<div class="jet-listing-grid__item )/)
        .filter((chunk) => /^<div class="jet-listing-grid__item /.test(chunk));

    return chunks.map((chunk, index) => {
        const where = `page ${page}, row ${index + 1}`;
        const postId = /data-post-id="(\d+)"/.exec(chunk)?.[1];
        if (postId === undefined) {
            throw new Error(`No post id on ${where}.`);
        }

        const heading = (field: keyof typeof ELEMENT_IDS): string => {
            const elementId = ELEMENT_IDS[field];
            const pattern = new RegExp(
                `elementor-element-${elementId}[^>]*elementor-widget-heading[\\s\\S]*?` +
                    `elementor-heading-title[^>]*>([\\s\\S]*?)</`,
            );
            const raw = pattern.exec(chunk)?.[1];
            if (raw === undefined) {
                throw new Error(`No "${field}" heading (element ${elementId}) on ${where}.`);
            }
            return decodeEntities(raw).trim();
        };

        const id = heading("id");
        if (!/^\d+$/.test(id)) {
            throw new Error(`Expected a numeric song id on ${where}, got ${JSON.stringify(id)}.`);
        }

        // Field order here is the order they land in the JSON file.
        return {
            id: Number(id),
            postId: Number(postId),
            artist: heading("artist"),
            song: heading("song"),
        };
    });
}

/** One song per line, so refreshing the catalog produces a diff worth reading. */
function serialize(songs: Song[]): string {
    const rows = songs.map((song) => `        ${JSON.stringify(song)}`).join(",\n");
    return [
        "{",
        `    "source": ${JSON.stringify(LIST_URL)},`,
        `    "fetchedAt": ${JSON.stringify(new Date().toISOString())},`,
        `    "count": ${songs.length},`,
        '    "songs": [',
        rows,
        "    ]",
        "}",
        "",
    ].join("\n");
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            out: { type: "string", default: "data/songs.json" },
            pages: { type: "string" },
            delay: { type: "string", default: "1000" },
        },
    });

    const delayMs = Number(values.delay);
    const pageLimit = values.pages === undefined ? Infinity : Number(values.pages);
    if (!Number.isFinite(delayMs) || delayMs < 0) {
        throw new Error(`--delay must be a non-negative number of milliseconds, got ${values.delay}`);
    }
    if (values.pages !== undefined && (!Number.isInteger(pageLimit) || pageLimit < 1)) {
        throw new Error(`--pages must be a whole number of at least 1, got ${values.pages}`);
    }

    const songs: Song[] = [];
    const seenPostIds = new Set<number>();
    let page = 1;
    let totalPages = 1;
    let perPage = 1;

    for (;;) {
        const listing = findListing(await fetchPage(page));
        const rows = parseRows(listing.html, page);
        if (rows.length === 0) {
            throw new Error(`Page ${page} of ${listing.totalPages} has no rows.`);
        }

        if (page === 1) {
            ({ totalPages, perPage } = listing);
            if (!Number.isInteger(totalPages) || totalPages < 1) {
                throw new Error(`Could not read the page count from the listing, got ${totalPages}.`);
            }
            if (!Number.isInteger(perPage) || perPage < 1) {
                throw new Error(`Could not read the page size from the listing, got ${perPage}.`);
            }
            console.log(`${totalPages} pages of up to ${perPage} songs to fetch`);
        }

        // The walk takes minutes and the source sorts by artist, so a catalog edit
        // midway through can shift rows across page boundaries and serve some of them
        // twice. Deduplicating on the WordPress post id keeps that out of the output,
        // and a page carrying nothing new means paging has stopped making progress.
        const fresh = rows.filter((song) => !seenPostIds.has(song.postId));
        for (const song of fresh) {
            seenPostIds.add(song.postId);
            songs.push(song);
        }
        console.log(
            `  page ${page}/${totalPages}: ${rows.length} rows` +
                (fresh.length === rows.length ? "" : ` (${rows.length - fresh.length} already seen)`),
        );
        if (fresh.length === 0) {
            break;
        }

        if (page >= Math.min(totalPages, pageLimit)) {
            break;
        }
        page++;
        await sleep(delayMs);
    }

    if (unknownEntities.size > 0) {
        console.warn(`Left these HTML entities undecoded: ${[...unknownEntities].join(", ")}`);
    }

    const expected = totalPages * perPage;
    if (pageLimit === Infinity && songs.length < expected - perPage) {
        throw new Error(`Only scraped ${songs.length} songs, expected roughly ${expected}. Aborting to be safe.`);
    }

    songs.sort((a, b) => a.id - b.id || a.postId - b.postId);

    const duplicateIds = songs.filter((song, index) => index > 0 && songs[index - 1]?.id === song.id);
    if (duplicateIds.length > 0) {
        console.warn(`${duplicateIds.length} songs share an id with another song, e.g. ${duplicateIds[0]?.id}`);
    }

    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, serialize(songs), "utf8");
    console.log(`Wrote ${songs.length} songs to ${values.out}`);
}

await main();
