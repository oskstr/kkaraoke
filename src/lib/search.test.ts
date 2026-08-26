import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SearchSong } from "./catalog.ts";
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
} from "./search.ts";

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

const catStevens: SearchArtist = {
    name: "Cat Stevens",
    slug: "cat-stevens",
    sortName: "Stevens, Cat",
    aliases: ["Yusuf / Cat Stevens", "Yusuf Islam", "Steven Demetre Georgiou"],
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
        id: 21,
        title: "Dreaming",
        artist: "Marshmello, P!nk, Sting",
        artists: [
            { name: "Marshmello", slug: "marshmello" },
            { name: "P!nk", slug: "pink" },
            { name: "Sting", slug: "sting" },
        ],
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
        id: 51,
        title: "A Hard Day’s Night",
        artist: "The Beatles",
        artists: [{ name: "The Beatles", slug: "the-beatles" }],
    }),
    song({
        id: 52,
        title: "Love Me Do",
        artist: "The Beatles",
        artists: [{ name: "The Beatles", slug: "the-beatles" }],
    }),
    song({
        id: 53,
        title: "LoveGame",
        artist: "Lady Gaga",
        artists: [{ name: "Lady Gaga", slug: "lady-gaga" }],
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
    song({
        id: 110,
        title: "Wild World",
        artist: "Cat Stevens",
        artists: [{ name: "Cat Stevens", slug: "cat-stevens" }],
    }),
    song({
        id: 120,
        title: "California Love",
        artist: "2Pac",
        artists: [{ name: "2Pac", slug: "2pac" }],
    }),
    song({
        id: 130,
        title: "Buttons",
        artist: "The Pussycat Dolls",
        artists: [{ name: "The Pussycat Dolls", slug: "the-pussycat-dolls" }],
    }),
    song({
        id: 140,
        title: "Life on Mars?",
        artist: "David Bowie",
        artists: [{ name: "David Bowie", slug: "david-bowie" }],
    }),
];

const artists: SearchArtist[] = [
    aTeens,
    pink,
    aha,
    acdc,
    catStevens,
    { name: "ABBA", slug: "abba" },
    { name: "Queen", slug: "queen" },
    { name: "Håkan Hellström", slug: "hakan-hellstrom" },
    { name: "Elton John", slug: "elton-john" },
    { name: "The Pussycat Dolls", slug: "the-pussycat-dolls" },
    { name: "Doja Cat", slug: "doja-cat" },
    { name: "Pink Floyd", slug: "pink-floyd" },
    { name: "Cameo", slug: "cameo" },
    { name: "Cash Cash", slug: "cash-cash" },
    { name: "Four Cats", slug: "four-cats" },
    { name: "The Cars", slug: "the-cars" },
    { name: "Cascada", slug: "cascada" },
    { name: "2Pac", slug: "2pac" },
    { name: "Elvis Presley", slug: "elvis-presley", aliases: ["The King", "Elvis"] },
    {
        name: "David Bowie",
        slug: "david-bowie",
        aliases: ["Ziggy Stardust", "The Thin White Duke", "Bowie"],
    },
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

    it("still matches A★Teens while the last word is being typed", () => {
        const row = catalog[0]!;
        assert.equal(matchesQuery(row, "a t", bySlug), true);
        assert.equal(matchesQuery(row, "a te", bySlug), true);
        assert.equal(rankArtists(artists, "a t")[0]?.name, "A★Teens");
        assert.equal(rankArtists(artists, "a te")[0]?.name, "A★Teens");
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
        assert.equal(songs[0]?.title, "So What");
        assert.equal(rankArtists(artists, "pink")[0]?.name, "P!nk");
        assert.ok(rankArtists(artists, "pink").some((artist) => artist.name === "Pink Floyd"));
    });

    it("finds a-ha from aha and a ha", () => {
        assert.equal(rankSongs(catalog, "aha", bySlug)[0]?.title, "Take On Me");
        assert.equal(rankSongs(catalog, "a ha", bySlug)[0]?.title, "Take On Me");
        assert.equal(rankArtists(artists, "aha")[0]?.name, "a-ha");
    });

    it("does not treat aha as a prefix of A Hard Day’s Night", () => {
        const titles = rankSongs(catalog, "aha", bySlug).map((row) => row.title);
        assert.ok(!titles.includes("A Hard Day’s Night"));
        const spaced = rankSongs(catalog, "a ha", bySlug);
        assert.equal(spaced[0]?.title, "Take On Me");
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

    it("matches ca as a word prefix of Cat Stevens and California Love", () => {
        const songs = rankSongs(catalog, "ca", bySlug);
        const titles = songs.map((row) => row.title);
        const names = rankArtists(artists, "ca").map((artist) => artist.name);
        assert.equal(names[0], "Cat Stevens");
        assert.ok(titles.includes("California Love"));
        assert.ok(titles.includes("Wild World"));
        assert.ok(titles.indexOf("California Love") < titles.indexOf("Wild World"));
    });

    it("matches cat inside Pussycat Dolls and ranks Cat Stevens first", () => {
        const names = rankArtists(artists, "cat").map((artist) => artist.name);
        assert.equal(names[0], "Cat Stevens");
        assert.ok(names.includes("Doja Cat"));
        assert.ok(names.includes("The Pussycat Dolls"));
        assert.ok(names.indexOf("Cat Stevens") < names.indexOf("The Pussycat Dolls"));
        const titles = rankSongs(catalog, "cat", bySlug).map((row) => row.title);
        assert.ok(titles.includes("Buttons"));
        assert.ok(titles.includes("Wild World"));
        assert.ok(titles.indexOf("Wild World") < titles.indexOf("Buttons"));
    });
});

describe("ranking", () => {
    it("prefers the ABBA Mamma Mia over the A★Teens cover when searching mamma mia abba", () => {
        const rows = rankSongs(catalog, "mamma mia abba", bySlug);
        assert.equal(rows[0]?.artist, "ABBA");
    });

    it("prefers a title that starts with the query", () => {
        const extra = [...catalog, song({ id: 101, title: "Can't Help Falling in Love", artist: "Elvis Presley" })];
        const rows = rankSongs(extra, "love", bySlug);
        const titles = rows.map((row) => row.title);
        assert.ok(titles.includes("Love Me Do"));
        assert.ok(titles.includes("California Love"));
        assert.ok(titles.indexOf("Love Me Do") < titles.indexOf("California Love"));
    });

    it("prefers Money, Money, Money over the shorter title Money", () => {
        const extra = [
            ...catalog,
            song({ id: 1100, title: "Money, Money, Money", artist: "ABBA" }),
            song({ id: 3839, title: "Money", artist: "Pink Floyd" }),
        ];
        const rows = rankSongs(extra, "Money, Money, Money", bySlug);
        assert.equal(rows[0]?.title, "Money, Money, Money");
        assert.ok(rows.some((row) => row.title === "Money"));
    });

    it("prefers the song titled 1999 over punch-in number 1999", () => {
        const extra = [
            ...catalog,
            song({ id: 852, title: "1999", artist: "Prince" }),
            song({ id: 1999, title: "Ain’t Goin’ Down", artist: "Garth Brooks" }),
        ];
        const rows = rankSongs(extra, "1999", bySlug);
        assert.equal(rows[0]?.title, "1999");
        assert.equal(rows[0]?.artist, "Prince");
        assert.ok(rows.some((row) => row.id === 1999));
    });
});

describe("aliases", () => {
    it("finds Cat Stevens from Yusuf and Yusuf Islam", () => {
        assert.equal(rankArtists(artists, "yusuf")[0]?.name, "Cat Stevens");
        assert.equal(rankArtists(artists, "yusuf islam")[0]?.name, "Cat Stevens");
        assert.equal(rankSongs(catalog, "yusuf", bySlug)[0]?.artist, "Cat Stevens");
        assert.equal(rankSongs(catalog, "yusuf islam", bySlug)[0]?.title, "Wild World");
    });

    it("ranks ABBA above the A★Teens ABBA Teens alias", () => {
        assert.equal(rankArtists(artists, "abba")[0]?.name, "ABBA");
    });

    it("finds Elvis from the king without treating king as only Elvis", () => {
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
        const titles = kingSongs.map((row) => row.title);
        assert.ok(titles.includes("King of Wishful Thinking"));
        assert.ok(titles.indexOf("King of Wishful Thinking") < titles.indexOf("Jailhouse Rock"));
    });

    it("keeps Latin aliases ahead of script-only ones", () => {
        const aliases = usefulAliases("Elvis Presley", ["エルヴィス・プレスリー", "The King", "Elvis"]);
        assert.ok(aliases.includes("Elvis"));
        assert.ok(aliases.includes("The King"));
        assert.equal(aliases.at(-1), "エルヴィス・プレスリー");
    });
});

describe("typeahead and typos", () => {
    it("keeps Ziggy Stardust visible for every prefix of the last word", () => {
        for (const query of ["ziggy", "ziggy s", "ziggy st", "ziggy star", "ziggy stardust"]) {
            assert.equal(rankArtists(artists, query)[0]?.name, "David Bowie", query);
            assert.equal(rankSongs(catalog, query, bySlug)[0]?.artist, "David Bowie", query);
        }
    });

    it("finds David Bowie from a missing-letter typo in Ziggy Stardust", () => {
        assert.equal(rankArtists(artists, "ziggy stadust")[0]?.name, "David Bowie");
        assert.equal(rankSongs(catalog, "ziggy stadust", bySlug)[0]?.artist, "David Bowie");
    });

    it("keeps Dancing Queen and Pussycat Dolls while the last word is one letter", () => {
        assert.equal(rankSongs(catalog, "dancing q", bySlug)[0]?.title, "Dancing Queen");
        assert.equal(rankArtists(artists, "pussycat d")[0]?.name, "The Pussycat Dolls");
        assert.equal(rankSongs(catalog, "life on m", bySlug)[0]?.title, "Life on Mars?");
        assert.equal(rankArtists(artists, "yusuf i")[0]?.name, "Cat Stevens");
    });

    it("finds Bowie from The Thin White Duke", () => {
        assert.equal(rankArtists(artists, "thin white")[0]?.name, "David Bowie");
    });
});

describe("compactText", () => {
    it("joins folded words", () => {
        assert.equal(compactText("A★Teens"), "ateens");
        assert.equal(compactText("a-ha"), "aha");
    });
});
