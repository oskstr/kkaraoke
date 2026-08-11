# Songs still to review

4 songs, written by `pnpm build:resolved`. Regenerable, so do not edit it.

A decision here becomes an entry in `data/proposals.json`, keyed by `postId`. A proposal only
adds a key for the matcher to look for, so it applies if MusicBrainz agrees and does nothing at
all if it does not — a wrong guess is cheap. Anything the dump cannot confirm belongs in
`data/overrides.json` instead. Songs already listed there are omitted from this queue.

## Contents

- weak match — **3**
- no match, and this artist string is unknown to MusicBrainz — **1**

## weak match (3)

### Bruce Springsteen — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 2574 | Rosalita | Bruce Springsteen – Rosalita (Come Out Tonight) (Con’t) — matched by loose | 48666 |

### Four Tops — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 4663 | I can't help myself | Four Tops – I Can’t Help Myself (Sugar Pie, Honey Bunch) (multiplex: with lead vocals) — matched by loose | 50076 |

### Omi — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 5230 | Cheerleader (felix Jaehn Remix) | OMI – Cheerleader (Felix Jaehn remix edit) — matched by loose | 51967 |


## no match, and this artist string is unknown to MusicBrainz (1)

### Debbie Smith-Tebay — 1

| id | the venue's title | postId |
| -: | --- | -: |
| 333 | Follow your road | 49271 |
