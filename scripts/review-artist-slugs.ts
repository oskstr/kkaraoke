/**
 * Writes `data/artist-slugs-review.md` — every catalogue artist and the slug their
 * page uses. Regenerable; change a display name or a `slug` in artist-names.json
 * instead of editing the markdown.
 */
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { getArtists, getSongsByArtist, slugify } from "../src/lib/songs.ts";
import artistNamesFile from "../data/artist-names.json" with { type: "json" };

function cell(value: string): string {
    return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

async function main(): Promise<void> {
    const { values } = parseArgs({
        options: {
            out: { type: "string", default: "data/artist-slugs-review.md" },
        },
    });

    const curatedByMbid = new Map(
        Object.entries(
            (artistNamesFile.artists ?? {}) as Record<string, { name: string; slug?: string }>,
        )
            .filter(([, entry]) => entry.slug !== undefined && entry.slug.length > 0)
            .map(([mbid, entry]) => [mbid, slugify(entry.slug!)]),
    );
    const mbidsForCuratedSlug = new Map<string, string[]>();
    for (const [mbid, slug] of curatedByMbid) {
        const group = mbidsForCuratedSlug.get(slug);
        if (group === undefined) {
            mbidsForCuratedSlug.set(slug, [mbid]);
        } else {
            group.push(mbid);
        }
    }

    const artists = getArtists().sort(
        (a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug, "en"),
    );
    const rows = artists.map((artist) => {
        const auto = slugify(artist.name);
        const merged = mbidsForCuratedSlug.get(artist.slug);
        const curated = curatedByMbid.has(artist.mbid) || (merged !== undefined && merged.length > 1);
        const songs = getSongsByArtist(artist.slug).length;
        let note = "";
        if (merged !== undefined && merged.length > 1) {
            note = `merged ${merged.length} MusicBrainz ids onto \`${artist.slug}\``;
        } else if (curated && artist.slug !== auto) {
            note = `curated (\`${auto}\` → \`${artist.slug}\`)`;
        } else if (curated) {
            note = "curated";
        } else if (artist.slug !== auto) {
            note = `disambiguated from \`${auto}\``;
        }
        return { artist, songs, note, curated, merged: merged !== undefined && merged.length > 1 };
    });

    const curatedCount = rows.filter((row) => row.curated && !row.merged).length;
    const mergedCount = rows.filter((row) => row.merged).length;
    const disambiguatedCount = rows.filter(
        (row) => !row.curated && row.artist.slug !== slugify(row.artist.name),
    ).length;

    const lines = [
        "# Artist slug review",
        "",
        `${artists.length} artists, written by \`pnpm review:artist-slugs\` from the composed`,
        "catalogue. Regenerable, so do not edit it — change a display name or add a `slug` in",
        "`data/artist-names.json` instead.",
        "",
        `${curatedCount} curated slug override(s), ${mergedCount} merged page(s), ${disambiguatedCount} collision disambiguation(s).`,
        "Everyone else is `slugify(display name)`. Shared curated slugs merge MusicBrainz entities onto one page.",
        "",
        "| name | slug | songs | note | mbid |",
        "| --- | --- | -: | --- | --- |",
        ...rows.map(({ artist, songs, note }) => {
            return `| ${cell(artist.name)} | ${cell(artist.slug)} | ${songs} | ${cell(note)} | \`${artist.mbid}\` |`;
        }),
        "",
    ];

    const out = values.out ?? "data/artist-slugs-review.md";
    await writeFile(out, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${out} (${artists.length} artists)`);
}

await main();
