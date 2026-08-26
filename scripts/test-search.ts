import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SearchSong } from "../src/lib/catalog.ts";
import {
    artistMap,
    compactText,
    foldText,
    matchesQuery,
    rankArtists,
    rankSongs,
    searchTokens,
    usefulAliases,
    type SearchArtist,
} from "../src/lib/search.ts";

function song(partial: Partial<SearchSong> & Pick<SearchSong, "title" | "artist">): SearchSong {
    return {
        id: partial.id ?? 1,
        ids: partial.ids ?? [partial.id ?? 1],
        title: partial.title,
        artist: partial.artist,
        ...(partial.from === undefined ? {} : { from: partial.from }),
        ...(partial.categories === undefined ? {} : { categories: partial.categories }),
        ...(partial.year === undefined ? {} : { year: partial.year }),
        ...(partial.genres === undefined ? {} : { genres: partial.genres }),
        ...(partial.artists === undefined ? {} : { artists: partial.artists }),
    };
}

const aTeens: SearchArtist = {
    name: "A★Teens",
    slug: "a-teens",
    sortName: "A‐Teens",
    aliases: ["A Teens", "A-Teens", "ATeens", "ABBA Teens"],
};

const pink: SearchArtist = {
    name: "P!nk",
    slug: "pink",
    sortName: "Pink",
    aliases: ["Pink", "Alecia Moore"],
};

const aha: SearchArtist = {
    name: "a-ha",
    slug: "a-ha",
    sortName: "a‐ha",
};

const acdc: SearchArtist = {
    name: "AC/DC",
    slug: "ac-dc",
};

const catalog: SearchSong[] = [
    song({
        id: 10,
        title: "Upside Down",
        artist: "A★Teens",
        artists: [{ name: "A★Teens", slug: "a-teens" }],
        genres: ["teen pop", "europop", "pop"],
    }),
    song({
        id: 11,
        title: "Mamma Mia",
        artist: "A★Teens",
        artists: [{ name: "A★Teens", slug: "a-teens" }],
        genres: ["pop"],
    }),
    song({
        id: 12,
        title: "Mamma Mia",
        artist: "ABBA",
        artists: [{ name: "ABBA", slug: "abba" }],
        genres: ["pop"],
    }),
    song({
        id: 20,
        title: "So What",
        artist: "P!nk",
        artists: [{ name: "P!nk", slug: "pink" }],
    }),
    song({
        id: 30,
        title: "Take On Me",
        artist: "a-ha",
        artists: [{ name: "a-ha", slug: "a-ha" }],
        from: "The Living Daylights",
    }),
    song({
        id: 40,
        title: "Highway to Hell",
        artist: "AC/DC",
        artists: [{ name: "AC/DC", slug: "ac-dc" }],
    }),
    song({
        id: 50,
        title: "Dancing Queen",
        artist: "ABBA",
        artists: [{ name: "ABBA", slug: "abba" }],
    }),
    song({
        id: 60,
        title: "Don't Stop Me Now",
        artist: "Queen",
        artists: [{ name: "Queen", slug: "queen" }],
    }),
    song({
        id: 70,
        title: "En apostel",
        artist: "Håkan Hellström",
        artists: [{ name: "Håkan Hellström", slug: "hakan-hellstrom" }],
    }),
    song({
        id: 80,
        title: "Beloved",
        artist: "Someone",
        artists: [{ name: "Someone", slug: "someone" }],
    }),
    song({
        id: 90,
        title: "Circle of Life",
        artist: "Elton John",
        from: "The Lion King",
        categories: ["Disney"],
        artists: [{ name: "Elton John", slug: "elton-john" }],
    }),
];

const artists: SearchArtist[] = [
    aTeens,
    pink,
    aha,
    acdc,
    { name: "ABBA", slug: "abba" },
    { name: "Queen", slug: "queen" },
    { name: "Håkan Hellström", slug: "hakan-hellstrom" },
    { name: "Elton John", slug: "elton-john" },
    { name: "Elvis Presley", slug: "elvis-presley", aliases: ["The King", "Elvis"] },
];

const bySlug = artistMap(artists);

describe("foldText", () => {
    it("treats stars and hyphens as word breaks", () => {
        assert.equal(foldText("A★Teens"), "a teens");
        assert.equal(foldText("A-teens"), "a teens");
        assert.equal(foldText("a‐ha"), "a ha");
        assert.equal(foldText("AC/DC"), "ac dc");
    });

    it("folds diacritics and Swedish letters", () => {
        assert.equal(foldText("Håkan Hellström"), "hakan hellstrom");
        assert.equal(foldText("Céline"), "celine");
    });

    it("turns ampersands into and", () => {
        assert.equal(foldText("Hall & Oates"), "hall and oates");
    });
});

describe("searchTokens", () => {
    it("drops apostrophes inside words", () => {
        assert.deepEqual(searchTokens("Don't Stop"), ["dont", "stop"]);
    });
});

describe("issue #34 A★Teens", () => {
    it("matches a teens, a-teens, ateens, and A*Teens", () => {
        const row = catalog[0]!;
        for (const query of ["a teens", "a-teens", "A-Teens", "ateens", "A*Teens", "A★Teens"]) {
            assert.equal(matchesQuery(row, query, bySlug), true, query);
        }
    });

    it("ranks A★Teens first for a teens", () => {
        const artistHits = rankArtists(artists, "a teens");
        assert.equal(artistHits[0]?.name, "A★Teens");
        const songs = rankSongs(catalog, "a teens", bySlug);
        assert.ok(songs.length >= 2);
        assert.ok(songs.every((row) => row.artist === "A★Teens"));
    });
});

describe("stylized names", () => {
    it("finds P!nk from pink via the slug", () => {
        const songs = rankSongs(catalog, "pink", bySlug);
        assert.equal(songs[0]?.artist, "P!nk");
        assert.equal(rankArtists(artists, "pink")[0]?.name, "P!nk");
    });

    it("finds a-ha from aha and a ha", () => {
        assert.equal(rankSongs(catalog, "aha", bySlug)[0]?.title, "Take On Me");
        assert.equal(rankSongs(catalog, "a ha", bySlug)[0]?.title, "Take On Me");
        assert.equal(rankArtists(artists, "aha")[0]?.name, "a-ha");
    });

    it("finds AC/DC from acdc", () => {
        assert.equal(rankSongs(catalog, "acdc", bySlug)[0]?.artist, "AC/DC");
    });

    it("finds Håkan without the å", () => {
        assert.equal(rankSongs(catalog, "hakan", bySlug)[0]?.artist, "Håkan Hellström");
    });
});

describe("token matching", () => {
    it("requires whole tokens so in does not hit Dancing Queen", () => {
        const titles = rankSongs(catalog, "in", bySlug).map((row) => row.title);
        assert.ok(!titles.includes("Dancing Queen"));
        assert.ok(!titles.includes("Beloved"));
    });

    it("does not treat love as a substring of beloved", () => {
        const titles = rankSongs(catalog, "love", bySlug).map((row) => row.title);
        assert.ok(!titles.includes("Beloved"));
    });

    it("matches title prefixes and artist+title together", () => {
        const dancing = rankSongs(catalog, "danc", bySlug);
        assert.equal(dancing[0]?.title, "Dancing Queen");
        const combined = rankSongs(catalog, "upside down a teens", bySlug);
        assert.equal(combined[0]?.title, "Upside Down");
        assert.equal(combined[0]?.artist, "A★Teens");
    });

    it("matches a film and a category", () => {
        assert.equal(rankSongs(catalog, "lion king", bySlug)[0]?.title, "Circle of Life");
        assert.equal(rankSongs(catalog, "disney", bySlug)[0]?.title, "Circle of Life");
    });

    it("matches punch-in numbers by prefix", () => {
        const rows = rankSongs(catalog, "10", bySlug);
        assert.equal(rows[0]?.id, 10);
    });
});

describe("ranking", () => {
    it("prefers the ABBA Mamma Mia over the A★Teens cover when searching mamma mia abba", () => {
        const rows = rankSongs(catalog, "mamma mia abba", bySlug);
        assert.equal(rows[0]?.artist, "ABBA");
    });

    it("prefers a title that starts with the query", () => {
        const extra = [
            ...catalog,
            song({ id: 100, title: "Love Me Do", artist: "The Beatles" }),
            song({ id: 101, title: "Can't Help Falling in Love", artist: "Elvis Presley" }),
        ];
        const rows = rankSongs(extra, "love", bySlug);
        assert.equal(rows[0]?.title, "Love Me Do");
    });
});

describe("aliases", () => {
    it("finds Elvis from the king without dumping every Elvis song onto king", () => {
        assert.equal(rankArtists(artists, "the king")[0]?.name, "Elvis Presley");
        const kingSongs = rankSongs(
            [
                ...catalog,
                song({
                    id: 200,
                    title: "Jailhouse Rock",
                    artist: "Elvis Presley",
                    artists: [{ name: "Elvis Presley", slug: "elvis-presley" }],
                }),
                song({ id: 201, title: "King of Wishful Thinking", artist: "Go West" }),
            ],
            "king",
            bySlug,
        );
        assert.ok(!kingSongs.some((row) => row.artist === "Elvis Presley"));
        assert.ok(kingSongs.some((row) => row.title.includes("King")));
    });

    it("keeps Latin aliases ahead of script-only ones", () => {
        const aliases = usefulAliases("Elvis Presley", ["エルヴィス・プレスリー", "The King", "Elvis"]);
        assert.equal(aliases[0], "Elvis");
        assert.ok(aliases.includes("The King"));
    });
});

describe("compactText", () => {
    it("joins folded words", () => {
        assert.equal(compactText("A★Teens"), "ateens");
        assert.equal(compactText("a-ha"), "aha");
    });
});
