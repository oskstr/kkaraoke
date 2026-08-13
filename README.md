# KKaraoke

A karaoke song list built with [Astro](https://astro.build), rendered as a static site. The songs come from files
committed to the repository — the venue's catalogue in `data/songs.json`, the corrections in `data/resolved.json`, and
the hand edits in `data/overrides.json` — and are browsed by decade, genre, film, language, and artist.

## Requirements

- **Node.js `22.12.0` or higher** (required by Astro 7; odd-numbered releases such as v23 are not supported)
- **pnpm** — the version is pinned in `packageManager`, so `corepack enable` will match it automatically

## Getting started

```shell
pnpm install
pnpm dev
```

The site is served at [localhost:4321](http://localhost:4321). There is nothing else to configure: the catalogue is read
from a file in the repository, so builds need no database, no credentials and no network access.

## Project structure

```
/
├── data/
│   ├── songs.json              # scraped catalogue, the venue's data verbatim
│   ├── resolved.json           # the corrections the site applies; regenerable
│   ├── overrides.json          # hand corrections; no script ever writes it
│   ├── artist-names.json       # catalogue-scoped display names per artist MBID
│   ├── proposals.json          # guesses put to the dump; applied only if MusicBrainz agrees
│   ├── canonical-matches.json  # what the offline match found, per song
│   ├── artists.json            # canonical names, sort names, aliases, genres
│   ├── recordings.json         # earliest release date per title and artist
│   ├── works.json              # work titles and lyrics language, by recording
│   ├── review.md               # songs the resolver would not apply; regenerable
│   └── pilot/                  # a 50-artist trial of the resolution design
├── docs/
│   └── song-data.md            # design for correcting and enriching the catalogue
├── public/
│   └── favicon.svg
├── scripts/
│   ├── fetch-songs.ts          # scrapes the catalogue from kkaraoke.se
│   ├── match-canonical.ts      # offline match against the MusicBrainz dump
│   ├── fetch-artists.ts        # artist names and genres, batched by id
│   ├── fetch-recordings.ts     # earliest release date per title and artist
│   ├── fetch-works.ts          # work titles and languages, by recording MBID
│   ├── corroborate-titles.ts   # second-source check against Deezer and Discogs
│   ├── build-resolved.ts       # composes the above into resolved.json
│   ├── collect-artist-evidence.ts
│   ├── score-artist-verdicts.ts
│   └── lib/
│       └── musicbrainz.ts      # cached, rate-limited, batching API client
├── src/
│   ├── lib/
│   │   ├── songs.ts            # composes the catalogue with its corrections
│   │   ├── catalogue.ts        # browse tiles, collections, search index
│   │   └── categories.ts       # Disney / Bond / Musical derived from `from`
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   ├── index.astro         # featured browse tiles
│   │   ├── browse/[facet].astro
│   │   ├── collections/[kind]/[slug].astro
│   │   ├── artists/
│   │   ├── search.astro
│   │   └── favorites.astro
│   ├── components/
│   ├── scripts/                # client: windowed lists, sort, favorites, navigation
│   └── styles/
│       └── global.css          # Tailwind entrypoint
└── astro.config.mjs
```

Astro turns each file in `src/pages/` into a route based on its filename.

## Commands

All commands are run from the root of the project:

| Command            | Action                                           |
| :----------------- | :----------------------------------------------- |
| `pnpm install`     | Installs dependencies                            |
| `pnpm dev`         | Starts local dev server at `localhost:4321`      |
| `pnpm build`       | Builds the production site to `./dist/`          |
| `pnpm preview`     | Previews the build locally, before deploying     |
| `pnpm check`       | Type-checks the project with `astro check`       |
| `pnpm format`      | Formats the project with Prettier                |
| `pnpm astro`       | Runs CLI commands like `astro add`, `astro sync` |
| `pnpm fetch:songs` | Re-scrapes `data/songs.json` from kkaraoke.se    |

And these regenerate the corrections, rather than building the site. They are described under
[Correcting the catalogue](#correcting-the-catalogue), and designed in
[`docs/song-data.md`](docs/song-data.md):

| Command                  | Action                                                           |
| :----------------------- | :--------------------------------------------------------------- |
| `pnpm match:canonical`   | Matches the catalogue against a local MusicBrainz canonical dump |
| `pnpm fetch:artists`     | Canonical artist names, sort names, aliases and genres, by id    |
| `pnpm fetch:recordings`  | Earliest release date per title and artist                       |
| `pnpm fetch:works`       | Work titles and lyrics language, by recording MBID               |
| `pnpm corroborate:titles` | Second-source check of published artist+title (Deezer, Discogs) |
| `pnpm build:resolved`    | Composes the above into `data/resolved.json`                     |
| `pnpm collect:evidence`  | Gathers MusicBrainz evidence for a list of artist strings        |
| `pnpm score:verdicts`    | Scores a resolution run against `data/pilot/expectations.json`   |

TypeScript is held at 6.x on purpose. `astro check` goes through the Astro language server, which needs TypeScript's
programmatic compiler API, and the native compiler shipped in 7.0 does not expose it yet. Upgrading TypeScript to 7
makes `pnpm check` fail outright, so it stays on 6 until
[the Astro side lands support](https://github.com/withastro/roadmap/discussions/1321).

## The site

The home page is a short set of featured tiles (decades people actually sing, Swedish, Melodifestivalen, pop, rock,
Disney). Tabs behind that browse the whole catalogue by decade, genre, category, film and musical, or language. Each
tile opens a collection: a song list sorted A–Z, by artist, or by year.

Large collections are windowed — the first eighty rows are in the HTML, the rest load as you scroll — so the page stays
a document the browser can restore on back. Astro's `ClientRouter` handles that; the list is not a nested scroller.

Search matches title, artist, film, category, genre, and punch-in number. Artist pages list every song that credits that
performer, including collaborations. The artist column is those names, comma separated, each a link — not a MusicBrainz
credit line with `feat.` or `&` between people. The same song under two punch-in numbers is one row that shows both.

Favourites live in `localStorage` on this device. There is no login and no server to sync them.

## The song list

`src/lib/songs.ts` is the only thing that reads the data files. `data/songs.json` is the venue's catalogue verbatim;
`data/resolved.json` is what MusicBrainz says it should be; `data/overrides.json` wins over both. The `Song` and
`Correction` interfaces are declared there rather than inferred from the JSON, so a change to either shape fails
`pnpm check` instead of quietly reshaping the pages.

Only corrections the resolver marked trustworthy are in `data/resolved.json`, so composing them is a straight overlay.
The rest are listed in `data/review.md`, showing what the correction would have been, and the page keeps showing the
venue's own strings until someone looks. Nothing in the pipeline writes to `data/songs.json` or `data/overrides.json`.
`data/resolved.json` is regenerable from scratch.

`data/songs.json` is ordered by song id, because that keeps a re-scrape diffable, so the module sorts for display using
Swedish collation — otherwise å, ä and ö sort beside a, a and o instead of after z. It sorts by the artist's MusicBrainz
sort name where there is one, which is what files The Beatles under B and a collaboration under whoever is credited
first.

## Fetching the catalogue

`data/songs.json` is scraped from [the venue's song list](https://www.kkaraoke.se/latar/) by `pnpm fetch:songs`. It is
committed, so a refresh shows up as a reviewable diff:

```shell
pnpm fetch:songs
git diff --stat data/songs.json
```

The source has no API. It is a WordPress page whose JetEngine listing widget re-renders all ~450 KB of HTML for every
page of results, so the script walks the pages and lifts each row out of the markup. Two details make that work:

- The page renders the same catalogue twice, once at 10 rows per page and once at 50. The `jsf=jet-engine/default` query
  parameter aims `pagenum` at the 50-row listing, which is why the script uses that one.
- Every row is three Elementor heading widgets that are only distinguishable by the element id in their class, and their
  order in the markup is not the order the columns appear in on screen. The script matches on those ids.

Both are details of how the page happens to be built today, so the script asserts each of them and every field it reads,
and aborts rather than writing a partial or empty catalogue if the page changes shape. `--pages <n>` limits the walk for
a quick check, and `--delay <ms>` (1 second by default) spaces out the requests.

A refresh is therefore a data change like any other: re-run the script, read the diff, and deploy it.

The catalogue is the venue's data verbatim, typos and all, so `Ace of Base` and `Ace of base` are two different artists
in it. [docs/song-data.md](docs/song-data.md) is the design for correcting and enriching it.

## Correcting the catalogue

Five steps produce `data/resolved.json`, and each is regenerable from the one before:

```shell
pnpm match:canonical --csv canonical_musicbrainz_data.csv   # identity and titles, offline
pnpm fetch:artists                                         # canonical names, sort names, genres
pnpm fetch:recordings                                      # earliest release per title and artist
pnpm fetch:works                                           # work titles and lyrics language
pnpm build:resolved                                        # compose the above into resolved.json
```

The first step wants [the MusicBrainz canonical metadata dump](https://metabrainz.org/datasets/derived-dumps#canonical)
(CC0, ~2.3 GB compressed). It exists for exactly this problem — turning an artist string and a title into MBIDs — and it
matches 89% of the catalogue in 90 seconds without a single request. That is the reason the pipeline starts offline.

The lookups go through the MusicBrainz web service, whose rate limit is per IP and therefore shared with whatever
else uses the same egress address. Two things make that survivable. Responses are cached under `.cache/`, outside the
repository, so any run resumes where it left off and re-running costs nothing. And ids are batched into single queries —
`arid:(id1 OR id2 OR …)` returns a hundred artists at a time, which is why the artist step is 39 requests rather than 1670.

`pnpm fetch:recordings` is the slow one, because a year cannot be asked for by id: see
[docs/song-data.md](docs/song-data.md) for why the matched recording's own date is the wrong answer. It is resumable in
the same way, and `--fill` skips what a previous pass already dated.

`pnpm corroborate:titles` is not part of that chain. It checks published artist+title against Deezer and Discogs and
writes a review list; it never invents overrides.

## Styling

Tailwind CSS v4 is wired up through the `@tailwindcss/vite` plugin in `astro.config.mjs`. There is no
`tailwind.config.js`; configure the theme with CSS variables in `src/styles/global.css` instead. See the
[Tailwind v4 docs](https://tailwindcss.com/docs/theme).

## Deployment

The [Vercel adapter](https://docs.astro.build/en/guides/integrations-guide/vercel/) writes the static build to
`.vercel/output/static`. The build needs no environment variables, so a deploy depends on nothing but the contents of the
repository.
