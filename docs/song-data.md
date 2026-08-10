# Correcting and enriching the song data

The scrape in `data/songs.json` is the venue's data verbatim: a punch-in number, an artist string and a title
string. This describes how we turn that into something worth browsing — canonical artists, real titles, years,
languages — without ever inventing a fact.

Nothing here is built yet. This is the design, with the parts that were tested against the live MusicBrainz API
marked as such, so that the guesses are told apart from the findings.

## The rule everything else follows

**A field is either traceable to a lookup, or it is empty.** Every value we add carries the entity id it came
from and the query that found it. When a lookup comes back empty or ambiguous, the answer is to record that and
move on, never to fill the gap from memory. An agent doing this work is valuable because it can search, read the
candidates and judge them — not because it knows about music.

The corollary is that "no artist found" is a legitimate, final answer for some songs, and the pipeline has to be
able to say so.

## Three layers, and who is allowed to write to them

| File                  | Written by              | Contents                                                          |
| :-------------------- | :---------------------- | :---------------------------------------------------------------- |
| `data/songs.json`     | `pnpm fetch:songs` only | The scrape. Never hand-edited.                                    |
| `data/resolved.json`  | the resolver only       | Lookup results and provenance. Fully regenerable; safe to delete. |
| `data/overrides.json` | humans only             | Review decisions and hand corrections. No script ever writes it.  |

The site composes the three, with overrides winning. Keeping the machine-written and human-written files apart is
the whole point: a re-scrape or a re-run must never be able to destroy a review decision. Raw API responses are
cached outside the repository, so a re-run costs nothing and does not show up in diffs.

Songs are keyed by `postId`, the venue's WordPress id, because their punch-in `id` is the more likely of the two
to be reassigned.

**`id` is never corrected.** It is the number you type into the machine, so changing it is the one edit that can
break the site's actual purpose.

## Resolving artists first

2080 artist strings against 5915 songs, and the artist work is where the visible value is — artist pages, the
case variants, the collaboration splitting. Doing it first also makes the song pass tractable, because a song
lookup scoped to a known artist is a far narrower question than a title search against the whole database.

For prioritisation: 1278 artists have exactly one song, so **802 artists cover 4637 songs (78% of the
catalogue)**. The long tail is 22% of the songs at the highest cost per item and the worst source coverage, and
is the natural place to let flags accumulate rather than grind.

### Search on aliases, not on the name field

_Tested._ A name-restricted search misses artists the venue names by an alias, and the failure is silent because
something else scores 100:

```
artist:"Hall & Oates"   ->  100  HmfO: A Hall and Oates Tribute
                            89  Mind Over Matter: A Tribute to Hall and Oates
```

The real duo is `Daryl Hall & John Oates` and did not appear at all. Both an unfielded query and
`alias:"Hall & Oates"` return it at 100, with the tribute band demoted to 83. So: **query unfielded, and treat a
score of 100 as "worth checking", never as "correct".**

### Corroborate a candidate with the titles we already have

_Tested, and this is the load-bearing trick._ We know which songs the venue files under each artist, so we can
ask whether a candidate actually recorded them, scoped by the candidate's id:

```
recording:"<our title>" AND arid:<candidate mbid>
```

Three of our `Hall & Oates` titles, against the two candidates:

```
Daryl Hall & John Oates          Maneater -> 100   Rich girl -> 100   You make my dreams -> 100
HmfO: A Hall and Oates Tribute   Maneater -> miss  Rich girl -> miss  You make my dreams -> miss
```

Two or three sampled titles are enough to separate the real entity from a lexically similar one. It also returns
the canonical title casing (`Rich girl` becomes `Rich Girl`), so the same request that confirms the artist starts
fixing the titles.

Do not try to corroborate by browsing a candidate's recordings instead. _Tested:_ ABBA has far more than a page
of them, and an arbitrary 100 matched only 3 of our 32 ABBA titles, which looks like a mismatch and is not one.

### Splitting collaborations is a lookup, not a rule

379 artist strings contain a separator, and the syntax carries no information about how many artists there are:

- `Peter, Björn & John` is one group (_tested:_ resolves to `Peter Bjorn and John` at 100), as are
  `Peter, Paul & Mary` and `Emerson, Lake & Palmer`
- `Christina Aguilera, Lil Kim, Mya & Pink` is four artists, in the same shape
- 39 of the 269 strings containing `&` either follow the `X & The Ys` pattern or are known single acts —
  `Hall & Oates`, `Simon & Garfunkel`, `Adam & The Ants`, `KC & The Sunshine Band` — and that count comes from
  probing patterns we already knew, so the real figure is higher
- `Lilly Wood & The Prick And Robin Schulz` is a band whose name contains `&`, collaborating via `And`
- the five slash cases are not collaborations at all: `Björn Skifs/Blue Swede`, `Jimmy Somerville/Bronski Beat`,
  `Travis/Fran Healey` and `Rosie/Originals` each pair a band with its own frontman, and `Ac/Dc` is just
  miscased

So the order is: resolve the **whole string** first, and only if that fails try splitting — then resolve every
part, and fail the whole thing if any part does not resolve. Never split first.

## What we extract

Grouped by how well it can actually be grounded, which is not the same as how much we want it.

**Reliable.** Canonical artist name and MBID. Canonical title. First release year. Language. Aliases and
translated titles, which are what let someone find `Stilla natt` by typing "Silent Night". Composer, from the
work, which doubles as the signal for traditional material. Whether the credit is a collaboration, and of how
many credited artists.

**Two years, deliberately.** The release year of the earliest release by the credited artist, and separately the
work's first publication year. They diverge wildly for standards and traditional songs, and picking one would
mean arguing about it later.

**Match works, not recordings.** A karaoke catalogue is full of covers, and there are thousands of karaoke
recordings that would pollute recording-level matching. Works also carry the composer and the translations.
_Tested:_ `Stilla natt` resolves to a work at 100 with type `Song`.

**Sparse, take what's there.** Genre. MusicBrainz genres are user tags, so they are thin and inconsistent at
recording level and better at artist level. Take them per artist, allow a per-song override, and accept blanks
across the long tail. Genre is the field where the temptation to guess is strongest and must be resisted hardest.

**Not groundable, do not promise it.** Duet. _Tested and it failed:_ recording-level vocal-role relations came
back empty for the duets we tried, so there is no credit data to read. Worse, a title-only recording search
picks arbitrary recordings — searching `Wake Me Up` returned a J-pop group rather than Avicii, and
`Endless Love` returned a compilation track credited to Kenny Rogers.

Two credited artists also does not mean a duet: 25 of our multi-artist strings are a producer or DJ plus a
vocalist, where only one person sings — `Avicii Ft. Robbie Williams`, `Calvin Harris Feat. Ellie Goulding`,
`David Guetta & Akon`, `Kygo ft. Selena Gomez`. Meanwhile `Lionel Richie & Diana Ross – Endless love` and
`Paul McCartney & Stevie Wonder – Ebony and ivory` are real duets in the same shape.

So the pipeline records the collaboration structure, which it can prove, and duet stays a human-curated flag on
a small high-value set. Cover art is out of scope.

## Flagging: the resolver reports on itself

Rather than detecting problems afterwards with heuristics, each record carries the resolver's own account of how
the lookup went:

- `resolved` — one candidate, corroborated
- `ambiguous` — several plausible candidates, all of them recorded, with the reason it could not choose
- `unmatched` — nothing credible found
- `not-applicable` — no performer exists to find, e.g. a traditional work or a medley

Only `ambiguous` and `unmatched` need human eyes, and the queue is ordered by blast radius: a placeholder
covering 39 songs before an obscure single. Because the agent's confidence is itself a claim, a sample of
`resolved` records should be spot-checked so we know whether that confidence is worth anything.

## Songs with no real artist

30 artist values covering **124 songs**, in three kinds that need different handling.

**Finnish (39, filed under `Finsk musik`).** Real songs by real artists, filed under a language label. With no
artist to scope the search by, a title-only lookup often cannot decide. _Tested:_ `Myrskyn jälkeen` returns four
different artists all at score 100. These are `ambiguous` by construction, and that is the correct outcome
rather than a failure.

**Christmas (19, filed under `Julsång`).** Mostly traditional or 19th-century works — `Stilla natt`,
`Sankta Lucia`, `Bjällerklang`, `Gläns över sjö och strand`. There is no performer to find, and `O helga natt`
has a known composer but no canonical performer. These are `not-applicable`, and the data model has to allow a
song to be a work without a performer rather than have a fake artist forced onto it. One of them, `Jul medley`,
is not a single work at all.

**Films and musicals (28 values, 66 songs).** `Disney` (13 songs), `Chicago` (5), `Sound of Music` (4),
`High school musical` (4), `Grease` (3), `Frozen II` (3), `Moulin Rouge` (3), plus `Blues Brothers`,
`Jesus Christ Superstar`, `Hamilton`, `West Side Story` and `Lady & The Tramp`. `Chicago` is genuinely
ambiguous, since the band and the musical both exist and only the song titles can separate them. There is also
annotation leakage to strip: `Enya (fellowship Of The Ring Soundtrack)`, `Irish traditional song`.

These mostly do have a findable performer — the actor or artist who recorded the version — but which performer
depends on which production, so they need the same candidate-and-review treatment as the Finnish songs rather
than being treated as artist-less.

## Known scope of the corrections

| Problem                                        | Scope                                                           |
| :--------------------------------------------- | :-------------------------------------------------------------- |
| Titles sentence-cased by the venue             | 4109 of 4869 multi-word titles (84%)                            |
| Artist strings encoding more than one artist   | 379                                                             |
| Dropped leading "The"                          | 25+ confirmed (`Beatles`, `Kinks`, `Police`, `Clash`, `Eagles`) |
| Sentence-cased acronyms                        | `Abba`, `Kiss`, `Rem`, `Ac/Dc`, `Inxs`                          |
| Case-only duplicate artists                    | 18 clusters, 36 strings                                         |
| Same song listed twice under different numbers | 34 pairs, e.g. `Coldplay – In my place` as 119 and 4477         |
| Songs with no real artist                      | 124, across 30 artist values                                    |

The title casing is not a scattering of typos but a transformation applied to the whole catalogue, which is why
titles are a 5900-lookup job and not a cleanup pass.

The 34 duplicate pairs need a product decision rather than a lookup: either show one row carrying both numbers,
or keep both rows, since either number works at the machine. **Deferred to the UI rework**, where we can see how
each option actually reads on the page.

## Cost and rate limits

MusicBrainz allows **one request per second**, needs no API key, and requires a meaningful User-Agent. It is
free for non-commercial use. _Tested:_ 503s occur even at that rate, so the client needs retry with backoff and
should pace itself slightly slower than the limit.

_Measured on the pilot:_ an artist costs **11 requests** and a request takes **about four seconds** end to end —
the 1.2 s we wait between requests plus one to three seconds of search latency, which is the larger half. So the
artist pass over 2080 strings is on the order of 23000 requests and **around 25 hours**, not the five hours
estimated before anything was measured. The song pass adds roughly one scoped lookup each.

Two things bring that down. Title-only search is only collected when nothing else corroborates, which removes
three of the eleven requests for most artists. And the 1278 single-song artists need fewer corroborations than
the ones with a dozen titles. It stays an unattended background job either way, and because every response is
cached, re-runs and prompt changes cost nothing.

### Concurrency cannot make this faster

The limit is measured **per source IP address**, and exceeding it does not shed the excess — it rejects
everything:

> if your requests are coming in at 4 requests per second, we don't honour 25% of them and decline the other
> 75% — we decline 100% of them, until the rate drops to 1 per second or lower

So splitting the walk across several workers on one machine makes it strictly slower, and the documented
consequence of pushing it is having the IP blocked from the API entirely. Five hours is a floor set by
MusicBrainz, not by us.

What concurrency does help with is everything that is not a request. Keep one fetcher that owns the entire
request budget and writes to the cache, and let any number of workers reason over what it has already fetched.
That split is worth having anyway: it is what makes the job resumable, and what makes re-running the judgement
step against different prompts free.

If the wall clock ever genuinely matters, the answer is a local mirror of the MusicBrainz database rather than
more workers, which removes the limit but costs a large database to import and keep current.

## What the pilot showed

Rather than start on 2080 artists, the approach was tried on 50 — `data/pilot/artists.txt`, covering 432 songs,
weighted towards the cases known to be hard, with unambiguous controls mixed in so that false positives would be
visible and not just misses. `data/pilot/expectations.json` records what I thought the answers were, written from
the evidence before any model saw it, and `pnpm score:verdicts` checks a run against them. The expectations are my
judgement, not ground truth, and the cases where I do not think there is one defensible answer are marked
observe-only.

Collecting the evidence took 557 requests. Grok 4.5 then judged it with no network access of its own and **passed
all 89 scored assertions**: it left all seven acts whose names merely contain a separator intact, split all five
real collaborations, converged all five case-variant pairs on a single entity, and refused all six strings that
are not artists. It resolved `Chicago` to the band rather than the musical, which only the song titles can settle,
and stripped the annotation from `Enya (fellowship Of The Ring Soundtrack)`. On the observe-only cases it found
the trio entity behind `Kikki, Bettan och Lotta` and `Rosie & the Originals`, and called the singer-versus-band
slash cases ambiguous instead of picking one.

So the design works, and the expensive part is the fetching rather than the judging.

**It was also confidently wrong about something.** Asked to critique the evidence, it reported that the title-only
search was empty for essentially every entry. It was populated for 49 of 50. Everything else it raised checked
out, which is the point worth keeping: a model can be right about the substance of every case and still make a
firm, false claim about its own input. Spot-checking a sample of `resolved` records is not optional.

Its accurate criticisms were three ways the evidence could mislead, each confirmed against the data and now fixed
in the collector:

| Trap                                                                                        | Evidence                                                                                                     | Now                                        |
| :------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------- | :----------------------------------------- |
| The recording search matches supersets of a title, so a hit is not proof                    | `Please don't go` returns `Baby Please Don’t Go`, appearing to corroborate The E Street Band. 3 of 117 hits. | marked `looseMatch`                        |
| Tribute and covers acts have recorded the same songs                                        | `AC/DC UK` matches all three AC/DC titles                                                                    | 11 candidates carry `likelyTributeOrCover` |
| MusicBrainz placeholder entities score 100 against exactly the strings that are not artists | `[Disney]` matches two Disney titles                                                                         | 4 candidates carry `specialPurpose`        |

The last two matter because they defeat the corroboration trick that the rest of this document leans on. Grok
avoided all three unprompted, but on 2080 artists nobody will be reading each case, so the signal belongs in the
evidence rather than in a model's care.

One mechanical result is worth more than the model comparison. Asking only whether _any_ candidate that is neither
a placeholder nor a tribute act cleanly has the venue's songs identified **exactly the six strings that are not
artists**, with no false positives and no misses. That is a cheap arithmetic test over data we already fetch, and
it means judgement is only needed for a remainder, not for the catalogue.

## Order of work

1. Resolve artists, with alias search and title corroboration. Produces artist identity, the case fixes, the
   dropped articles and the collaboration splits.
2. Resolve songs, scoped to the artist ids from step 1. Produces canonical titles, years, works and composers.
3. Work the flag queue, biggest blast radius first, into `data/overrides.json`.
4. Enrich with language and genre, which are cheap once identity exists.
5. Artist pages, which are the reason for all of the above.

Favourites, playlists and login are a separate concern and want a real database. The catalogue itself should stay
as files in the repository: it is small, it wants to be diffable, and it makes the build depend on nothing.
