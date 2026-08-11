# Songs still to review

3 songs, written by `pnpm build:resolved`. Regenerable, so do not edit it.

A decision here becomes an entry in `data/proposals.json`, keyed by `postId`. A proposal only
adds a key for the matcher to look for, so it applies if MusicBrainz agrees and does nothing at
all if it does not — a wrong guess is cheap. Anything the dump cannot confirm belongs in
`data/overrides.json` instead.

## Contents

- no match, and this artist string is unknown to MusicBrainz — **2**
- this artist has no such title; the venue may have credited the wrong one — **1**

## no match, and this artist string is unknown to MusicBrainz (2)

### Ayumi Hamasaki — 1

| id | the venue's title | postId |
| -: | --- | -: |
| 4158 | Walking proud | 48108 |

### Debbie Smith-Tebay — 1

| id | the venue's title | postId |
| -: | --- | -: |
| 333 | Follow your road | 49271 |


## this artist has no such title; the venue may have credited the wrong one (1)

### Carola — 1

| id | the venue's title | postId |
| -: | --- | -: |
| 3008 | Det är bara vi | 48782 |
