/**
 * Looks up the lyrics language of each matched recording via its MusicBrainz work.
 *
 * The canonical dump has no works, so language is not something matching can supply.
 * A recording lookup with `inc=work-rels` returns the linked work's ISO 639-3 language
 * code when MusicBrainz knows it. Missing language is left blank — never invented.
 *
 * Resume-friendly: an existing `data/works.json` is kept and only unknown recordings
 * are fetched, so a long run can be interrupted and continued.
 *
 * Usage: pnpm fetch:works [--matches <file>] [--out data/works.json] [--limit N]
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { mbGet, requestStats } from "./lib/musicbrainz.ts";

export interface WorkLink {
    recordingMbid: string;
    /** MusicBrainz work id, when the recording is linked as a performance of one. */
    workMbid?: string;
    /** ISO 639-3 lyrics language from the work, when MusicBrainz has one. */
    language?: string;
    /** All languages on the work, when there is more than one. */
    languages?: string[];
}

interface WorkRel {
    work?: {
        id?: string;
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

function pickLanguage(relations: WorkRel[] | undefined): Omit<WorkLink, "recordingMbid"> {
    for (const relation of relations ?? []) {
        const work = relation.work;
        if (work === undefined) continue;
        const languages = (work.languages ?? []).filter((code) => code.length > 0);
        const language = work.language ?? languages[0];
        if (language === undefined || language.length === 0) {
            return { workMbid: work.id };
        }
        return {
            workMbid: work.id,
            language,
            ...(languages.length > 1 ? { languages } : {}),
        };
    }
    return {};
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            matches: { type: "string", default: "data/canonical-matches.json" },
            out: { type: "string", default: "data/works.json" },
            fill: { type: "string", default: "data/works.json" },
            limit: { type: "string" },
        },
    });

    const matches = JSON.parse(await readFile(values.matches, "utf8")) as {
        songs: { matched: boolean; trusted?: boolean; recordingMbid?: string }[];
    };

    const existing = await readJson<{ works: WorkLink[] }>(values.fill);
    const byRecording = new Map((existing?.works ?? []).map((work) => [work.recordingMbid, work]));

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
            const link = pickLanguage(body.relations);
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
            // Checkpoint so an interrupted long run keeps its progress.
            await mkdir(dirname(values.out), { recursive: true });
            await writeFile(
                values.out,
                `${JSON.stringify(
                    {
                        generatedAt: new Date().toISOString(),
                        note: "Written by `pnpm fetch:works`. Regenerable; language comes from MusicBrainz works.",
                        works: [...byRecording.values()].sort((a, b) =>
                            a.recordingMbid.localeCompare(b.recordingMbid),
                        ),
                    },
                    null,
                    2,
                )}\n`,
                "utf8",
            );
        }
    }

    const withLanguage = [...byRecording.values()].filter((work) => work.language !== undefined).length;
    console.log(
        `\n${byRecording.size} recordings looked up, ${withLanguage} with a language` +
            (missing > 0 ? `, ${missing} without on this run` : ""),
    );
    await mkdir(dirname(values.out), { recursive: true });
    await writeFile(
        values.out,
        `${JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                note: "Written by `pnpm fetch:works`. Regenerable; language comes from MusicBrainz works.",
                works: [...byRecording.values()].sort((a, b) =>
                    a.recordingMbid.localeCompare(b.recordingMbid),
                ),
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
    console.log(`Wrote ${values.out}`);
}

await main();
