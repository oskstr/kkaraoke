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

    const curatedSlugs = new Map(
        Object.entries(
            (artistNamesFile.artists ?? {}) as Record<string, { name: string; slug?: string }>,
        )
            .filter(([, entry]) => entry.slug !== undefined && entry.slug.length > 0)
            .map(([mbid, entry]) => [mbid, entry.slug!]),
    );

    const artists = getArtists().sort(
        (a, b) => a.name.localeCompare(b.name, "en") || a.slug.localeCompare(b.slug, "en"),
    );
    const rows = artists.map((artist) => {
        const auto = slugify(artist.name);
        const curated = curatedSlugs.get(artist.mbid);
        const songs = getSongsByArtist(artist.slug).length;
        let note = "";
        if (curated !== undefined) {
            note = `curated (\`${auto}\` → \`${artist.slug}\`)`;
        } else if (artist.slug !== auto) {
            note = `disambiguated from \`${auto}\``;
        }
        return { artist, songs, note };
    });

    const curatedCount = rows.filter((row) => curatedSlugs.has(row.artist.mbid)).length;
    const disambiguatedCount = rows.filter(
        (row) => !curatedSlugs.has(row.artist.mbid) && row.artist.slug !== slugify(row.artist.name),
    ).length;

    const lines = [
        "# Artist slug review",
        "",
        `${artists.length} artists, written by \`pnpm review:artist-slugs\` from the composed`,
        "catalogue. Regenerable, so do not edit it — change a display name or add a `slug` in",
        "`data/artist-names.json` instead.",
        "",
        `${curatedCount} curated slug override(s), ${disambiguatedCount} collision disambiguation(s).`,
        "Everyone else is `slugify(display name)`.",
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
