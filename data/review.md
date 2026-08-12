# Songs still to review

4 songs, written by `pnpm build:resolved`. Regenerable, so do not edit it.

A decision here becomes an entry in `data/proposals.json`, keyed by `postId`. A proposal only
adds a key for the matcher to look for, so it applies if MusicBrainz agrees and does nothing at
all if it does not — a wrong guess is cheap. Anything the dump cannot confirm belongs in
`data/overrides.json` instead. Songs already listed there are omitted from this queue.

## Contents

- no match, and this artist string is unknown to MusicBrainz — **2**
- matched a placeholder entity — **2**

## no match, and this artist string is unknown to MusicBrainz (2)

### BTS — 1

| id | the venue's title | postId |
| -: | --- | -: |
| 5728 | Blood sweat and tears | 48716 |

### Debbie Smith-Tebay — 1

| id | the venue's title | postId |
| -: | --- | -: |
| 333 | Follow your road | 49271 |


## matched a placeholder entity (2)

### High school musical — 2

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 5747 | What iv'e been looking for | MusicBrainz files this under [Disney], which is an id but not a performer | 50369 |
| 5843 | Were all in this together | MusicBrainz files this under [Disney], which is an id but not a performer | 50370 |
