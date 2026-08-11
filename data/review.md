# Songs still to review

10 songs, written by `pnpm build:resolved`. Regenerable, so do not edit it.

A decision here becomes an entry in `data/proposals.json`, keyed by `postId`. A proposal only
adds a key for the matcher to look for, so it applies if MusicBrainz agrees and does nothing at
all if it does not — a wrong guess is cheap. Anything the dump cannot confirm belongs in
`data/overrides.json` instead. Songs already listed there are omitted from this queue.

## Contents

- weak match — **8**
- no match, and this artist string is unknown to MusicBrainz — **1**
- matched a placeholder entity — **1**

## weak match (8)

### Arctic Monkeys — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 4352 | You probably couldn't see | Arctic Monkeys – You Probably Couldn’t See for the Lights but You Were Staring Straight at Me — matched by loose | 48037 |

### Beyonce — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 5630 | Bow down | Beyoncé – Bow Down / I Been On — matched by loose | 48317 |

### Beyoncé — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 5849 | Bow down | Beyoncé – Bow Down / I Been On — matched by loose | 48321 |

### Blues Brothers — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 1787 | Soul man | Blues Brothers – Soul Man (reprise) / End Credits — matched by loose | 48446 |

### Christina Aguilera — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 1359 | Dirty | Christina Aguilera – Dirty - Beginn — matched by loose | 48993 |

### Donna Summer — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 1949 | McArthur park | Donna Summer – McArthur Park Suite — matched by loose | 49485 |

### Fall out boy — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 5733 | This aint a scene | Fall Out Boy – This Ain’t a Scene, It’s an Arms Race — matched by loose | 49944 |

### Sting — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 286 | Every breath you take | Sting – Every Breath You Take (feat. Orchestra) (2010) — matched by loose | 52946 |


## no match, and this artist string is unknown to MusicBrainz (1)

### Debbie Smith-Tebay — 1

| id | the venue's title | postId |
| -: | --- | -: |
| 333 | Follow your road | 49271 |


## matched a placeholder entity (1)

### High school musical — 1

| id | the venue's title | what we found | postId |
| -: | --- | --- | -: |
| 5843 | Were all in this together | MusicBrainz files this under [Disney], which is an id but not a performer | 50370 |
