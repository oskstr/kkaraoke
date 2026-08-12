/**
 * Looks up each matched recording's MusicBrainz work: lyrics language and the work title.
 *
 * The canonical dump has no works. A recording lookup with `inc=work-rels` returns the
 * linked work's title and ISO 639-3 language when MusicBrainz knows them. The work title
 * is the song name to publish when it is compatible with the recording; missing fields
 * stay blank — never invented.
 *
 * Resume-friendly: an existing `data/works.json` is kept and only unknown recordings
 * are fetched. Pass `--refresh-titles` to re-read cached responses and fill `title` on
 * rows that were stored before titles were kept.
 *
 * Usage: pnpm fetch:works [--matches <file>] [--out data/works.json] [--limit N]
 *                         [--refresh-titles]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { mbGet, requestStats } from "./lib/musicbrainz.ts";

export interface WorkLink {
    recordingMbid: string;
    /** MusicBrainz work id, when the recording is linked as a performance of one. */
    workMbid?: string;
    /** Canonical work title from MusicBrainz, when the recording is linked to a work. */
    title?: string;
    /** ISO 639-3 lyrics language from the work, when MusicBrainz has one. */
    language?: string;
    /** All languages on the work, when there is more than one. */
    languages?: string[];
}

interface WorkRel {
    type?: string;
    attributes?: string[];
    work?: {
        id?: string;
        title?: string | null;
        language?: string | null;
        languages?: string[];
    };
}

interface RecordingWithWorks {
    id: string;
    relations?: WorkRel[];
}

async function readJson<T>(path: string): Promise<T | undefined> {
    try {
        return JSON.parse(await readFile(path, "utf8")) as T;
    } catch {
        return undefined;
    }
}

/**
 * Prefer a performance that is not tagged as a cover of a differently-named work
 * (`I Got You (I Feel Good)` → cover of `I Found You`). Fall back to the first work.
 */
function pickWork(relations: WorkRel[] | undefined): Omit<WorkLink, "recordingMbid"> {
    const works = (relations ?? []).filter((relation) => relation.work?.id !== undefined);
    const primary =
        works.find((relation) => {
            const attrs = relation.attributes ?? [];
            return !attrs.includes("cover") && !attrs.includes("translator");
        }) ?? works[0];
    if (primary?.work === undefined) return {};

    const work = primary.work;
    const languages = (work.languages ?? []).filter((code) => code.length > 0);
    const language = work.language ?? languages[0];
    const result: Omit<WorkLink, "recordingMbid"> = {};
    if (work.id !== undefined) result.workMbid = work.id;
    const title = work.title?.trim();
    if (title !== undefined && title.length > 0) result.title = title;
    if (language !== undefined && language.length > 0) result.language = language;
    if (languages.length > 1) result.languages = languages;
    return result;
}

function writePayload(byRecording: Map<string, WorkLink>): string {
    return `${JSON.stringify(
        {
            generatedAt: new Date().toISOString(),
            note: "Written by `pnpm fetch:works`. Regenerable; title and language come from MusicBrainz works.",
            works: [...byRecording.values()].sort((a, b) =>
                a.recordingMbid.localeCompare(b.recordingMbid),
            ),
        },
        null,
        2,
    )}\n`;
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            matches: { type: "string", default: "data/canonical-matches.json" },
            out: { type: "string", default: "data/works.json" },
            fill: { type: "string", default: "data/works.json" },
            limit: { type: "string" },
            "refresh-titles": { type: "boolean", default: false },
        },
    });

    const matches = JSON.parse(await readFile(values.matches, "utf8")) as {
        songs: { matched: boolean; trusted?: boolean; recordingMbid?: string }[];
    };

    const existing = await readJson<{ works: WorkLink[] }>(values.fill);
    const byRecording = new Map((existing?.works ?? []).map((work) => [work.recordingMbid, work]));

    if (values["refresh-titles"]) {
        const stale = [...byRecording.keys()].filter((mbid) => {
            const link = byRecording.get(mbid);
            return link !== undefined && link.title === undefined;
        });
        console.log(`Refreshing titles for ${stale.length} recordings that lack a work title…`);
        let filled = 0;
        for (let index = 0; index < stale.length; index++) {
            const recordingMbid = stale[index]!;
            try {
                const body = await mbGet<RecordingWithWorks>(`recording/${recordingMbid}?inc=work-rels`);
                const link = pickWork(body.relations);
                byRecording.set(recordingMbid, { recordingMbid, ...link });
                if (link.title !== undefined) filled++;
            } catch (error) {
                console.warn(
                    `  ${recordingMbid}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
            if ((index + 1) % 100 === 0 || index + 1 === stale.length) {
                const stats = requestStats();
                console.log(
                    `  ${index + 1}/${stale.length} refreshed, ${filled} with a title` +
                        ` (${stats.fetched} fetched, ${stats.served} cache)`,
                );
                await mkdir(dirname(values.out), { recursive: true });
                await writeFile(values.out, writePayload(byRecording), "utf8");
            }
        }
    }

    const needed = new Set<string>();
    for (const song of matches.songs) {
        if (!song.matched || song.trusted !== true || song.recordingMbid === undefined) continue;
        if (byRecording.has(song.recordingMbid)) continue;
        needed.add(song.recordingMbid);
    }

    const todo = [...needed];
    const limit = values.limit === undefined ? todo.length : Number(values.limit);
    if (!Number.isInteger(limit) || limit < 0) {
        throw new Error("--limit must be a non-negative whole number.");
    }
    const batch = todo.slice(0, limit);

    console.log(
        `${byRecording.size} recordings already have a works lookup; ${todo.length} still to ask` +
            (batch.length < todo.length ? ` (doing ${batch.length} this run)` : ""),
    );

    let found = 0;
    let missing = 0;
    for (let index = 0; index < batch.length; index++) {
        const recordingMbid = batch[index]!;
        try {
            const body = await mbGet<RecordingWithWorks>(`recording/${recordingMbid}?inc=work-rels`);
            const link = pickWork(body.relations);
            byRecording.set(recordingMbid, { recordingMbid, ...link });
            if (link.language !== undefined) found++;
            else missing++;
        } catch (error) {
            // A permanent miss still records that we asked, so a re-run does not spend
            // another request on the same id.
            byRecording.set(recordingMbid, { recordingMbid });
            missing++;
            console.warn(
                `  ${recordingMbid}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
        if ((index + 1) % 25 === 0 || index + 1 === batch.length) {
            const stats = requestStats();
            const left = batch.length - index - 1;
            const minutes = ((left * 1.2) / 60).toFixed(1);
            console.log(
                `  ${index + 1}/${batch.length} looked up, ${found} with a language` +
                    (left > 0 ? `, ~${minutes} min left` : "") +
                    ` (${stats.fetched} fetched, ${stats.served} cache)`,
            );
            await mkdir(dirname(values.out), { recursive: true });
            await writeFile(values.out, writePayload(byRecording), "utf8");
        }
    }

    const withLanguage = [...byRecording.values()].filter((work) => work.language !== undefined).length;
    const withTitle = [...byRecording.values()].filter((work) => work.title !== undefined).length;
    console.log(
        `\n${byRecording.size} recordings looked up, ${withTitle} with a title, ${withLanguage} with a language` +
            (missing > 0 ? `, ${missing} without language on this run` : ""),
    );
    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(values.out, writePayload(byRecording), "utf8");
    console.log(`Wrote ${values.out}`);
}

await main();
