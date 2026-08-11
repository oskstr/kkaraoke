/**
 * Scores a resolver run against the hand-written expectations in
 * data/pilot/expectations.json.
 *
 * The point is to find out whether a model's confidence means anything: a run that
 * resolves the easy names and also confidently resolves `Julsång` to some choir is
 * worse than useless, and only a check like this makes that visible.
 *
 * Usage: pnpm score:verdicts --verdicts <file> [--expectations <file>]
 */

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";

interface Verdict {
    artist: string;
    status: string;
    artists?: { name: string; mbid?: string }[];
    isCollaboration?: boolean;
    reason?: string;
}

interface Check {
    artist: string;
    status?: string;
    artistCount?: number;
    collaboration?: boolean;
    expectName?: string;
    sameEntityAs?: string;
    mustNotResolve?: boolean;
    observeOnly?: string;
}

const failures: string[] = [];
const observations: string[] = [];
let passed = 0;
let checked = 0;

function assert(condition: boolean, label: string): void {
    checked++;
    if (condition) {
        passed++;
    } else {
        failures.push(label);
    }
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            verdicts: { type: "string" },
            expectations: { type: "string", default: "data/pilot/expectations.json" },
        },
    });
    if (values.verdicts === undefined) {
        throw new Error("--verdicts <file> is required.");
    }

    const run = JSON.parse(await readFile(values.verdicts, "utf8")) as { verdicts?: Verdict[] };
    const { checks } = JSON.parse(await readFile(values.expectations, "utf8")) as { checks: Check[] };
    const byArtist = new Map((run.verdicts ?? []).map((verdict) => [verdict.artist, verdict]));

    for (const check of checks) {
        const verdict = byArtist.get(check.artist);
        if (!verdict) {
            failures.push(`${check.artist}: no verdict returned`);
            checked++;
            continue;
        }
        const resolvedCount = verdict.artists?.length ?? 0;

        if (check.observeOnly !== undefined) {
            const names = (verdict.artists ?? []).map((a) => a.name).join(" + ") || "(none)";
            observations.push(`${check.artist} -> ${verdict.status}, ${resolvedCount} artist(s): ${names}`);
            continue;
        }

        if (check.mustNotResolve === true) {
            assert(
                verdict.status !== "resolved",
                `${check.artist}: invented an artist (${verdict.status}, ${(verdict.artists ?? [])
                    .map((a) => a.name)
                    .join(", ")})`,
            );
            continue;
        }

        if (check.sameEntityAs !== undefined) {
            const other = byArtist.get(check.sameEntityAs);
            const a = verdict.artists?.[0]?.mbid;
            const b = other?.artists?.[0]?.mbid;
            assert(
                a !== undefined && a === b,
                `${check.artist} / ${check.sameEntityAs}: did not converge on one entity (${a ?? "-"} vs ${b ?? "-"})`,
            );
            continue;
        }

        if (check.status !== undefined) {
            assert(verdict.status === check.status, `${check.artist}: status ${verdict.status}, want ${check.status}`);
        }
        if (check.artistCount !== undefined) {
            assert(
                resolvedCount === check.artistCount,
                `${check.artist}: ${resolvedCount} artist(s), want ${check.artistCount}`,
            );
        }
        if (check.collaboration !== undefined) {
            assert(
                (verdict.isCollaboration ?? false) === check.collaboration,
                `${check.artist}: isCollaboration ${verdict.isCollaboration}, want ${check.collaboration}`,
            );
        }
        if (check.expectName !== undefined) {
            const names = (verdict.artists ?? []).map((a) => a.name);
            assert(
                names.includes(check.expectName),
                `${check.artist}: got ${JSON.stringify(names)}, want ${JSON.stringify(check.expectName)}`,
            );
        }
    }

    console.log(`${passed}/${checked} assertions passed`);
    if (failures.length > 0) {
        console.log(`\n${failures.length} failure(s):`);
        for (const failure of failures) console.log(`  - ${failure}`);
    }
    if (observations.length > 0) {
        console.log(`\nobserve-only cases (not scored):`);
        for (const observation of observations) console.log(`  - ${observation}`);
    }
    const unexpected = [...byArtist.keys()].filter((a) => !checks.some((c) => c.artist === a));
    if (unexpected.length > 0) {
        console.log(`\nverdicts with no expectation: ${unexpected.join(", ")}`);
    }
}

await main();
