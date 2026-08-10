# KKaraoke

A karaoke song list built with [Astro](https://astro.build), rendered as a static site. The songs come from
`data/songs.json`, which is committed to the repository, and are paginated 50 to a page.

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
│   └── songs.json          # scraped catalogue, the site's only data source
├── public/
│   └── favicon.svg
├── scripts/
│   └── fetch-songs.ts      # scrapes the catalogue from kkaraoke.se
├── src/
│   ├── lib/
│   │   └── songs.ts        # loads and orders the catalogue
│   ├── layouts/
│   │   └── Layout.astro
│   ├── pages/
│   │   └── [...page].astro # paginated song list
│   └── styles/
│       └── global.css      # Tailwind entrypoint
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

TypeScript is held at 6.x on purpose. `astro check` goes through the Astro language server, which needs TypeScript's
programmatic compiler API, and the native compiler shipped in 7.0 does not expose it yet. Upgrading TypeScript to 7
makes `pnpm check` fail outright, so it stays on 6 until
[the Astro side lands support](https://github.com/withastro/roadmap/discussions/1321).

## The song list

`src/lib/songs.ts` imports `data/songs.json` and is the only thing that reads it. The `Song` interface is declared there
rather than inferred from the JSON, so a change to the scraped shape fails `pnpm check` instead of quietly reshaping the
pages.

The file is ordered by song id, because that keeps a re-scrape diffable, so the module sorts by artist for display using
Swedish collation — otherwise å, ä and ö sort beside a, a and o instead of after z.

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

## Styling

Tailwind CSS v4 is wired up through the `@tailwindcss/vite` plugin in `astro.config.mjs`. There is no
`tailwind.config.js`; configure the theme with CSS variables in `src/styles/global.css` instead. See the
[Tailwind v4 docs](https://tailwindcss.com/docs/theme).

## Deployment

The [Vercel adapter](https://docs.astro.build/en/guides/integrations-guide/vercel/) writes the static build to
`.vercel/output/static`. The build needs no environment variables, so a deploy depends on nothing but the contents of the
repository.
