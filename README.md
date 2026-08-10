# KKaraoke

A karaoke song list built with [Astro](https://astro.build), rendered as a static site. The song list is read from a
PostgreSQL database via [Prisma](https://www.prisma.io) at build time and paginated 50 songs to a page.

## Requirements

- **Node.js `22.12.0` or higher** (required by Astro 7; odd-numbered releases such as v23 are not supported)
- A PostgreSQL database

## Getting started

Install dependencies:

```shell
yarn install
```

Point `DATABASE_URL` at your database in a `.env` file:

```
DATABASE_URL="postgresql://user:password@localhost:5432/kkaraoke?schema=public"
```

Generate the Prisma client, then start the dev server:

```shell
yarn prisma generate
yarn dev
```

The site is served at [localhost:4321](http://localhost:4321).

Because the song list is fetched during `getStaticPaths`, the database must be reachable at build time as well as in
development.

## Project structure

```
/
├── prisma/
│   └── schema.prisma       # kkaraoke table
├── public/
│   └── favicon.svg
├── src/
│   ├── db/
│   │   └── songs.ts        # Prisma queries
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

| Command        | Action                                           |
| :------------- | :----------------------------------------------- |
| `yarn install` | Installs dependencies                            |
| `yarn dev`     | Starts local dev server at `localhost:4321`      |
| `yarn build`   | Builds the production site to `./dist/`          |
| `yarn preview` | Previews the build locally, before deploying     |
| `yarn check`   | Type-checks the project with `astro check`       |
| `yarn format`  | Formats the project with Prettier                |
| `yarn astro`   | Runs CLI commands like `astro add`, `astro sync` |

## Styling

Tailwind CSS v4 is wired up through the `@tailwindcss/vite` plugin in `astro.config.mjs`. There is no
`tailwind.config.js`; configure the theme with CSS variables in `src/styles/global.css` instead. See the
[Tailwind v4 docs](https://tailwindcss.com/docs/theme).

## Deployment

The [Vercel adapter](https://docs.astro.build/en/guides/integrations-guide/vercel/) writes the static build to
`.vercel/output/static`. `DATABASE_URL` must be set as an environment variable in the Vercel project so the build can
read the song list.
